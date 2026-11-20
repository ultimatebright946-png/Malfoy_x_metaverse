'use strict';
// Quest, travel and charm rules shared by the chat commands and the website (one set of server-side checks).
const db = require('./db');
const D = require('./data');
const R = require('./rpg');

const MAX_ACTIVE = 3;
const zid = n => { n = String(n || '').toLowerCase().replace(/[^a-z]/g, ''); return Object.keys(D.ZONES).find(k => k === n || (D.ZONES[k].n.toLowerCase().replace(/[^a-z]/g, '').indexOf(n) === 0 && n.length >= 3)); };

function accept(u, id) {
  id = String(id || '').toLowerCase(); const q = D.QMAP[id];
  if (!q) return { ok: false, msg: 'That quest does not exist.' };
  if (u.rpg.done.indexOf(id) > -1) return { ok: false, msg: 'Already completed.' };
  if (id in u.rpg.quests) return { ok: false, msg: 'Already active.' };
  if (Object.keys(u.rpg.quests).length >= MAX_ACTIVE) return { ok: false, msg: '📜 Max ' + MAX_ACTIVE + ' active quests. Finish or abandon one.' };
  if (u.level < D.ZONES[q.zone].lvl) return { ok: false, msg: '🔒 Needs level ' + D.ZONES[q.zone].lvl + '.' };
  u.rpg.quests[id] = 0; db.save(); return { ok: true, quest: q, msg: '📜 *Quest accepted:* ' + q.name + '\n' + q.desc + '\nReward: ' + q.geo + ' Denarii, ' + q.xp + ' XP' };
}
function abandon(u, id) { id = String(id || '').toLowerCase(); if (!(id in u.rpg.quests)) return { ok: false, msg: 'Not an active quest.' }; delete u.rpg.quests[id]; db.save(); return { ok: true, msg: '🗑️ Quest abandoned.' }; }
function travel(u, q) {
  const id = zid(q); if (!id) return { ok: false, msg: 'Unknown zone.' };
  const z = D.ZONES[id]; if (u.level < z.lvl) return { ok: false, msg: '🔒 ' + z.n + ' needs level ' + z.lvl + '.' };
  u.rpg.zone = id; db.save(); return { ok: true, zone: id, msg: z.e + ' You travel to *' + z.n + '*.' };
}
function equip(u, k) {
  k = String(k || '').toLowerCase(); if (!D.CHARMS[k]) return { ok: false, msg: 'Unknown charm.' };
  if (u.rpg.charms.indexOf(k) === -1) return { ok: false, msg: 'You do not own that charm.' }; if (u.rpg.equipped.indexOf(k) > -1) return { ok: false, msg: 'Already equipped.' };
  if (R.usedNotches(u) + D.CHARMS[k].notch > R.notches(u)) return { ok: false, msg: '❌ Not enough notches (' + R.usedNotches(u) + '/' + R.notches(u) + ').' };
  u.rpg.equipped.push(k); db.save(); return { ok: true, msg: '✅ Equipped ' + D.CHARMS[k].e + ' ' + D.CHARMS[k].n + ' — ' + D.CHARMS[k].desc };
}
function unequip(u, k) { k = String(k || '').toLowerCase(); const i = u.rpg.equipped.indexOf(k); if (i === -1) return { ok: false, msg: 'That charm is not equipped.' }; u.rpg.equipped.splice(i, 1); db.save(); return { ok: true, msg: '➖ Unequipped ' + D.CHARMS[k].n }; }

const questView = (u, q) => ({ id: q.id, name: q.name, desc: q.desc, zone: D.ZONES[q.zone].n, geo: q.geo, xp: q.xp, need: q.t.n, have: u.rpg.quests[q.id] || 0 });
function quests(u) {
  const active = Object.keys(u.rpg.quests).filter(id => D.QMAP[id]).map(id => questView(u, D.QMAP[id]));
  const available = D.QUESTS.filter(q => u.rpg.done.indexOf(q.id) === -1 && !(q.id in u.rpg.quests) && u.level >= D.ZONES[q.zone].lvl).map(q => questView(u, q));
  const locked = D.QUESTS.filter(q => u.rpg.done.indexOf(q.id) === -1 && u.level < D.ZONES[q.zone].lvl).map(q => Object.assign(questView(u, q), { needLevel: D.ZONES[q.zone].lvl }));
  return { max: MAX_ACTIVE, active, available, locked, done: u.rpg.done.filter(id => D.QMAP[id]).map(id => ({ id, name: D.QMAP[id].name })), total: D.QUESTS.length };
}
function world(u) {
  return Object.keys(D.ZONES).map(id => { const z = D.ZONES[id]; return { id, name: z.n, emoji: z.e, level: z.lvl, hub: !!z.hub, unlocked: u.level >= z.lvl, here: u.rpg.zone === id, boss: z.boss ? { name: z.boss.n, hp: z.boss.hp, beaten: (u.rpg.bosses[id] || 0), reward: { geo: z.boss.geo, xp: z.boss.xp } } : null, enemies: z.enemies ? z.enemies.map(e => e.n) : [] }; });
}
function gear(u) {
  const s = R.stats(u), cnt = {}; u.inventory.forEach(id => { cnt[id] = (cnt[id] || 0) + 1; });
  return {
    stats: { masks: s.hp, hp: R.curHp(u), damage: Math.round(s.dmg * (1 + s.dmgPct / 100)), crit: s.crit, soul: s.soul, soulGain: s.soulGain, focusCost: s.focusCost, spell: s.spell, xpBonus: s.xp, geoBonus: s.geo, charm: s.charm },
    weapon: s.weapon ? s.weapon.name : 'Old Gladius', armor: s.armor ? s.armor.name : null,
    items: Object.keys(cnt).map(id => D.SHOP_MAP[id]).filter(Boolean).map(it => ({ id: it.id, name: it.name, emoji: it.emoji, cat: it.cat, desc: it.desc, count: cnt[it.id], usable: !!it.use })),
    charms: u.rpg.charms.map(k => ({ id: k, name: D.CHARMS[k].n, emoji: D.CHARMS[k].e, notch: D.CHARMS[k].notch, desc: D.CHARMS[k].desc, equipped: u.rpg.equipped.indexOf(k) > -1 })),
    notches: { used: R.usedNotches(u), max: R.notches(u) },
  };
}
module.exports = { MAX_ACTIVE, zid, accept, abandon, travel, equip, unequip, quests, world, gear };
