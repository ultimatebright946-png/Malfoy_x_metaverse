'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { tmpDir, runIn } = require('./helpers');
const mk = (n) => { const u = {}; for (let i = 0; i < n; i++) u['u' + i + '@s.whatsapp.net'] = { id: 'u' + i + '@s.whatsapp.net', name: 'P' + i, level: i + 1, coins: 100 * i }; return u; };

test('fresh start creates database dir and a database after first save', () => {
  const d = tmpDir('fresh');
  const r = runIn(d, "const db=require('./lib/db');db.getUser('1@s.whatsapp.net','A');db.flush();console.log(Object.keys(db.data.users).length)");
  assert.strictEqual(r.out.split('\n').pop(), '1');
  assert.ok(fs.existsSync(path.join(d, 'database', 'db.json')));
});
test('existing data is never overwritten by initialisation (players, coins, level survive)', () => {
  const d = tmpDir('keep'); fs.mkdirSync(path.join(d, 'database'), { recursive: true });
  fs.writeFileSync(path.join(d, 'database/db.json'), JSON.stringify({ users: mk(5), sessions: {}, alias: {}, muted: {}, groups: {} }));
  const r = runIn(d, "const db=require('./lib/db');console.log(db.getUser('u3@s.whatsapp.net').coins, db.getUser('u3@s.whatsapp.net').level, Object.keys(db.data.users).length)");
  assert.strictEqual(r.out.split('\n').pop(), '300 4 5');
  const saved = JSON.parse(fs.readFileSync(path.join(d, 'database/db.json')));
  assert.strictEqual(Object.keys(saved.users).length, 5);
  assert.strictEqual(saved.users['u2@s.whatsapp.net'].coins, 200);
});
test('corrupt db.json is preserved, then a known-good backup is restored (not an empty db)', () => {
  const d = tmpDir('corrupt'); const db = path.join(d, 'database'); fs.mkdirSync(path.join(db, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(db, 'db.json'), '{"users": {"x": ');                                   // truncated write
  fs.writeFileSync(path.join(db, 'backups', 'db-20260101-000000.json'), JSON.stringify({ users: mk(3) }));
  fs.writeFileSync(path.join(db, 'backups', 'db-20260102-000000.json'), '{broken');               // newest backup is also bad
  const r = runIn(d, "const db=require('./lib/db');console.log(JSON.stringify(db.store.status()))");
  const st = JSON.parse(r.out.split('\n').pop());
  assert.strictEqual(st.players, 3); assert.strictEqual(st.source, 'recovered'); assert.match(st.recoveredFrom, /20260101/);
  const kept = fs.readdirSync(path.join(db, 'corrupt')); assert.strictEqual(kept.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(db, 'corrupt', kept[0]), 'utf8'), '{"users": {"x": ');
});
test('missing db.json but a backup exists: restores instead of starting empty', () => {
  const d = tmpDir('missing'); const db = path.join(d, 'database'); fs.mkdirSync(path.join(db, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(db, 'backups', 'db-20260101-000000.json'), JSON.stringify({ users: mk(2) }));
  const r = runIn(d, "const db=require('./lib/db');console.log(db.store.status().players)");
  assert.strictEqual(r.out.split('\n').pop(), '2');
});
test('corrupt and no backup: starts empty but keeps the corrupt copy', () => {
  const d = tmpDir('nobk'); fs.mkdirSync(path.join(d, 'database'), { recursive: true });
  fs.writeFileSync(path.join(d, 'database/db.json'), 'garbage');
  const r = runIn(d, "const db=require('./lib/db');console.log(db.store.status().players)");
  assert.strictEqual(r.out.split('\n').pop(), '0');
  assert.strictEqual(fs.readdirSync(path.join(d, 'database/corrupt')).length, 1);
});
test('an empty database is refused over a populated one', () => {
  const d = tmpDir('empty'); fs.mkdirSync(path.join(d, 'database'), { recursive: true });
  fs.writeFileSync(path.join(d, 'database/db.json'), JSON.stringify({ users: mk(4) }));
  const r = runIn(d, "const db=require('./lib/db');for(const k of Object.keys(db.data.users))delete db.data.users[k];db.save();console.log(db.flush())");
  assert.match(r.out, /false/);
  assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(d, 'database/db.json'))).users).length, 4);
});
test('previous version is kept as .prev and backups are written', () => {
  const d = tmpDir('prev');
  const r = runIn(d, "const db=require('./lib/db');db.getUser('1@s.whatsapp.net','A');db.flush();db.data.users['1@s.whatsapp.net'].coins=7;db.flush();const b=db.store.backupNow();console.log(!!b, db.store.listBackups().length)");
  assert.match(r.out, /true [12]/);
  assert.ok(fs.existsSync(path.join(d, 'database/db.json.prev')));
});
test('a second process on the same data dir is refused (single writer)', () => {
  const d = tmpDir('lock'); fs.mkdirSync(path.join(d, 'database'), { recursive: true });
  fs.writeFileSync(path.join(d, 'database/.lock'), JSON.stringify({ pid: 999999, host: 'other-host', t: Date.now() }));
  const r = runIn(d, "require('./lib/db')");
  assert.notStrictEqual(r.code, 0); assert.match(r.err, /another Malfoy process/);
  fs.writeFileSync(path.join(d, 'database/.lock'), JSON.stringify({ pid: 999999, host: 'other-host', t: Date.now() - 120000 }));
  const r2 = runIn(d, "require('./lib/db');console.log('ok')"); assert.match(r2.out, /ok/);                      // stale lock is taken over
});
test('SIGTERM flushes unsaved changes (graceful shutdown) and releases the lock', async () => {
  const d = tmpDir('sig'); const cp = require('child_process');
  const ch = cp.spawn(process.execPath, ['-e', "const db=require('./lib/db');db.getUser('1@s.whatsapp.net','Z').coins=4242;db.save();console.log('ready');setInterval(()=>{},1000)"], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { DATA_DIR: d }) });
  await new Promise(r => ch.stdout.on('data', x => /ready/.test(String(x)) && r()));
  ch.kill('SIGTERM'); await new Promise(r => ch.on('exit', r));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'database/db.json'))).users['1@s.whatsapp.net'].coins, 4242);
  assert.ok(!fs.existsSync(path.join(d, 'database/.lock')));
});
test('requiring the store twice does not create a second instance', () => {
  const d = tmpDir('dup');
  const r = runIn(d, "const a=require('./lib/store');delete require.cache[require.resolve('./lib/store')];const b=require('./lib/store');console.log(a===b, a.data===b.data)");
  assert.match(r.out, /true true/);
});
test('DATA_DIR default is /var/data and an unwritable explicit DATA_DIR fails loudly', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/store.js'), 'utf8'); assert.match(src, /process\.env\.DATA_DIR \|\| '\/var\/data'/);
  const f = path.join(tmpDir('file'), 'iamafile'); fs.writeFileSync(f, 'x');
  const r = runIn(path.join(f, 'sub'), "require('./lib/store')"); assert.notStrictEqual(r.code, 0); assert.match(r.err, /not writable/);
});
