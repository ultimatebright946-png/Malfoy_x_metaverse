// Always run under the supervisor (auto-restart + Neon login/database backup). The supervisor starts this file again as a child.
if (!process.env.MALFOY_CHILD && !process.env.MALFOY_NO_SUPERVISOR) { require('./start'); return; }
require('dotenv').config();
const fs = require('fs');
const pino = require('pino');
const QR = require('qrcode');
const B = require('@whiskeysockets/baileys');
const makeWASocket = B.default || B.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadContentFromMessage, normalizeMessageContent } = B;

const db = require('./lib/db');
const ROLES = require('./lib/roles');
const G = require('./lib/groups');
const M = require('./lib/media');
const R = require('./lib/rpg');
const reg = require('./lib/registry');
const { num, rnd, between } = require('./lib/util');
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'roles', 'owner'].forEach(f => require('./commands/' + f));

const PREFIX = process.env.PREFIX || '.';
const PORT = process.env.PORT || 3000;
const DATA_DIR = db.store.paths.DATA_DIR;          // /var/data by default (see lib/store.js)
const AUTH_DIR = DATA_DIR + '/auth';
const OWNERS = (process.env.OWNER_NUMBER || '').split(',').map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
fs.mkdirSync(AUTH_DIR, { recursive: true });

// ---------------- web server (Render needs a port) ----------------
const STATE = { qr: null, connected: false };
require('./lib/server').start({ routes: app => {
  app.get('/qr', async (q, r) => {
    const expected = String(process.env.QR_KEY || '').trim();
    const supplied = String(q.query.key || '').trim();

    if (!expected) {
      return r.status(503).send('QR_KEY is missing from Render Environment.');
    }

    if (!supplied || supplied !== expected) {
      return r.status(403).send('Invalid QR access key. Check your URL and Render Environment.');
    }

    if (STATE.connected) {
      return r.send('MALFOY WhatsApp is already connected.');
    }

    if (!STATE.qr) {
      return r.send(
        '<meta http-equiv="refresh" content="3">' +
        '<body style="background:#111;color:white;text-align:center;font-family:sans-serif">' +
        '<h2>⚔️ MALFOY</h2><p>Waiting for WhatsApp QR...</p></body>'
      );
    }

    try {
      const img = await QR.toDataURL(STATE.qr);
      return r.send(
        '<meta http-equiv="refresh" content="20">' +
        '<body style="background:#111;color:white;text-align:center;font-family:sans-serif;padding:20px">' +
        '<h2>⚔️ MALFOY WHATSAPP LOGIN</h2>' +
        '<p>WhatsApp → Linked devices → Link a device</p>' +
        '<img src="' + img + '" style="width:320px;max-width:90%;background:white;padding:10px;border-radius:12px">' +
        '</body>'
      );
    } catch (e) {
      console.log('[QR ERROR]', e.message);
      return r.status(500).send('Could not generate QR code.');
    }
  });
} });

// ---------------- helpers ----------------
function textOf(m) {
  const x = m.message; if (!x) return '';
  return x.conversation || (x.extendedTextMessage && x.extendedTextMessage.text) || (x.imageMessage && x.imageMessage.caption) || (x.videoMessage && x.videoMessage.caption) || '';
}
const LINK_RE = /(https?:\/\/|chat\.whatsapp\.com\/|www\.)\S+/i;
async function readStream(st) { const ch = []; for await (const c of st) ch.push(c); return Buffer.concat(ch); }
const seen = new Set();
const AFK_SEEN = new Map();

