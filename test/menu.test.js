'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict'); const H = require('./helpers');
process.env.DATA_DIR = H.tmpDir('menu');
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'owner'].forEach(f => require('../commands/' + f));
const M = require('../lib/menu'), reg = require('../lib/registry'), db = require('../lib/db');
const GROUP = 'https://chat.whatsapp.com/DEzTmMDm4nxG2ZWIQ0Pvw5';

for (const pl of ['whatsapp', 'discord']) {
  test(pl + ': menu lists only real commands, within limits, no undefined', () => {
    const u = db.getUser('menu1@s.whatsapp.net', 'Menu');
    const r = M.buildMenu({ platform: pl, u, name: 'Menu', isOwner: false }), all = r.pages.join('\n');
    r.pages.forEach(p => assert.ok(p.length <= (pl === 'discord' ? 1900 : 3500), 'page too long ' + p.length));
    assert.ok(!/undefined|NaN|\[object|null/.test(all)); assert.ok(!all.includes(GROUP)); assert.ok(!/Wounded\\?|campfire|Official WhatsApp community/i.test(all)); assert.ok(all.includes('guide') && all.includes('help')); assert.ok(!/goku awarded/i.test(all));
    const listed = (all.match(/│ ◈ (\S+(?: \S+)?)/g) || []).map(x => x.slice(4));
    assert.ok(listed.length > 40);
    M.sections(pl, false).forEach(s => s.commands.forEach(n => assert.ok(reg.has(n, pl), n + ' must exist on ' + pl)));
    // every real command for the platform appears somewhere (sections + More)
    const shown = new Set(); M.sections(pl, true).forEach(s => s.commands.forEach(n => shown.add(n)));
    reg.entries().filter(e => e.platforms.includes(pl)).forEach(e => assert.ok(shown.has(e.main) || e.names.some(n => shown.has(n)), e.main + ' missing from menu'));
  });
}
test('awakening commands remain without the old banner and path block; creator and cards present', () => {
  const t = M.buildMenu({ platform: 'whatsapp' }).pages.join('\\n');
  assert.ok(t.includes('.awaken')); assert.ok(t.includes('.awakentrial'));
  assert.ok(!t.includes('⬤ 🟢 ᴀᴡᴀᴋᴇɴɪɴɢ | sᴛᴀᴛ sᴄᴀʟᴇ ⬤'));
  assert.ok(!t.includes('☫ ʏᴏᴜʀ ᴘᴏᴛᴇɴᴛɪᴀʟ sʟᴇᴇᴘs ᴅᴏʀᴍᴀɴᴛ...'));
  assert.ok(t.includes('.creator')); assert.ok(t.includes('.carddaily')); assert.ok(t.includes('.claim'));
});
test('owner section hidden for normal users, shown for owner; admin hidden on discord', () => {
  assert.ok(!M.buildMenu({ platform: 'whatsapp', isOwner: false }).pages.join('').includes('dbstatus'));
  assert.ok(M.buildMenu({ platform: 'whatsapp', isOwner: true }).pages.join('').includes('dbstatus'));
  assert.ok(!M.buildMenu({ platform: 'discord', isOwner: true }).pages.join('').includes('tagall'));
});
test('help shows usage, aliases and platforms; unknown help is graceful; section filter works', () => {
  assert.match(M.helpFor('weblogin', 'whatsapp'), /Also: .*website/); assert.match(M.helpFor('nonsense', 'discord'), /No command/); assert.match(M.helpFor('sticker', 'discord'), /only works on whatsapp/);
  assert.ok(M.buildMenu({ platform: 'whatsapp', section: 'cards' }).ok); assert.equal(M.buildMenu({ platform: 'whatsapp', section: 'zzz' }).ok, false);
});
test('.menu / .help handlers do not crash when the banner image is missing or sending fails', async () => {
  const sent = []; const c = { platform: 'whatsapp', jid: 'j', msg: {}, args: [], u: db.getUser('menu2@s.whatsapp.net', 'M2'), isOwner: false, sock: { sendMessage: async (j, x) => { sent.push(x); if (x.image) throw new Error('boom'); } }, reply: async t => sent.push({ text: t }) };
  await reg.get('menu').fn(c); assert.ok(sent.length >= 1 && sent.every(x => x.text));
  await reg.get('help').fn(Object.assign({}, c, { args: ['daily'] })); assert.match(sent[sent.length - 1].text, /daily/);
});
test('format(): discord conversion of bold/italic/commands/mentions; whatsapp untouched', () => {
  assert.equal(M.format('*hi* _there_ .daily @123456789012345678', 'discord'), '**hi** *there* /daily <@123456789012345678>'); assert.equal(M.format('*hi* .daily', 'whatsapp'), '*hi* .daily');
  assert.equal(M.format('file.txt and 3.5 stay', 'discord'), 'file.txt and 3.5 stay');
});
