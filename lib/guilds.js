'use strict';
// Real guilds: membership lives on the player (u.guildId), the guild record holds name, tag, owner, treasury XP and an activity log.
// Existing players keep their "Griffin Guild" label: it becomes a real default guild they are members of.
const crypto = require('crypto');
const db = require('./db');

const CFG = { CREATE_COST: 5000, MAX_LOG: 50, MIN_NAME: 3, MAX_NAME: 24 };
const store = () => db.data.guilds || (db.data.guilds = {});
function ensureDefault() {
  const g = store();
  if (!g.griffin) g.griffin = { id: 'griffin', name: 'Griffin Guild', tag: 'GRF', owner: null, created: Date.now(), xp: 0, open: true, motto: 'The original guild of Malfoy.', log: [] };
  return g.griffin;
}
// Legacy players: u.guild === 'Griffin Guild' and no guildId -> member of the default guild (done lazily, never removes anyone).
function adopt(u) { if (u && !u.guildId && u.guild === 'Griffin Guild' && !u.guildLeft) { ensureDefault(); u.guildId = 'griffin'; } return u; }
const level = g => Math.floor(Math.sqrt((g.xp || 0) / 1000)) + 1;
const members = g => Object.values(db.data.users).filter(u => adopt(u) && u.guildId === g.id);
const logEv = (g, type, u, text) => { g.log.push({ t: Date.now(), type, who: u ? u.name : null, text }); if (g.log.length > CFG.MAX_LOG) g.log.splice(0, g.log.length - CFG.MAX_LOG); };
const find = q => { q = String(q || '').trim().toLowerCase(); if (!q) return null; ensureDefault(); const l = Object.values(store()); return l.find(g => g.id === q) || l.find(g => g.name.toLowerCase() === q) || l.find(g => g.tag.toLowerCase() === q) || l.find(g => g.name.toLowerCase().indexOf(q) === 0) || null; };
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} _\-']/gu, '').trim().replace(/\s+/g, ' ');
function pub(g, viewer) {
  const ms = members(g);
  return { id: g.id, name: g.name, tag: g.tag, level: level(g), xp: g.xp, motto: g.motto || '', open: !!g.open, members: ms.length, owner: g.owner && db.data.users[g.owner] ? db.data.users[g.owner].name : null, mine: !!viewer && viewer.guildId === g.id,
    top: ms.sort((a, b) => b.level - a.level).slice(0, 5).map(u => ({ name: u.name, level: u.level })) };
}
function list(viewer) { ensureDefault(); return Object.values(store()).map(g => pub(g, viewer)).sort((a, b) => b.members - a.members || b.xp - a.xp); }
function mine(u) { adopt(u); return u.guildId && store()[u.guildId] ? store()[u.guildId] : null; }
function create(u, name, tag) {
  adopt(u); name = cleanName(name); tag = String(tag || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5);
  if (mine(u) && u.guildId !== 'griffin') return { ok: false, msg: 'Leave your current guild first.' };
  if (name.length < CFG.MIN_NAME || name.length > CFG.MAX_NAME) return { ok: false, msg: 'Guild names are ' + CFG.MIN_NAME + ' to ' + CFG.MAX_NAME + ' characters.' };
  if (tag.length < 2) tag = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'GLD';
  ensureDefault(); const all = Object.values(store());
  if (all.some(g => g.name.toLowerCase() === name.toLowerCase())) return { ok: false, msg: 'That guild name is taken.' };
  if (all.some(g => g.tag === tag)) return { ok: false, msg: 'That tag is taken. Pick another (2 to 5 letters).' };
  if (u.coins < CFG.CREATE_COST) return { ok: false, msg: 'Founding a guild costs ' + CFG.CREATE_COST + ' Denarii (you have ' + u.coins + ').' };
  db.money(u, -CFG.CREATE_COST, 'guild', 'Founded guild ' + name);
  const id = crypto.randomBytes(4).toString('hex'), g = { id, name, tag, owner: u.id, created: Date.now(), xp: 0, open: true, motto: '', log: [] };
  store()[id] = g; if (u.guildId === 'griffin') logEv(store().griffin, 'leave', u, u.name + ' left to found ' + name); u.guildId = id; u.guild = name; u.guildLeft = false; logEv(g, 'create', u, u.name + ' founded ' + name);
  require('./social').event('guild', u, 'founded the guild ' + name); db.save(); return { ok: true, guild: g, msg: 'Guild ' + name + ' [' + tag + '] founded.' };
}
function join(u, q) {
  adopt(u); const g = find(q); if (!g) return { ok: false, msg: 'Guild not found. See .guild list.' };
  if (u.guildId === g.id) return { ok: false, msg: 'You are already in ' + g.name + '.' };
  if (u.guildId && u.guildId !== 'griffin') return { ok: false, msg: 'Leave your current guild first.' };
  if (!g.open) return { ok: false, msg: g.name + ' is closed to new members.' };
  if (members(g).length >= 100) return { ok: false, msg: 'That guild is full.' };
  if (u.guildId === 'griffin') logEv(store().griffin, 'leave', u, u.name + ' joined ' + g.name);
  u.guildId = g.id; u.guild = g.name; u.guildLeft = false; logEv(g, 'join', u, u.name + ' joined'); require('./social').event('guild', u, 'joined ' + g.name); db.save(); return { ok: true, guild: g, msg: 'You joined ' + g.name + '.' };
}
function leave(u) {
  const g = mine(u); if (!g) return { ok: false, msg: 'You are not in a guild.' };
  if (g.owner === u.id) { const others = members(g).filter(x => x.id !== u.id); if (others.length) { const nx = others.sort((a, b) => b.level - a.level)[0]; g.owner = nx.id; logEv(g, 'owner', nx, nx.name + ' is the new guild master'); } else { delete store()[g.id]; u.guildId = null; u.guild = ''; u.guildLeft = true; db.save(); return { ok: true, msg: 'You left and the empty guild was disbanded.' }; } }
  logEv(g, 'leave', u, u.name + ' left'); u.guildId = null; u.guild = ''; u.guildLeft = true; db.save(); return { ok: true, msg: 'You left ' + g.name + '.' };
}
function deposit(u, amount) {
  const g = mine(u); if (!g) return { ok: false, msg: 'Join a guild first.' };
  amount = Math.floor(Number(amount)); if (!(amount >= 1) || amount > 1e8) return { ok: false, msg: 'Enter an amount of 1 Denarii or more.' };
  if (u.coins < amount) return { ok: false, msg: 'You only have ' + u.coins + ' Denarii.' };
  const before = level(g); db.money(u, -amount, 'guild', 'Donated to ' + g.name); g.xp += amount; logEv(g, 'donate', u, u.name + ' donated ' + amount + ' Denarii'); db.save();
  return { ok: true, msg: 'Donated ' + amount + ' Denarii. ' + g.name + ' is level ' + level(g) + (level(g) > before ? ' (level up!)' : '') + '.' };
}
function setOpen(u, open) { const g = mine(u); if (!g || g.owner !== u.id) return { ok: false, msg: 'Only the guild master can change this.' }; g.open = !!open; db.save(); return { ok: true, msg: g.name + ' is now ' + (g.open ? 'open' : 'closed') + '.' }; }
function setMotto(u, text) { const g = mine(u); if (!g || g.owner !== u.id) return { ok: false, msg: 'Only the guild master can change this.' }; g.motto = require('./social').clean(text, 80); db.save(); return { ok: true, msg: 'Motto updated.' }; }
function activity(u, n) { const g = mine(u); return g ? g.log.slice(-(n || 15)).reverse() : []; }

module.exports = { CFG, ensureDefault, adopt, find, pub, list, mine, create, join, leave, deposit, setOpen, setMotto, activity, members, level };
