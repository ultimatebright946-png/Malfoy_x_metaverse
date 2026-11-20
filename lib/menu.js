'use strict';
// Menu, help and text formatting. Sections are written here as *layouts*, but every command shown is checked against the
// live registry (and the platform), so a command that does not exist can never appear. Anything real that no layout mentions
// is gathered into a "More" section automatically.
const reg = require('./registry');
const P = require('./platform');
const D = require('./data');
const R = require('./rpg');
const A = require('./awaken');
const { rom } = require('./util');

const PREFIX = process.env.PREFIX || '.';
const VERSION = '25.0.0';
const GROUP_URL = () => require('./webcore').GROUP_URL;
const LINES = ['Fortuna favet audaci.', 'Veni, vidi, vici.', 'Per aspera ad astra.', 'Audentes fortuna iuvat.', 'Roma non uno die aedificata est.'];
const OLD_LINES = ['The light of the Imperium is fading. Press on, Wanderer.', 'Rest at a campfire, then descend again.', 'Every shell has a story. Write yours.', 'Beneath the city, something stirs.', 'Denarii is only useful when spent.'];

const SECTIONS = [
  { icon: '🏛️', title: 'THE ROMAN FORUM', sub: 'General', key: 'general', cmds: ['menu', 'help', 'guide', 'support', 'afk', 'ping', 'exp', 'rank', 'top', 'alive', 'uptime', 'owner', 'calc', 'weather', 'speak', 'tts', 'dice', 'flip', 'roll', '8ball', 'joke', 'fact', 'quote'] },
  { icon: '⚔️', title: 'THE LEGION\'S PATH', sub: 'Quests', key: 'quests', cmds: ['quests', 'accept', 'abandon', 'explore', 'boss', 'rest', 'map', 'travel', 'gear', 'charms', 'equip', 'unequip'] },
  { icon: '🟢', title: 'TEMPLE OF AWAKENING', sub: 'Awakening', key: 'awakening', awaken: true, cmds: ['awaken', 'awakenpaths', 'awakendiscover', 'awakentrial', 'awakenhistory', 'ability', 'grimoire', 'cast'] },
  { icon: '🪞', title: 'THE IMPERIAL MIRROR', sub: 'Character Creator', key: 'character', cmds: ['creator'] },
  { icon: '🪙', title: 'MERCATUS IMPERIALIS', sub: 'Economy', key: 'economy', cmds: ['register', 'profile', 'stats', 'website', 'balance', 'bank', 'deposit', 'withdraw', 'transactions', 'daily', 'work', 'rob', 'mine', 'miners', 'collect', 'shop', 'buy', 'inventory', 'use', 'give', 'pay'] },
  { icon: '🃏', title: 'THE CARD TEMPLE', sub: 'Cards', key: 'cards', cmds: ['card', 'cards', 'claim', 'carddaily', 'cardpack', 'cardopen', 'cardprofile', 'cardcollection', 'cardinventory', 'carddex', 'cardinfo', 'cardview', 'cardsearch', 'cardfavorite', 'cardupgrade', 'cardfusion', 'cardduplicates', 'cardtrade', 'cardoffer', 'cardaccept', 'carddecline', 'cardleaderboard', 'cardhelp'] },
  { icon: '🔗', title: 'THE IMPERIAL SEAL', sub: 'Website & accounts', key: 'account', cmds: ['linkaccount', 'unlinkaccount'] },
  { icon: '🧬', title: 'LINEAGE OF ROME', sub: 'Anime DNA', key: 'dna', cmds: ['animedna'] },
  { icon: '🏛️', title: 'SENATE HALL', sub: 'Guilds', key: 'guilds', cmds: ['guild'] },
  { icon: '⚜️', title: 'THE IMPERIAL COURT', sub: 'Ranks & moderation', key: 'court', cmds: ['hierarchy', 'title', 'exile', 'pardon', 'warnplayer', 'warnings'] },
  { icon: '🔮', title: 'ORACLE OF ROME', sub: 'AI', key: 'ai', cmds: ['ai', 'chat', 'ask'] },
  { icon: '🛡️', title: 'PRAETORIAN GUARD', sub: 'Admin', key: 'admin', cmds: ['tagall', 'everyone', 'hidetag', 'infogc', 'link', 'invite', 'out', 'open', 'close', 'kick', 'promote', 'demote', 'add', 'mute', 'unmute', 'warn', 'antilink', 'welcome'] },
  { icon: '🎭', title: 'THEATRUM ROMANUM', sub: 'Media', key: 'media', cmds: ['play', 'song', 'ytmp3', 'ytmp4', 'video', 'tiktok', 'sticker', 'toimage', 'tomp3', 'vv', 'image', 'pinterest', 'pfp', 'character'] },
  { icon: '🔥', title: 'SATURNALIA', sub: 'Fun', key: 'fun', cmds: ['kill', 'shoot', 'ship', 'slap', 'hug', 'kiss', 'pat', 'cuddle', 'poke', 'bite', 'bonk', 'punch', 'kick', 'yeet', 'highfive', 'handhold', 'tickle', 'feed', 'wave'] },
  { icon: '🏟️', title: 'ARENA OF ROME', sub: 'Games', key: 'games', cmds: ['duel', 'minigame', 'slots', 'gamble', 'dice', 'flip'] },
  { icon: '💭', title: 'AUGUR\'S SCALES', sub: 'Meters', key: 'meters', cmds: ['gay', 'les', 'goon', 'simp', 'delulu', 'downbad', 'sigma', 'alpha', 'beta', 'npc', 'baddie', 'cute', 'smart', 'dumb', 'lucky', 'unlucky', 'aura', 'rizz'] },
  { icon: '🌸', title: 'HORTI ROMANI', sub: 'Anime', key: 'anime', cmds: ['waifu', 'neko', 'gender', 'sm', 'smanhwa', 'soulmate', 'pursue', 'mysm', 'charm', 'characters'] },
  { icon: '🐎', title: 'COMPANIONS OF THE LEGION', sub: 'Characters', key: 'companions', cmds: ['char', 'talk'] },
  { icon: '👑', title: 'CHAMBER OF THE IMPERATOR', sub: 'Owner tools', key: 'owner', ownerOnly: true, cmds: ['addgeo', 'addxp', 'dbstatus', 'backup', 'restore', 'spawncard', 'ban', 'unban', 'mod', 'unmod', 'settitle'] },
];
const note = (name, platform) => P.notation(name, platform, PREFIX);

