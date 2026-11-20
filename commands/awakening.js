'use strict';
// Awakening + character creator commands. All rules live in lib/awaken.js and lib/creator.js (shared with the website).
const reg = require('../lib/registry');
const A = require('../lib/awaken');
const CR = require('../lib/creator');
const M = require('../lib/menu');
const P = process.env.PREFIX || '.';
const n = (name, c) => M.note(name, c.platform || 'whatsapp');

reg.add('awaken', 'AWAKENING', c => {
  const v = A.view(c.u);
  let t = A.banner(c.u) + '\n\n';
  if (v.path) t += '☫ Path: *' + A.PATHS[v.path].name + '*  stage ' + v.stage + '/' + v.maxStage + ' (' + v.stageName + ')\n';
  else t += '☫ No path chosen yet.\n';
  const b = Object.keys(v.bonus).map(k => '+' + v.bonus[k] + ' ' + k).join(', '); if (b) t += '📈 Bonuses: ' + b + '\n';
  t += '\n' + v.paths.map(p => (p.discovered ? '✅' : '🔒') + ' ' + p.icon + ' *' + p.name + '* (tier ' + p.tier + ')' + (p.active ? ' ← your path' : '')).join('\n');
  t += '\n\nNext: ' + n('awakenpaths', c) + ' · ' + n('awakentrial', c) + ' · ' + n('ability', c);
  return c.reply(t);
}, 'Your awakening status');
reg.add('awakenpaths', 'AWAKENING', c => {
  const v = A.view(c.u);
  return c.reply('🟢 *Awakening paths*\n\n' + v.paths.map(p => p.icon + ' *' + p.name + '* — tier ' + p.tier + '\n' + (p.discovered ? '   ' + p.blurb + '\n   Stages: ' + p.stageNames.filter(Boolean).join(' → ') : '   ??? ' + (p.hint || '')) ).join('\n\n') + '\n\nBegin one with ' + n('awakentrial', c) + ' <path>.');
}, 'The four awakening paths');
reg.add('awakendiscover', 'AWAKENING', c => {
  const found = A.discover(c.u), v = A.view(c.u);
  if (found.length) return c.reply('✨ You discovered: ' + found.map(id => A.PATHS[id].icon + ' *' + A.PATHS[id].name + '*').join(', ') + '!');
  const hid = v.paths.filter(p => !p.discovered);
  return c.reply(hid.length ? '🔍 Nothing new yet. Hints:\n' + hid.map(p => '• ' + p.hint).join('\n') : '🔍 You have discovered every path.');
}, 'Check whether a new path has revealed itself');
reg.add('awakentrial', 'AWAKENING', c => {
  const id = (c.args[0] || '').toLowerCase() || (c.u.awaken && c.u.awaken.path) || '';
  if (!id) return c.reply('Pick a path: ' + A.PATH_LIST.join(', ') + '.\nUse: ' + n('awakentrial', c) + ' <path>');
  const r = A.trial(c.u, id);
  if (!r.ok) return c.reply('❌ ' + r.msg);
  let t = (r.won ? '🟢 ' : '💀 ') + r.msg;
  if (r.won) { if (r.unlocked && r.unlocked.length) t += '\n✨ Unlocked: ' + r.unlocked.map(a => a.name).join(', '); t += '\n+' + r.xp + ' XP'; if (r.ups) t += '\n🎉 LEVEL UP!'; }
  return c.reply(t);
}, 'Face the next awakening trial', { usage: 'awakentrial [path]' });
reg.add('awakenhistory', 'AWAKENING', c => {
  const h = A.view(c.u).history; if (!h.length) return c.reply('📜 Your awakening story has not begun.');
  return c.reply('📜 *Awakening history*\n' + h.map(e => '• ' + new Date(e.t).toISOString().slice(0, 10) + ' — ' + String(e.type).replace(/_/g, ' ') + (e.path ? ' (' + e.path + (e.stage ? ' ' + e.stage : '') + ')' : '')).join('\n'));
}, 'Your awakening log');
reg.add('ability', 'AWAKENING', c => {
  const ab = A.abilities(c.u); if (!ab.length) return c.reply('✨ No abilities yet. Pass a trial with ' + n('awakentrial', c) + '.');
  return c.reply('✨ *Abilities*\n' + ab.map(a => '• *' + a.name + '* (' + a.kind + (a.mp ? ', ' + a.mp + ' soul' : '') + ') — ' + a.text).join('\n'));
}, 'Abilities unlocked by your path');

