'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict'); const H = require('./helpers');
process.env.DATA_DIR = H.tmpDir('rob');
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'owner'].forEach(f => require('../commands/' + f));
const db = require('../lib/db'), reg = require('../lib/registry'), ROB = require('../lib/rob');
const mk = (id, name, coins, bank) => { const u = db.getUser(id + '@s.whatsapp.net', name); u.registered = true; u.coins = coins; u.bank = { bal: bank || 0, at: Date.now() }; u.robAt = 0; u.robbedAt = 0; return u; };
const win = () => { let i = 0; return () => [0.1, 0.5][i++ % 2]; }, lose = () => 0.9;

test('rob steals only from the wallet and records both transactions', () => {
  const a = mk('r1', 'Thief', 500), b = mk('r2', 'Mark', 1000, 5000); const r = ROB.rob(a, b, win());
  assert.ok(r.ok && r.win); assert.ok(r.amount > 0 && r.amount <= 300 + 1); assert.equal(b.coins, 1000 - r.amount); assert.equal(a.coins, 500 + r.amount);
  assert.equal(b.bank.bal, 5000, 'bank untouched'); assert.ok(a.tx.some(t => t.k === 'rob') && b.tx.some(t => t.k === 'robbed'));
});
test('Denarii in the bank is safe: empty wallet cannot be robbed', () => {
  const a = mk('r3', 'Thief2', 500), b = mk('r4', 'Banker', 20, 99999); const r = ROB.rob(a, b, win());
  assert.equal(r.ok, false); assert.match(r.msg, /bank/i); assert.equal(a.robAt, 0, 'no cooldown for an impossible attempt'); assert.equal(b.bank.bal, 99999);
});
test('cooldown, victim protection, self and missing target', () => {
  const a = mk('r5', 'T3', 100), b = mk('r6', 'V3', 5000), c = mk('r7', 'V4', 5000);
  assert.ok(ROB.rob(a, b, win()).ok); assert.match(ROB.rob(a, c, win()).msg, /laying low/);
  a.robAt = 0; assert.match(ROB.rob(a, b, win()).msg, /on guard/); assert.match(ROB.rob(a, a, win()).msg, /yourself/); assert.equal(ROB.rob(a, null).ok, false);
});
test('a failed robbery costs a fine paid to the victim', () => {
  const a = mk('r8', 'T5', 2000), b = mk('r9', 'V5', 5000); const r = ROB.rob(a, b, lose);
  assert.ok(r.ok && !r.win); assert.equal(r.amount, 200); assert.equal(a.coins, 1800); assert.equal(b.coins, 5200);
});
test('.rob command works through the registry (by player ID)', async () => {
  const a = mk('r10', 'Cmd', 100), b = mk('r11', 'Victim', 3000); const W = require('../lib/webcore'); let out = '';
  const c = { platform: 'whatsapp', u: a, args: [W.pid(b)], full: W.pid(b), target: () => null, reply: t => { out += t; }, isOwner: false };
  await reg.get('rob').fn(c); assert.match(out, /Robbery successful|Caught/);
});
test('owner can add Denarii and XP to self and others; players cannot', async () => {
  const W = require('../lib/webcore'), R = require('../lib/rpg');
  const o = mk('o1', 'Imperator', 10), p = mk('o2', 'Pawn', 10); p.level = 1; p.xp = 0; p.xpNeeded = R.xpNeeded(1); let out = '';
  const ctx = (u, args, owner) => ({ platform: 'whatsapp', u, args, full: args.join(' '), target: () => null, reply: t => { out = t; }, isOwner: owner });
  await reg.get('addgeo').fn(ctx(o, ['1,000,000'], true)); assert.equal(o.coins, 1000010, 'self by default');
  await reg.get('addgeo').fn(ctx(o, ['5000', W.pid(p)], true)); assert.equal(p.coins, 5010); assert.match(out, /Pawn/);
  await reg.get('addxp').fn(ctx(o, ['50000', W.pid(p)], true)); assert.ok(p.level > 5, 'levelled up: ' + p.level); assert.match(out, /Level 1/);
  const lv = o.level; await reg.get('addxp').fn(ctx(o, ['100000'], true)); assert.ok(o.level > lv, 'self xp');
  const before = p.coins; await reg.get('addgeo').fn(ctx(p, ['999999'], false)); assert.equal(p.coins, before); assert.match(out, /Owner only/);
  await reg.get('addgeo').fn(ctx(o, ['abc'], true)); assert.match(out, /Use:/); await reg.get('addgeo').fn(ctx(o, ['100', 'nobody'], true)); assert.match(out, /not found/);
});