async function handle(sock, msg) {
  if (!msg || !msg.message || !msg.key || !msg.key.remoteJid) return;
  if (msg.key.fromMe && process.env.ALLOW_SELF !== 'true') return;
  const jid = msg.key.remoteJid;
  if (jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) return;
  if (msg.key.id) { if (seen.has(msg.key.id)) return; seen.add(msg.key.id); if (seen.size > 800) seen.delete(seen.values().next().value); }
  try { msg.message = normalizeMessageContent(msg.message) || msg.message; } catch (e) {}

  const isGroup = jid.endsWith('@g.us');
  try { if (msg.key.participant && msg.key.participantAlt) db.link(msg.key.participant, msg.key.participantAlt); if (msg.key.participant && msg.key.participantPn) db.link(msg.key.participant, msg.key.participantPn); if (!isGroup && msg.key.remoteJidAlt) db.link(jid, msg.key.remoteJidAlt); } catch (e) {}
  const sids = [msg.key.participant, msg.key.participantAlt, msg.key.participantPn].filter(Boolean);
  let sender = msg.key.fromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
    : (isGroup ? (msg.key.participantAlt || msg.key.participantPn || msg.key.participant) : (jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid));
  if (!sender) return;
  const text = textOf(msg).trim();
  const isOwner = !!msg.key.fromMe || OWNERS.indexOf(num(sender)) > -1;
  const u = db.getUser(sender, msg.pushName);
  if (u.banned && !isOwner) return;
  if (ROLES.isExiled(u) && !isOwner) { if (text.indexOf(PREFIX) === 0) sock.sendMessage(jid, { text: '⛓️ You have been Exiled from MALFOY. Your access is suspended.' }, { quoted: msg }).catch(() => {}); return; }

  const ci = (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo) || (msg.message.imageMessage && msg.message.imageMessage.contextInfo) || (msg.message.videoMessage && msg.message.videoMessage.contextInfo) || null;

  // --- moderation (groups) ---
  if (isGroup) {
    const mutedIds = db.muted(jid);
    if (mutedIds.length && !isOwner && [sender].concat(sids).some(i => mutedIds.indexOf(i) > -1 || mutedIds.indexOf(db.resolve(i)) > -1)) { sock.sendMessage(jid, { delete: msg.key }).catch(() => {}); return; }
    const cfg = db.groupCfg(jid);
    if (cfg.antilink && text && LINK_RE.test(text) && !isOwner) {
      const gi = await G.check({ sock, jid, isGroup, sender, sids, isOwner }, false).catch(() => null);
      if (gi && gi.botAdmin && !gi.senderAdmin) {
        sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        sock.sendMessage(jid, { text: '🔗 @' + num(sender) + ' links are not allowed here.', mentions: [sender] }).catch(() => {});
        return;
      }
    }
  }

  // --- chat XP ---
  const now = Date.now();
  if (isGroup && now - u.lastMsgXp > 45000) {
    u.lastMsgXp = now; const r = R.gainXp(u, between(2, 4)); db.save();
    if (r.ups) sock.sendMessage(jid, { text: '🎉 *LEVEL UP!* @' + num(sender) + ' is now level *' + u.level + '*', mentions: [sender] }).catch(() => {});
  }

  // --- card spawns: random, expiring, claimed with .claim <code> ---
  if (isGroup && text && text.indexOf(PREFIX) !== 0) {
    try { const sp = require('./lib/cards').maybeSpawn(jid); if (sp) sock.sendMessage(jid, { text: require('./lib/menu').spawnText(sp, 'whatsapp') }).catch(() => {}); } catch (e) { console.log('SPAWN ERROR', e.message); }
  }

  // --- AFK: welcome back, and tell people who tag someone who is away ---
  if (text && u.afk && text.toLowerCase().indexOf(PREFIX + 'afk') !== 0) {
    const mins = Math.max(1, Math.round((Date.now() - u.afk.t) / 60000)); delete u.afk; db.save();
    sock.sendMessage(jid, { text: '👋 Welcome back @' + num(sender) + '! You were AFK for *' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' min') + '*.', mentions: [sender] }, { quoted: msg }).catch(() => {});
  }
  if (isGroup && ci) {
    const tagged = new Set([].concat(ci.mentionedJid || [], ci.participant ? [ci.participant] : []));
    tagged.forEach(t => {
      const tu = db.data.users[db.resolve(t)];
      if (!tu || !tu.afk || tu.id === u.id) return;
      const k = jid + '|' + tu.id, nowT = Date.now(); if (nowT - (AFK_SEEN.get(k) || 0) < 60000) return; AFK_SEEN.set(k, nowT);
      sock.sendMessage(jid, { text: '😴 @' + num(tu.id) + ' is AFK' + (tu.afk.r ? ': ' + tu.afk.r : '') + '\n_since ' + Math.max(1, Math.round((nowT - tu.afk.t) / 60000)) + ' min ago_', mentions: [tu.id] }, { quoted: msg }).catch(() => {});
    });
  }

  if (!text || text.indexOf(PREFIX) !== 0) return;
  const body = text.slice(PREFIX.length).trim(); if (!body) return;
  const parts = body.split(/\s+/); const cmd = parts.shift().toLowerCase();
  const entry = reg.get(cmd); if (!entry) return;

  const mentioned = (ci && ci.mentionedJid) || [];
  const quotedSender = ci && ci.participant || null;
  const quoted = ci && ci.quotedMessage || null;
  const c = {
    platform: 'whatsapp', sock, msg, jid, sender, sids, isGroup, isOwner, u, cmd, args: parts, full: parts.join(' '), quoted,
    mentioned, quotedSender,
    target: () => mentioned[0] || quotedSender || ((/@(\d{8,15})\b/.exec(text) || [])[1] ? RegExp.$1 + '@s.whatsapp.net' : null),
    reply: (t, m) => sock.sendMessage(jid, { text: t, mentions: m || [] }, { quoted: msg }).catch(e => console.log('REPLY FAIL', e.message)),
    download: async (node, type) => readStream(await downloadContentFromMessage(node, type)),
  };
  try { await entry.fn(c); }
  catch (e) { console.log('CMD ERROR', cmd, e && e.stack || e); c.reply('⚠️ Something went wrong. Try again.'); }
}

