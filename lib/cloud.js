'use strict';
// Neon (serverless Postgres) mirror for the two things that must survive a redeploy:
//   * the WhatsApp login (DATA_DIR/auth/*)   -> the bot is not logged out when the server is rebuilt
//   * the player database (DATA_DIR/database/db.json)
// Talks to Neon over its HTTPS SQL endpoint, so no database driver is needed. Local files stay the working copy;
// this keeps a copy in Postgres and puts it back when the local disk is empty (new container, new server).
// Never throws into the caller: if Neon is unreachable the bot simply keeps using the local files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHUNK = 1500000;                                  // characters per row, keeps each request small
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const TABLE = 'create table if not exists malfoy_kv (k text primary key, v text not null, updated_at timestamptz not null default now())';

function parseUrl(conn) { try { const u = new URL(conn); return u.hostname; } catch (e) { return null; } }

function create(opts) {
  opts = opts || {};
  const dataDir = opts.dataDir, conn = opts.url || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  const log = opts.log || ((...a) => console.log('[cloud]', ...a));
  const host = parseUrl(conn);
  const endpoint = opts.endpoint || process.env.NEON_HTTP_URL || (host ? 'https://' + host + '/sql' : null);
  const enabled = !!(dataDir && conn && endpoint);
  const FILES = { auth: path.join(dataDir || '.', 'auth'), db: path.join(dataDir || '.', 'database', 'db.json') };
  const pushed = new Map();                              // rel path -> hash last written to Neon (this process)
  let ready = false, lastErr = 0, busy = false, timer = null;

  async function sql(query, params) {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': conn }, body: JSON.stringify({ query, params: params || [] }), signal: AbortSignal.timeout(opts.timeoutMs || 25000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Neon ' + r.status + ' ' + String(j.message || '').slice(0, 160));
    return j.rows || [];
  }
  async function ensure() { if (ready) return; await sql(TABLE); ready = true; }
  const note = e => { if (Date.now() - lastErr > 60000) { lastErr = Date.now(); log('Neon not reachable right now (' + (e && e.message) + '). Using the local files; will retry.'); } };

  // ---- local files <-> rows
  function localFiles() {
    const out = {};
    try { fs.readdirSync(FILES.auth).forEach(n => { const p = path.join(FILES.auth, n); try { if (fs.statSync(p).isFile()) out['auth/' + n] = fs.readFileSync(p, 'utf8'); } catch (e) {} }); } catch (e) {}
    try { out['database/db.json'] = fs.readFileSync(FILES.db, 'utf8'); } catch (e) {}
    return out;
  }
  const rowsFor = (rel, text) => { const n = Math.max(1, Math.ceil(text.length / CHUNK)), rows = [{ k: 'm/' + rel, v: JSON.stringify({ n, h: sha(text), t: Date.now(), len: text.length }) }]; for (let i = 0; i < n; i++) rows.push({ k: 'f/' + rel + '/' + i, v: text.slice(i * CHUNK, (i + 1) * CHUNK) }); return rows; };
  const upsert = rows => sql('insert into malfoy_kv(k, v) select r.k, r.v from jsonb_to_recordset($1::jsonb) as r(k text, v text) on conflict (k) do update set v = excluded.v, updated_at = now()', [JSON.stringify(rows)]);
  const remove = keys => sql('delete from malfoy_kv where k = any(select jsonb_array_elements_text($1::jsonb))', [JSON.stringify(keys)]);
  const fetchKeys = keys => sql('select k, v from malfoy_kv where k = any(select jsonb_array_elements_text($1::jsonb))', [JSON.stringify(keys)]);

  async function remoteMetas() { const rows = await sql("select k, v from malfoy_kv where k like 'm/%'"); const m = {}; rows.forEach(r => { try { m[r.k.slice(2)] = JSON.parse(r.v); } catch (e) {} }); return m; }
  async function readRemote(rel, meta) {
    const keys = []; for (let i = 0; i < meta.n; i++) keys.push('f/' + rel + '/' + i);
    const got = {}; (await fetchKeys(keys)).forEach(r => { got[r.k] = r.v; });
    let text = ''; for (const k of keys) { if (got[k] == null) return null; text += got[k]; }
    return sha(text) === meta.h ? text : null;
  }
  function writeLocal(rel, text) {
    const p = path.join(dataDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, p);
  }

  // Called once before the bot starts. Puts the WhatsApp login and the database back if this disk does not have them.
  async function restore() {
    if (!enabled) return { enabled: false };
    const res = { enabled: true, auth: 0, db: false };
    try {
      await ensure(); const metas = await remoteMetas();
      const haveAuth = fs.existsSync(path.join(FILES.auth, 'creds.json')), haveDb = fs.existsSync(FILES.db);
      for (const rel of Object.keys(metas)) {
        const isAuth = rel.startsWith('auth/'), isDb = rel === 'database/db.json'; if (!isAuth && !isDb) continue;
        if (isAuth && haveAuth) { pushed.set(rel, metas[rel].h); continue; }                  // local login exists: it wins
        let doIt = isAuth || !haveDb;
        if (isDb && haveDb) { const st = fs.statSync(FILES.db); doIt = metas[rel].t > st.mtimeMs + 5 * 60000 && metas[rel].h !== sha(fs.readFileSync(FILES.db, 'utf8')); if (doIt) { try { fs.copyFileSync(FILES.db, FILES.db + '.before-cloud-restore'); } catch (e) {} } }
        if (!doIt) { if (isDb) pushed.set(rel, metas[rel].h); continue; }
        const text = await readRemote(rel, metas[rel]);
        if (text == null) { log('skipped ' + rel + ': copy in Neon is incomplete'); continue; }
        writeLocal(rel, text); pushed.set(rel, metas[rel].h); if (isAuth) res.auth++; else res.db = true;
      }
      if (res.auth || res.db) log('restored from Neon: ' + res.auth + ' WhatsApp session file(s)' + (res.db ? ', player database' : ''));
      else log('Neon connected; local files are current.');
    } catch (e) { note(e); res.error = e.message; }
    return res;
  }

  // Writes what changed since the last pass. Files deleted locally (for example after a logout) are removed from Neon too.
  async function pushOnce() {
    if (!enabled || busy) return { pushed: 0 }; busy = true;
    try {
      await ensure(); const cur = localFiles(), rows = [], gone = [], names = [];
      for (const rel of Object.keys(cur)) { const h = sha(cur[rel]); if (pushed.get(rel) !== h) { if (rel === 'database/db.json' && cur[rel].length < 20) continue; rowsFor(rel, cur[rel]).forEach(r => rows.push(r)); names.push([rel, h]); } }
      for (const rel of Array.from(pushed.keys())) if (cur[rel] === undefined && rel.startsWith('auth/')) gone.push(rel);
      if (rows.length) { for (let i = 0; i < rows.length; i += 40) await upsert(rows.slice(i, i + 40)); names.forEach(x => pushed.set(x[0], x[1])); }
      if (gone.length) { const keys = []; gone.forEach(rel => { keys.push('m/' + rel); keys.push('f/' + rel + '/0'); }); await remove(keys); gone.forEach(rel => pushed.delete(rel)); }
      return { pushed: names.length, removed: gone.length };
    } catch (e) { note(e); return { pushed: 0, error: e.message }; }
    finally { busy = false; }
  }
  function start(everyMs) { if (!enabled || timer) return; timer = setInterval(() => { pushOnce(); }, everyMs || 15000); timer.unref && timer.unref(); pushOnce(); }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  async function flush() { stop(); for (let i = 0; i < 30 && busy; i++) await new Promise(r => setTimeout(r, 100)); return pushOnce(); }
  return { enabled, restore, pushOnce, start, stop, flush, _sql: sql };
}
module.exports = { create };
