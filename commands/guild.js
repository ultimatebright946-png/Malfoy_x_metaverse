'use strict';
const reg = require('../lib/registry');
const G = require('../lib/guilds');
const M = require('../lib/menu');
reg.add('guild', 'GUILD', c => {
  const n = x => M.note(x, c.platform || 'whatsapp'), sub = (c.args[0] || 'info').toLowerCase(), rest = c.args.slice(1).join(' ');
  const say = r => c.reply((r.ok ? '✅ ' : '❌ ') + r.msg);
  if (sub === 'list') return c.reply('🏰 *Guilds*\n' + G.list().slice(0, 15).map(g => '• [' + g.tag + '] *' + g.name + '* Lv' + g.level + ' — ' + g.members + ' members' + (g.open ? '' : ' 🔒')).join('\n'));
  if (sub === 'create') { const m = /^(.+?)(?:\s+\[?([A-Za-z0-9]{2,5})\]?)?$/.exec(rest); return say(G.create(c.u, m ? (m[2] ? m[1] : rest) : rest, m && m[2])); }
  if (sub === 'join') return say(G.join(c.u, rest));
  if (sub === 'leave') return say(G.leave(c.u));
  if (sub === 'donate') return say(G.deposit(c.u, c.args[1]));
  if (sub === 'open' || sub === 'close') return say(G.setOpen(c.u, sub === 'open'));
  if (sub === 'motto') return say(G.setMotto(c.u, rest));
  if (sub === 'activity') { const a = G.activity(c.u, 10); return c.reply(a.length ? '📜 *Guild activity*\n' + a.map(e => '• ' + e.text).join('\n') : '📜 No activity (or you have no guild).'); }
  const g = G.mine(c.u); if (!g) return c.reply('🏰 You are not in a guild.\n' + n('guild', c) + ' list · join <name> · create <name> [TAG]');
  const p = G.pub(g, c.u);
  return c.reply('🏰 *' + p.name + '* [' + p.tag + '] Lv' + p.level + '\n' + (p.motto ? '_' + p.motto + '_\n' : '') + '👑 Master: ' + p.owner + '\n👥 ' + p.members + ' members · XP ' + p.xp + '\nTop: ' + p.top.map(t => t.name + ' (Lv' + t.level + ')').join(', ') + '\n\n' + n('guild', c) + ' list | join | leave | donate <n> | activity | motto <text> | open | close');
}, 'Guild hall', { usage: 'guild [list|join|create|leave|donate|activity|motto|open|close]' });
