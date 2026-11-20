'use strict';
// "Continue with Google" (OAuth 2.0 authorization-code flow, no extra packages).
// Google can only SIGN IN to a profile that already exists (created through the WhatsApp bot) and was linked to that Google account
// in Settings. It never creates a second profile for the same person.
const crypto = require('crypto');
const db = require('./db');
const W = require('./webcore');
const STATES = new Map();                     // state -> { mode, uid, exp, bind }
const TTL = 10 * 60000;
const cfg = () => ({ id: process.env.GOOGLE_CLIENT_ID || '', secret: process.env.GOOGLE_CLIENT_SECRET || '' });
const enabled = () => { const c = cfg(); return !!(c.id && c.secret); };
const redirectUri = () => (process.env.GOOGLE_REDIRECT_URI || W.baseUrl() + '/auth/google/callback');
const mask = e => { const [a, d] = String(e || '').split('@'); return a ? a.slice(0, 2) + '***@' + (d || '') : ''; };
function sweep() { const now = Date.now(); STATES.forEach((v, k) => { if (v.exp < now) STATES.delete(k); }); }

function start(mode, uid) {                   // returns { url, bind } ; bind goes in a cookie so only this browser can finish the flow
  sweep(); const state = crypto.randomBytes(24).toString('hex'), bind = crypto.randomBytes(16).toString('hex');
  STATES.set(state, { mode, uid: uid || null, exp: Date.now() + TTL, bind });
  const q = new URLSearchParams({ client_id: cfg().id, redirect_uri: redirectUri(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account', access_type: 'online' });
  return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, bind };
}
async function post(url, form) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000) }); return r.json().catch(() => ({})); }
async function profile(code) {
  const t = await post('https://oauth2.googleapis.com/token', { code, client_id: cfg().id, client_secret: cfg().secret, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  if (!t.access_token) return null;
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + t.access_token }, signal: AbortSignal.timeout(15000) });
  const p = await r.json().catch(() => null); return p && p.sub ? p : null;
}
const byGoogle = sub => Object.values(db.data.users).find(u => u.google && u.google.sub === sub) || null;

// Finishes the flow. Returns { ok, mode, user?, reason? }  reason: bad_state | cancelled | failed | unverified | not_linked | banned | taken
async function finish(query, bindCookie, fetchProfile) {
  sweep(); const st = STATES.get(String(query.state || ''));
  if (!st || st.exp < Date.now() || !bindCookie || bindCookie !== st.bind) return { ok: false, reason: 'bad_state' };
  STATES.delete(query.state);
  if (query.error || !query.code) return { ok: false, mode: st.mode, reason: 'cancelled' };
  let p; try { p = await (fetchProfile || profile)(String(query.code)); } catch (e) { p = null; }
  if (!p) return { ok: false, mode: st.mode, reason: 'failed' };
  if (p.email_verified !== true && p.email_verified !== 'true') return { ok: false, mode: st.mode, reason: 'unverified' };
  const owner = byGoogle(p.sub);
  if (st.mode === 'link') {
    const u = db.data.users[st.uid]; if (!u) return { ok: false, mode: 'link', reason: 'failed' };
    if (owner && owner.id !== u.id) return { ok: false, mode: 'link', reason: 'taken' };
    u.google = { sub: p.sub, email: String(p.email || '').slice(0, 120), at: Date.now() }; db.save(); return { ok: true, mode: 'link', user: u };
  }
  if (!owner) return { ok: false, mode: 'login', reason: 'not_linked' };
  if (owner.banned) return { ok: false, mode: 'login', reason: 'banned' };
  if (owner.exiled) return { ok: false, mode: 'login', reason: 'exiled' };
  return { ok: true, mode: 'login', user: owner };
}
function unlink(u) { if (!u.google) return { ok: false, msg: 'No Google account is linked.' }; delete u.google; db.save(); return { ok: true }; }
module.exports = { enabled, start, finish, unlink, mask, redirectUri, _states: STATES };
