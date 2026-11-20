// Augur's Gaze: fun percentage meters. Result is fixed per person per meter per day, and shows a picture.
const reg = require('../lib/registry');
const M = require('../lib/media');
const { num, bar, pick } = require('../lib/util');
const PREFIX = process.env.PREFIX || '.';

const METERS = {
  gay:     ['🌈', 'RAINBOW METER', ['Barely a sparkle.', 'A little shimmer.', 'Glittering nicely!', 'Full rainbow energy!']],
  les:     ['💜', 'SAPPHIC METER', ['Just a hint.', 'Getting warmer.', 'Strong sapphic aura.', 'Maximum sapphic power!']],
  goon:    ['🥷', 'GOON METER', ['A lone wanderer.', 'Carries the boss\'s bags.', 'Reliable muscle.', 'Head henchman of the Imperium!']],
  simp:    ['🥺', 'SIMP METER', ['Cool and distant.', 'Sends the occasional heart.', 'Down bad for a few characters.', 'Would carry the whole squad\'s bags.']],
  delulu:  ['🌀', 'DELULU METER', ['Feet on the ground.', 'A little daydreaming.', 'Living in a fantasy.', 'The delulu is the solulu!']],
  downbad: ['📉', 'DOWN BAD METER', ['Doing fine.', 'A small crush wobble.', 'Texting at 3am.', 'Down terrible. Send help.']],
  sigma:   ['🐺', 'SIGMA METER', ['Follows the crowd.', 'Has some independence.', 'Walks alone.', 'Pure sigma. Needs nobody.']],
  alpha:   ['🦁', 'ALPHA METER', ['Quiet and calm.', 'Takes the lead sometimes.', 'Natural leader.', 'King of the pride!']],
  beta:    ['🐟', 'BETA METER', ['Not beta at all.', 'A little shy.', 'Pretty chill and soft.', 'Gentle beta, everyone\'s friend.']],
  npc:     ['🤖', 'NPC METER', ['Fully in control.', 'Has a few scripted lines.', 'Mostly walks in circles.', 'Says "Welcome to Roma" all day.']],
  baddie:  ['💅', 'BADDIE METER', ['Low-key.', 'Looking good.', 'Certified baddie.', 'Walks in and the room stops.']],
  cute:    ['🥰', 'CUTE METER', ['Cool and mysterious.', 'Quite cute.', 'Very cute.', 'Dangerously cute!']],
  smart:   ['🧠', 'BRAIN METER', ['Vibes over books.', 'Pretty sharp.', 'Big brain.', 'Galaxy brain. Lady Vespera is jealous.']],
  dumb:    ['🪨', 'CLUELESS METER', ['Sharp as a blade.', 'A few blank moments.', 'Often lost in thought.', 'Lost in Deep Catacombs without a map.']],
  lucky:   ['🍀', 'LUCK METER', ['Not today.', 'Some good breaks.', 'Fortune smiles.', 'Denarii falls from the sky!']],
  unlucky: ['🌧️', 'BAD LUCK METER', ['Skies are clear.', 'A small puddle.', 'Stepped on a spike trap.', 'Cursed. Stay away from Deep Catacombs.']],
  aura:    ['✨', 'AURA METER', ['Quiet aura.', 'Decent glow.', 'Strong presence.', 'Infinite aura points!']],
  rizz:    ['😎', 'RIZZ METER', ['Needs practice.', 'Some charm.', 'Smooth talker.', 'Unspoken rizz. Charms everyone.']],
};
const FALLBACK = ['Gojo Satoru', 'Itachi Uchiha', 'Levi Ackerman', 'Frieren', 'Makima'];

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
const day = () => new Date().toISOString().slice(0, 10);
const pct = (id, name) => hash(id + '|' + name + '|' + day()) % 101;

Object.keys(METERS).forEach(k => {
  reg.add(k, 'DREAM', async c => {
    const t = c.target() || c.sender, p = pct(t, k), m = METERS[k];
    const tier = p < 25 ? 0 : p < 50 ? 1 : p < 75 ? 2 : 3;
    const cap = m[0] + ' *' + m[1] + '*\n\n@' + num(t) + ' is *' + p + '%*\n' + bar(p, 10) + '\n\n_' + m[2][tier] + '_';
    const pic = await M.pfp(c.sock, t);
    return M.image(c.sock, c.jid, [pic, () => M.charImage(pick(FALLBACK))], cap, [t], c.msg);
  });
});
module.exports = { METERS, pct };
