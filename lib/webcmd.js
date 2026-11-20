'use strict';
// Runs any registered command for a signed-in website player. Same registry, same game code as WhatsApp/Discord.
// Output is collected as plain items (text / image / audio) and returned to the page.
const reg = require('./registry');
const db = require('./db');
const ROLES = require('./roles');
const MENU = require('./menu');
const isImg = b => Buffer.isBuffer(b) && b.length;
const MAXTEXT = 6000, MAXMEDIA = 3 * 1024 * 1024;

function mime(b, kind) {
  if (kind === 'image') return b[0] === 0xff ? 'image/jpeg' : b[0] === 0x47 ? 'image/gif' : b[0] === 0x52 ? 'image/webp' : 'image/png';
  return kind === 'audio' ? 'audio/mpeg' : 'video/mp4';
}
function list(isOwner) {
  return reg.entries().filter(e => e.platforms.length && (isOwner || !e.owner)).map(e => ({ name: e.main, aliases: e.names.slice(1), cat: e.cat, desc: e.desc, usage: e.usage || e.main, owner: e.owner })).sort((a, b) => a.name.localeCompare(b.name));
}
async function run(u, line, isOwner) {
  const out = [];
  const push = (type, text, extra) => { if (out.length < 12) out.push(Object.assign({ type, text: String(text == null ? '' : text).slice(0, MAXTEXT) }, extra)); };
  line = String(line || '').trim().slice(0, 500).replace(/^[./!]\s*/, '');
  if (!line) return { ok: false, out: [{ type: 'text', text: 'Type a command, for example menu.' }] };
  const parts = line.split(/\s+/), name = parts[0].toLowerCase(), args = parts.slice(1), entry = reg.get(name);
  if (!entry) return { ok: false, out: [{ type: 'text', text: 'Unknown command "' + name.slice(0, 30) + '". Type menu to see every command.' }] };
  if (entry.owner && !isOwner) return { ok: false, out: [{ type: 'text', text: 'That command is for the Imperator only.' }] };
  if (u.banned && !isOwner) return { ok: false, out: [{ type: 'text', text: 'You are banned.' }] };
  if (ROLES.isExiled(u) && !isOwner) return { ok: false, out: [{ type: 'text', text: 'You have been Exiled from MALFOY.' }] };
  const media = (kind, buf, caption) => { if (!isImg(buf) || buf.length > MAXMEDIA) return push('text', caption || '[' + kind + ' too large to show here]'); push(kind, caption || '', { data: 'data:' + mime(buf, kind) + ';base64,' + buf.toString('base64') }); };
  const sock = {
    user: { id: 'web' },
    sendMessage: async (jid, c) => {
      if (c.text != null) push('text', c.text);
      else if (isImg(c.image)) media('image', c.image, c.caption);
      else if (isImg(c.audio)) media('audio', c.audio, c.caption);
      else if (isImg(c.video)) media('video', c.video, c.caption);
      else if (c.caption) push('text', c.caption);
      return { key: { id: 'w' + Date.now(), remoteJid: jid } };
    },
    profilePictureUrl: async () => { throw new Error('not available on the website'); },
    groupMetadata: async () => { throw new Error('Group tools only work inside a WhatsApp group.'); },
  };
  const c = {
    platform: 'whatsapp', web: true, sock, msg: { pushName: u.name, key: { id: 'w' + Date.now(), remoteJid: 'web:' + u.id, fromMe: false }, message: {} }, jid: 'web:' + u.id,
    sender: u.id, sids: [u.id], isGroup: false, isOwner: !!isOwner, u, cmd: entry.main, args, full: args.join(' '), quoted: null, mentioned: [], quotedSender: null,
    target: () => null, reply: t => { push('text', t); return Promise.resolve(); }, replyPrivate: t => { push('text', t); return Promise.resolve(); },
    download: async () => { throw new Error('Attachments are not supported on the website.'); },
  };
  try {
    if (entry.main === 'menu' || entry.main === 'commands') {
      const r = MENU.buildMenu({ platform: 'whatsapp', u, name: u.name, isOwner: !!isOwner, section: args[0] });
      r.pages.forEach(p => push('text', p));
    } else await entry.fn(c);
  } catch (e) { console.log('[webcmd] ERROR', entry.main, e && e.stack || e); push('text', 'Something went wrong. Try again.'); }
  try { db.save && db.save(); } catch (e) {}
  return { ok: true, cmd: entry.main, out: out.length ? out : [{ type: 'text', text: '(done)' }] };
}
module.exports = { run, list };
