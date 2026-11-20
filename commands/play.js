// .afk and .duel
const reg = require('../lib/registry');
const db = require('../lib/db');
const D = require('../lib/duel');
const { num, http, pick } = require('../lib/util');
const M = require('../lib/media');
const B = require('../lib/bank');
const W = require('../lib/webcore');
const PREFIX = process.env.PREFIX || '.';

reg.add(['afk', 'away', 'brb'], 'GENERAL', c => {
  c.u.afk = { t: Date.now(), r: c.full.slice(0, 100) }; db.save();
  return c.reply('😴 @' + num(c.sender) + ' is now AFK' + (c.u.afk.r ? ': ' + c.u.afk.r : '') + '\nI will tell anyone who tags you. Send any message to come back.', [c.sender]);
});

// .duel @user 500   (bet is optional; without @user, anyone with the link can join)
reg.add(['duel', 'fight', 'challenge', 'team', '4v4', 'teamduel'], 'GAMES', c => {
  let bet = 0, mode = '1v1'; if (c.args.some(a => /^(4v4|team|teams|4x4)$/i.test(a)) || ['team', '4v4'].indexOf(c.cmd) > -1) mode = '4v4'; c.args.forEach(a => { if (/^\d{1,5}$/.test(a)) bet = parseInt(a); else if (/^\d+k$/i.test(a)) bet = parseInt(a) * 1000; });
  const t = c.target();
  if (t && c.sock.user && db.getUser(t).id === db.getUser(c.sock.user.id.split(':')[0] + '@s.whatsapp.net').id) return c.reply('The bot does not fight. Pick a player.');
  const r = D.create(c.u, t, bet, c.jid, mode);
  if (!r.ok) return c.reply('❌ ' + r.msg);
  const text = mode === '4v4' ? '🛡️ *4 vs 4 ROOM READY*\n\n@' + num(c.sender) + ' is building a team match.\n\n🔗 *' + r.link + '*\n\n1. Sign in on the website\n2. Open the link and press *Join* (teams balance themselves)\n3. The host presses *Start* when ready, or it starts by itself at 8 players\n\n🏆 Winners: +10 XP and +30 Denarii. Room closes in 15 minutes.' : '⚔️ *DUEL ROOM READY*\n\n@' + num(c.sender) + (t ? ' challenges @' + num(t) : ' is looking for an opponent') + '!\n' + (bet ? '💰 Bet: *' + bet + '* Denarii each\n' : '') +
    '\n🔗 *' + r.link + '*\n\n1. Sign in on the website (Register once with your number, the bot sends you a code)\n2. Open the link and press *Join*\n3. Fight in real time: move, jump, swing your blade, dash and cast Spirit Bolt. Last knight standing wins (5 masks each)\n\n⏱️ Room closes in 15 minutes.';
  return c.reply(text, t ? [c.sender, t] : [c.sender]);
});

// ---------- bank ----------
const fmtLeft = ms => { const h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60000); return h + 'h ' + m + 'm'; };
function bankCard(u) { const i = B.info(u); return '🏦 *MALFOY BANK*\n\n💰 Wallet: *' + i.wallet + '* Denarii\n🏛️ Bank: *' + i.bank + '* / ' + i.cap + ' Denarii\n📈 Interest: *' + i.rate + '%* per day (next in ' + fmtLeft(i.next) + ')\n\n🛡️ Denarii in the bank is safe from your Wraith.\n' + PREFIX + 'deposit 500   ' + PREFIX + 'withdraw 500   (or "all")'; }
reg.add(['bank', 'vault'], 'ECONOMY', c => c.reply(bankCard(c.u)));
reg.add(['deposit', 'dep'], 'ECONOMY', c => { const r = B.deposit(c.u, c.args[0]); return c.reply(r.ok ? '✅ ' + r.msg + '\n\n' + bankCard(c.u) : '❌ ' + r.msg + '\nUse: *' + PREFIX + 'deposit 500* or *' + PREFIX + 'deposit all*'); });
reg.add(['withdraw', 'wd'], 'ECONOMY', c => { const r = B.withdraw(c.u, c.args[0]); return c.reply(r.ok ? '✅ ' + r.msg + '\n\n' + bankCard(c.u) : '❌ ' + r.msg + '\nUse: *' + PREFIX + 'withdraw 500* or *' + PREFIX + 'withdraw all*'); });

// ---------- official group ----------
reg.add(['support', 'officialgc', 'botgc', 'group'], 'GENERAL', c => c.reply('👥 *OFFICIAL MALFOY GROUP*\n\nJoin to get updates, find duel partners and meet other players:\n' + W.GROUP_URL));

