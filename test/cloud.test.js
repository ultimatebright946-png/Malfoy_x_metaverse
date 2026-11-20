'use strict';
// Neon mirror: tested against a fake Neon HTTP SQL endpoint (same request/response shape as Neon's /sql API).
const test = require('node:test'); const assert = require('node:assert');
const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { create } = require('../lib/cloud');

function fakeNeon() {
  const kv = new Map(); const seen = { calls: 0, conn: null };
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      seen.calls++; seen.conn = req.headers['neon-connection-string']; const { query, params } = JSON.parse(b); let rows = [];
      if (/create table/i.test(query)) rows = [];
      else if (/jsonb_to_recordset/.test(query)) JSON.parse(params[0]).forEach(r => kv.set(r.k, r.v));
      else if (/^delete/i.test(query)) JSON.parse(params[0]).forEach(k => kv.delete(k));
      else if (/like 'm\/%'/.test(query)) rows = Array.from(kv).filter(([k]) => k.startsWith('m/')).map(([k, v]) => ({ k, v }));
      else if (/^select k, v/.test(query)) rows = JSON.parse(params[0]).filter(k => kv.has(k)).map(k => ({ k, v: kv.get(k) }));
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ rows }));
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ kv, seen, server, url: 'http://127.0.0.1:' + server.address().port + '/sql' })));
}
const tmp = n => fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-' + n + '-'));
const CONN = 'postgresql://user:pw@ep-test-123.eu-central-1.aws.neon.tech/neondb?sslmode=require';
function seed(dir, big) {
  fs.mkdirSync(path.join(dir, 'auth'), { recursive: true }); fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'auth', 'creds.json'), JSON.stringify({ me: { id: '2349@s.whatsapp.net' }, noiseKey: 'abc' }));
  fs.writeFileSync(path.join(dir, 'auth', 'pre-key-1.json'), '{"k":1}'); fs.writeFileSync(path.join(dir, 'auth', 'pre-key-2.json'), '{"k":2}');
  fs.writeFileSync(path.join(dir, 'database', 'db.json'), JSON.stringify({ users: { a: { name: 'Ashen', coins: 5 } }, pad: big ? 'x'.repeat(4000000) : '' }));
}

test('disabled without a connection string: does nothing, never throws', async () => {
  const c = create({ dataDir: tmp('off'), url: '' }); assert.equal(c.enabled, false);
  assert.deepEqual(await c.restore(), { enabled: false }); assert.equal((await c.pushOnce()).pushed, 0); await c.flush();
});

test('login + database are copied to Neon, and restored on an empty disk (redeploy)', async () => {
  const f = await fakeNeon(); const A = tmp('a'), B = tmp('b'); seed(A, true);
  const ca = create({ dataDir: A, url: CONN, endpoint: f.url, log() {} }); const r = await ca.pushOnce();
  assert.equal(r.pushed, 4, 'creds + 2 keys + db'); assert.equal(f.seen.conn, CONN, 'connection string is sent as the Neon header');
  assert.ok(Array.from(f.kv.keys()).filter(k => k.startsWith('f/database/db.json/')).length >= 3, 'big database is split into rows');
  const cb = create({ dataDir: B, url: CONN, endpoint: f.url, log() {} }); const rs = await cb.restore();
  assert.equal(rs.auth, 3); assert.equal(rs.db, true);
  for (const rel of ['auth/creds.json', 'auth/pre-key-1.json', 'auth/pre-key-2.json', 'database/db.json']) assert.equal(fs.readFileSync(path.join(B, rel), 'utf8'), fs.readFileSync(path.join(A, rel), 'utf8'), rel + ' identical');
  f.server.close();
});

test('only changed files are re-sent; deleted auth files are removed from Neon', async () => {
  const f = await fakeNeon(); const A = tmp('c'); seed(A);
  const c = create({ dataDir: A, url: CONN, endpoint: f.url, log() {} }); await c.pushOnce();
  assert.equal((await c.pushOnce()).pushed, 0, 'nothing changed');
  fs.writeFileSync(path.join(A, 'auth', 'pre-key-1.json'), '{"k":99}'); assert.equal((await c.pushOnce()).pushed, 1);
  fs.rmSync(path.join(A, 'auth', 'pre-key-2.json')); const r = await c.pushOnce(); assert.equal(r.removed, 1); assert.equal(f.kv.has('m/auth/pre-key-2.json'), false);
  f.server.close();
});

test('an existing local login is never overwritten by Neon', async () => {
  const f = await fakeNeon(); const A = tmp('d'), B = tmp('e'); seed(A); seed(B);
  fs.writeFileSync(path.join(B, 'auth', 'creds.json'), '{"me":{"id":"LOCAL"}}');
  await create({ dataDir: A, url: CONN, endpoint: f.url, log() {} }).pushOnce();
  const rs = await create({ dataDir: B, url: CONN, endpoint: f.url, log() {} }).restore(); assert.equal(rs.auth, 0);
  assert.match(fs.readFileSync(path.join(B, 'auth', 'creds.json'), 'utf8'), /LOCAL/); f.server.close();
});

test('Neon being down never throws and leaves local files alone', async () => {
  const A = tmp('f'); seed(A); const c = create({ dataDir: A, url: CONN, endpoint: 'http://127.0.0.1:9/sql', timeoutMs: 800, log() {} });
  const r = await c.restore(); assert.ok(r.error); const p = await c.pushOnce(); assert.ok(p.error);
  assert.ok(fs.existsSync(path.join(A, 'auth', 'creds.json')));
});

test('supervisor restarts the bot every time it stops and shuts down cleanly', async () => {
  const { spawn } = require('child_process'); const D = tmp('sup'); const mark = path.join(D, 'runs.txt');
  const dir = tmp('sup-app'); fs.copyFileSync(path.join(__dirname, '..', 'start.js'), path.join(dir, 'start.js')); fs.mkdirSync(path.join(dir, 'lib')); fs.copyFileSync(path.join(__dirname, '..', 'lib', 'cloud.js'), path.join(dir, 'lib', 'cloud.js'));
  fs.writeFileSync(path.join(dir, 'index.js'), "require('fs').appendFileSync(" + JSON.stringify(mark) + ", 'run\\n'); setTimeout(() => process.exit(1), 150);");
  const p = spawn(process.execPath, [path.join(dir, 'start.js')], { env: Object.assign({}, process.env, { DATA_DIR: D, NEON_DATABASE_URL: '', DATABASE_URL: '' }), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 4500)); const runs = fs.readFileSync(mark, 'utf8').trim().split('\n').length; assert.ok(runs >= 2, 'restarted after stopping (' + runs + ' runs)');
  const exited = new Promise(r => p.on('exit', r)); p.kill('SIGTERM'); const code = await Promise.race([exited, new Promise(r => setTimeout(() => r('timeout'), 5000))]); assert.equal(code, 0);
});
