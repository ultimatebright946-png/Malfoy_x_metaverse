'use strict';
// Character creator: the options are numbered choices (and a few validated colours). The page draws a vector preview from them
// and the server stores them on the player (u.char). Art is original vector drawing, no third-party character art.
const db = require('./db');

const CLASSES = ['Knight', 'Mage', 'Ranger', 'Rogue', 'Cleric', 'Warden'];
const OPTS = {
  body: ['Feminine', 'Masculine', 'Androgynous', 'Sturdy'],
  face: ['Calm', 'Fierce', 'Gentle', 'Sly', 'Stoic', 'Cheerful'],
  hair: ['Short crop', 'Long loose', 'Ponytail', 'Twin braids', 'Spiky', 'Bob', 'Undercut', 'Windswept', 'Bun', 'Shaved'],
  clothes: ['Traveller tunic', 'Scholar robe', 'Hunter leathers', 'Noble coat', 'Hooded cloak', 'Monk wrap', 'Street jacket', 'Ceremonial dress'],
  armor: ['None', 'Leather vest', 'Chain mail', 'Plate cuirass', 'Shell mask guard', 'Void-forged'],
  accessory: ['None', 'Scarf', 'Earrings', 'Glasses', 'Crown', 'Horns', 'Eye patch', 'Lantern'],
  weapon: ['Blade', 'Longsword', 'Spear', 'Staff', 'Bow', 'Twin daggers', 'Greataxe', 'Tome'],
};
const COLORS = {
  hairColor: ['#0b0b10', '#3b2a20', '#7a4b2a', '#c9a15a', '#e8d9a8', '#d9d9e4', '#d94f5f', '#e87fb0', '#7957d5', '#3f8fe0', '#19d68a', '#ff8a2a'],
  eyeColor: ['#1a1a22', '#5b3a22', '#2f7f5f', '#3f8fe0', '#8a8f99', '#7957d5', '#d94f5f', '#e8b13a'],
  skin: ['#f6d9c2', '#eec2a0', '#d9a37c', '#b9805a', '#8d5a3b', '#5f3b28', '#3f271c', '#c9d6c8'],
};
const FIELDS = Object.keys(OPTS).concat(Object.keys(COLORS));
const DEFAULT = { name: '', cls: 'Knight', body: 2, face: 0, hair: 0, hairColor: 0, eyeColor: 3, skin: 1, clothes: 0, armor: 0, accessory: 0, weapon: 0 };
const NAME_RE = /^[\p{L}\p{N} _'\-]{2,24}$/u;
const HEX = /^#[0-9a-fA-F]{6}$/;

function normalize(input, base) {
  const out = Object.assign({}, DEFAULT, base || {}); input = input || {};
  const err = f => ({ ok: false, msg: 'Bad value for ' + f + '.' });
  if (input.name !== undefined) { const n = String(input.name).replace(/\s+/g, ' ').trim(); if (!NAME_RE.test(n)) return { ok: false, msg: 'Character names are 2 to 24 letters, numbers, spaces, apostrophes or dashes.' }; out.name = n; }
  if (input.cls !== undefined) { const c = CLASSES.find(x => x.toLowerCase() === String(input.cls).toLowerCase()); if (!c) return { ok: false, msg: 'Classes: ' + CLASSES.join(', ') + '.' }; out.cls = c; }
  for (const f of Object.keys(OPTS)) if (input[f] !== undefined) { const v = Number(input[f]); if (!Number.isInteger(v) || v < 0 || v >= OPTS[f].length) return err(f); out[f] = v; }
  for (const f of Object.keys(COLORS)) if (input[f] !== undefined) {
    const raw = input[f]; if (typeof raw === 'string' && HEX.test(raw)) { out[f] = raw.toLowerCase(); continue; }
    const v = Number(raw); if (!Number.isInteger(v) || v < 0 || v >= COLORS[f].length) return err(f); out[f] = v;
  }
  return { ok: true, char: out };
}
function save(u, input) {
  const r = normalize(input, u.char); if (!r.ok) return r;
  if (!r.char.name) r.char.name = String(u.name || 'Wanderer').slice(0, 24);
  r.char.v = ((u.char && u.char.v) || 0) + 1; u.char = r.char; require('./social').checkAch(u); db.save();
  return { ok: true, char: view(u) };
}
function resolveColor(f, v) { return typeof v === 'string' ? v : COLORS[f][v] || COLORS[f][0]; }
function view(u) {
  const c = u.char; if (!c) return null;
  return Object.assign({}, c, { labels: { body: OPTS.body[c.body], face: OPTS.face[c.face], hair: OPTS.hair[c.hair], clothes: OPTS.clothes[c.clothes], armor: OPTS.armor[c.armor], accessory: OPTS.accessory[c.accessory], weapon: OPTS.weapon[c.weapon] }, colors: { hairColor: resolveColor('hairColor', c.hairColor), eyeColor: resolveColor('eyeColor', c.eyeColor), skin: resolveColor('skin', c.skin) } });
}
const options = () => ({ classes: CLASSES, choices: OPTS, colors: COLORS, default: DEFAULT });

module.exports = { CLASSES, OPTS, COLORS, FIELDS, DEFAULT, normalize, save, view, options };
