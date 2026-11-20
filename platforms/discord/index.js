'use strict';
// Discord adapter (HTTP Interactions). Discord POSTs signed interactions to /discord/interactions; we verify the Ed25519
// signature, defer within 3 seconds, run the same registry commands the WhatsApp bot uses through a small ctx shim, and
// send the output as the deferred reply plus follow-ups. No gateway connection and no bot-token secret is needed to answer.
// Discord players get their own identity ("discord:<snowflake>") unless they link to a website account via /link.
const crypto = require('crypto');
const reg = require('../../lib/registry');
const P = require('../../lib/platform');
const MENU = require('../../lib/menu');
const db = require('../../lib/db');
const ROLES = require('../../lib/roles');
const ID = require('../../lib/identity');

const API = 'https://discord.com/api/v10';
const PRIVATE = new Set(['weblogin', 'linkaccount', 'unlinkaccount', 'dbstatus', 'backup', 'restore', 'ban', 'unban', 'exile', 'pardon', 'warnplayer', 'warnings', 'mod', 'unmod', 'settitle']);
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const TOLERANCE = 5 * 60 * 1000;
const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const owners = () => csv(process.env.DISCORD_OWNER_IDS);

// ---------- signature ----------
function verify(rawBody, sigHex, ts, pubHex) {
  try {
    if (!rawBody || !sigHex || !ts || !pubHex || !/^[0-9a-f]{64}$/i.test(pubHex) || !/^[0-9a-f]{128}$/i.test(sigHex)) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(pubHex, 'hex')]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.concat([Buffer.from(String(ts)), rawBody]), key, Buffer.from(sigHex, 'hex'));
  } catch (e) { return false; }
}

// ---------- slash definitions, built from the live registry ----------
const T = { SUB: 1, GROUP: 2, STRING: 3, USER: 6 };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n) || '-';
const OPTS = () => [{ type: T.STRING, name: 'args', description: 'Arguments', required: false, max_length: 500 }, { type: T.USER, name: 'user', description: 'Target player', required: false }];
function buildDefinitions() {
  const entries = reg.entries().filter(e => e.platforms.indexOf('discord') > -1 && !e.owner);
  const owner = reg.entries().filter(e => e.platforms.indexOf('discord') > -1 && e.owner);
  const top = new Map(), seen = new Set(); const all = entries.concat(owner);
  const GROUP_DESC = { react: 'Reaction actions', meter: 'Fun meters', card: 'Card collection', awaken: 'Awakening' };
  all.forEach(e => {
    const parts = P.slashParts(e.main), key = parts.join(' '); if (seen.has(key)) return; seen.add(key);
    if (parts.length === 1) top.set(parts[0], { type: 1, name: parts[0], description: clip(e.desc || e.cat, 100), options: OPTS(), _main: e.main });
    else { const g = top.get(parts[0]) || { type: 1, name: parts[0], description: GROUP_DESC[parts[0]] || parts[0], options: [], _group: true }; g.options.push({ type: T.SUB, name: parts[1], description: clip(e.desc || e.cat, 100), options: OPTS() }); top.set(parts[0], g); }
  });
  let list = Array.from(top.values()).map(d => { const o = Object.assign({}, d); delete o._main; delete o._group; return o; });
  let overflow = [];
  if (list.length > 100) {            // Discord allows 100 global commands: keep the most useful, send the rest through /run
    const keep = new Set(['menu', 'help', 'daily', 'profile', 'explore', 'boss', 'rest', 'claim', 'weblogin', 'linkaccount', 'unlinkaccount', 'card', 'awaken', 'react', 'meter', 'guild', 'quests', 'shop', 'inventory', 'balance', 'bank']);
    const keepList = list.filter(d => keep.has(d.name) || d.options.some(o => o.type === T.SUB)), rest = list.filter(d => keepList.indexOf(d) === -1);
    list = keepList.slice(0, 99); overflow = rest.concat(keepList.slice(99)).map(d => d.name);
    list.push({ type: 1, name: 'run', description: 'Run any other command by name', options: [{ type: T.STRING, name: 'command', description: 'Command name', required: true, max_length: 32 }].concat(OPTS()) });
  }
  return { commands: list, overflow };
}

// ---------- REST (injectable so tests never touch the network) ----------
function makeRest(token) {
  return async function rest(method, path, body) {
    const headers = { Authorization: 'Bot ' + token, 'User-Agent': 'MalfoyBot (https://github.com, 1.0)' };
    let payload;
    if (body && body.files && body.files.length) {
      const fd = new FormData(); const j = Object.assign({}, body); delete j.files; fd.append('payload_json', JSON.stringify(j));
      body.files.forEach((f, i) => fd.append('files[' + i + ']', new Blob([f.data]), f.name)); payload = fd;
    } else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(API + path, { method, headers, body: payload });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Discord ' + r.status + ' ' + t.slice(0, 200)); }
    const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
  };
}

