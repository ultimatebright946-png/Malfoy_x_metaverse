'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const crypto = require('crypto'); const H = require('./helpers');
process.env.DATA_DIR = H.tmpDir('discord'); process.env.DISCORD_OWNER_IDS = '999000111';
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'owner'].forEach(f => require('../commands/' + f));
const D = require('../platforms/discord'); const db = require('../lib/db'); const reg = require('../lib/registry'); const P = require('../lib/platform'); const ID = require('../lib/identity');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubHex = publicKey.export({ format: 'der', type: 'spki' }).slice(-32).toString('hex');
const calls = []; const rest = async (m, p, b) => { calls.push({ m, p, b }); return {}; };
const bot = D.create({ rest, appId: 'APP1', publicKey: pubHex, cooldownMs: 0 });
let seq = 0;
const sign = (obj, ts) => { const raw = Buffer.from(JSON.stringify(obj)); ts = String(ts || Math.floor(Date.now() / 1000)); return { raw, headers: { 'x-signature-timestamp': ts, 'x-signature-ed25519': crypto.sign(null, Buffer.concat([Buffer.from(ts), raw]), privateKey).toString('hex') } }; };
const slash = (name, opts, user, extra) => Object.assign({ id: 'i' + (++seq), type: 2, token: 'tok' + seq, channel_id: 'chan1', guild_id: 'g1', member: { user: Object.assign({ id: '1000000000000000' + (user || 1), username: 'tester' + (user || 1) }) }, data: { name, options: opts || [] } }, extra);
const run = async (ix) => { const s = sign(ix); const r = await bot.handle(s.raw, s.headers); await bot.idle(); return r; };
const lastText = () => calls.filter(c => c.b && c.b.content).map(c => c.b.content).join('\n');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('rejects bad / missing / stale signatures, answers ping', async () => {
  const ping = { id: 'p1', type: 1 }; let s = sign(ping);
  assert.deepEqual((await bot.handle(s.raw, s.headers)).body, { type: 1 });
  assert.equal((await bot.handle(s.raw, {})).status, 401);
  const tampered = Buffer.from(JSON.stringify({ id: 'p1', type: 1, x: 1 })); assert.equal((await bot.handle(tampered, s.headers)).status, 401);
  s = sign(ping, Math.floor(Date.now() / 1000) - 3600); assert.equal((await bot.handle(s.raw, s.headers)).status, 401);
  const other = crypto.generateKeyPairSync('ed25519'); const ts = String(Math.floor(Date.now() / 1000)), raw = Buffer.from('{"type":1}');
  assert.equal((await bot.handle(raw, { 'x-signature-timestamp': ts, 'x-signature-ed25519': crypto.sign(null, Buffer.concat([Buffer.from(ts), raw]), other.privateKey).toString('hex') })).status, 401);
});