// every section, resolved against the registry for this platform. Names are shown once per section.
function resolve(platform, isOwner) {
  const claimed = new Set(), out = [];
  SECTIONS.forEach(s => {
    if (s.ownerOnly && !isOwner) { s.cmds.forEach(n => claimed.add(n)); return; }
    const list = []; s.cmds.forEach(n => { const e = reg.get(n); if (e && reg.has(n, platform) && list.indexOf(n) === -1) list.push(n); claimed.add(n); });
    // an entry that is only a duplicate shown on Discord (same slash path) is dropped
    const seen = new Set(), uniq = list.filter(n => { const k = platform === 'discord' ? P.slashPath(reg.get(n).main) : n; if (seen.has(k)) return false; seen.add(k); return true; });
    if (uniq.length || s.awaken) out.push(Object.assign({}, s, { list: uniq }));
  });
  const more = [];
  reg.entries().forEach(e => { if (!claimed.has(e.main) && !e.names.some(n => claimed.has(n)) && e.platforms.indexOf(platform) > -1) more.push(e.main); });
  if (more.length) out.push({ icon: '📦', title: 'THE ARMORY', sub: 'Other commands', key: 'more', list: more });
  return out;
}

const SMALL = { a:'ᴀ', b:'ʙ', c:'ᴄ', d:'ᴅ', e:'ᴇ', f:'ғ', g:'ɢ', h:'ʜ', i:'ɪ', j:'ᴊ', k:'ᴋ', l:'ʟ', m:'ᴍ', n:'ɴ', o:'ᴏ', p:'ᴘ', q:'ǫ', r:'ʀ', s:'s', t:'ᴛ', u:'ᴜ', v:'ᴠ', w:'ᴡ', x:'x', y:'ʏ', z:'ᴢ' };
function small(text) { return String(text).toLowerCase().replace(/[a-z]/g, c => SMALL[c] || c); }
function sectionText(s, platform, u) {
  const title = small(s.sub || s.title);
  let t = '╭━━〔 ' + s.icon + ' ' + title + ' 〕━━┈⊷\n';
  t += s.list.map(n => '┃ ✫✧│ ' + note(n, platform)).join('\n');
  return t + '\n╰━━━━━━━━━━━━┈⊷';
}

