'use strict';
// Interactive boss battles. `.boss` creates a server-side session; the website only sends an action id.
// Stats are read from the saved player when the session starts and kept in the session, HP/MP/boss HP, the random
// generator and the reward flag all live in the database, so a client cannot edit stats, reroll or claim twice.
const crypto = require('crypto');
const db = require('./db');
const D = require('./data');
const R = require('./rpg');
const A = require('./awaken');

const HP_PER_MASK = 10, SESSION_TTL = 30 * 60000, COOLDOWN = 300000, LOG_MAX = 60, KEEP = 300;
const rngHook = { fn: null };                                       // tests can inject a deterministic generator
function rngFor(s) { if (rngHook.fn) return rngHook.fn; return () => { let t = (s.rs += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const store = () => db.data.battles || (db.data.battles = {});
const link = id => require('./webcore').baseUrl() + '/#/boss/' + id;

function purge(now) {
  const b = store(), ids = Object.keys(b);
  ids.forEach(id => { const s = b[id]; if (s.status === 'active' && s.exp < now) { s.status = 'expired'; s.updated = now; } });
  if (ids.length > KEEP) ids.map(id => b[id]).filter(s => s.status !== 'active').sort((x, y) => x.updated - y.updated).slice(0, ids.length - KEEP).forEach(s => delete b[s.id]);
}
function active(u) { const now = Date.now(); purge(now); return Object.values(store()).find(s => s.uid === u.id && s.status === 'active') || null; }

function skillsFor(u, snap) {
  const base = [
    { id: 'focus', name: 'Focus', mp: snap.focusCost, cd: 0, text: 'Heal one mask (10 HP).' },
    { id: 'spirit', name: 'Spirit Bolt', mp: snap.focusCost, cd: 1, text: 'Cast a soul spell.' },
  ];
  return base.concat(A.abilities(u).filter(a => a.kind === 'skill').map(a => ({ id: a.id, name: a.name, mp: a.mp, cd: a.cd, text: a.text })));
}

function create(u) {
  const now = Date.now(); const open = active(u);
  if (open) return { ok: true, resumed: true, id: open.id, link: link(open.id), session: open };
  const zid = u.rpg.zone, zone = D.ZONES[zid];
  if (!zone || !zone.boss) return { ok: false, msg: 'No boss here. Travel with .map first.' };
  if (now - u.rpg.lastBoss < COOLDOWN) return { ok: false, msg: 'The boss is recovering. Try again in ' + Math.ceil((COOLDOWN - (now - u.rpg.lastBoss)) / 1000) + ' seconds.' };
  const s = R.stats(u); if (R.curHp(u) < s.hp) return { ok: false, msg: 'Rest first (.rest). Bosses need full masks.' };
  purge(now);
  const e = zone.boss, id = crypto.randomBytes(8).toString('hex');
  const snap = { dmg: Math.max(1, Math.round(s.dmg * (1 + s.dmgPct / 100))), crit: s.crit, soulGain: s.soulGain, focusCost: s.focusCost, spell: s.spell, geoBonus: s.geo, level: u.level, spellDmg: Math.round((8 + u.level) * 1.4 * (1 + s.spell / 100)) };
  const sess = {
    id, uid: u.id, zone: zid, status: 'active', created: now, updated: now, exp: now + SESSION_TTL, turn: 1, rewarded: false,
    rs: crypto.randomInt(1, 2 ** 31), snap, cd: {}, guard: false, intent: 'attack', result: null,
    boss: { name: e.n, hp: e.hp, max: e.hp, atk: e.atk },
    p: { name: u.name, hp: s.hp * HP_PER_MASK, max: s.hp * HP_PER_MASK, mp: 0, maxMp: s.soul },
    log: [{ t: now, m: '⚔️ ' + e.n + ' blocks the way. Fight!' }],
  };
  u.rpg.lastBoss = now; store()[id] = sess; db.save();
  return { ok: true, resumed: false, id, link: link(id), session: sess };
}

function say(s, m) { s.log.push({ t: Date.now(), m }); if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX); }

function bossTurn(s, rng, bossAtkMult) {
  const b = s.boss; let dmg = 0, text;
  if (s.intent === 'charge') { text = b.name + ' gathers terrible power...'; s.intent = 'heavy'; return { dmg: 0, text }; }
  const heavy = s.intent === 'heavy';
  dmg = Math.round(b.atk * 5 * (heavy ? 2.2 : 1) * (0.85 + rng() * 0.3));
  if (s.guard) dmg = Math.max(1, Math.round(dmg * 0.4));
  text = b.name + (heavy ? ' unleashes a crushing blow' : ' strikes') + (s.guard ? ' (you guard)' : '') + ' for ' + dmg + ' damage.';
  const r = rng(); s.intent = r < 0.25 ? 'charge' : 'attack';
  return { dmg, text };
}

function act(s, u, action, skillId) {
  const now = Date.now(); purge(now);
  if (!s || s.uid !== u.id) return { ok: false, code: 404, msg: 'Battle not found.' };
  if (s.status !== 'active') return { ok: false, code: 409, msg: 'This battle is over (' + s.status + ').' };
  const rng = rngFor(s), snap = s.snap, p = s.p, b = s.boss;
  let dealt = 0, healed = 0; s.guard = false; const turnNo = s.turn;
  if (action === 'flee') { s.status = 'fled'; s.updated = now; say(s, '🏃 You retreat from ' + b.name + '.'); db.save(); return { ok: true, view: view(s) }; }
  if (action === 'attack') {
    let d = snap.dmg * (0.85 + rng() * 0.3), crit = rng() * 100 < snap.crit; if (crit) d *= 1.6; d = Math.max(1, Math.round(d));
    b.hp -= d; dealt = d; p.mp = Math.min(p.maxMp, p.mp + snap.soulGain); say(s, '🗡️ You strike for ' + d + (crit ? ' (critical!)' : '') + '.');
  } else if (action === 'defend') {
    s.guard = true; p.mp = Math.min(p.maxMp, p.mp + 12); say(s, '🛡️ You raise your guard and gather soul.');
  } else if (action === 'skill') {
    const sk = skillsFor(u, snap).find(x => x.id === skillId);
    if (!sk) return { ok: false, code: 400, msg: 'You do not know that skill.' };
    if (p.mp < sk.mp) return { ok: false, code: 400, msg: 'Not enough soul (' + p.mp + '/' + sk.mp + ').' };
    if ((s.cd[sk.id] || 0) > turnNo) return { ok: false, code: 400, msg: sk.name + ' is recharging for ' + (s.cd[sk.id] - turnNo) + ' more turn(s).' };
    p.mp -= sk.mp; s.cd[sk.id] = turnNo + (sk.cd || 0) + 1;
    if (sk.id === 'focus') { if (p.hp >= p.max) { p.mp += sk.mp; s.cd[sk.id] = 0; return { ok: false, code: 400, msg: 'Your masks are already full.' }; } healed = Math.min(HP_PER_MASK, p.max - p.hp); p.hp += healed; say(s, '💙 You focus and restore ' + healed + ' HP.'); }
    else if (sk.id === 'spirit') { const d = Math.max(1, Math.round(snap.spellDmg * (0.9 + rng() * 0.2))); b.hp -= d; dealt = d; say(s, '🔮 Spirit Bolt hits for ' + d + '.'); }
    else {
      const ab = A.PATH_LIST.map(k => A.PATHS[k].abilities).reduce((x, y) => x.concat(y), []).find(x => x.id === sk.id), ef = ab && ab.effect;
      if (!ef) return { ok: false, code: 400, msg: 'That skill cannot be used.' };
      const baseD = ef.type === 'spell' ? snap.spellDmg : snap.dmg, d = Math.max(1, Math.round(baseD * ef.mult * (0.9 + rng() * 0.2)));
      b.hp -= d; dealt = d; say(s, '✨ ' + sk.name + ' hits for ' + d + '.');
      if (ef.heal) { healed = Math.min(ef.heal, p.max - p.hp); p.hp += healed; if (healed) say(s, '💚 You recover ' + healed + ' HP.'); }
    }
  } else return { ok: false, code: 400, msg: 'Unknown action.' };

  if (b.hp <= 0) { b.hp = 0; finish(s, u, true); s.updated = now; db.save(); return { ok: true, view: view(s) }; }
  const t = bossTurn(s, rng); if (t.dmg) p.hp -= t.dmg; say(s, '👑 ' + t.text);
  if (p.hp <= 0) { p.hp = 0; finish(s, u, false); }
  s.turn++; s.updated = now; s.exp = now + SESSION_TTL; db.save();
  return { ok: true, view: view(s) };
}

// Settles the battle exactly once. The rewarded flag is set before any reward is paid.
function finish(s, u, won) {
  if (s.rewarded) return; s.rewarded = true; s.status = won ? 'won' : 'lost';
  const zid = s.zone, zone = D.ZONES[zid], e = zone.boss, st = R.stats(u), now = Date.now();
  const maskHp = Math.max(1, Math.ceil(s.p.hp / HP_PER_MASK));
  if (won) {
    const first = !u.rpg.bosses[zid]; u.rpg.bosses[zid] = (u.rpg.bosses[zid] || 0) + 1; const k = first ? 1 : 0.5;
    const geo = Math.floor(between(Math.random, e.geo[0], e.geo[1]) * k * (1 + st.geo / 100)), g = R.gainXp(u, Math.floor(between(Math.random, e.xp[0], e.xp[1]) * k));
    db.money(u, geo, 'boss', 'Defeated boss ' + e.n); u.rpg.hp = Math.min(st.hp, maskHp); u.rpg.kills++;
    const out = { geo, xp: g.gain, levelUps: g.ups, first, charm: null, quests: [] };
    if (first && e.drop && u.rpg.charms.indexOf(e.drop) === -1) { u.rpg.charms.push(e.drop); out.charm = D.CHARMS[e.drop].n; }
    out.quests = R.progress(u, { type: 'boss', zone: zid });
    const nx = Object.keys(D.ZONES)[Object.keys(D.ZONES).indexOf(zid) + 1]; if (first && nx) out.unlocked = D.ZONES[nx].n;
    s.result = out; say(s, '🏆 ' + e.n + ' is defeated! +' + geo + ' Denarii, +' + g.gain + ' XP.');
    const soc = require('./social'); soc.event('boss', u, 'defeated ' + e.n, { boss: e.n }); soc.checkAch(u); A.discover(u);
  } else {
    const lost = Math.floor(u.coins * 0.3);
    db.money(u, -lost, 'shade', 'Lost to your Wraith in ' + zone.n); u.rpg.shade = { zone: zid, geo: lost }; u.rpg.hp = R.stats(u).hp; u.rpg.zone = 'dirtmouth'; u.rpg.deaths++;
    s.result = { lostGeo: lost }; say(s, '💀 ' + e.n + ' defeated you. Your Wraith holds ' + lost + ' Denarii in ' + zone.n + '.');
  }
  s.updated = now;
}

function view(s) {
  const u = db.data.users[s.uid];
  const skills = u ? skillsFor(u, s.snap).map(k => ({ id: k.id, name: k.name, mp: k.mp, text: k.text, wait: Math.max(0, (s.cd[k.id] || 0) - s.turn), ready: s.p.mp >= k.mp && (s.cd[k.id] || 0) <= s.turn })) : [];
  return {
    id: s.id, status: s.status, turn: s.turn, zone: (D.ZONES[s.zone] || {}).n, expiresInMs: Math.max(0, s.exp - Date.now()),
    boss: { name: s.boss.name, hp: s.boss.hp, max: s.boss.max, intent: s.status === 'active' ? s.intent : null },
    player: { name: s.p.name, hp: s.p.hp, max: s.p.max, mp: s.p.mp, maxMp: s.p.maxMp, attack: s.snap.dmg, guard: s.guard },
    skills, log: s.log.slice(-25), result: s.result,
  };
}
const get = id => { purge(Date.now()); return store()[String(id || '')] || null; };

module.exports = { HP_PER_MASK, COOLDOWN, SESSION_TTL, create, act, get, view, active, link, rngHook, skillsFor };
