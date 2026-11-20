'use strict';
const db = require('./db');

const ORDER = ['king', 'moderator', 'noble', 'knight', 'citizen', 'peasant', 'exiled'];
const TITLES = {
  king: { title: 'King', icon: '👑', desc: 'The owner and supreme authority.' },
  moderator: { title: 'Moderator', icon: '🛡️', desc: 'Trusted staff with moderation powers.' },
  noble: { title: 'Noble', icon: '🏛️', desc: 'A recognised member of the court.' },
  knight: { title: 'Knight', icon: '⚔️', desc: 'A sworn defender of the Imperium.' },
  citizen: { title: 'Citizen', icon: '🏺', desc: 'A full member of the Imperium.' },
  peasant: { title: 'Peasant', icon: '🌾', desc: 'The default rank of a new player.' },
  exiled: { title: 'Exiled', icon: '⛓️', desc: 'Removed from the Imperium; access is suspended.' },
};
const OWNER_NUMBERS = () => String(process.env.OWNER_NUMBER || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean);
const OWNER_DISCORD = () => String(process.env.DISCORD_OWNER_IDS || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean);
function isOwner(u) {
  if (!u || !u.id) return false;
  const id = String(u.id);
  if (id.startsWith('discord:')) return OWNER_DISCORD().includes(id.replace(/\D/g, ''));
  return OWNER_NUMBERS().includes(id.split('@')[0].replace(/\D/g, ''));
}
function isModerator(u) { return !!(u && u.mod === true); }
function isExiled(u) { return !!(u && u.exiled === true); }
function keyOf(u) {
  if (isOwner(u)) return 'king';
  if (isExiled(u)) return 'exiled';
  if (isModerator(u)) return 'moderator';
  const k = String((u && u.rankTitle) || 'peasant').toLowerCase();
  return Object.prototype.hasOwnProperty.call(TITLES, k) && !['king', 'moderator', 'exiled'].includes(k) ? k : 'peasant';
}
function info(u) { const k = keyOf(u); return Object.assign({ key: k }, TITLES[k]); }
function canModerate(c) { return !!(c && (c.isOwner || isOwner(c.u) || isModerator(c.u))); }
function canExile(c, target) {
  if (!canModerate(c) || !target || isOwner(target) || target.id === c.u.id) return false;
  if (!c.isOwner && !isOwner(c.u) && isModerator(target)) return false;
  return true;
}
function record(u, action, by, reason) {
  if (!Array.isArray(u.modHistory)) u.modHistory = [];
  u.modHistory.push({ action, by: by && by.id || 'system', reason: String(reason || '').slice(0, 180), at: Date.now() });
  if (u.modHistory.length > 30) u.modHistory.splice(0, u.modHistory.length - 30);
}
function setModerator(target, enabled, actor) {
  if (!target || isOwner(target)) return { ok: false, msg: 'The King cannot be changed by this command.' };
  if (isExiled(target)) return { ok: false, msg: 'Pardon this player before changing their staff status.' };
  if (enabled) {
    if (!target.mod) target.rankBeforeMod = target.rankTitle || 'peasant';
    target.mod = true; target.rankTitle = 'moderator';
    record(target, 'appointed moderator', actor);
  } else {
    if (!target.mod) return { ok: false, msg: 'That player is not a moderator.' };
    target.mod = false; target.rankTitle = target.rankBeforeMod || 'peasant'; delete target.rankBeforeMod;
    record(target, 'removed moderator', actor);
  }
  db.save(); return { ok: true, msg: enabled ? target.name + ' is now a Moderator.' : target.name + ' is no longer a Moderator.' };
}
function setTitle(target, title, actor) {
  const k = String(title || '').toLowerCase();
  if (!['noble', 'knight', 'citizen', 'peasant'].includes(k)) return { ok: false, msg: 'Choose noble, knight, citizen or peasant.' };
  if (!target || isOwner(target) || target.mod || isExiled(target)) return { ok: false, msg: 'That player cannot be assigned this title.' };
  target.rankTitle = k; record(target, 'title set to ' + k, actor); db.save();
  return { ok: true, msg: target.name + ' is now ' + TITLES[k].title + '.' };
}
function exile(target, actor, reason, actorIsOwner) {
  if (!canExile({ u: actor, isOwner: !!actorIsOwner || isOwner(actor) }, target)) return { ok: false, msg: 'You cannot exile that player. Moderators cannot exile the King or another Moderator.' };
  if (isExiled(target)) return { ok: false, msg: 'That player is already Exiled.' };
  target.rankBeforeExile = target.mod ? 'moderator' : (target.rankTitle || 'peasant');
  target.exiled = true; target.exiledAt = Date.now(); target.exiledBy = actor.id;
  target.exileReason = String(reason || 'No reason supplied').slice(0, 180);
  record(target, 'exiled', actor, target.exileReason); db.save();
  return { ok: true, msg: target.name + ' has been Exiled. Reason: ' + target.exileReason };
}
function pardon(target, actor, actorIsOwner) {
  if (!canModerate({ u: actor, isOwner: !!actorIsOwner || isOwner(actor) }) || !target || isOwner(target)) return { ok: false, msg: 'You do not have permission to pardon that player.' };
  if (!isExiled(target)) return { ok: false, msg: 'That player is not Exiled.' };
  if (!(actorIsOwner || isOwner(actor)) && target.rankBeforeExile === 'moderator') return { ok: false, msg: 'Only the King may restore an Exiled Moderator.' };
  target.exiled = false; target.rankTitle = target.rankBeforeExile || 'peasant';
  if (target.rankTitle === 'moderator') target.mod = true;
  delete target.rankBeforeExile; delete target.exiledAt; delete target.exiledBy; delete target.exileReason;
  record(target, 'pardoned', actor); db.save();
  return { ok: true, msg: target.name + ' has been pardoned and restored as ' + info(target).title + '.' };
}
function warn(target, actor, reason, actorIsOwner) {
  if (!canModerate({ u: actor, isOwner: !!actorIsOwner || isOwner(actor) }) || !target || isOwner(target) || (!(actorIsOwner || isOwner(actor)) && isModerator(target))) return { ok: false, msg: 'You do not have permission to warn that player.' };
  target.warns = (Number(target.warns) || 0) + 1;
  record(target, 'warning #' + target.warns, actor, reason || 'No reason supplied'); db.save();
  return { ok: true, msg: target.name + ' has received warning #' + target.warns + '.' };
}
function hierarchy() { return ORDER.map(k => TITLES[k]); }
module.exports = { ORDER, TITLES, isOwner, isModerator, isExiled, keyOf, info, canModerate, canExile, setModerator, setTitle, exile, pardon, warn, hierarchy };