const bar = (cur, max, n) => { n = n || 8; const f = max > 0 ? Math.max(0, Math.min(n, Math.round(cur / max * n))) : 0; return '▰'.repeat(f) + '▱'.repeat(n - f); };
function header(platform, u, name) {
  let hud = '';
  if (u) {
    const st = R.stats(u), z = D.ZONES[u.rpg.zone], hp = R.curHp(u), soul = Math.min(st.soul, u.rpg.soul || 0), need = u.xpNeeded || 1;
    hud = '┃ ✫ 🏅 ʀᴀɴᴋ: ' + u.level + '\n┃ ✫ 🪙 ᴅᴇɴᴀʀɪɪ: ' + u.coins + '\n┃ ✫ ❤️ ᴍᴀsᴋs: ' + hp + '/' + st.hp + '\n┃ ✫ ✨ xᴘ: ' + Math.round(u.xp / need * 100) + '%\n┃ ✫ 🔷 sᴏᴜʟ: ' + soul + '/' + st.soul + '\n┃ ✫ 📍 ᴢᴏɴᴇ: ' + z.n + '\n';
  }
  const count = reg.entries().filter(e => e.platforms.indexOf(platform) > -1).length;
  const up = Math.floor(process.uptime());
  const uptime = Math.floor(up / 3600) + 'h ' + Math.floor((up % 3600) / 60) + 'm';
  return '╭━━〔 ⚔️ ᴍᴀʟғᴏʏ ɪᴍᴘᴇʀɪᴜᴍ 〕━━┈⊷\n┃\n┃ ✫ 👋 ʜᴇʟʟᴏ: ' + (name || 'Wanderer') + '\n┃ ✫ 👑 ᴏᴡɴᴇʀ: Benjamin\n┃ ✫ ⚡ sᴛᴀᴛᴜs: Online\n┃ ✫ ⏱️ ᴜᴘᴛɪᴍᴇ: ' + uptime + '\n┃ ✫ 🔰 ᴘʀᴇғɪx: ' + (platform === 'discord' ? '/' : PREFIX) + '\n┃ ✫ 📦 ᴠᴇʀsɪᴏɴ: ' + VERSION + '\n┃ ✫ 📚 ᴛᴏᴛᴀʟ ᴄᴏᴍᴍᴀɴᴅs: ' + count + '\n┃ ✫ 🔐 ᴍᴏᴅᴇ: PUBLIC\n' + (hud ? hud : '') + '╰━━━━━━━━━━━━┈⊷\n\n⚡ Powered by MALFOY';
}
function footer(platform) {
  return '╭━━〔 📖 ɢᴜɪᴅᴇ 〕━━┈⊷\n┃ ✫✧│ ' + note('guide', platform) + '\n┃ ✫✧│ ' + note('help', platform) + ' <command>\n╰━━━━━━━━━━━━┈⊷\n\n⚡ Powered by MALFOY IMPERIUM';
}