// ---------- manhwa recommendations ----------
const MANHWA = [
  ['Solo Leveling', 'action fantasy', 'The weakest hunter gets a second chance and levels up alone.'],
  ['Tower of God', 'fantasy adventure', 'Climb a mysterious tower, floor by floor, to find the one you love.'],
  ['The Beginning After the End', 'fantasy isekai', 'A mighty king is reborn into a world of magic and starts over.'],
  ['Omniscient Reader', 'fantasy action', 'The only reader of a dead web novel watches it come true.'],
  ['Lookism', 'drama school', 'A bullied teen wakes up in a second, perfect body.'],
  ['Noblesse', 'action supernatural', 'A noble vampire wakes after 820 years in a changed world.'],
  ['The God of High School', 'action martial', 'A tournament of fighters where the prize is anything you wish.'],
  ['Sweet Home', 'horror thriller', 'Residents of an apartment block fight as people turn into monsters.'],
  ['True Beauty', 'romance drama comedy', 'A girl who hides behind makeup meets a boy who sees her bare face.'],
  ['Business Proposal', 'romance comedy', 'She goes on a blind date for a friend and it is her boss.'],
  ['See You in My 19th Life', 'romance fantasy', 'A girl who remembers every past life meets a boy who does too.'],
  ['Who Made Me a Princess', 'romance fantasy', 'Reborn as a princess in a novel, she is determined to survive.'],
  ['The Remarried Empress', 'romance drama', 'An empress fights for her place after her husband wants a new wife.'],
  ['Villains Are Destined to Die', 'romance fantasy', 'Trapped in a game as a villain, she must dodge every death flag.'],
  ['Marry My Husband', 'romance drama revenge', 'Given a second chance, she gives her cheating husband to her friend.'],
  ['Eleceed', 'action comedy', 'A kind boy with lightning powers trains under a cat who is a master.'],
  ['Unordinary', 'school superpower', 'In a world of powers, the powerless are at the bottom.'],
  ['Weak Hero', 'action school', 'A top student uses brains and fists against school bullies.'],
  ['Nano Machine', 'action martial', 'Nanomachines from the future turn a cast-out into a martial prodigy.'],
  ['Return of the Mount Hua Sect', 'martial action comedy', 'A legendary swordsman wakes up 100 years later to save his sect.'],
  ['Second Life Ranker', 'fantasy action', 'He climbs a tower to learn what happened to his brother.'],
  ['The Gamer', 'action fantasy', 'A teen sees his life as a game with stats and quests.'],
  ['Bastard', 'thriller psychological', 'A quiet boy hides a dark secret about his father.'],
  ['Wind Breaker', 'sports school', 'A boy finds friends and purpose on a racing bike.'],
  ['Legend of the Northern Blade', 'martial action', 'A swordsman returns to rebuild his fallen clan.'],
  ['Tomb Raider King', 'action fantasy', 'A treasure hunter rises with the help of a mysterious system.'],
  ['Midnight Poppy Land', 'romance fantasy', 'A cursed girl is protected by a mysterious guardian.'],
  ['Hardcore Leveling Warrior', 'action fantasy', 'Fallen from the top rank, he plans a comeback.'],
];
const coverCache = new Map();
async function cover(title) {
  if (coverCache.has(title)) return coverCache.get(title);
  const q = 'query($s:String){Media(search:$s,type:MANGA,countryOfOrigin:"KR"){coverImage{extraLarge large}siteUrl}}';
  const d = await http('https://graphql.anilist.co', { t: 9000, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: q, variables: { s: title } }) });
  const m = d && d.data && d.data.Media; const r = m ? { img: m.coverImage && (m.coverImage.extraLarge || m.coverImage.large), url: m.siteUrl } : null;
  if (r) coverCache.set(title, r); return r;
}
reg.add(['smanhwa', 'manhwa', 'readlist'], 'ANIME', async c => {
  const want = (c.args[0] || '').toLowerCase(); const GENRES = ['action', 'fantasy', 'romance', 'horror', 'drama', 'comedy', 'school', 'martial', 'thriller', 'isekai', 'sports', 'supernatural', 'psychological', 'adventure', 'superpower'];
  if (want && GENRES.indexOf(want) < 0) return c.reply('Pick a genre: ' + GENRES.join(', ') + '\nExample: *' + PREFIX + 'smanhwa romance*');
  const pool = MANHWA.filter(m => !want || m[1].split(' ').indexOf(want) > -1);
  const picks = pool.slice().sort(() => Math.random() - 0.5).slice(0, 5);
  const covers = await Promise.all(picks.map(p => cover(p[0]).catch(() => null)));
  const text = '📚 *MANHWA FOR YOU*' + (want ? ' (' + want + ')' : '') + '\n\n' + picks.map((p, i) => (i + 1) + '. *' + p[0] + '*\n    🏷️ ' + p[1].split(' ').join(', ') + '\n    ' + p[2] + (covers[i] && covers[i].url ? '\n    🔗 ' + covers[i].url : '')).join('\n\n') + '\n\n🔁 Send *' + PREFIX + 'smanhwa* again for new picks, or add a genre.';
  const first = covers.find(x => x && x.img);
  return M.image(c.sock, c.jid, first ? [first.img] : [], text, [], c.msg);
});