// ---------------- connection ----------------
async function startBot() {
  const auth = await useMultiFileAuthState(AUTH_DIR);
  let version; try { version = (await fetchLatestBaileysVersion()).version; } catch (e) {}
  const sock = makeWASocket({
    auth: auth.state, version, logger: pino({ level: 'silent' }), printQRInTerminal: false,
    browser: B.Browsers ? B.Browsers.ubuntu('Chrome') : undefined,
    syncFullHistory: false, markOnlineOnConnect: false, generateHighQualityLinkPreview: false,
  });
  sock.ev.on('creds.update', auth.saveCreds);
  require('./lib/auth').hooks.sendDM = async (jid, text) => { if (!STATE.connected) throw new Error('offline'); await sock.sendMessage(jid, { text }); };
  require('./lib/duel').hooks.notify = (jid, text, mentions) => sock.sendMessage(jid, { text, mentions }).catch(() => {});
  let pairAsked = false;

  sock.ev.on('connection.update', async u => {
    if (u.qr) {
      STATE.qr = u.qr; STATE.connected = false;
      const pn = (process.env.PAIRING_NUMBER || '').replace(/[^0-9]/g, '');
      if (pn && !sock.authState.creds.registered) {
        if (!pairAsked) { pairAsked = true; try { console.log('PAIRING CODE: ' + await sock.requestPairingCode(pn) + '   (WhatsApp > Linked devices > Link with phone number)'); } catch (e) { console.log('Pairing code failed:', e.message); pairAsked = false; } }
      } else if (!pn) { try { require('qrcode-terminal').generate(u.qr, { small: true }); } catch (e) {} }
    }
    if (u.connection === 'open') { STATE.connected = true; STATE.qr = null; console.log('MALFOY CONNECTED'); M.warm(); }
    if (u.connection === 'close') {
      STATE.connected = false;
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output ? u.lastDisconnect.error.output.statusCode : 0;
      try { sock.ev.removeAllListeners(); sock.end && sock.end(undefined); } catch (e) {}
      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out. Moving the old session aside (not deleted); a new login code/QR will be created.');
        try { const keep = AUTH_DIR + '.loggedout'; fs.rmSync(keep, { recursive: true, force: true }); fs.renameSync(AUTH_DIR, keep); fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (e) { console.log('Could not move session aside: ' + e.message); }
      }
      setTimeout(() => startBot().catch(e => console.log('RESTART FAIL', e.message)), code === DisconnectReason.connectionReplaced ? 10000 : 2500);
    }
  });

  // Every message is handled concurrently, so one slow download never delays the others.
  sock.ev.on('messages.upsert', ev => {
    if (ev.type && ev.type !== 'notify') return;
    for (const m of ev.messages) handle(sock, m).catch(e => console.log('HANDLE ERROR', e && e.message));
  });

  sock.ev.on('groups.update', us => us.forEach(g => G.invalidate(g.id)));
  sock.ev.on('group-participants.update', async ev => {
    G.invalidate(ev.id);
    if (ev.action !== 'add' || !db.groupCfg(ev.id).welcome) return;
    try {
      const m = await G.meta(sock, ev.id, true);
      for (const p of ev.participants) {
        const id = typeof p === 'string' ? p : p.id;
        const pic = await M.pfp(sock, id);
        await M.image(sock, ev.id, [pic, () => M.waifu('waifu')], '👋 Welcome @' + num(id) + ' to *' + m.subject + '*!\nType *' + PREFIX + 'menu* to see what I can do. ⚔️', [id]);
      }
    } catch (e) {}
  });
}
// keep yt-dlp current: YouTube changes often and old versions stop working
try { require('child_process').execFile('yt-dlp', ['-U'], { timeout: 120000 }, () => {}); } catch (e) {}
process.on('uncaughtException', e => { console.log('FATAL', e && e.stack || e); process.exit(1); });   // the supervisor starts the bot again
process.on('unhandledRejection', e => console.log('UNHANDLED', e && e.message || e));
// watchdog: if WhatsApp has been disconnected for 10 minutes, restart the whole bot
setInterval(() => { if (STATE.connected) STATE.upAt = Date.now(); else if (Date.now() - (STATE.upAt || (STATE.upAt = Date.now())) > 600000) { console.log('WhatsApp has been offline for 10 minutes, restarting.'); process.exit(1); } }, 30000).unref();
startBot().catch(e => { console.log('START FAIL', e.message); process.exit(1); });
