// Accounts: register, sign in, forgot password. Codes are sent to the player's WhatsApp by the bot itself.
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const db = require('./db');

const CODE_MIN = 10, RESEND_SEC = 60, MAX_CODES_HOUR = 3, MAX_TRIES = 5, MAX_FAILS = 5, LOCK_MIN = 15;
const PENDING = new Map();
const hooks = { sendDM: null };           // set by index.js: (jid, text) => Promise
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const store = (k) => db.data[k] || (db.data[k] = {});
const names = () => store('names');       // username -> user id
const otps = () => store('otps');

const normNumber = s => String(s || '').replace(/\D/g, '');
const validNumber = n => n.length >= 8 && n.length <= 15 && n[0] !== '0';
const validName = s => /^[a-z0-9_]{3,20}$/.test(s);
const validPass = s => typeof s === 'string' && s.length >= 8 && s.length <= 72;
const OPEN = () => process.env.OPEN_REGISTRATION === 'true';
const OWNERS = () => (process.env.OWNER_NUMBER || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean);   // the owner can always register

function byNumber(n) { return db.data.users[n + '@s.whatsapp.net'] || null; }
function byName(s) { const id = names()[String(s || '').toLowerCase()]; return id ? db.data.users[id] || null : null; }
function find(idOrNumber) { const s = String(idOrNumber || '').trim(); const n = normNumber(s); return (/^[0-9+\s-]{8,}$/.test(s) && byNumber(n)) || byName(s) || null; }

async function hashPw(pw, salt) { salt = salt || crypto.randomBytes(16).toString('hex'); const h = await scrypt(pw, salt, 64); return { salt, hash: h.toString('hex') }; }
async function checkPw(pw, a) { const h = await scrypt(pw, a.salt, 64); const b = Buffer.from(a.hash, 'hex'); return b.length === h.length && crypto.timingSafeEqual(b, h); }
const DUMMY = { salt: '0'.repeat(32), hash: '0'.repeat(128) };

function pendingFor(u) { const p = PENDING.get(u.id); if (!p || p.exp < Date.now()) { PENDING.delete(u.id); return null; } return p; }
function sweep() { const now = Date.now(), o = otps(); Object.keys(o).forEach(k => { if (o[k].exp < now) delete o[k]; }); }

// create + send a code. Returns {ok, msg}
async function sendCode(u, purpose, extra) {
  sweep(); const now = Date.now(), o = otps(), key = purpose + ':' + u.id, old = o[key];
  if (old && now - old.sent < RESEND_SEC * 1000) return { ok: false, msg: 'Please wait ' + Math.ceil((RESEND_SEC * 1000 - (now - old.sent)) / 1000) + ' seconds before asking for another code.' };
  const hist = (u.otpLog || []).filter(t => now - t < 3600e3); if (hist.length >= MAX_CODES_HOUR) return { ok: false, msg: 'Too many codes for this number. Try again in an hour.' };
  if (!hooks.sendDM) return { ok: false, msg: 'The bot is offline right now. Try again in a few minutes.' };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  o[key] = Object.assign({ h: sha(code), exp: now + CODE_MIN * 60000, sent: now, tries: 0 }, extra || {});
  const text = '🔐 *MALFOY CODE*\n\nYour ' + (purpose === 'reset' ? 'password reset' : 'sign up') + ' code is:\n\n*' + code + '*\n\nIt works for ' + CODE_MIN + ' minutes. Never share it with anyone, not even me. If you did not ask for it, ignore this message.';
  PENDING.set(u.id, { code, exp: now + CODE_MIN * 60000, purpose });          // kept in memory only, so ".code" in WhatsApp can hand it over if the push fails
  if (OWNERS().indexOf(String(u.id).split('@')[0]) > -1) console.log('[OTP] ' + purpose + ' code for owner ' + String(u.id).split('@')[0] + ': ' + code);   // owner fallback: Render logs
  let pushed = true;
  try { await hooks.sendDM(u.id, text); }
  catch (e) { pushed = false; console.log('[OTP] could not send to ' + u.id + ': ' + (e && e.message)); }
  if (!pushed) { hist.push(now); u.otpLog = hist; db.save(); return { ok: true, pushed: false, msg: 'I could not push the code to your WhatsApp. Open a chat with the bot and send ' + (process.env.PREFIX || '.') + 'code to get it.' }; }
  hist.push(now); u.otpLog = hist; db.save(); return { ok: true };
}
function checkCode(u, purpose, code) {
  const o = otps(), key = purpose + ':' + u.id, r = o[key];
  if (!r || r.exp < Date.now()) { delete o[key]; return { ok: false, msg: 'That code expired. Ask for a new one.' }; }
  if (++r.tries > MAX_TRIES) { delete o[key]; db.save(); return { ok: false, msg: 'Too many wrong codes. Ask for a new one.' }; }
  const a = Buffer.from(sha(String(code || '').replace(/\D/g, '')), 'hex'), b = Buffer.from(r.h, 'hex');
  if (!crypto.timingSafeEqual(a, b)) { db.save(); return { ok: false, msg: 'Wrong code. ' + (MAX_TRIES - r.tries) + ' tries left.' }; }
  delete o[key]; db.save(); return { ok: true, rec: r };
}