// ---------- the ctx / sock shim ----------
const isImage = b => Buffer.isBuffer(b) && b.length > 0;
function createOutput(rest, appId, token, ephemeral) {
  let first = true, chain = Promise.resolve(); const sent = [];
  const send = body => {
    const run = async () => {
      const b = Object.assign({ allowed_mentions: { parse: ['users'] } }, body); if (ephemeral) b.flags = 64;
      if (first) { first = false; return rest('PATCH', '/webhooks/' + appId + '/' + token + '/messages/@original', b); }
      return rest('POST', '/webhooks/' + appId + '/' + token, b);
    };
    chain = chain.then(run, run).catch(e => { console.log('[discord] send failed', e && e.message); }); return chain;
  };
  return {
    sent, flush: () => chain,
    text(t, extra) { const parts = MENU.split(MENU.format(t, 'discord'), 1900); sent.push(t); return parts.reduce((p, x, i) => p.then(() => send(Object.assign({ content: x }, i === parts.length - 1 ? extra : null))), Promise.resolve()); },
    file(buf, name, caption) { sent.push('[file ' + name + ']'); return send({ content: caption ? MENU.format(caption, 'discord').slice(0, 1900) : undefined, files: [{ name, data: buf }] }); },
  };
}
function makeCtx(ix, out, user, args, mentioned) {
  const du = ix.member ? ix.member.user : ix.user, key = ID.discordKey(du.id);
  const display = (ix.member && ix.member.nick) || du.global_name || du.username || 'Player';
  const chan = 'discord:' + (ix.channel_id || 'dm');
  const sock = {
    user: { id: 'discord-bot' },
    sendMessage: async (jid, content) => {
      if (content.text != null) await out.text(content.text);
      else if (isImage(content.image)) await out.file(content.image, 'image.png', content.caption);
      else if (isImage(content.video)) await out.file(content.video, 'video.mp4', content.caption);
      else if (isImage(content.audio)) await out.file(content.audio, 'audio.mp3', content.caption);
      else if (content.caption) await out.text(content.caption);
      return { key: { id: 'd' + Date.now(), remoteJid: jid } };
    },
    profilePictureUrl: async () => { throw new Error('not available on Discord'); },
    groupMetadata: async () => { throw new Error('not available on Discord'); },
  };
  const isOwner = owners().indexOf(du.id) > -1;
  return {
    platform: 'discord', sock, msg: { pushName: display, key: { id: ix.id, remoteJid: chan, fromMe: false }, message: {} }, jid: chan, sender: key, sids: [key],
    isGroup: !!ix.guild_id, isOwner, u: user, cmd: '', args, full: args.join(' '), quoted: null, mentioned, quotedSender: null,
    target: () => mentioned[0] || null,
    reply: t => out.text(t), replyPrivate: t => out.text(t),
    download: async () => { throw new Error('Attachments are not supported on Discord yet.'); },
  };
}

// ---------- interaction handling ----------
function optionsOf(data) {
  let o = data.options || [], path = [data.name];
  while (o.length && (o[0].type === T.SUB || o[0].type === T.GROUP)) { path.push(o[0].name); o = o[0].options || []; }
  const get = n => (o.find(x => x.name === n) || {}).value;
  return { path, get, resolved: data.resolved };
}
function resolveName(path, get) {
  if (path[0] === 'run') return String(get('command') || '').toLowerCase().replace(/^[/.]/, '');
  const hit = reg.entries().find(e => e.platforms.indexOf('discord') > -1 && P.slashParts(e.main).join(' ') === path.join(' '));
  return hit ? hit.main : null;
}

