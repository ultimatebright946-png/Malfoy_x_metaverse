// Website logic that does not need express: login codes, sessions, profile pictures, leaderboard.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const D = require('./data');
const R = require('./rpg');
const M = require('./media');
const S = require('./shop');

const DATA_DIR = process.env.DATA_DIR || '.';
const UPLOADS = path.join(DATA_DIR, 'uploads');
const WEB = path.join(__dirname, '..', 'web');
fs.mkdirSync(UPLOADS, { recursive: true });
db.data.sessions = db.data.sessions || {};

const GALLERY = [{ key: 'dementor-girl', file: 'gallery/dementor-girl.jpg', title: 'Dementor!' }];
const MAX_PFP = 500 * 1024;
const EXT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const baseUrl = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');

// ---- login codes (one-time, 15 minutes, kept in the database so a restart does not lose them) ----
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_MIN = 15, SESSION_DAYS = 30;
function codeStore() { return db.data.codes || (db.data.codes = {}); }
function makeCode(uid) {
  const now = Date.now(), st = codeStore();
  Object.keys(st).forEach(k => { if (st[k].exp < now) delete st[k]; });
  const mine = Object.keys(st).filter(k => st[k].uid === uid).sort((x, y) => st[x].exp - st[y].exp);
  while (mine.length >= 3) delete st[mine.shift()];
  let c = ''; const b = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) c += ALPHA[b[i] % ALPHA.length];
  st[sha(c)] = { uid: uid, exp: now + CODE_MIN * 60000 };
  db.save(); return c;
}
const prettyCode = c => c.slice(0, 4) + '-' + c.slice(4);
function loginLink(code) { return baseUrl() + '/#/login/' + code; }
function redeem(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const st = codeStore(), key = sha(c); if (!st[key]) return null;
  const v = st[key]; delete st[key]; db.save();
  if (v.exp < Date.now() || !db.data.users[v.uid]) return null;
  return v.uid;
}

// ---- sessions (stored hashed, 30 days, renewed while you keep using the site) ----
function newSession(uid, via) {
  const now = Date.now();
  Object.keys(db.data.sessions).forEach(h => { if (db.data.sessions[h].exp < now) delete db.data.sessions[h]; });
  const token = crypto.randomBytes(32).toString('hex');
  db.data.sessions[sha(token)] = { uid: uid, exp: now + SESSION_DAYS * 86400000, via: via || 'password', t0: now };
  db.flush(); return token;
}
function sessionUser(token, renew) {
  if (!token) return null;
  const s = db.data.sessions[sha(token)];
  if (!s || s.exp < Date.now()) return null;
  if (renew && s.exp - Date.now() < (SESSION_DAYS - 1) * 86400000) { s.exp = Date.now() + SESSION_DAYS * 86400000; db.save(); renew.renewed = true; }
  const u = db.data.users[s.uid]; if (u) db.getUser(u.id);
  return u || null;
}
function sessionMeta(token) { const x = token && db.data.sessions[sha(token)]; return x ? { via: x.via || 'password', t0: x.t0 || 0 } : null; }
function endSession(token) { if (token) { delete db.data.sessions[sha(token)]; db.save(); } }

// ---- public id + profile picture ----
const pidIndex = new Map();
function pid(u) { if (!u.pid) { u.pid = crypto.randomBytes(5).toString('hex'); db.save(); } return u.pid; }
function byPid(p) {
  let id = pidIndex.get(p); if (id && db.data.users[id] && db.data.users[id].pid === p) return db.data.users[id];
  const u = Object.values(db.data.users).find(x => x.pid === p); if (u) pidIndex.set(p, u.id); return u || null;
}
function webState(u) { if (!u.web) u.web = { pfp: null, v: 0 }; return u.web; }
function pfpUrl(u) { const w = webState(u); return w.pfp ? '/pfp/' + pid(u) + '?v=' + (w.v || 0) : null; }
function pfpPath(u) {
  const p = webState(u).pfp; if (!p) return null;
  if (p.kind === 'upload') return { file: path.join(UPLOADS, path.basename(p.file)), type: EXT[p.file.split('.').pop()] || 'image/jpeg' };
  const g = GALLERY.find(x => x.key === p.key); return g ? { file: path.join(WEB, g.file), type: 'image/jpeg' } : null;
}
function pfpBuffer(u) { const p = pfpPath(u); if (!p) return null; try { return fs.readFileSync(p.file); } catch (e) { return null; } }

