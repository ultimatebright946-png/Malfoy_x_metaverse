'use strict';
// Platform identities. A Discord player is `discord:<snowflake>` and is a separate profile from any WhatsApp player.
// Two ways to connect to the website / other platform, both started on a trusted side and finished on the other:
//   1. Discord -> website: /website gives a single-use, 15 minute sign-in link (shown only to that Discord user).
//   2. Website -> Discord link: a signed-in website player asks for a link code (shown on the website), then runs /link in Discord.
//      Linking makes the Discord identity an alias of the website profile. Nothing is merged silently.
// No email addresses are collected or trusted, and no passwords or one-time codes are ever sent through Discord.
const crypto = require('crypto');
const db = require('./db');

const CODE_MIN = 10;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const links = () => db.data.links || (db.data.links = {});
const isDiscord = id => /^discord:\d{5,25}$/.test(String(id));
const discordKey = snow => 'discord:' + String(snow).replace(/\D/g, '');
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function sweep(now) { const l = links(); Object.keys(l).forEach(k => { if (l[k].exp < now) delete l[k]; }); }

// website side: create a code for the signed-in player
function startDiscordLink(u) {
  if (isDiscord(u.id)) return { ok: false, msg: 'This profile is already a Discord profile. Start the link from your WhatsApp or website account.' };
  if (u.linked && u.linked.discord) return { ok: false, msg: 'A Discord account is already linked. Unlink it first.' };
  const now = Date.now(), l = links(); sweep(now);
  Object.keys(l).filter(k => l[k].uid === u.id && l[k].purpose === 'discord').forEach(k => delete l[k]);   // one live code per player
  let c = ''; const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) c += ALPHA[b[i] % ALPHA.length];
  l[sha(c)] = { uid: u.id, exp: now + CODE_MIN * 60000, purpose: 'discord', tries: 0 }; db.save();
  return { ok: true, code: c.slice(0, 4) + '-' + c.slice(4), expiresInMin: CODE_MIN };
}

const hasProgress = u => u.level > 1 || u.xp > 0 || (u.rpg && (u.rpg.kills > 0 || (u.rpg.done || []).length > 0)) || (u.inventory || []).length > 0;
// Discord side: /link code:XXXX-XXXX [confirm:true]
function completeDiscordLink(discordId, rawCode, confirm) {
  if (!isDiscord(discordId)) return { ok: false, msg: 'Not a Discord account.' };
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), now = Date.now(), l = links(); sweep(now);
  const key = sha(code), rec = l[key];
  if (!rec || rec.purpose !== 'discord') return { ok: false, msg: 'That code is not valid or has expired. Create a new one on the website (Settings > Linked accounts).' };
  const target = db.data.users[rec.uid]; if (!target) { delete l[key]; return { ok: false, msg: 'That website account no longer exists.' }; }
  if (db.data.alias[discordId] && db.data.alias[discordId] !== target.id) return { ok: false, msg: 'This Discord account is already linked to another player. Use /unlink first.' };
  const own = db.data.users[discordId];
  if (own && hasProgress(own) && !confirm) {
    return { ok: false, needsConfirm: true, msg: 'This Discord profile already has progress (level ' + own.level + '). Linking keeps your *website* profile (' + target.name + ', level ' + target.level + ') and archives the Discord one (it is kept, not deleted, and its cards move to the linked profile). Run /link again with confirm:true to continue.' };
  }
  delete l[key];                                   // single use
  if (own) {
    const arch = db.data.archived || (db.data.archived = {}); arch[discordId + '@' + now] = JSON.parse(JSON.stringify(own));
    const C = db.data.cards; if (C && C.inst) { Object.keys(C.inst).forEach(k => { if (C.inst[k].owner === discordId) C.inst[k].owner = target.id; }); try { require('./cards')._reset(); } catch (e) {} }
    delete db.data.users[discordId];
  }
  db.data.alias[discordId] = target.id;
  target.linked = Object.assign({}, target.linked, { discord: { id: discordId, at: now } });
  (db.data.identities || (db.data.identities = {}))[discordId] = { uid: target.id, at: now };
  require('./social').notify(target, 'link', 'Your Discord account was linked.', null);
  db.save(); return { ok: true, user: target, msg: 'Linked. Your Discord now plays as *' + target.name + '* (level ' + target.level + ') and shares that profile on the website and WhatsApp.' };
}
function unlinkDiscord(u, discordId) {
  const id = discordId || (u.linked && u.linked.discord && u.linked.discord.id);
  if (!id || db.data.alias[id] !== u.id) return { ok: false, msg: 'No Discord account is linked.' };
  delete db.data.alias[id]; if (db.data.identities) delete db.data.identities[id];
  u.linked = Object.assign({}, u.linked, { discord: null }); db.save();
  return { ok: true, msg: 'Discord account unlinked. It will start with its own profile again; your main profile keeps everything.' };
}

// Discord -> website: single-use sign-in link for this Discord player
function webLoginLink(discordId, name) {
  const u = db.getUser(discordId, name); const W = require('./webcore');
  const code = W.makeCode(u.id);
  return { code, url: W.loginLink(code), expiresInMin: 15 };
}
module.exports = { isDiscord, discordKey, startDiscordLink, completeDiscordLink, unlinkDiscord, webLoginLink, hasProgress };
