'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict'); const H = require('./helpers');
process.env.DATA_DIR = H.tmpDir('grim');
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'owner'].forEach(f => require('../commands/' + f));
const db = require('../lib/db'), reg = require('../lib/registry'), R = require('../lib/rpg'), GR = require('../lib/grimoire');
const mk = (id, lvl) => { const u = db.getUser(id + '@s.whatsapp.net', id); u.registered = true; u.level = lvl; u.xpNeeded = R.xpNeeded(lvl); return u; };
const run = async (u, name, args) => { let out = ''; await reg.get(name).fn({ platform: 'whatsapp', u, args, full: args.join(' '), target: () => null, reply: t => { out += t; }, isOwner: false }); return out; };

test('affinity is chosen once, needs level 5, and spells unlock with level', async () => {
  const u = mk('gr1', 3); assert.match(await run(u, 'grimoire', ['choose', 'flame']), /opens at level 5/);
  u.level = 5; assert.match(await run(u, 'grimoire', ['choose', 'nonsense']), /Unknown affinity/); assert.match(await run(u, 'grimoire', ['choose', 'flame']), /Flame Magic/);
  assert.match(await run(u, 'grimoire', ['choose', 'tide']), /cannot be changed/);
  assert.deepEqual(GR.spells(u).map(s => s.unlocked), [true, false, false, false]); u.level = 40; assert.deepEqual(GR.spells(u).map(s => s.unlocked), [true, true, true, false]);
});
test('casting spends soul, applies a timed buff to stats, and respects cooldown', async () => {
  const u = mk('gr2', 20); await run(u, 'grimoire', ['choose', 'flame']); u.rpg.soul = 99;
  const base = R.stats(u).dmgPct; const out = await run(u, 'cast', ['2']); assert.match(out, /Cinder Veil/); assert.equal(u.rpg.soul, 69);
  const s = R.stats(u); assert.ok(s.dmgPct >= base + 16 && s.crit >= 10, 'buff in stats()');
  assert.match(await run(u, 'cast', ['2']), /recharging/); u.grimoire.buff.until = Date.now() - 1; assert.ok(R.stats(u).dmgPct < s.dmgPct, 'buff expires');
  assert.match(await run(u, 'cast', ['4']), /unlocks at level 60/); u.rpg.soul = 1; u.grimoire.cast = {}; assert.match(await run(u, 'cast', ['1']), /Not enough soul/);
});
test('healing affinities restore masks (never above max); everything shows in the menu', async () => {
  const u = mk('gr3', 20); await run(u, 'grimoire', ['choose', 'tide']); u.rpg.soul = 99; u.rpg.hp = 1; const out = await run(u, 'cast', ['1']);
  assert.match(out, /Recovered 1 mask/); assert.equal(u.rpg.hp, 2); u.rpg.hp = R.stats(u).hp; u.grimoire.cast = {}; assert.doesNotMatch(await run(u, 'cast', ['1']), /Recovered/);
  const M = require('../lib/menu'); const t = M.buildMenu({ platform: 'whatsapp', u }).pages.join('\n'); assert.ok(t.includes('.grimoire') && t.includes('.cast'));
});
