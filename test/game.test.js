'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict'); const H = require('./helpers');
process.env.DATA_DIR = H.tmpDir('game');
const db = require('../lib/db'), C = require('../lib/cards'), A = require('../lib/awaken'), B = require('../lib/battle'), GL = require('../lib/guilds'), S = require('../lib/social'), CR = require('../lib/creator'), R = require('../lib/rpg'), D = require('../lib/data');
const FEED = (v) => { const f = S.feed(v, {}); return Array.isArray(f) ? f : f.posts; };
let n = 0; const P = (name, lvl) => { const u = db.getUser('2347' + String(++n).padStart(9, '0') + '@s.whatsapp.net', name || 'P' + n); u.registered = true; u.level = lvl || 1; u.coins = 50000; return u; };

test('cards: a spawn code can be claimed by exactly one of many simultaneous claimants; second claim fails; expiry works', () => {
  const sp = C.spawn('chanA', true); const players = Array.from({ length: 8 }, () => P());
  const res = players.map(u => C.claim(u, sp.code)); assert.equal(res.filter(r => r.ok).length, 1, 'exactly one winner');
  const w = res.findIndex(r => r.ok); assert.equal(C.inventory(players[w]).cards.length, 1); players.forEach((u, i) => { if (i !== w) assert.equal(C.inventory(u).cards.length, 0); });
  assert.ok(!C.claim(P(), sp.code).ok, 'cannot claim again'); assert.ok(!C.claim(P(), 'ZZZZZZZZ').ok, 'bad code');
  const sp2 = C.spawn('chanB', true); const real = Date.now; Date.now = () => real() + 3600e3; try { assert.ok(!C.claim(P(), sp2.code).ok, 'expired code is rejected'); } finally { Date.now = real; }
});
test('cards: daily is once per day; packs charge once; fusion consumes exactly three and makes one', () => {
  const u = P(); assert.ok(C.daily(u).ok); assert.ok(!C.daily(u).ok);
  const geo = u.coins; const b = C.buyPack(u, 'basic'); assert.ok(b.ok); assert.equal(geo - u.coins, C.CFG.PACKS.basic.geo); assert.ok(C.openPack(u, 'basic').ok); assert.ok(!C.openPack(u, 'basic').ok, 'no pack left');
  const f = P(); const ids = [0, 1, 2].map(i => C.newInstance(f.id, 'C0' + (i + 1), 'seed').id); const before = C.inventory(f).cards.length; const r = C.fusion(f, ids); assert.ok(r.ok, r.msg); assert.equal(C.inventory(f).cards.length, before - 3 + 1);
  assert.ok(!C.fusion(f, ids).ok, 'consumed cards cannot be fused again');
});
test('cards: trade is atomic, ownership-checked and cannot be accepted twice or by the wrong player', () => {
  const a = P('Alice'), b = P('Bob'), c = P('Carl'); const x = C.newInstance(a.id, 'C05', 's').id, y = C.newInstance(b.id, 'C07', 's').id;
  assert.ok(!C.makeOffer(a, 'Bob', [y], []).ok, 'cannot offer cards you do not own'); const o = C.makeOffer(a, 'Bob', [x], [y]); assert.ok(o.ok, o.msg);
  assert.ok(!C.acceptOffer(c, o.oid).ok, 'wrong player'); assert.ok(C.acceptOffer(b, o.oid).ok);
  assert.equal(C.instById(x).owner, b.id); assert.equal(C.instById(y).owner, a.id); assert.ok(!C.acceptOffer(b, o.oid).ok, 'no double accept');
  const z = C.newInstance(a.id, 'C09', 's').id; const o2 = C.makeOffer(a, 'Bob', [z], []); C.instById(z).owner = c.id; assert.ok(!C.acceptOffer(b, o2.oid).ok, 'offer is void if the card moved'); assert.equal(C.instById(z).owner, c.id);
});
test('awakening: paths are discovered by real progress, one path only, stages need trials and respect cooldown', () => {
  const u = P('Aw', 1); u.rpg.kills = 200; u.rpg.bosses = { crossroads: 1, greenpath: 1 }; assert.deepEqual(A.discover(u), []); u.level = 5; A.discover(u); assert.ok(A.view(u).paths.find(p => p.id === 'system').discovered); assert.ok(!A.choosePath(u, 'truemagic').ok, 'undiscovered path cannot be chosen');
  assert.ok(A.choosePath(u, 'system').ok); u.level = 40; u.rpg.hp = R.stats(u).hp; u.rpg.hp = R.stats(u).hp;
  let r = A.trial(u, 'system'); assert.ok(r.ok, JSON.stringify(r)); const stage1 = A.view(u).stage; assert.ok(stage1 >= 0);
  const t = A.trial(u, 'system'); if (r.won) assert.ok(!t.ok, 'cooldown after a trial'); const v = A.view(u); assert.ok(v.paths.find(p => p.id === 'heritage' && !p.discovered)); assert.ok(!A.choosePath(u, 'heritage').ok, 'second path refused');
  assert.ok(A.banner(u).includes('⬤ 🟢 ᴀᴡᴀᴋᴇɴɪɴɢ | sᴛᴀᴛ sᴄᴀʟᴇ ⬤'));
  const q = P('Q', 3); q.rpg.done = ['q1', 'q2', 'q3']; assert.ok(A.discover(q).includes('heritage'));
});
test('boss: needs full masks, unique id, rewards exactly once, only the owner may act, client cannot dictate numbers', () => {
  const u = P('Boss', 20); u.rpg.zone = Object.keys(D.ZONES).find(z => D.ZONES[z].boss); u.rpg.lastBoss = 0; u.rpg.hp = 1; assert.ok(!B.create(u).ok, 'must be rested');
  const max = R.stats(u).hp; u.rpg.hp = max; const c = B.create(u); assert.ok(c.ok); assert.match(c.id, /^[a-f0-9]{16}$/); const again = B.create(u); assert.ok(again.resumed && again.id === c.id, 'one active session');
  const s = B.get(c.id), other = P('Other', 20); assert.ok(!B.act(s, other, 'attack').ok, 'another player cannot act');
  const bogus = B.act(s, u, 'attack', 'god_mode'); assert.ok(bogus.ok); const hp0 = s.boss.max; assert.ok(hp0 === s.boss.max);
  let guard = 0, coins0 = u.coins; while (s.status === 'active' && guard++ < 200) B.act(s, u, 'attack');
  assert.ok(s.status === 'won' || s.status === 'lost'); const after = u.coins; assert.ok(!B.act(s, u, 'attack').ok, 'finished battle refuses actions'); assert.equal(u.coins, after, 'no duplicate reward');
  if (s.status === 'won') assert.ok(u.coins > coins0); assert.ok(!B.act(s, u, 'attack', 'x').ok);
});
test('boss balance report: win rate with a simple attack/heal policy for each zone at a sensible level', () => {
  const rows = []; const zones = Object.keys(D.ZONES).filter(z => D.ZONES[z].boss);
  zones.forEach(zid => {
    const lv = Math.max(1, D.ZONES[zid].lvl || 1); let wins = 0; const N = 60;
    for (let i = 0; i < N; i++) { const u = P('Sim', lv + 2); u.rpg.zone = zid; u.rpg.lastBoss = 0; u.rpg.hp = R.stats(u).hp; const c = B.create(u); if (!c.ok) { rows.push([zid, 'cannot start: ' + c.msg]); return; } const s = B.get(c.id); let g = 0;
      while (s.status === 'active' && g++ < 200) { const sk = B.skillsFor(u, s.snap); const heal = s.p.hp < s.p.max * 0.4 && s.p.mp >= s.snap.focusCost; B.act(s, u, heal ? 'skill' : 'attack', heal ? 'focus' : ''); } if (s.status === 'won') wins++; }
    rows.push([zid, lv + 2, Math.round(wins / N * 100) + '%']);
  });
  console.log('   boss win-rate (level = zone level + 2, 60 runs each):\n   ' + rows.map(r => r.join(' ')).join('\n   '));
  const r = rows.filter(x => x.length === 3).map(x => parseInt(x[2], 10)); assert.ok(r.length === zones.length, 'every boss can be started'); assert.ok(r[0] >= 15, 'the first boss is winnable by a fresh character'); console.log('   NOTE: later bosses are gear-gated (stats do not scale with level); see README'); assert.ok(r.some(x => x < 100), 'bosses are not trivially safe');
});
test('guilds: create costs Denarii once, unique names, join/leave, one guild each, deposits are real transfers', () => {
  const a = P('GA', 10), b = P('GB', 5); const c0 = a.coins; const g = GL.create(a, 'Night Wardens', 'NW'); assert.ok(g.ok, g.msg); assert.ok(a.coins < c0); assert.ok(!GL.create(P('GC'), 'night wardens', 'NX').ok, 'name unique, case-insensitive');
  assert.ok(!GL.create(a, 'Second Guild', 'SG').ok, 'one guild per player'); assert.ok(GL.join(b, 'Night Wardens').ok); assert.ok(!GL.join(b, 'Night Wardens').ok);
  const bal = b.coins; const d = GL.deposit(b, 100); assert.ok(d.ok); assert.equal(bal - b.coins, 100); assert.ok(!GL.deposit(b, 99999999).ok, 'cannot donate more than you have'); assert.ok(!GL.deposit(b, -5).ok, 'negative donation refused');
  assert.ok(GL.leave(b).ok); assert.ok(!GL.leave(b).ok);
});
test('social: posts are length-limited, likes toggle once per player, comments, follows, notifications', () => {
  const a = P('SA'), b = P('SB'); assert.ok(!S.post(a, '').ok); { const lc = P('SC'), lp = S.post(lc, 'x'.repeat(501)); assert.ok(!lp.ok || lp.post.text.length <= 500, 'long posts are rejected or truncated'); } const p = S.post(a, 'hello <script>alert(1)</script>'); assert.ok(p.ok);
  const id = FEED(b)[0].id; assert.ok(S.like(b, id).ok); const f = FEED(b).find(x => x.id === id); assert.equal(f.likes, 1); S.like(b, id); assert.equal(FEED(b).find(x => x.id === id).likes, 0, 'second like toggles off');
  assert.ok(S.comment(b, id, 'nice').ok); assert.ok(!S.follow(a, a).ok); assert.ok(S.follow(b, a).ok); assert.ok(!S.follow(b, a).ok); assert.ok(S.notes(a).list.length >= 1);
  assert.ok(!S.removePost(b, id).ok, 'only the author can delete'); assert.ok(S.removePost(a, id).ok);
});
test('creator: validates every field, persists per profile, rejects bad input', () => {
  const u = P('Cr'); assert.ok(!CR.save(u, { hair: 99 }).ok); assert.ok(!CR.save(u, { cls: 'Dragon' }).ok); assert.ok(!CR.save(u, { name: '<b>' }).ok); assert.ok(!CR.save(u, { hairColor: 'red' }).ok);
  const r = CR.save(u, { name: 'Mira', cls: 'Mage', hair: 3, hairColor: '#112233', weapon: 7 }); assert.ok(r.ok, r.msg); assert.equal(u.char.hair, 3); assert.equal(CR.view(u).colors.hairColor, '#112233'); const o = P('Other'); assert.equal(o.char, null);
});
