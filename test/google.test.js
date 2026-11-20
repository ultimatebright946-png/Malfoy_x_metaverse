'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict'); const H = require('./helpers');
process.env.DATA_DIR = H.tmpDir('google'); process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com'; process.env.GOOGLE_CLIENT_SECRET = 'sec'; process.env.PUBLIC_URL = 'https://game.example.com';
const db = require('../lib/db'), G = require('../lib/google');
const mk = (id, name) => { const u = db.getUser(id + '@s.whatsapp.net', name); u.registered = true; return u; };
const prof = (sub, email, v) => async () => ({ sub, email, email_verified: v !== false });

test('start builds a Google URL with state and the exact redirect URI', () => {
  const r = G.start('login'); const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth'); assert.equal(u.searchParams.get('client_id'), 'cid.apps.googleusercontent.com');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://game.example.com/auth/google/callback'); assert.match(u.searchParams.get('scope'), /openid email/); assert.equal(u.searchParams.get('state').length, 48);
});
test('link then sign in with Google; unlinked, unverified, banned, wrong browser and reused state are refused', async () => {
  const a = mk('g1', 'Alice'), b = mk('g2', 'Bob'); const run = async (mode, uid, p, over) => { const s = G.start(mode, uid), st = new URL(s.url).searchParams.get('state'); return { r: await G.finish(Object.assign({ state: st, code: 'c' }, over || {}), (over && over.bind) || s.bind, p), st, s }; };
  assert.equal((await run('login', null, prof('sub-A', 'alice@gmail.com'))).r.reason, 'not_linked');
  assert.equal((await run('link', a.id, prof('sub-A', 'alice@gmail.com'))).r.ok, true); assert.equal(a.google.sub, 'sub-A'); assert.equal(G.mask(a.google.email), 'al***@gmail.com');
  const ok = await run('login', null, prof('sub-A', 'alice@gmail.com')); assert.ok(ok.r.ok && ok.r.user.id === a.id);
  assert.equal((await G.finish({ state: ok.st, code: 'c' }, ok.s.bind, prof('sub-A', 'x'))).reason, 'bad_state', 'state is single use');
  assert.equal((await run('link', b.id, prof('sub-A', 'alice@gmail.com'))).r.reason, 'taken', 'one Google account, one profile');
  assert.equal((await run('login', null, prof('sub-A', 'alice@gmail.com', false))).r.reason, 'unverified');
  assert.equal((await run('login', null, prof('sub-A', 'a@g.com'), { bind: 'f'.repeat(32) })).r.reason, 'bad_state', 'other browser cannot finish the flow');
  assert.equal((await run('login', null, prof('sub-A', 'a@g.com'), { error: 'access_denied', code: '' })).r.reason, 'cancelled');
  a.banned = true; assert.equal((await run('login', null, prof('sub-A', 'a@g.com'))).r.reason, 'banned'); a.banned = false;
  assert.equal(G.unlink(a).ok, true); assert.equal(a.google, undefined);
});
test('routes: redirect to Google with a bound cookie; callback without it is refused; disabled when unset', async () => {
  const { boot } = require('./fixture'); const fx = await boot();
  let r = await fetch(fx.base + '/auth/google', { redirect: 'manual' }); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /^https:\/\/accounts\.google\.com\//); assert.match(r.headers.get('set-cookie'), /mf_gs=[a-f0-9]{32}.*HttpOnly/i);
  r = await fetch(fx.base + '/auth/google/callback?state=zzz&code=abc', { redirect: 'manual' }); assert.equal(r.headers.get('location'), '/#/google/bad_state');
  r = await fetch(fx.base + '/auth/google/link', { redirect: 'manual' }); assert.equal(r.headers.get('location'), '/#/google/signin', 'linking needs a session');
  assert.equal((await (await fetch(fx.base + '/api/info')).json()).google, true);
  delete process.env.GOOGLE_CLIENT_SECRET; r = await fetch(fx.base + '/auth/google', { redirect: 'manual' }); assert.equal(r.headers.get('location'), '/#/google/off'); assert.equal((await (await fetch(fx.base + '/api/info')).json()).google, false);
  fx.close();
});