function detectExt(b) {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
function dropUpload(u) { const p = webState(u).pfp; if (p && p.kind === 'upload') { try { fs.unlinkSync(path.join(UPLOADS, path.basename(p.file))); } catch (e) {} } }
function savePfp(u, dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { ok: false, msg: 'Choose a PNG, JPG or WebP image.' };
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_PFP) return { ok: false, msg: 'That image is too large (max 500 KB).' };
  const ext = detectExt(buf); if (!ext) return { ok: false, msg: 'That file is not a valid image.' };
  dropUpload(u);
  const file = pid(u) + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS, file), buf);
  const w = webState(u); w.pfp = { kind: 'upload', file: file }; w.v = Date.now(); db.save();
  return { ok: true };
}
function setGallery(u, key) {
  if (!GALLERY.find(g => g.key === key)) return { ok: false, msg: 'Picture not found.' };
  dropUpload(u); const w = webState(u); w.pfp = { kind: 'gallery', key: key }; w.v = Date.now(); db.save(); return { ok: true };
}
function clearPfp(u) { dropUpload(u); const w = webState(u); w.pfp = null; w.v = Date.now(); db.save(); return { ok: true }; }
function setName(u, name) {
  const n = String(name || '').replace(/[^\p{L}\p{N} _\-]/gu, '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (n.length < 2) return { ok: false, msg: 'Names need at least 2 letters or numbers.' };
  u.name = n; u.registered = true; db.save(); return { ok: true, name: n };
}


// ---- mini game (gladiator run). The client plays; the server decides the reward. ----
const GAME = { DURATION: 60, MAX_RUNS: 6, MAX_XP_DAY: 250, COOLDOWN: 25000, KILL_XP: 2, WIN_XP: 10 };
const runs = new Map();
function gameState(u) {
  const w = webState(u), d = new Date().toISOString().slice(0, 10);
  if (!w.game || w.game.day !== d) w.game = { day: d, runs: 0, xp: 0, last: 0, best: (w.game && w.game.best) || 0, total: (w.game && w.game.total) || 0 };
  return w.game;
}
function gameInfo(u) { const g = gameState(u); return { runsLeft: GAME.MAX_RUNS - g.runs, maxRuns: GAME.MAX_RUNS, xpToday: g.xp, xpCap: GAME.MAX_XP_DAY, best: g.best, total: g.total }; }
function gameStart(u) {
  const g = gameState(u), now = Date.now();
  if (g.runs >= GAME.MAX_RUNS) return { ok: false, msg: 'You used all ' + GAME.MAX_RUNS + ' runs for today. Come back tomorrow.' };
  if (now - g.last < GAME.COOLDOWN) return { ok: false, msg: 'Catch your breath. Next run in ' + Math.ceil((GAME.COOLDOWN - (now - g.last)) / 1000) + ' seconds.' };
  for (const [k, v] of runs) if (now - v.t0 > 10 * 60000) runs.delete(k);
  const s = R.stats(u), id = crypto.randomBytes(12).toString('hex');
  runs.set(id, { uid: u.id, t0: now }); g.runs++; g.last = now; db.save();
  return { ok: true, runId: id, duration: GAME.DURATION, masks: s.hp, damage: Math.max(1, Math.round(s.dmg * (1 + s.dmgPct / 100))), crit: s.crit, soulGain: s.soulGain, focusCost: s.focusCost, level: u.level, info: gameInfo(u) };
}
function gameFinish(u, runId, rep) {
  const run = runs.get(String(runId || ''));
  if (!run || run.uid !== u.id) return { ok: false, msg: 'That run is not valid any more.' };
  runs.delete(String(runId));
  const elapsed = (Date.now() - run.t0) / 1000;
  if (elapsed < 5) return { ok: false, msg: 'That run was too short to count.' };
  rep = rep || {};
  const maxKills = Math.min(80, Math.floor(elapsed / 0.8) + 2);
  const kills = Math.max(0, Math.min(maxKills, Math.floor(Number(rep.kills) || 0)));
  const geo = Math.max(0, Math.min(kills * 3, Math.floor(Number(rep.geo) || 0)));
  const survived = !!rep.survived && elapsed >= GAME.DURATION - 5;
  const g = gameState(u);
  const base = Math.max(0, Math.min(kills * GAME.KILL_XP + (survived ? GAME.WIN_XP : 0), GAME.MAX_XP_DAY - g.xp));
  const r = R.gainXp(u, base);
  db.money(u, geo, 'arena', 'Imperium Arena run'); g.xp += base; g.total += kills; if (kills > g.best) g.best = kills;
  db.save();
  return { ok: true, kills: kills, geo: geo, survived: survived, xp: r.gain, levelUps: r.ups, level: u.level, coins: u.coins, capped: base < kills * GAME.KILL_XP + (survived ? GAME.WIN_XP : 0), info: gameInfo(u) };
}

// ---- data for the site ----
function rankOf(u) { return db.ranked().findIndex(x => x.id === u.id) + 1; }
function leaderboard(by, limit) {
  if (by === 'cards') return require('./cards').leaderboard(Math.min(limit || 50, 100)).map(r => { const u = db.data.users[r.uid]; return { rank: r.rank, name: r.name, level: u.level, xp: u.xp, coins: 0, kills: 0, cards: r.total, score: r.score, unique: r.unique, pfp: pfpUrl(u), pid: r.pid }; });
  const key = by === 'coins' ? u => u.coins : by === 'kills' ? u => u.rpg.kills : u => u.level * 1e6 + u.xp;
  const list = Object.values(db.data.users).filter(u => u.registered || u.level > 1 || u.rpg.kills > 0 || u.xp > 0);
  list.forEach(u => db.getUser(u.id));
  return list.sort((a, b) => key(b) - key(a)).slice(0, Math.min(limit || 50, 100)).map((u, i) => ({
    rank: i + 1, name: u.name, level: u.level, xp: u.xp, coins: u.coins, kills: u.rpg.kills, pfp: pfpUrl(u), pid: pid(u),
  }));
}
function me(u) {
  const s = R.stats(u), sm = D.ALL[(u.soulmate || 0) - 1], court = require('./roles').info(u);
  return {
    id: undefined, name: u.name, pid: pid(u), pfp: pfpUrl(u), court: { title: court.title, icon: court.icon, key: court.key }, level: u.level, xp: u.xp, xpNeeded: u.xpNeeded, coins: u.coins, gems: u.gems, rank: rankOf(u), players: Object.keys(db.data.users).length,
    charm: s.charm, masks: s.hp, hp: R.curHp(u), damage: Math.round(s.dmg * (1 + s.dmgPct / 100)), crit: s.crit, xpBonus: s.xp,
    kills: u.rpg.kills, quests: u.rpg.done.length, bosses: Object.keys(u.rpg.bosses).length, zone: D.ZONES[u.rpg.zone].n, streak: u.streak,
    soulmate: sm ? { name: sm.name, anime: sm.anime, bond: u.soulmateLv, img: M.cachedChar(sm.name, sm.anime) } : null,
    dna: u.dna ? u.dna.parts : null, game: gameInfo(u), look: look(u), gender: u.gender, genderSet: !!u.genderSet, bank: (u.bank && u.bank.bal) || 0,
    gallery: GALLERY.map(g => ({ key: g.key, title: g.title, url: '/' + g.file })),
    platform: u.platform || (/^discord:/.test(u.id) ? 'discord' : 'whatsapp'),
    soul: s.soul, mp: Math.min(s.soul, u.rpg.soul || 0), exploreWaitMs: Math.max(0, 15000 - (Date.now() - u.rpg.lastExplore)),
    cls: u.char ? u.char.cls : null, char: require('./creator').view(u),
    awaken: (function () { const a = u.awaken || {}; const A = require('./awaken'); return { path: a.path || null, pathName: a.path ? A.PATHS[a.path].name : null, stage: a.stage || 0, stageName: a.path ? A.PATHS[a.path].stageNames[a.stage || 0] : null, maxStage: A.MAX_STAGE, discovered: (a.discovered || []).length }; })(),
    guild: (function () { const g = require('./guilds').mine(u); return g ? { id: g.id, name: g.name, tag: g.tag } : null; })(),
    achievements: Object.keys(u.ach || {}).length, unread: (u.notes || []).filter(x => !x.read).length, linked: u.linked || null, google: u.google ? require('./google').mask(u.google.email) : null,
  };
}
function shopList(u) {
  return D.SHOP.map(it => ({ id: it.id, name: it.name, emoji: it.emoji, price: it.price, cat: it.cat, desc: it.desc, owned: u ? S.owned(u, it) : false }));
}

const GROUP_URL = process.env.OFFICIAL_GROUP || 'https://chat.whatsapp.com/DEzTmMDm4nxG2ZWIQ0Pvw5';
function setGender(u, g) { g = String(g || '').toLowerCase(); if (g !== 'male' && g !== 'female') return { ok: false, msg: 'Choose male or female.' }; u.gender = g; u.genderSet = true; db.save(); return { ok: true }; }
function transactions(u, n) { return (u.tx || []).slice(-(n || 50)).reverse().map(x => ({ t: x.t, a: x.a, b: x.b, k: x.k, n: x.n })); }
// find a player by website ID, phone number or username
function find(q) {
  q = String(q || '').trim().replace(/^@/, ''); if (!q) return null;
  const low = q.toLowerCase();
  if (/^[a-f0-9]{10}$/.test(low)) { const p = byPid(low); if (p) return p; }
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length === q.replace(/[\s+\-()]/g, '').length) { const id = db.resolve ? db.resolve(digits + '@s.whatsapp.net') : digits + '@s.whatsapp.net'; if (db.data.users[id]) return db.data.users[id]; const x = Object.values(db.data.users).find(v => String(v.id).split('@')[0] === digits); if (x) return x; }
  const named = Object.values(db.data.users).filter(v => v.name && String(v.name).toLowerCase() === low);
  return named.length === 1 ? named[0] : null;
}
function give(u, to, amount) {
  amount = Math.floor(Number(amount));
  if (!amount || amount < 1 || amount > 1e9) return { ok: false, msg: 'Enter an amount of 1 Denarii or more.' };
  const t = find(to);
  if (!t) return { ok: false, msg: 'No player found. Use their player ID, phone number (with country code) or exact username.' };
  if (t.id === u.id) return { ok: false, msg: 'You cannot send Denarii to yourself.' };
  if (u.coins < amount) return { ok: false, msg: 'You only have ' + u.coins + ' Denarii.' };
  db.money(u, -amount, 'give_out', 'Sent to ' + t.name); db.money(t, amount, 'give_in', 'Received from ' + u.name);
  return { ok: true, msg: 'Sent ' + amount + ' Denarii to ' + t.name + '.', coins: u.coins };
}

