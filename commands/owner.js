'use strict';
// Owner-only tools: database status, backups, restore, bans and a manual card spawn. Never touches auth/session files.
const reg = require('../lib/registry');
const db = require('../lib/db');
const store = require('../lib/store');
const CD = require('../lib/cards');
const MENU = require('../lib/menu');
const gate = fn => c => (c.isOwner ? fn(c) : c.reply('🔒 Owner only.'));
const bad = { ok: false };
reg.add('dbstatus', 'OWNER', gate(c => { const s = store.status(); return c.reply('🗄️ *Database*\nDir: ' + s.dataDir + '\nPlayers: ' + s.players + '\nSchema: v' + s.schema + '\nSaves this run: ' + s.saves + '\nBackups: ' + s.backups + (s.newestBackup ? ' (newest ' + s.newestBackup + ')' : '') + '\nLoaded from: ' + s.source + (s.recoveredFrom ? '\n⚠️ Recovered from ' + s.recoveredFrom : '') + (s.corruptCopy ? '\n⚠️ Corrupt copy kept: ' + s.corruptCopy : '')); }), 'Database health', { owner: true, platforms: ['whatsapp', 'discord'] });
reg.add('backup', 'OWNER', gate(c => { const f = store.backupNow('manual'); return c.reply(f ? '✅ Backup written: ' + require('path').basename(f) : '❌ Backup skipped (no players to protect or write failed).'); }), 'Write a backup now', { owner: true });
reg.add('restore', 'OWNER', gate(c => {
  const list = store.listBackups();
  if (!c.args[0]) return c.reply('♻️ *Backups* (newest first)\n' + (list.slice(0, 12).map((f, i) => (i + 1) + '. ' + require('path').basename(f)).join('\n') || 'none') + '\n\nRestore: ' + MENU.note('restore', c.platform || 'whatsapp') + ' <number> confirm\nA safety copy of the current state is made first.');
  const f = list[parseInt(c.args[0], 10) - 1]; if (!f) return c.reply('❌ No backup with that number.');
  if ((c.args[1] || '').toLowerCase() !== 'confirm') return c.reply('⚠️ This replaces the live database with ' + require('path').basename(f) + '. Add *confirm* to proceed.');
  const r = store.restoreFrom(f); return c.reply((r.ok ? '✅ ' : '❌ ') + r.msg);
}), 'Restore a backup', { owner: true, usage: 'restore [number confirm]' });
const find = c => { const W = require('../lib/webcore'); return W.find(c.args[0]) || (c.target && c.target() && db.data.users[db.resolve ? db.resolve(c.target()) : c.target()]) || null; };
reg.add('ban', 'OWNER', gate(c => { const t = find(c); if (!t) return c.reply('Player not found.'); if (t.id === c.u.id) return c.reply('You cannot ban yourself.'); t.banned = true; db.save(); return c.reply('🚫 Banned ' + t.name + '.'); }), 'Ban a player', { owner: true, usage: 'ban <player>' });
reg.add('unban', 'OWNER', gate(c => { const t = find(c); if (!t) return c.reply('Player not found.'); t.banned = false; db.save(); return c.reply('✅ Unbanned ' + t.name + '.'); }), 'Unban a player', { owner: true, usage: 'unban <player>' });
reg.add('spawncard', 'OWNER', gate(c => { const sp = CD.spawn((c.jid || c.channel || 'owner'), true, c.args[0] && CD.CMAP[String(c.args[0]).toUpperCase()] ? String(c.args[0]).toUpperCase() : null); return c.reply(MENU.spawnText(sp, c.platform || 'whatsapp')); }), 'Force a card spawn here', { owner: true, usage: 'spawncard [card id]' });

// Owner grants: .addgeo <amount> [player], .addxp <amount> [player]. No player = yourself.
function grantTarget(c) {
  const W = require('../lib/webcore'); const rest = c.args.slice(1);
  const t = c.target && c.target(); if (t) return db.data.users[db.resolve ? db.resolve(t) : t] || null;
  if (!rest.length) return c.u;
  return W.find(rest.join(' ')) || W.find(rest[0]);
}
function amountOf(c) { const n = Math.floor(Number(String(c.args[0] || '').replace(/[,_]/g, ''))); return n >= 1 && n <= 1e12 ? n : 0; }
reg.add('addgeo', 'OWNER', gate(c => {
  const n = amountOf(c); if (!n) return c.reply('Use: ' + MENU.note('addgeo', c.platform) + ' <amount> [player]\nNo player means yourself.');
  const t = grantTarget(c); if (!t) return c.reply('Player not found.');
  db.money(t, n, 'owner-grant', 'Granted by the Imperator'); db.save();
  return c.reply('🪙 Added *' + n.toLocaleString('en-US') + '* Denarii to *' + t.name + (t.id === c.u.id ? ' (you)' : '') + '*.\nWallet now: ' + t.coins.toLocaleString('en-US') + ' Denarii');
}), 'Owner: add Denarii to yourself or a player', { owner: true, usage: 'addgeo <amount> [player]' });
reg.add('addxp', 'OWNER', gate(c => {
  const n = amountOf(c); if (!n) return c.reply('Use: ' + MENU.note('addxp', c.platform) + ' <amount> [player]\nNo player means yourself.');
  const t = grantTarget(c); if (!t) return c.reply('Player not found.');
  const R = require('../lib/rpg'), before = t.level; t.xpNeeded = R.xpNeeded(t.level); const ups = R.addXp(t, n); db.save();
  return c.reply('✨ Added *' + n.toLocaleString('en-US') + '* XP to *' + t.name + (t.id === c.u.id ? ' (you)' : '') + '*.\nLevel ' + before + ' → *' + t.level + '*' + (ups ? ' (+' + ups + ' level' + (ups === 1 ? '' : 's') + ')' : ''));
}), 'Owner: add XP to yourself or a player', { owner: true, usage: 'addxp <amount> [player]' });
