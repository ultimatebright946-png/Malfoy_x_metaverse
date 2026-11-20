'use strict';
// Command registry. Every command registers here; menus, /help and the Discord slash definitions are built from it,
// so nothing can be listed that does not exist.
const P = require('./platform');
const commands = new Map();      // every name (main + aliases) -> entry
const cats = {};                 // CATEGORY -> [main names]

function add(names, cat, fn, desc, opts) {
  if (!Array.isArray(names)) names = [names];
  opts = opts || {};
  const main = names[0];
  const entry = {
    fn, main, cat, names, desc: desc || require('./descs')[main] || '', usage: opts.usage || '', owner: !!opts.owner,
    platforms: opts.platforms || P.defaultPlatforms(cat, main),
  };
  (cats[cat] = cats[cat] || []);
  if (cats[cat].indexOf(main) === -1) cats[cat].push(main);
  names.forEach(n => commands.set(n, entry));
  return entry;
}
const get = n => commands.get(n);
const mains = () => Array.from(new Set(Array.from(commands.values()))).map(e => e.main);
const entries = () => Array.from(new Set(commands.values()));
const names = platform => Array.from(commands.keys()).filter(n => !platform || commands.get(n).platforms.indexOf(platform) > -1);
const has = (n, platform) => { const e = commands.get(n); return !!e && (!platform || e.platforms.indexOf(platform) > -1); };
module.exports = { add, get, has, cats, commands, mains, entries, names, count: () => entries().length };
