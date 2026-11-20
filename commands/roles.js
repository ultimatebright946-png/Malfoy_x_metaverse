'use strict';
const reg = require('../lib/registry');
const db = require('../lib/db');
const R = require('../lib/roles');
const W = require('../lib/webcore');

function target(c) {
  const raw = c.target && c.target();
  if (raw) {
    const id = db.resolve ? db.resolve(raw) : raw;
    if (db.data.users[id]) return db.data.users[id];
    const byId = Object.values(db.data.users).find(u => u.id === raw || u.id === id);
    if (byId) return byId;
  }
  const q = c.args[0];
  if (!q) return null;
  if (db.data.users[q]) return db.data.users[q];
  const id = db.resolve ? db.resolve(q) : q;
  if (db.data.users[id]) return db.data.users[id];
  return W.find(q);
}
function remaining(c) {
  const hasMention = !!(c.target && c.target());
  const args = c.args.slice(hasMention ? 0 : 1);
  if (hasMention && c.platform === 'whatsapp' && args[0] && args[0].startsWith('@')) args.shift();
  return args.join(' ').trim();
}
function staff(c) { if (R.canModerate(c)) return true; c.reply('🔒 Only the King and Moderators may use this command.'); return false; }
function king(c) { if (c.isOwner || R.isOwner(c.u)) return true; c.reply('👑 Only the King may appoint staff or change court titles.'); return false; }
function label(u) { const r = R.info(u); return r.icon + ' ' + r.title; }

reg.add('hierarchy', 'COURT', c => {
  const lines = R.hierarchy().map((r, i) => (i + 1) + '. ' + r.icon + ' *' + r.title + '* — ' + r.desc);
  return c.reply('⚜️ *THE IMPERIAL HIERARCHY*\n\n' + lines.join('\n') + '\n\nYour standing: *' + label(c.u) + '*');
}, 'Show the MALFOY rank hierarchy.');
reg.add(['title', 'mytitle'], 'COURT', c => {
  const t = target(c) || c.u;
  return c.reply('⚜️ *' + t.name + '*\nStanding: *' + label(t) + '*' + (t.exiled ? '\nStatus: ACCESS SUSPENDED' : '') + (t.warns ? '\nWarnings: ' + t.warns : ''));
}, 'Show your title or another player’s title.', { usage: 'title [player]' });
reg.add('mod', 'COURT', c => {
  if (!king(c)) return; const t = target(c); if (!t) return c.reply('Use: mod @player or mod <player ID/name>.');
  const r = R.setModerator(t, true, c.u); return c.reply((r.ok ? '🛡️ ' : '❌ ') + r.msg);
}, 'Appoint a Moderator (King only).', { owner: true, usage: 'mod <player>' });
reg.add('unmod', 'COURT', c => {
  if (!king(c)) return; const t = target(c); if (!t) return c.reply('Use: unmod @player or unmod <player ID/name>.');
  const r = R.setModerator(t, false, c.u); return c.reply((r.ok ? '⬇️ ' : '❌ ') + r.msg);
}, 'Remove a Moderator (King only).', { owner: true, usage: 'unmod <player>' });
reg.add('settitle', 'COURT', c => {
  if (!king(c)) return; const t = target(c); if (!t) return c.reply('Use: settitle @player <noble|knight|citizen|peasant>.');
  const title = remaining(c).split(/\s+/)[0] || c.args[1];
  const r = R.setTitle(t, title, c.u); return c.reply((r.ok ? '⚜️ ' : '❌ ') + r.msg);
}, 'Assign a non-staff court title (King only).', { owner: true, usage: 'settitle <player> <title>' });
reg.add('exile', 'COURT', c => {
  if (!staff(c)) return; const t = target(c); if (!t) return c.reply('Use: exile @player [reason].');
  const r = R.exile(t, c.u, remaining(c), c.isOwner); return c.reply((r.ok ? '⛓️ ' : '❌ ') + r.msg);
}, 'Exile a player from MALFOY. King and Moderators only.', { usage: 'exile <player> [reason]' });
reg.add('pardon', 'COURT', c => {
  if (!staff(c)) return; const t = target(c); if (!t) return c.reply('Use: pardon @player.');
  const r = R.pardon(t, c.u, c.isOwner); return c.reply((r.ok ? '🕊️ ' : '❌ ') + r.msg);
}, 'Restore an Exiled player. King and Moderators only.', { usage: 'pardon <player>' });
reg.add('warnplayer', 'COURT', c => {
  if (!staff(c)) return; const t = target(c); if (!t) return c.reply('Use: warnplayer @player [reason].');
  const r = R.warn(t, c.u, remaining(c), c.isOwner); return c.reply((r.ok ? '⚠️ ' : '❌ ') + r.msg);
}, 'Issue a formal player warning. King and Moderators only.', { usage: 'warnplayer <player> [reason]' });
reg.add('warnings', 'COURT', c => {
  if (!staff(c)) return; const t = target(c) || c.u;
  const hist = (t.modHistory || []).filter(x => /^warning/.test(x.action)).slice(-10);
  return c.reply('⚠️ *Warnings — ' + t.name + '*\nTotal: *' + (t.warns || 0) + '*\n' + (hist.length ? hist.map(x => '• ' + new Date(x.at).toLocaleString() + ' — ' + x.reason).join('\n') : 'No recorded warnings.'));
}, 'View warning history. King and Moderators only.', { usage: 'warnings [player]' });
