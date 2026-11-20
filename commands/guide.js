// .guide : how to use the bot, in the Malfoy / the Imperium style.
const reg = require('../lib/registry');
const P = process.env.PREFIX || '.';

const box = (icon, title, sub) => '╭━━━『 ' + icon + ' *' + title + '* 』━━━╮\n' + (sub ? '┃  ⟡ ' + sub + ' ⟡\n' : '') + '╰━━━━━━━━━━━━━━━━━╯\n';
const sec = (icon, title) => '\n┏━━━━━━━━━━━━━━━━━\n┃ ' + icon + ' ' + title + '\n┗━━━━━━━━━━━━━━━━━\n';
const li = (cmd, text) => '│ ◈ *' + P + cmd + '*' + (text ? '  ' + text : '') + '\n';
const tip = t => '\n💡 ' + t + '\n';
const foot = '\n╰━━━━━━━━━━━━━━━━━\n🌟 Malfoy\n👥 Official group: ' + P + 'support';

const TOPICS = {
  start() {
    return box('🪲', 'MALFOY GUIDE', 'H O W   T O   P L A Y') +
      '\nWelcome, Wanderer. Follow these steps and you will be a legend of the Imperium.\n' +
      sec('1️⃣', 'FIRST STEPS') + li('register YourName', 'choose your name') + li('daily', 'free Denarii every 24 hours') + li('work', 'earn Denarii every hour') + li('profile', 'see your stats') +
      sec('2️⃣', 'GO ADVENTURING') + li('travel via appia', 'leave town for the Via Appia') + li('explore', 'fight, find chests, gain XP (every 15s)') + li('rest', 'heal your masks at a campfire') + li('boss', 'challenge the area boss (full masks needed)') +
      sec('3️⃣', 'GET STRONGER') + li('shop', 'buy blades, masks, charms, leveling gear') + li('buy nail1', 'buy an item by its id') + li('quests', 'see quests') + li('accept q2', 'start a quest') + li('exp', 'your level and XP boosts') +
      sec('4️⃣', 'HAVE FUN') + li('sm', 'meet an anime soulmate') + li('animedna', 'which characters are you made of?') + li('kill @user', 'anime reactions') + li('website', 'how to sign up on the website') + li('minigame', 'play the gladiator arena for XP') + li('duel @user', 'fight a friend online') + li('afk reason', 'tell people you are away') +
      '\n📖 *More guides*\n' + li('guide quest') + li('guide shop') + li('guide love') + li('guide group') + li('guide media') + li('guide web') +
      tip('Chatting in groups also gives you XP. Just talk and level up!') + foot;
  },
  quest() {
    return box('🗡️', 'THE KNIGHT\'S PATH', 'Q U E S T   G U I D E') +
      sec('🗺️', 'TRAVEL') + li('map', 'all areas and their level needs') + li('travel silva nera', 'go to an area') +
      '│ Areas: Via Appia (Lv 1), Silva Nera (5), Mushroom Marshes (10), City of Ashes (15), Deep Catacombs (22), Void Pit (30)\n' +
      sec('⚔️', 'FIGHTING') + li('explore', 'every 15 seconds') +
      '│ You may meet: enemies, hidden chests, campfires, lore, or a spike trap.\n' +
      '│ Your masks (❤️) are your health. Soul fills as you strike and heals you or casts spells automatically.\n' + li('rest', 'refill masks (every 2 minutes)') + li('boss', 'every 5 minutes, needs full masks') +
      sec('💀', 'IF YOU DIE') + '│ You wake in Roma and 30% of your Denarii goes to your *Wraith*.\n│ Go back to that area and defeat your Wraith to get it back.\n' +
      sec('📜', 'QUESTS') + li('quests', 'your log (max 3 active)') + li('accept q2', 'start one') + li('abandon q2', 'drop one') + '│ Progress counts automatically while you explore. Rewards are paid at once.\n' +
      sec('📿', 'CHARMS') + li('charms', 'your charms and notches') + li('equip soulcatcher') + li('unequip soulcatcher') + '│ Charms come from first-time boss wins and the shop. You unlock more notches as you level.\n' +
      li('gear', 'your full stats') +
      tip('Stuck on a boss? Buy a better blade and mask in ' + P + 'shop, equip charms, then try again.') + foot;
  },
  shop() {
    return box('💰', 'THE MARKET', 'E C O N O M Y   G U I D E') +
      sec('🛒', 'BUYING') + li('shop', 'see the categories') + li('shop leveling', 'open a category') + li('buy <id>', 'buy with Denarii') + li('inventory', 'what you own') + li('use lifeblood', 'use a potion') +
      '│ Categories: blades, armor, leveling, attraction, charms, potions, extras\n' +
      sec('📈', 'WHAT EACH DOES') + '│ Blades: more damage\n│ Armor: more masks\n│ Leveling: more XP, Denarii, crit and soul\n│ Attraction: more charm, so soulmates say yes\n│ Charms: special bonuses, need notches\n│ Potions: heal, refill soul, or give XP\n' +
      sec('💵', 'EARNING DENARII') + li('daily', 'every 24 hours, grows with your streak') + li('work', 'every hour') + li('mine 1', 'send a miner for 24 hours') + li('collect', 'collect finished mining') + li('slots 100', 'gamble (risky)') + li('bank', 'safe storage with 1% daily interest') + li('deposit 500') + li('withdraw 500') + li('give @user 500', 'send Denarii to a player') + li('transactions', 'your Denarii history') +
      tip('Check your boosts any time with ' + P + 'exp and ' + P + 'gear.') + foot;
  },
  love() {
    return box('🌸', 'QUEEN\'S GARDENS', 'L O V E   G U I D E') +
      sec('💘', 'SOULMATES') + li('gender male', 'tell me who you are, then ' + P + 'sm brings the opposite gender') + li('sm', 'a random character, their show and picture') + li('smanhwa', 'manhwa to read (add a genre: ' + P + 'smanhwa romance)') + li('pursue', 'try to win them (costs 100 Denarii)') + li('mysm', 'your current soulmate') + li('characters', 'the full list') + li('pursue Nami', 'pick one yourself') +
      '│ Your *charm* decides your chance. Raise it with attraction gear: ' + P + 'shop attraction\n' + li('charm', 'see your charm and chance') +
      '│ Date your soulmate again with ' + P + 'pursue to raise the bond. Each bond level gives +1% XP.\n' +
      sec('🧬', 'ANIME DNA') + li('animedna', 'your character percentages') + li('animedna @user', 'check a friend') + li('animedna reroll', 'new DNA once a day') +
      sec('⚔️', 'DUELS') + li('duel @user', 'the bot opens a room and sends the link') + li('duel @user 500', 'with a Denarii bet') + '│ A real-time 2D fight in your browser: move, jump, blade, dash, Spirit Bolt and heal. 5 masks each.\n│ Keyboard: arrows move, J blade, K dash, L spirit, F heal. On a phone use the buttons.\n' +
      sec('🎭', 'REACTIONS') + li('kill @user') + li('hug @user') + li('kiss @user') + li('slap @user') + li('pat @user') + li('ship @user', 'love meter') +
      sec('💭', 'DREAM NAIL METERS') + li('gay') + li('goon') + li('simp') + li('sigma') + li('rizz') + li('aura') + li('npc') + '│ ...and more, see ' + P + 'menu. Add @user to check a friend.\n' +
      sec('🪲', 'TALK TO CHARACTERS') + li('char nyx hello', 'chat with a bug companion') +
      foot;
  },
  group() {
    return box('🛡️', 'WATCHERS\' KEEP', 'A D M I N   G U I D E') +
      '\nOnly group admins can use these. Make Malfoy an admin too so it can act.\n' +
      sec('📢', 'ANNOUNCE') + li('tagall message', 'mention everyone') + li('hidetag message', 'mention everyone silently') + li('infogc', 'group picture and info') +
      sec('👥', 'MEMBERS') + li('kick @user') + li('add 2348012345678') + li('promote @user') + li('demote @user') + li('warn @user', '3 warns = removed') + li('mute @user', 'their messages get deleted') + li('unmute @user') +
      sec('🔒', 'GROUP') + li('close', 'only admins can write') + li('open') + li('link', 'invite link') + li('antilink on', 'delete links from members') + li('welcome on', 'greet new members') + li('out', 'make the bot leave') +
      foot;
  },
  media() {
    return box('🎞️', 'THEATRUM ROMANUM', 'M E D I A   G U I D E') +
      sec('🎵', 'MUSIC AND VIDEO') + li('play Asake Lonely', 'song with its picture') + li('ytmp4 <link>', 'YouTube video') + li('tiktok <link>', 'TikTok video') +
      sec('🖼️', 'PICTURES') + li('waifu') + li('neko') + li('pinterest naruto', 'search pictures') + li('character Levi', 'character art') + li('pfp @user', 'profile picture') +
      sec('✨', 'CONVERT') + li('sticker', 'reply to a photo or short video') + li('toimage', 'reply to a sticker') + li('tomp3', 'reply to a video') + li('vv', 'reply to a view-once photo, video or voice note to open it') + li('speak hello', 'text to voice') +
      foot;
  },
  web() {
    return box('🌐', 'THE WEBSITE', 'S I G N   I N') +
      sec('🔑', 'HOW TO ENTER') + '│ 1. Open the website and tap *Register*\n│ 2. Type your WhatsApp number, a username and a password\n│ 3. The bot sends a 6 digit code to your WhatsApp. Type it on the site.\n│ Next time use *Sign in*. Forgot it? Tap *Forgot password* and the bot sends a new code.\n│ Tip: send "hi" to the bot in a private chat first so it knows your number.\n' +
      sec('✨', 'WHAT YOU CAN DO') + '│ Change your name and profile picture\n│ Buy gear in the shop\n│ Play the Imperium Arena for XP\n│ See your Denarii wallet and send Denarii\n│ See the global leaderboard\n│ See your stats, soulmate and DNA\n' + li('minigame', 'play the Imperium Arena for XP and Denarii') + li('profile', 'shows your website picture in WhatsApp') + li('website', 'get the link again') +
      foot;
  },
};
const ALIAS = { start: 'start', begin: 'start', quest: 'quest', quests: 'quest', rpg: 'quest', game: 'quest', shop: 'shop', economy: 'shop', money: 'shop', geo: 'shop', love: 'love', sm: 'love', anime: 'love', dna: 'love', soulmate: 'love', group: 'group', admin: 'group', media: 'media', music: 'media', web: 'web', website: 'web', site: 'web' };

reg.add(['guide', 'howto', 'tutorial', 'start'], 'GENERAL', c => {
  const k = ALIAS[(c.args[0] || 'start').toLowerCase()];
  if (!k) return c.reply('❌ No such guide. Try: ' + Object.keys(TOPICS).slice(1).map(t => P + 'guide ' + t).join(', '));
  return c.sock.sendMessage(c.jid, { text: TOPICS[k]() }, { quoted: c.msg });
});
module.exports = { TOPICS };
