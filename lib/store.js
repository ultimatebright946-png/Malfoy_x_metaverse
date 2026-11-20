'use strict';
// Persistent JSON store: safe atomic writes, rolling backups, corruption recovery, migrations, single-writer lock.
//
//   DATA_DIR/database/db.json            live database
//   DATA_DIR/database/db.json.prev       copy of the previous good version (kept on every write)
//   DATA_DIR/database/backups/           rolling timestamped backups
//   DATA_DIR/database/corrupt/           any unreadable db.json is preserved here, never deleted
//   DATA_DIR/database/.lock              single-writer lock (heartbeat), stops two processes from overwriting each other
//
// Initialisation never overwrites existing data: an empty database is only created when there is no
// readable database AND no readable backup anywhere.
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- location ----------
function resolveDataDir() {
  const want = process.env.DATA_DIR || '/var/data';
  try { fs.mkdirSync(path.join(want, 'database'), { recursive: true }); fs.accessSync(want, fs.constants.W_OK); return path.resolve(want); }
  catch (e) {
    if (process.env.DATA_DIR) { console.error('[store] DATA_DIR ' + want + ' is not writable: ' + e.message); throw e; }   // an explicit setting is never silently replaced
    const alt = path.resolve('./data');
    console.warn('[store] /var/data is not available here, using ' + alt + ' (fine for local runs; on Render mount the disk at /var/data)');
    fs.mkdirSync(path.join(alt, 'database'), { recursive: true });
    return alt;
  }
}

// One store per process, even if this file is required twice through different paths.
const KEY = Symbol.for('malfoy.store.v1');
if (globalThis[KEY]) { module.exports = globalThis[KEY]; return; }

const SCHEMA = 5;               // bump when you add a migration below
const MIGRATIONS = {            // version N -> N+1. Each must be idempotent and only add/convert fields.
  // 3 -> 4: containers added by the website/social/cards update
  3: d => { ['guilds', 'posts', 'cards', 'battles', 'links', 'events', 'follows', 'notes'].forEach(k => { if (d[k] === undefined) d[k] = k === 'posts' || k === 'events' ? [] : {}; }); },
  // 4 -> 5: awakening / identities containers
  4: d => { ['identities', 'archived'].forEach(k => { if (d[k] === undefined) d[k] = {}; }); },
};

const DATA_DIR = resolveDataDir();
const DIR = path.join(DATA_DIR, 'database');
const FILE = path.join(DIR, 'db.json');
const PREV = FILE + '.prev';
const BACKUPS = path.join(DIR, 'backups');
const CORRUPT = path.join(DIR, 'corrupt');
const LOCK = path.join(DIR, '.lock');
[BACKUPS, CORRUPT].forEach(d => fs.mkdirSync(d, { recursive: true }));

const CFG = {
  SAVE_DELAY: 1500,
  BACKUP_EVERY: (parseInt(process.env.BACKUP_MINUTES, 10) || 30) * 60000,
  KEEP_BACKUPS: parseInt(process.env.BACKUP_KEEP, 10) || 48,
  KEEP_DAILY: 14,
  LOCK_STALE: 60000,
};
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const log = (...a) => console.log('[store]', ...a);

// ---------- reading / validation ----------
function readJson(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    if (!txt.trim()) return { ok: false, why: 'empty file' };
    const obj = JSON.parse(txt);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, why: 'not an object' };
    if (obj.users !== undefined && (typeof obj.users !== 'object' || Array.isArray(obj.users) || obj.users === null)) return { ok: false, why: 'users is not an object' };
    return { ok: true, obj, size: txt.length };
  } catch (e) { return { ok: false, why: e.code === 'ENOENT' ? 'missing' : e.message }; }
}
const userCount = o => Object.keys((o && o.users) || {}).length;
function listBackups() {
  try { return fs.readdirSync(BACKUPS).filter(f => /^db-.*\.json$/.test(f)).sort().reverse().map(f => path.join(BACKUPS, f)); } catch (e) { return []; }
}

let info = { source: 'fresh', recoveredFrom: null, corruptCopy: null, schemaFrom: null, notes: [] };