// ---- register ----
async function register(number, username, password) {
  const n = normNumber(number); username = String(username || '').trim().toLowerCase();
  if (!validNumber(n)) return { ok: false, msg: 'Enter your WhatsApp number with the country code, for example 2348012345678.' };
  if (!validName(username)) return { ok: false, msg: 'Username: 3 to 20 letters, numbers or underscores.' };
  if (!validPass(password)) return { ok: false, msg: 'Password must be 8 to 72 characters.' };
  let u = byNumber(n);
  if (!u) { if (OPEN() || OWNERS().indexOf(n) > -1) u = db.getUser(n + '@s.whatsapp.net', username); else return { ok: false, msg: 'I do not know that number yet. Open a private chat with the bot on WhatsApp, send "hi", then try again.' }; }
  if (u.auth) return { ok: false, msg: 'This number already has an account. Sign in, or use Forgot password.' };
  const owner = names()[username]; if (owner && owner !== u.id) return { ok: false, msg: 'That username is taken.' };
  const pw = await hashPw(password);
  const r = await sendCode(u, 'register', { username, salt: pw.salt, hash: pw.hash }); if (!r.ok) return r;
  return { ok: true, msg: r.pushed === false ? r.msg : 'I sent a 6 digit code to your WhatsApp.' };
}
function verifyRegister(number, code) {
  const u = byNumber(normNumber(number)); if (!u) return { ok: false, msg: 'Start again from Register.' };
  const c = checkCode(u, 'register', code); if (!c.ok) return c;
  const { username, salt, hash } = c.rec; if (names()[username] && names()[username] !== u.id) return { ok: false, msg: 'That username was just taken. Register again with another one.' };
  u.auth = { name: username, salt, hash, at: Date.now() }; names()[username] = u.id; u.registered = true; if (!u.name || /^\d+$/.test(u.name)) u.name = username; db.save();
  return { ok: true, user: u };
}

// ---- sign in ----
async function login(idOrNumber, password) {
  const u = find(idOrNumber), now = Date.now(), bad = { ok: false, msg: 'Wrong username/number or password.' };
  if (u && u.auth && u.authLock && u.authLock > now) return { ok: false, msg: 'Too many wrong passwords. Try again in ' + Math.ceil((u.authLock - now) / 60000) + ' minutes, or use Forgot password.' };
  const ok = await checkPw(String(password || '').slice(0, 200), u && u.auth ? u.auth : DUMMY);   // same work for unknown users
  if (!u || !u.auth || !ok) {
    if (u && u.auth) { u.authFails = (u.authFails || []).filter(t => now - t < LOCK_MIN * 60000); u.authFails.push(now); if (u.authFails.length >= MAX_FAILS) { u.authLock = now + LOCK_MIN * 60000; u.authFails = []; } db.save(); }
    if (u && !u.auth) return { ok: false, msg: 'This number has no password yet. Use Register (or Forgot password) to create one.' };
    return bad;
  }
  u.authFails = []; u.authLock = 0; db.save(); return { ok: true, user: u };
}

// ---- forgot password ----
async function forgot(idOrNumber) {
  const u = find(idOrNumber); const generic = { ok: true, msg: 'If that account exists, I sent a code to its WhatsApp.' };
  if (!u || !u.auth) return generic;
  const r = await sendCode(u, 'reset', {}); if (!r.ok && /wait|Too many/.test(r.msg)) return r; if (r.ok && r.pushed === false) return { ok: true, msg: r.msg }; return generic;
}
async function reset(idOrNumber, code, password) {
  const u = find(idOrNumber); if (!u || !u.auth) return { ok: false, msg: 'Wrong code or account.' };
  if (!validPass(password)) return { ok: false, msg: 'Password must be 8 to 72 characters.' };
  const c = checkCode(u, 'reset', code); if (!c.ok) return c;
  const pw = await hashPw(password); u.auth.salt = pw.salt; u.auth.hash = pw.hash; u.authFails = []; u.authLock = 0;
  Object.keys(db.data.sessions).forEach(h => { if (db.data.sessions[h].uid === u.id) delete db.data.sessions[h]; });   // sign out everywhere
  db.save(); return { ok: true, user: u };
}
async function changePassword(u, oldPw, newPw) {
  if (!u.auth) return { ok: false, msg: 'No password set.' };
  if (!(await checkPw(String(oldPw || '').slice(0, 200), u.auth))) return { ok: false, msg: 'Your current password is wrong.' };
  if (!validPass(newPw)) return { ok: false, msg: 'New password must be 8 to 72 characters.' };
  const pw = await hashPw(newPw); u.auth.salt = pw.salt; u.auth.hash = pw.hash; db.save(); return { ok: true };
}
// Set or reset a password for a player whose identity was just verified by the bot (single-use sign-in link). No email, no OTP, nothing sent through chat.
async function setPasswordVerified(u, username, newPw) {
  if (!validPass(newPw)) return { ok: false, msg: 'Password must be 8 to 72 characters.' };
  let name = u.auth ? u.auth.name : String(username || '').trim().toLowerCase();
  if (!u.auth) { if (!validName(name)) return { ok: false, msg: 'Username: 3 to 20 letters, numbers or underscores.' }; const o = names()[name]; if (o && o !== u.id) return { ok: false, msg: 'That username is taken.' }; }
  const pw = await hashPw(newPw);
  if (u.auth) { u.auth.salt = pw.salt; u.auth.hash = pw.hash; } else { u.auth = { name, salt: pw.salt, hash: pw.hash, at: Date.now() }; names()[name] = u.id; u.registered = true; }
  u.authFails = []; u.authLock = 0; db.save(); return { ok: true, username: u.auth.name };
}
module.exports = { pendingFor, hooks, register, verifyRegister, login, forgot, reset, changePassword, setPasswordVerified, find };