function create(opts) {
  opts = opts || {};
  const rest = opts.rest || (process.env.DISCORD_BOT_TOKEN ? makeRest(process.env.DISCORD_BOT_TOKEN) : async () => { throw new Error('DISCORD_BOT_TOKEN is not set'); });
  const appId = () => opts.appId || process.env.DISCORD_APP_ID || '';
  const pub = () => opts.publicKey || process.env.DISCORD_PUBLIC_KEY || '';
  const seen = new Map(), last = new Map(); const C = require('../../lib/cards');

  async function runCommand(ix) {
    const du = ix.member ? ix.member.user : ix.user; if (!du) return;
    const o = optionsOf(ix.data), name = resolveName(o.path, o.get), entry = name && reg.get(name);
    const priv = !!(entry && PRIVATE.has(entry.main)) || ix.data.name === 'link' || ix.data.name === 'unlink';
    const out = createOutput(rest, appId(), ix.token, priv);
    if (!entry || !reg.has(entry.main, 'discord')) { await out.text('❌ Unknown command. Try /menu.'); return out.flush(); }
    const key = ID.discordKey(du.id), display = (ix.member && ix.member.nick) || du.global_name || du.username || 'Player';
    const u = db.getUser(key, display); if (!u.platform) u.platform = 'discord';
    if (u.banned && owners().indexOf(du.id) === -1) { await out.text('🚫 You are banned.'); return out.flush(); }
    if (ROLES.isExiled(u) && owners().indexOf(du.id) === -1) { await out.text('⛓️ You have been Exiled from MALFOY. Your access is suspended.'); return out.flush(); }
    const args = String(o.get('args') || '').split(/\s+/).filter(Boolean), target = o.get('user');
    const mentioned = target ? [ID.discordKey(target)] : [];
    if (target) { const r = o.resolved && o.resolved.users && o.resolved.users[target]; db.getUser(ID.discordKey(target), r && (r.global_name || r.username)); }
    const c = makeCtx(ix, out, u, args, mentioned); c.cmd = entry.main;
    try { await entry.fn(c); }
    catch (e) { console.log('[discord] CMD ERROR', entry.main, e && e.stack || e); await out.text('⚠️ Something went wrong. Try again.'); }
    if (!priv && ix.channel_id) {     // chance of a card spawn, announced after the reply
      try { const sp = C.maybeSpawn('discord:' + ix.channel_id); if (sp) await out.text(MENU.spawnText(sp, 'discord'), { components: [{ type: 1, components: [{ type: 2, style: 3, label: 'Claim', custom_id: 'claim:' + sp.code }] }] }); } catch (e) { console.log('[discord] spawn failed', e && e.message); }
    }
    return out.flush();
  }

  function componentReply(ix) {
    const du = ix.member ? ix.member.user : ix.user, m = /^claim:([A-Z0-9]{4,12})$/.exec(String(ix.data && ix.data.custom_id || ''));
    if (!du || !m) return { type: 4, data: { content: '❌ That button is no longer valid.', flags: 64 } };
    const u = db.getUser(ID.discordKey(du.id), du.global_name || du.username), r = C.claim(u, m[1]);
    if (!r.ok) return { type: 4, data: { content: '❌ ' + r.msg, flags: 64 } };
    return { type: 7, data: { content: '✅ Claimed by <@' + du.id + '>: ' + r.card.rarityName + ' · **' + r.card.name + '**', components: [], allowed_mentions: { parse: [] } } };
  }

  // returns {status, body}
  async function handle(rawBody, headers) {
    if (!verify(rawBody, headers['x-signature-ed25519'], headers['x-signature-timestamp'], pub())) return { status: 401, body: 'invalid request signature' };
    const ts = Number(headers['x-signature-timestamp']); if (!(Math.abs(Date.now() / 1000 - ts) * 1000 < TOLERANCE)) return { status: 401, body: 'stale request' };
    let ix; try { ix = JSON.parse(rawBody.toString('utf8')); } catch (e) { return { status: 400, body: 'bad json' }; }
    if (ix.type === 1) return { status: 200, body: { type: 1 } };
    if (seen.has(ix.id)) return { status: 200, body: { type: 5 } }; seen.set(ix.id, Date.now()); if (seen.size > 500) seen.delete(seen.keys().next().value);
    if (ix.type === 3) return { status: 200, body: componentReply(ix) };
    if (ix.type !== 2) return { status: 400, body: 'unsupported' };
    const du = ix.member ? ix.member.user : ix.user, now = Date.now();
    if (du && now - (last.get(du.id) || 0) < (opts.cooldownMs != null ? opts.cooldownMs : 600)) return { status: 200, body: { type: 4, data: { content: '⏳ Slow down a moment.', flags: 64 } } };
    if (du) last.set(du.id, now); if (last.size > 2000) last.clear();
    const o = optionsOf(ix.data), nm = resolveName(o.path, o.get), e = nm && reg.get(nm), priv = !!(e && PRIVATE.has(e.main)) || ix.data.name === 'link' || ix.data.name === 'unlink';
    const p = runCommand(ix).catch(err => console.log('[discord] run failed', err && err.message));
    handle.pending = (handle.pending || new Set()); handle.pending.add(p); p.then(() => handle.pending.delete(p));
    return { status: 200, body: { type: 5, data: priv ? { flags: 64 } : {} } };
  }
  const idle = () => Promise.all(Array.from(handle.pending || []));

  function mount(app, mini) {
    app.post('/discord/interactions', mini.raw(), async (req, res) => {
      const r = await handle(req.rawBody, req.headers);
      if (typeof r.body === 'string') return res.status(r.status).send(r.body); return res.status(r.status).json(r.body);
    });
  }
  return { handle, mount, idle, verify };
}

// ---------- registering slash commands with Discord (run by hand: npm run discord:register) ----------
async function register(opts) {
  opts = opts || {}; const appId = opts.appId || process.env.DISCORD_APP_ID, guild = opts.guildId || process.env.DISCORD_GUILD_ID;
  if (!appId || !process.env.DISCORD_BOT_TOKEN) throw new Error('Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first.');
  const rest = opts.rest || makeRest(process.env.DISCORD_BOT_TOKEN), d = buildDefinitions();
  await rest('PUT', '/applications/' + appId + (guild ? '/guilds/' + guild : '') + '/commands', d.commands);
  return { count: d.commands.length, overflow: d.overflow, scope: guild ? 'guild ' + guild : 'global' };
}
module.exports = { create, verify, buildDefinitions, register, makeRest, PRIVATE };