function load() {
  const main = readJson(FILE);
  if (main.ok) { info.source = 'db.json'; return main.obj; }
  if (main.why !== 'missing') {                      // exists but unreadable: keep it for forensics before anything else happens
    const keep = path.join(CORRUPT, 'db-' + stamp() + '.json');
    try { fs.copyFileSync(FILE, keep); info.corruptCopy = keep; info.notes.push('unreadable db.json preserved at ' + keep + ' (' + main.why + ')'); log('db.json unreadable (' + main.why + '); preserved at ' + keep); } catch (e) { log('could not preserve corrupt db.json: ' + e.message); }
  } else log('db.json is missing, looking for a backup before creating anything');
  const candidates = [PREV].concat(listBackups());
  for (const f of candidates) {
    const r = readJson(f);
    if (r.ok && userCount(r.obj) >= 0) { info.source = 'recovered'; info.recoveredFrom = f; info.notes.push('recovered from ' + f); log('RECOVERED database from ' + f + ' (' + userCount(r.obj) + ' players)'); return r.obj; }
  }
  if (main.why !== 'missing') info.notes.push('no usable backup found: started empty; the corrupt file is kept in ' + CORRUPT);
  log(main.why !== 'missing' ? 'WARNING: no usable backup, starting with an empty database (corrupt copy kept)' : 'no database yet, creating a new one');
  info.source = 'fresh';
  return {};
}

let data = load();
data.users = data.users || {}; data.sessions = data.sessions || {}; data.alias = data.alias || {}; data.muted = data.muted || {}; data.groups = data.groups || {};

// ---------- migrations (with a safety backup first) ----------
info.schemaFrom = data._schema || 3;
if ((data._schema || 3) < SCHEMA) {
  if (userCount(data) > 0) { try { fs.writeFileSync(path.join(BACKUPS, 'db-' + stamp() + '-pre-migrate-v' + (data._schema || 3) + '.json'), JSON.stringify(data)); } catch (e) { log('pre-migration backup failed: ' + e.message); } }
  for (let v = data._schema || 3; v < SCHEMA; v++) { if (MIGRATIONS[v]) MIGRATIONS[v](data); data._schema = v + 1; }
  info.notes.push('migrated schema ' + info.schemaFrom + ' -> ' + SCHEMA);
}
data._schema = SCHEMA;

// ---------- single-writer lock ----------
const me = { pid: process.pid, host: os.hostname() };
function lockHeld() {
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (l.pid === me.pid && l.host === me.host) return false;
    return Date.now() - l.t < CFG.LOCK_STALE;           // a live heartbeat from another process
  } catch (e) { return false; }
}
function touchLock() { try { fs.writeFileSync(LOCK, JSON.stringify({ pid: me.pid, host: me.host, t: Date.now() })); } catch (e) {} }
if (lockHeld() && process.env.IGNORE_DB_LOCK !== 'true') {
  throw new Error('[store] another Malfoy process is using ' + DIR + ' right now (lock heartbeat < ' + CFG.LOCK_STALE / 1000 + 's old). Refusing to start so two writers cannot overwrite each other. Stop the other process, wait a minute, or set IGNORE_DB_LOCK=true if you are sure it is dead.');
}
touchLock();
const lockTimer = setInterval(touchLock, 15000); lockTimer.unref();

// ---------- writing ----------
let timer = null, dirty = false, lastBackup = 0, lastGoodUsers = userCount(data), closed = false, saves = 0;