// ---------- character creator ----------
const show = (u, c) => {
  const v = CR.view(u); if (!v) return 'You have not made a character yet.\nCreate one on the website (Character page) or: ' + n('creator', c) + ' set name=Ash class=' + CR.CLASSES[0];
  return '🪞 *' + v.name + '* — ' + v.cls + '\n' + Object.keys(v.labels).map(k => '• ' + k + ': ' + v.labels[k]).join('\n') + '\n\nEdit: ' + n('creator', c) + ' set <field>=<number> …\nOptions: ' + n('creator', c) + ' options';
};
reg.add('creator', 'AWAKENING', c => {
  const sub = (c.args[0] || '').toLowerCase();
  if (sub === 'options') { const o = CR.options(); return c.reply('🪞 *Creator options*\nClasses: ' + o.classes.join(', ') + '\n' + Object.keys(o.choices).map(f => f + ': ' + o.choices[f].map((x, i) => i + '=' + x).join(', ')).join('\n') + '\nColors: ' + Object.keys(o.colors).map(f => f + ' 0-' + (o.colors[f].length - 1)).join(', ')); }
  if (sub === 'set') {
    const input = {}; c.args.slice(1).join(' ').replace(/(\w+)=("[^"]*"|\S+)/g, (m, k, v) => { input[k === 'class' ? 'cls' : k] = v.replace(/^"|"$/g, ''); return m; });
    if (!Object.keys(input).length) return c.reply('Use: ' + n('creator', c) + ' set name=Ash class=' + CR.CLASSES[0] + ' hair=2');
    const r = CR.save(c.u, input); return c.reply(r.ok ? '✅ Saved.\n' + show(c.u, c) : '❌ ' + r.msg);
  }
  return c.reply(show(c.u, c));
}, 'Design your character (also on the website)', { usage: 'creator [options|set field=value]' });

// ---------- Grimoire Magic (original magic system) ----------
const GR = require('../lib/grimoire'), R = require('../lib/rpg');
reg.add('grimoire', 'AWAKENING', c => {
  const u = c.u, sub = (c.args[0] || '').toLowerCase(), g = GR.st(u);
  if (sub === 'choose' || sub === 'bind') { const r = GR.choose(u, c.args[1]); return c.reply((r.ok ? '' : '❌ ') + r.msg); }
  if (!g.affinity) return c.reply('📖 *Grimoire Magic*\nBind one affinity for life (opens at level ' + GR.RANKS[0].lvl + '):\n' + GR.LIST.map(k => GR.AFFINITIES[k].icon + ' *' + k + '* — ' + GR.AFFINITIES[k].blurb).join('\n') + '\n\nChoose: ' + n('grimoire', c) + ' choose <affinity>');
  const a = GR.AFFINITIES[g.affinity], now = Date.now();
  let t = '📖 *' + a.name + '* ' + a.icon + '  (rank ' + GR.rankOf(u) + '/4)\n' + a.blurb + '\n';
  if (g.buff && g.buff.until > now) t += '✨ Active: ' + g.buff.name + ' (' + Math.ceil((g.buff.until - now) / 60000) + ' min left)\n';
  t += '\n' + GR.spells(u).map(s => (s.unlocked ? '▸ ' : '🔒 ') + s.rank + '. *' + s.name + '* — ' + GR.describe(s.fx) + ' · ' + s.mp + ' soul · ' + (s.unlocked ? (Math.max(0, Math.ceil(((g.cast[s.rank] || 0) + s.cd * 1000 - now) / 1000)) ? 'recharging' : 'ready') : 'level ' + s.lvl)).join('\n');
  return c.reply(t + '\n\nCast: ' + n('cast', c) + ' <number or name>');
}, 'Your grimoire: affinity and spells', { usage: 'grimoire [choose <affinity>]' });
reg.add('cast', 'AWAKENING', c => {
  const r = GR.cast(c.u, c.args.join(' '), () => R.curHp(c.u), () => R.stats(c.u).hp, v => { c.u.rpg.hp = v; });
  return c.reply((r.ok ? '' : '❌ ') + r.msg);
}, 'Cast a grimoire spell (buff or heal)', { usage: 'cast <spell>' });
