const reg = require('../lib/registry');
const db = require('../lib/db');
const M = require('../lib/media');
const AI = require('../lib/ai');
const D = require('../lib/data');
const R = require('../lib/rpg');
const { rom, http, calc, fmt, pick, num, bar } = require('../lib/util');

const PREFIX = process.env.PREFIX || '.';
const START = Date.now();
const MENU = require('../lib/menu');
const { isOwnerUser } = (() => { try { return require('../lib/web'); } catch (e) { return {}; } })();

// .menu / .help are built by lib/menu from the live registry, so they can never list a missing command.
async function sendPages(c, pages) {
  for (let i = 0; i < pages.length; i++) { try { await c.sock.sendMessage(c.jid, { text: pages[i] }, i === 0 ? { quoted: c.msg } : {}); } catch (e) { console.log('[menu] send failed', e && e.message); } }
}
reg.add(['menu', 'commands'], 'GENERAL', async c => {
  const platform = c.platform || 'whatsapp';
  const owner = !!(c.isOwner || (c.u && c.u.owner));

  const r = MENU.buildMenu({
    platform,
    u: c.u,
    name: (c.u && c.u.name) || (c.msg && c.msg.pushName) || '',
    isOwner: owner,
    section: c.args && c.args[0]
  });

  if (!r.ok) return c.reply(r.pages[0]);

  return sendPages(c, r.pages);
}, 'Show the command menu', { usage: 'menu [section]' });
    // optional banner image: used only if the asset exists, never a crash if it does not
    let img = null; try { img = M.local('menu'); } catch (e) {}
    if (img) {
      // the picture carries only the header (WhatsApp captions are short); the sections follow as normal text
      const i = r.pages[0].indexOf('┏━'), cap = i > 0 ? r.pages[0].slice(0, i).trim() : r.pages[0].slice(0, 900), rest = i > 0 ? [r.pages[0].slice(i)].concat(r.pages.slice(1)) : r.pages.slice(1);
      try { await M.image(c.sock, c.jid, [img], cap, [], c.msg); return sendPages(c, rest); } catch (e) {}
    }
  }
  return sendPages(c, r.pages);
}, 'Show the command menu', { usage: 'menu [section]' });
reg.add('help', 'GENERAL', c => {
  const platform = c.platform || 'whatsapp';
  if (!c.args[0]) return c.reply(MENU.helpFor('menu', platform) + '\n\nSections: ' + MENU.sections(platform, false).map(s => s.key).join(', ') + '\nTry ' + MENU.note('menu', platform) + ' <section>');
  return c.reply(MENU.helpFor(c.args[0], platform));
}, 'Help for one command', { usage: 'help <command>' });
reg.add('ping', 'GENERAL', async c => { const t = Date.now(); const r = await c.reply('🏓 Pong!'); const ms = Date.now() - t; return r; });
reg.add(['alive', 'uptime', 'runtime'], 'GENERAL', c => c.reply('🐍 *Malfoy* is alive\n⏱️ Uptime: ' + fmt(Date.now() - START) + '\n👥 Players: ' + Object.keys(db.data.users).length));
reg.add('owner', 'GENERAL', c => c.reply('👑 Owner: Benjamin'));
reg.add(['ai', 'chat', 'ask'], 'GENERAL', async c => {
  if (!c.full) return c.reply('Use: ' + PREFIX + 'ai what is love');
  const a = await AI.ask(c.full, D.CINFO[c.u.activeChar] ? D.CINFO[c.u.activeChar].n : 'Malfoy');
  return c.reply(a || '😵 My brain lagged. Try again.');
});
reg.add('joke', 'GENERAL', async c => {
  const d = await http('https://v2.jokeapi.dev/joke/Any?safe-mode&type=single');
  return c.reply(d && d.joke ? '😂 ' + d.joke : '😂 Why did the knight cross the road? To get to the other blade.');
});
reg.add('fact', 'GENERAL', async c => {
  const d = await http('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
  return c.reply('🧠 ' + (d && d.text ? d.text : 'Honey never spoils.'));
});
reg.add('quote', 'GENERAL', async c => {
  const d = await http('https://api.quotable.io/random');
  return c.reply(d && d.content ? '💬 "' + d.content + '"\n— ' + d.author : '💬 "Be water, my friend." — Bruce Lee');
});
reg.add(['calc', 'math'], 'GENERAL', c => {
  const r = calc(c.full); return c.reply(r === null ? 'Use: ' + PREFIX + 'calc 12*(3+4)' : '🧮 ' + c.full + ' = *' + r + '*');
});
reg.add('weather', 'GENERAL', async c => {
  const city = c.full || 'Lagos';
  const g = await http('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(city));
  const p = g && g.results && g.results[0]; if (!p) return c.reply('City not found: ' + city);
  const w = await http('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto');
  if (!w || !w.current) return c.reply('Weather failed. Try again.');
  return c.reply('🌤️ *' + p.name + ', ' + (p.country || '') + '*\n🌡️ ' + w.current.temperature_2m + '°C\n💧 ' + w.current.relative_humidity_2m + '%\n💨 ' + w.current.wind_speed_10m + ' km/h');
});
reg.add(['speak', 'tts'], 'GENERAL', async c => {
  if (!c.full) return c.reply('Use: ' + PREFIX + 'speak hello world');
  const b = await M.buf('https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=' + encodeURIComponent(c.full.slice(0, 190)));
  if (!b) return c.reply('Voice failed. Try again.');
  return c.sock.sendMessage(c.jid, { audio: b, mimetype: 'audio/mpeg', ptt: false }, { quoted: c.msg });
});
reg.add(['dice', 'roll'], 'GENERAL', c => c.reply('🎲 You rolled *' + (1 + Math.floor(Math.random() * 6)) + '*'));
reg.add(['flip', 'coin'], 'GENERAL', c => c.reply('🪙 ' + pick(['Heads', 'Tails'])));
reg.add('8ball', 'GENERAL', c => c.reply('🎱 ' + pick(['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Very unlikely.', 'Without a doubt.'])));
reg.add(['top', 'leaderboard', 'lb'], 'GENERAL', c => {
  const r = db.ranked().slice(0, 10); const md = ['🥇', '🥈', '🥉'];
  return c.reply('🏆 *TOP HUNTERS*\n\n' + r.map((u, i) => (md[i] || (i + 1) + '.') + ' ' + u.name + ' — Lv ' + u.level + ' (' + u.xp + ' XP)').join('\n'));
});
reg.add(['rank'], 'GENERAL', c => {
  const r = db.ranked(); const i = r.findIndex(x => x.id === c.u.id) + 1;
  return c.reply('🏅 Your rank: *#' + i + '* of ' + r.length + '\nLevel ' + c.u.level + ' • ' + c.u.xp + '/' + c.u.xpNeeded + ' XP');
});

// .exp : full XP breakdown
reg.add(['exp', 'xp', 'level'], 'GENERAL', c => {
  const u = c.u, s = R.stats(u), pct = Math.floor(u.xp / u.xpNeeded * 100);
  const r = db.ranked(); const rk = r.findIndex(x => x.id === u.id) + 1;
  let t = '✨ *EXPERIENCE — ' + u.name + '*\n\n';
  t += '🎖️ Level: *' + u.level + '*\n';
  t += bar(pct, 12) + ' ' + pct + '%\n';
  t += '📊 XP: *' + u.xp + ' / ' + u.xpNeeded + '*  (' + (u.xpNeeded - u.xp) + ' to next)\n';
  t += '🏅 Rank: #' + rk + '\n\n';
  t += '⚡ *XP bonus: +' + s.xp + '%*\n';
  if (u.soulmateLv) t += '   💘 Soulmate bond +' + u.soulmateLv + '%\n';
  u.inventory.forEach(id => { const it = D.SHOP_MAP[id]; if (it && it.stats && it.stats.xp) t += '   ' + it.emoji + ' ' + it.name + ' +' + it.stats.xp + '%\n'; });
  u.rpg.equipped.forEach(k => { if (D.CHARMS[k].stats.xp) t += '   ' + D.CHARMS[k].e + ' ' + D.CHARMS[k].n + ' +' + D.CHARMS[k].stats.xp + '%\n'; });
  t += '\n📈 *How to earn XP*\n• Chat in groups (small XP)\n• ' + PREFIX + 'explore & ' + PREFIX + 'boss\n• ' + PREFIX + 'quests rewards\n• ' + PREFIX + 'daily / ' + PREFIX + 'work\n• ' + PREFIX + 'shop → LEVELING gear boosts XP';
  return c.reply(t);
});