function writeNow(reason) {
  if (closed && reason !== 'shutdown') return false;
  const n = userCount(data);
  // never replace a populated database with an empty one by accident
  if (n === 0 && lastGoodUsers > 0 && !process.env.ALLOW_EMPTY_DB) { log('REFUSED to write an empty database over ' + lastGoodUsers + ' players'); return false; }
  const txt = JSON.stringify(data);
  const tmp = FILE + '.tmp';
  try {
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, txt); fs.fsyncSync(fd); fs.closeSync(fd);
    const cur = readJson(FILE); if (cur.ok && cur.size > 2) { try { fs.copyFileSync(FILE, PREV); } catch (e) {} }   // keep the previous good copy
    fs.renameSync(tmp, FILE);
    dirty = false; lastGoodUsers = Math.max(n, 0); saves++;
    maybeBackup();
    return true;
  } catch (e) { console.error('[store] SAVE FAILED: ' + e.message); try { fs.unlinkSync(tmp); } catch (x) {} return false; }
}
function save() { dirty = true; if (timer || closed) return; timer = setTimeout(() => { timer = null; writeNow('timer'); }, CFG.SAVE_DELAY); }
function flush() { if (timer) { clearTimeout(timer); timer = null; } return writeNow('flush'); }

function pruneBackups() {
  const all = listBackups(); const daily = all.filter(f => /-daily\.json$/.test(f)), rest = all.filter(f => !/-daily\.json$/.test(f));
  rest.slice(CFG.KEEP_BACKUPS).forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  daily.slice(CFG.KEEP_DAILY).forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
}
function backupNow(tag) {
  if (userCount(data) === 0) return null;                  // empty databases are never worth keeping
  try {
    if (dirty || timer) flush();
    const name = path.join(BACKUPS, 'db-' + stamp() + (tag ? '-' + tag : '') + '.json');
    fs.copyFileSync(FILE, name); lastBackup = Date.now(); pruneBackups(); return name;
  } catch (e) { log('backup failed: ' + e.message); return null; }
}
function maybeBackup() {
  const now = Date.now(); if (now - lastBackup < CFG.BACKUP_EVERY) return;
  const dayFile = path.join(BACKUPS, 'db-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-000000-daily.json');
  try { if (!fs.existsSync(dayFile) && userCount(data) > 0) fs.copyFileSync(FILE, dayFile); } catch (e) {}
  backupNow();
}
if (userCount(data) > 0) { writeNow('init'); }        // makes sure a recovered/migrated database is on disk right away
const backupTimer = setInterval(() => { if (!closed && userCount(data) > 0) { if (dirty) flush(); else backupNow(); } }, CFG.BACKUP_EVERY); backupTimer.unref();

// ---------- recovery helpers (used by the owner commands) ----------
function restoreFrom(file) {
  const r = readJson(file); if (!r.ok) return { ok: false, msg: 'That backup is not readable: ' + r.why };
  const safety = backupNow('before-restore');
  const keep = Object.keys(data); keep.forEach(k => delete data[k]); Object.assign(data, r.obj);
  data.users = data.users || {}; data.sessions = data.sessions || {}; data.alias = data.alias || {}; data.muted = data.muted || {}; data.groups = data.groups || {};
  lastGoodUsers = userCount(data); flush();
  return { ok: true, msg: 'Restored ' + userCount(data) + ' players from ' + path.basename(file) + '. Safety copy of the previous state: ' + (safety ? path.basename(safety) : 'none') + '.' };
}
function status() { return { dataDir: DATA_DIR, file: FILE, players: userCount(data), schema: data._schema, saves, backups: listBackups().length, newestBackup: listBackups()[0] ? path.basename(listBackups()[0]) : null, source: info.source, recoveredFrom: info.recoveredFrom, corruptCopy: info.corruptCopy, notes: info.notes.slice(), dirty }; }

// ---------- graceful shutdown ----------
function close(why) {
  if (closed) return; closed = true;
  if (timer) { clearTimeout(timer); timer = null; }
  closed = false; try { writeNow('shutdown'); } finally { closed = true; }
  try { const l = JSON.parse(fs.readFileSync(LOCK, 'utf8')); if (l.pid === me.pid) fs.unlinkSync(LOCK); } catch (e) {}
  log('closed (' + (why || 'exit') + '), ' + userCount(data) + ' players saved');
}
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, () => { close(s); process.exit(0); }));
process.on('exit', () => close('exit'));

const api = { data, save, flush, close, backupNow, restoreFrom, listBackups, status, paths: { DATA_DIR, DIR, FILE, BACKUPS, CORRUPT }, SCHEMA };
globalThis[KEY] = api;
module.exports = api;