// ---- character look (stored as small numbers; the page draws them) ----
const LOOK_MAX = { cloak: 9, mask: 5, eyes: 7, hat: 5, cape: 3, blade: 4 };
function look(u) { const l = u.look || {}, o = {}; Object.keys(LOOK_MAX).forEach(k => { const v = parseInt(l[k], 10); o[k] = v >= 0 && v <= LOOK_MAX[k] ? v : 0; }); return o; }
function setLook(u, b) {
  if (!b || typeof b !== 'object') return { ok: false, msg: 'Nothing to save.' };
  const o = {}; for (const k of Object.keys(LOOK_MAX)) { const v = parseInt(b[k], 10); if (!(v >= 0 && v <= LOOK_MAX[k])) return { ok: false, msg: 'Bad choice for ' + k + '.' }; o[k] = v; }
  u.look = o; db.save(); return { ok: true };
}
module.exports = { find, look, setLook, LOOK_MAX, GROUP_URL, setGender, transactions, give, gameStart, gameFinish, gameInfo, GAME, UPLOADS, WEB, baseUrl, makeCode, prettyCode, loginLink, redeem, newSession, sessionUser, sessionMeta, endSession, pid, byPid, pfpUrl, pfpPath, pfpBuffer, savePfp, setGallery, clearPfp, setName, leaderboard, me, shopList, rankOf, GALLERY, CATS: D.CATS };