test('/menu defers, then sends real chunks within 2000 chars with slash notation', async () => {
  calls.length = 0; const r = await run(slash('menu'));
  assert.equal(r.body.type, 5);
  const msgs = calls.filter(c => c.b.content); assert.ok(msgs.length >= 2);
  assert.equal(msgs[0].m, 'PATCH'); assert.match(msgs[0].p, /\/webhooks\/APP1\/tok\d+\/messages\/@original/); assert.equal(msgs[1].m, 'POST');
  msgs.forEach(m => assert.ok(m.b.content.length <= 2000));
  const all = lastText(); assert.ok(!/undefined|NaN|\[object/.test(all)); assert.ok(all.includes('/card daily')); assert.ok(!/\*\*\*/.test(all));
  assert.ok(!all.includes('https://chat.whatsapp.com/DEzTmMDm4nxG2ZWIQ0Pvw5')); assert.ok(!/Wounded\?|campfire|Official WhatsApp community/i.test(all)); assert.ok(all.includes('guide') && all.includes('help')); assert.ok(!/GOKU/i.test(all));
});

test('/daily works for a Discord identity and keeps it separate from WhatsApp users', async () => {
  calls.length = 0; await run(slash('daily', [], 2));
  const u = db.data.users['discord:10000000000000002']; assert.ok(u); assert.ok(u.coins > 1000); assert.match(lastText(), /Denarii|daily/i);
  assert.ok(!db.data.users['10000000000000002@s.whatsapp.net']);
});

test('group commands resolve: /card daily, /awaken status, /react hug with user mention', async () => {
  calls.length = 0; await run(slash('card', [{ type: 1, name: 'daily', options: [] }], 3)); assert.match(lastText(), /card/i);
  calls.length = 0; await run(slash('awaken', [{ type: 1, name: 'status', options: [] }], 3)); assert.match(lastText(), /AWAKENING|ᴀᴡᴀᴋᴇɴɪɴɢ/i);
  calls.length = 0; await run(slash('react', [{ type: 1, name: 'hug', options: [{ name: 'user', type: 6, value: '10000000000000004' }] }], 3));
  assert.ok(calls.some(c => c.b && (c.b.content || c.b.files))); assert.ok(!/undefined/.test(lastText()));
});

test('discord can use no WhatsApp-only command; unknown commands are refused politely', async () => {
  assert.ok(!reg.has('sticker', 'discord')); assert.ok(!reg.has('tagall', 'discord'));
  calls.length = 0; await run(slash('run', [{ name: 'command', type: 3, value: 'sticker' }])); assert.match(lastText(), /Unknown command/);
});

test('owner commands are refused for non-owners and work for DISCORD_OWNER_IDS (ephemeral)', async () => {
  calls.length = 0; let r = await run(slash('dbstatus', [], 5)); assert.equal(r.body.data.flags, 64); assert.match(lastText(), /Owner only/);
  const owner = slash('dbstatus', [], 5); owner.member.user.id = '999000111'; calls.length = 0; await run(owner); assert.match(lastText(), /Database/);
});

test('private commands answer ephemerally: /weblogin returns a single-use link and no password/OTP', async () => {
  calls.length = 0; const r = await run(slash('weblogin', [], 6)); assert.equal(r.body.data.flags, 64);
  assert.ok(calls.every(c => c.b.flags === 64)); assert.match(lastText(), /#\/login\//); assert.ok(!/password.*:/i.test(lastText()));
});

test('/link: hashed single-use code links Discord to a website profile; confirm needed when Discord has progress', async () => {
  const web = db.getUser('2348000000001@s.whatsapp.net', 'WebPlayer'); web.level = 7; web.coins = 5000; db.save();
  const st = ID.startDiscordLink(web); assert.ok(st.ok);
  assert.ok(!JSON.stringify(db.data.links).includes(st.code.replace('-', '')), 'raw code must not be stored');
  const d = db.getUser('discord:10000000000000007', 'Dis'); d.level = 3; d.xp = 50; db.save();
  calls.length = 0; await run(slash('link', [{ name: 'args', type: 3, value: st.code }], 7));
  assert.match(lastText(), /already has progress/); assert.ok(!db.data.alias['discord:10000000000000007']);
  calls.length = 0; await run(slash('link', [{ name: 'args', type: 3, value: st.code + ' confirm' }], 7));
  assert.match(lastText(), /Linked/); assert.equal(db.data.alias['discord:10000000000000007'], web.id);
  assert.ok(Object.keys(db.data.archived).some(k => k.startsWith('discord:10000000000000007')), 'old discord profile archived, not deleted');
  calls.length = 0; await run(slash('link', [{ name: 'args', type: 3, value: st.code + ' confirm' }], 8)); assert.match(lastText(), /not valid|expired/, 'code is single use');
  calls.length = 0; await run(slash('profile', [], 7)); assert.match(lastText(), /WebPlayer|Level/i);
  calls.length = 0; await run(slash('unlink', [], 7)); assert.match(lastText(), /unlinked/i); assert.ok(!db.data.alias['discord:10000000000000007']);
});

test('card spawn + claim button: only one of two simultaneous claimants wins', async () => {
  const C = require('../lib/cards'); const sp = C.spawn('discord:chanX', true);
  const btn = (n) => ({ id: 'b' + (++seq), type: 3, token: 't', member: { user: { id: '1000000000000000' + n, username: 'c' + n } }, data: { custom_id: 'claim:' + sp.code } });
  const [a, b] = await Promise.all([bot.handle(...Object.values(sign(btn(1)))), bot.handle(...Object.values(sign(btn(2))))]);
  const wins = [a, b].filter(r => r.body.type === 7); assert.equal(wins.length, 1); assert.equal([a, b].filter(r => r.body.data.flags === 64).length, 1);
});

test('slash definitions obey Discord limits and cover every discord command', () => {
  const d = D.buildDefinitions(); assert.ok(d.commands.length <= 100, 'count ' + d.commands.length);
  const names = new Set(); d.commands.forEach(c => { assert.match(c.name, /^[a-z0-9_-]{1,32}$/); assert.ok(c.description.length >= 1 && c.description.length <= 100); assert.ok(!names.has(c.name)); names.add(c.name); assert.ok((c.options || []).length <= 25); JSON.stringify(c).length < 8000 || assert.fail('too big'); });
  const reachable = new Set(); d.commands.forEach(c => { if (c.name === 'run') return; if ((c.options || []).some(o => o.type === 1)) c.options.forEach(o => reachable.add(c.name + ' ' + o.name)); else reachable.add(c.name); });
  const missing = reg.entries().filter(e => e.platforms.includes('discord')).filter(e => !reachable.has(P.slashParts(e.main).join(' ')) && d.overflow.indexOf(P.slashParts(e.main)[0]) === -1);
  assert.deepEqual(missing.map(e => e.main), []);
  assert.ok(!JSON.stringify(d).includes('sticker'));
});

test('HTTP: mounted endpoint verifies the raw body over a real socket', async () => {
  const mini = require('../lib/mini'); const app = mini(); bot.mount(app, mini); const srv = app.listen(0); await wait(50);
  const port = srv.address().port; const s = sign({ id: 'h1', type: 1 });
  let r = await fetch('http://127.0.0.1:' + port + '/discord/interactions', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, s.headers), body: s.raw });
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { type: 1 });
  r = await fetch('http://127.0.0.1:' + port + '/discord/interactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: s.raw }); assert.equal(r.status, 401);
  srv.close();
});