// Returns an array of message strings, each within `limit` characters.
function buildMenu(opts) {
  opts = opts || {}; const platform = opts.platform || 'whatsapp', limit = opts.limit || (platform === 'discord' ? 1900 : 3500);
  let secs = resolve(platform, !!opts.isOwner);
  if (opts.section) {
    const q = String(opts.section).toLowerCase().replace(/^[./]/, '');
    const hit = secs.filter(s => s.key === q || s.title.toLowerCase().indexOf(q) > -1 || s.sub.toLowerCase().indexOf(q) > -1 || s.list.indexOf(q) > -1);
    if (!hit.length) return { ok: false, pages: ['❌ No section called *' + q + '*. Sections: ' + secs.map(s => s.key).join(', ') + '.'] };
    secs = hit;
  }
  const parts = [opts.section ? '' : header(platform, opts.u, opts.name)].filter(Boolean).concat(secs.map(s => sectionText(s, platform, opts.u)));
  const pages = []; let cur = '';
  const push = piece => {
    if (piece.length > limit) { // a single oversized section is split on line boundaries
      piece.split('\n').forEach(line => { if ((cur + '\n' + line).length > limit) { pages.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line; }); return;
    }
    if (cur && (cur + '\n\n' + piece).length > limit) { pages.push(cur); cur = piece; } else cur = cur ? cur + '\n\n' + piece : piece;
  };
  parts.forEach(push);
  const f = footer(platform); if (cur && (cur + '\n\n' + f).length > limit) { pages.push(cur); cur = f; } else cur = cur ? cur + '\n\n' + f : f;
  pages.push(cur);
  return { ok: true, pages: pages.filter(Boolean) };
}
const sections = (platform, isOwner) => resolve(platform, isOwner).map(s => ({ key: s.key, title: s.title, commands: s.list }));

function helpFor(name, platform) {
  const n = String(name || '').replace(/^[./]/, '').toLowerCase(), e = reg.get(n);
  if (!e || (platform && e.platforms.indexOf(platform) === -1)) {
    if (e) return '❌ *' + n + '* only works on ' + e.platforms.join(' and ') + '.';
    return '❌ No command called *' + n + '*. See ' + note('menu', platform || 'whatsapp');
  }
  const alias = e.names.filter(x => x !== e.main && (!platform || P.slashPath(x) !== P.slashPath(e.main)));
  return 'ℹ️ *' + note(e.main, platform || 'whatsapp') + '*\n' + (e.desc ? '📝 ' + e.desc + '\n' : '') + '📂 Category: ' + e.cat + (e.usage ? '\n🔧 Usage: ' + note(e.main, platform || 'whatsapp') + ' ' + e.usage.replace(/^\S+\s?/, '') : '') + (alias.length && platform !== 'discord' ? '\n🔀 Also: ' + alias.map(x => note(x, platform || 'whatsapp')).join(' ') : '') + '\n📱 Works on: ' + e.platforms.join(', ');
}

function spawnText(sp, platform) {
  const c = sp.card;
  return '🃏 *A wild card appeared!*\n' + c.rarityName + ' · *' + c.name + '* (' + c.element + ')\n\nBe the first to claim it:\n*' + (platform === 'discord' ? '/claim code:' : PREFIX + 'claim ') + sp.code + '*\n⏳ Expires in ' + Math.round(sp.expiresInMs / 60000) + ' minutes. One person only.';
}

// ---------- text conversion ----------
// Handlers write WhatsApp-style text with ".command" hints. For Discord: *bold* -> **bold**, _italic_ -> *italic*,
// ".daily" -> "/daily" (using the real slash path), "@123..." -> a real mention.
function rewriteCommands(text, platform) {
  if (platform !== 'discord') return text;
  return text.replace(/(^|[\s(*`'"_])\.([a-z0-9]{2,20})(?![\w.])/g, (m, pre, name) => (reg.has(name, 'discord') ? pre + P.slashPath(reg.get(name).main).replace(/^\//, '/') : m));
}
function toDiscord(text) {
  let t = String(text == null ? '' : text);
  t = rewriteCommands(t, 'discord');
  t = t.replace(/(^|[\s(\[])\*([^*\n]+?)\*(?=[\s).,!?:;\]]|$)/g, '$1**$2**');
  t = t.replace(/(^|[\s(\[])_([^_\n]+?)_(?=[\s).,!?:;\]]|$)/g, '$1*$2*');
  t = t.replace(/@(\d{17,20})\b/g, '<@$1>');
  return t;
}
const format = (text, platform) => platform === 'discord' ? toDiscord(text) : String(text == null ? '' : text);
// splits long text for a platform limit, on line boundaries
function split(text, limit) {
  const out = []; let cur = '';
  String(text).split('\n').forEach(line => {
    while (line.length > limit) { if (cur) { out.push(cur); cur = ''; } out.push(line.slice(0, limit)); line = line.slice(limit); }
    if ((cur + '\n' + line).length > limit && cur) { out.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line;
  });
  if (cur) out.push(cur); return out;
}

module.exports = { SECTIONS, VERSION, buildMenu, sections, helpFor, spawnText, rewriteCommands, toDiscord, format, split, resolve, note };
