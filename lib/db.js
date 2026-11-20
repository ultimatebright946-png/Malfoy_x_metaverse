// In-memory database. Persistence (atomic writes, backups, recovery, migrations, lock) lives in ./store.js.
const D = require('./data');
const store = require('./store');
const data = store.data;
const VER = 5;
const save = store.save, flush = store.flush;

function defaults(jid, name) {
  return {
    id: jid, name: name || 'User', gender: 'male', genderSet: false, age: 18, level: 1, xp: 0, xpNeeded: 100, coins: 1000, gems: 5, treasures: 0,
    streak: 0, lastDaily: 0, lastWork: 0, lastMsgXp: 0, soulmate: 0, soulmateLv: 0,
    miners: [{ id: 1, status: 'IDLE', startedAt: 0, endsAt: 0 }, { id: 2, status: 'IDLE', startedAt: 0, endsAt: 0 }, { id: 3, status: 'LOCKED', startedAt: 0, endsAt: 0 }, { id: 4, status: 'LOCKED', startedAt: 0, endsAt: 0 }],
    companion: { name: 'YUNA', bond: 55, energy: 90, mood: 'Happy' }, characters: {}, inventory: [], guild: 'Griffin Guild',
    activeChar: 'malfoy', lifelongChar: '', registered: false, banned: false, warns: 0, mod: false, rankTitle: 'peasant', exiled: false,
    platform: /^discord:/.test(String(jid)) ? 'discord' : 'whatsapp',
    awaken: { discovered: [], path: null, stage: 0, trial: null, history: [], lastTrial: 0 },
    char: null, ach: {}, guildId: null, cardMeta: { lastDaily: 0, packs: {}, claims: 0 },
    rpg: { hp: 5, soul: 0, zone: 'dirtmouth', quests: {}, done: [], charms: [], equipped: [], kills: 0, bosses: {}, journal: {}, lastRest: 0, lastExplore: 0, lastBoss: 0, deaths: 0, shade: null, explores: 0 },
  };
}
function ensure(u) {
  if (u._v === VER) return;
  const d = defaults(u.id, u.name);
  for (const k in d) if (u[k] === undefined) u[k] = d[k];
  for (const k in d.rpg) if (u.rpg[k] === undefined) u.rpg[k] = d.rpg[k];
  for (const k in d.awaken) if (u.awaken[k] === undefined) u.awaken[k] = d.awaken[k];
  for (const k in d.cardMeta) if (u.cardMeta[k] === undefined) u.cardMeta[k] = d.cardMeta[k];
  if (u.lifelongChar === 'zerotwo') u.lifelongChar = 'erza';
  if (u.activeChar === 'zerotwo') u.activeChar = 'erza';
  if (u.soulmate > D.ALL.length) u.soulmate = 0;
  D.CHARS.forEach(function (c) { if (!u.characters[c]) u.characters[c] = { bond: 20, mood: 'Neutral' }; });
  u._v = VER;
}
function getUser(jid, name) {
  jid = data.alias[jid] || jid;
  let u = data.users[jid];
  if (u) u.xpNeeded = xpFor(u.level || 1);
  if (!u) u = data.users[jid] = defaults(jid, name);
  ensure(u);
  if (name && (u.name === 'User' || !u.registered)) u.name = name;
  return u;
}
// Every Denarii change goes through money() so it is recorded in the player's transaction history.
const xpFor = l => Math.floor(150 * Math.pow(l, 1.8));
function money(u, delta, type, note) {
  delta = Math.trunc(Number(delta) || 0); if (!delta) return 0;
  if (u.coins + delta < 0) delta = -u.coins;
  u.coins += delta;
  if (!u.tx) u.tx = [];
  u.tx.push({ t: Date.now(), a: delta, b: u.coins, k: type || 'other', n: String(note || '').slice(0, 80) });
  if (u.tx.length > 200) u.tx.splice(0, u.tx.length - 200);
  save(); return delta;
}
const resolve = id => data.alias[id] || id;
// WhatsApp can show the same person as a @lid id or a phone @s.whatsapp.net id. Join them into one account.
function link(a, b) {
  const lid = [a, b].find(x => x && x.endsWith('@lid')), pn = [a, b].find(x => x && x.endsWith('@s.whatsapp.net'));
  if (!lid || !pn || data.alias[lid] === pn) return;
  data.alias[lid] = pn;
  const old = data.users[lid];
  if (old) {
    const keep = data.users[pn];
    if (!keep) { old.id = pn; data.users[pn] = old; }
    else { if (old.level > keep.level || (old.level === keep.level && old.xp > keep.xp)) { keep.level = old.level; keep.xp = old.xp; keep.xpNeeded = old.xpNeeded; } keep.coins += old.coins; keep.tx = (keep.tx || []).concat(old.tx || []).sort((x, y) => x.t - y.t).slice(-200); }
    delete data.users[lid];
  }
  save();
}
function groupCfg(jid) { if (!data.groups[jid]) data.groups[jid] = { antilink: false, welcome: false }; return data.groups[jid]; }
function muted(jid) { if (!data.muted[jid]) data.muted[jid] = []; return data.muted[jid]; }
const score = u => u.level * 100000 + u.xp;
function ranked() { return Object.values(data.users).sort((a, b) => score(b) - score(a)); }

module.exports = { store, data, save, flush, xpFor, money, resolve, link, getUser, groupCfg, muted, score, ranked };
