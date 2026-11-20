'use strict';
// Which commands exist on which platform, and how a command is written on each one.
//   WhatsApp: .name            Discord: /name  or  /group sub   (Discord allows at most 100 top-level slash commands,
//   so related commands are grouped: /card daily, /react hug, /meter gay, /awaken trial ...)

const PLATFORMS = ['whatsapp', 'discord'];

// Commands that depend on WhatsApp itself (group admin, stickers, voice notes, media downloads, WhatsApp OTP).
const WA_ONLY_CATS = new Set(['ADMIN']);
const WA_ONLY = new Set(['sticker', 'toimage', 'tomp3', 'vv', 'pfp', 'play', 'ytmp4', 'tiktok', 'speak', 'afk', 'code', 'pinterest', 'character']);

// Reaction and meter commands are grouped on Discord.
const REACT = ['kill', 'shoot', 'hug', 'kiss', 'slap', 'pat', 'cuddle', 'poke', 'bite', 'bonk', 'punch', 'kick', 'yeet', 'highfive', 'handhold', 'tickle', 'feed', 'wave', 'ship'];
const METER = ['gay', 'les', 'goon', 'simp', 'delulu', 'downbad', 'sigma', 'alpha', 'beta', 'npc', 'baddie', 'cute', 'smart', 'dumb', 'lucky', 'unlucky', 'aura', 'rizz'];
const FAMILIES = { card: /^card(.*)$/, awaken: /^awaken(.+)$/ };

function slashParts(name) {
  if (REACT.indexOf(name) > -1) return ['react', name];
  if (METER.indexOf(name) > -1) return ['meter', name];
  if (name === 'card') return ['card', 'show'];
  if (name === 'cards') return ['card', 'list'];
  if (name === 'linkaccount') return ['link'];
  if (name === 'unlinkaccount') return ['unlink'];
  let m = FAMILIES.card.exec(name); if (m && m[1]) return ['card', m[1]];
  if (name === 'awaken') return ['awaken', 'status'];
  m = FAMILIES.awaken.exec(name); if (m) return ['awaken', m[1]];
  return [name];
}
const slashPath = name => '/' + slashParts(name).join(' ');
const notation = (name, platform, prefix) => platform === 'discord' ? slashPath(name) : (prefix || '.') + name;

// Called by the registry for every command.
function defaultPlatforms(cat, main) {
  if (WA_ONLY_CATS.has(cat) || WA_ONLY.has(main)) return ['whatsapp'];
  return PLATFORMS.slice();
}

module.exports = { PLATFORMS, WA_ONLY, REACT, METER, slashParts, slashPath, notation, defaultPlatforms };
