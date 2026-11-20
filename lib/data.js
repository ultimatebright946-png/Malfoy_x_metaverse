// Static game data: companions, soulmate roster, shop, zones, quests, charms.

const CHARS = ['malfoy', 'nyx', 'mika', 'yuna', 'yako', 'erza', 'kashimo'];
const CINFO = {
  malfoy: { n: 'Malfoy', e: '🐍' }, nyx: { n: 'Nyx', e: '🌙' }, mika: { n: 'Mika', e: '🌸' },
  yuna: { n: 'Yuna', e: '💖' }, yako: { n: 'Yako', e: '💙' }, erza: { n: 'Erza', e: '⚔️' }, kashimo: { n: 'Kashimo', e: '🍔' },
};

// Soulmate / character-match roster (adult characters only)
const RAW = `Nami|One Piece
Nico Robin|One Piece
Boa Hancock|One Piece
Yor Forger|Spy x Family
Makima|Chainsaw Man
Frieren|Frieren
Darkness|Konosuba
Aqua|Konosuba
Mitsuri Kanroji|Demon Slayer
Shinobu Kocho|Demon Slayer
Chizuru Mizuhara|Rent-A-Girlfriend
Tohru|Dragon Maid
Erza Scarlet|Fairy Tail
Mirajane Strauss|Fairy Tail
Bulma|Dragon Ball
Android 18|Dragon Ball
Misato Katsuragi|Evangelion
Ritsuko Akagi|Evangelion
Rangiku Matsumoto|Bleach
Yoruichi Shihouin|Bleach
Tsunade|Naruto
Kushina Uzumaki|Naruto
Konan|Naruto
Mei Terumi|Naruto
Anko Mitarashi|Naruto
Kurenai Yuhi|Naruto
Revy|Black Lagoon
Balalaika|Black Lagoon
Esdeath|Akame ga Kill
Albedo|Overlord
Narberal Gamma|Overlord
Riza Hawkeye|Fullmetal Alchemist
Olivier Armstrong|Fullmetal Alchemist
Lust|Fullmetal Alchemist
Faye Valentine|Cowboy Bebop
Motoko Kusanagi|Ghost in the Shell
C.C.|Code Geass
Fubuki|One Punch Man
Lisa Lisa|JoJo's Bizarre Adventure
Medusa Gorgon|Soul Eater
Roronoa Zoro|One Piece
Sanji|One Piece
Trafalgar Law|One Piece
Gojo Satoru|Jujutsu Kaisen
Nanami Kento|Jujutsu Kaisen
Toji Fushiguro|Jujutsu Kaisen
Levi Ackerman|Attack on Titan
Erwin Smith|Attack on Titan
Itachi Uchiha|Naruto
Kakashi Hatake|Naruto
Madara Uchiha|Naruto
Jiraiya|Naruto
Goku|Dragon Ball
Vegeta|Dragon Ball
Roy Mustang|Fullmetal Alchemist
Kyojuro Rengoku|Demon Slayer
Tengen Uzui|Demon Slayer
Giyu Tomioka|Demon Slayer
Saitama|One Punch Man
Spike Spiegel|Cowboy Bebop
Vash the Stampede|Trigun
Alucard|Hellsing
Guts|Berserk
Griffith|Berserk
Aki Hayakawa|Chainsaw Man
Osamu Dazai|Bungo Stray Dogs
Chuuya Nakahara|Bungo Stray Dogs
Gilgamesh|Fate
Ainz Ooal Gown|Overlord
Sebastian Michaelis|Black Butler
Howl|Howl's Moving Castle
Meliodas|The Seven Deadly Sins
Dio Brando|JoJo's Bizarre Adventure
Kenpachi Zaraki|Bleach
Byakuya Kuchiki|Bleach
Sosuke Aizen|Bleach
Hisoka Morow|Hunter x Hunter
Chrollo Lucilfer|Hunter x Hunter
Rimuru Tempest|Tensura
Ken Kaneki|Tokyo Ghoul
Gintoki Sakata|Gintama`;
const ALL = RAW.split('\n').map((l, i) => {
  const [name, anime] = l.split('|'); const p = name.split(' ');
  return { id: i + 1, name, first: p[0], last: p[1] || '', anime, g: i < 41 ? 'f' : 'm', about: name + ' from ' + anime + '.' };
});

// ---------- Charms (Roman-gladiator-style, need notches) ----------
const CHARMS = {
  fragileheart: { n: 'Heart of Glass', e: '❤️', notch: 2, price: 2500, stats: { hp: 2 }, desc: '+2 masks' },
  unbreakable: { n: "Titan's Might", e: '💪', notch: 3, price: 4000, stats: { dmgPct: 40 }, desc: '+40% blade damage' },
  gatheringswarm: { n: 'Coin Magnet', e: '🐝', notch: 1, price: 1500, stats: { geo: 25 }, desc: '+25% Denarii' },
  wanderer: { n: "Pilgrim's Compass", e: '🧭', notch: 1, price: 2000, stats: { xp: 15 }, desc: '+15% XP' },
  soulcatcher: { n: 'Spirit Catcher', e: '🔵', notch: 1, price: 1200, stats: { soulGain: 6 }, desc: '+6 soul per hit' },
  quickfocus: { n: 'Swift Mending', e: '⏱️', notch: 3, price: 3500, stats: { focusCost: -13 }, desc: 'Focus costs less soul' },
  shamanstone: { n: "Sorcerer's Stone", e: '🪨', notch: 3, price: 4500, stats: { spell: 50 }, desc: '+50% spell damage' },
  longnail: { n: 'Longblade', e: '📏', notch: 2, price: 2200, stats: { crit: 10 }, desc: '+10% crit chance' },
};

// ---------- Shop ----------
const I = (id, name, emoji, price, cat, desc, x) => Object.assign({ id, name, emoji, price, cat, desc }, x || {});
const SHOP = [
  I('nail1', 'Iron Gladius', '🗡️', 800, 'BLADES', '+4 blade damage', { slot: 'weapon', tier: 1, stats: { dmg: 4 } }),
  I('nail2', 'Steel Spatha', '🗡️', 2500, 'BLADES', '+8 blade damage', { slot: 'weapon', tier: 2, stats: { dmg: 8 } }),
  I('nail3', 'Legion Gladius', '⚔️', 6000, 'BLADES', '+12 blade damage', { slot: 'weapon', tier: 3, stats: { dmg: 12 } }),
  I('nail4', 'Imperial Blade', '⚔️', 14000, 'BLADES', '+17 blade damage', { slot: 'weapon', tier: 4, stats: { dmg: 17 } }),
  I('mask1', 'Bronze Mask', '🎭', 1500, 'ARMOR', '+1 mask (HP)', { slot: 'armor', tier: 1, stats: { hp: 1 } }),
  I('mask2', 'Iron Mask', '🎭', 5000, 'ARMOR', '+2 masks (HP)', { slot: 'armor', tier: 2, stats: { hp: 2 } }),
  I('mask3', 'Gilded Mask', '🎭', 12000, 'ARMOR', '+3 masks (HP)', { slot: 'armor', tier: 3, stats: { hp: 3 } }),
  I('tome', 'Scholar Tome', '📘', 1800, 'LEVELING', '+10% XP from everything', { stats: { xp: 10 } }),
  I('compass', 'Pilgrim Compass', '🧭', 3500, 'LEVELING', '+20% XP from everything', { stats: { xp: 20 } }),
  I('sagecrown', 'Sage Crown', '👑', 12000, 'LEVELING', '+35% XP from everything', { stats: { xp: 35 } }),
  I('pouch', 'Coin Pouch', '👝', 2000, 'LEVELING', '+15% Denarii from fights', { stats: { geo: 15 } }),
  I('lens', 'Hunter Lens', '🔍', 2500, 'LEVELING', '+8% crit chance', { stats: { crit: 8 } }),
  I('vessel', 'Spirit Urn', '🔮', 3000, 'LEVELING', '+33 max soul', { stats: { soul: 33 } }),
  I('rose', 'Rose', '🌹', 100, 'ATTRACTION', '+2 Charm', { stats: { charm: 2 } }),
  I('chocolate', 'Chocolate', '🍫', 250, 'ATTRACTION', '+4 Charm', { stats: { charm: 4 } }),
  I('perfume', 'Perfume', '🧴', 600, 'ATTRACTION', '+6 Charm', { stats: { charm: 6 } }),
  I('suit', 'Tailored Suit', '🕴️', 2500, 'ATTRACTION', '+15 Charm', { stats: { charm: 15 } }),
  I('chain', 'Gold Chain', '📿', 6000, 'ATTRACTION', '+25 Charm', { stats: { charm: 25 } }),
  I('crown', 'Golden Crown', '👑', 12000, 'ATTRACTION', '+40 Charm', { stats: { charm: 40 } }),
  I('lambo', 'Lamborghini', '🏎️', 80000, 'ATTRACTION', '+90 Charm', { stats: { charm: 90 } }),
  I('lifeblood', 'Healing Draught', '🧪', 300, 'POTIONS', 'Heal all masks (.use lifeblood)', { use: 'heal' }),
  I('soultonic', 'Spirit Tonic', '🔵', 250, 'POTIONS', 'Refill soul (.use soultonic)', { use: 'soul' }),
  I('xpscroll', 'XP Scroll', '📜', 1000, 'POTIONS', '+400 XP instantly (.use xpscroll)', { use: 'xp' }),
  I('miner3', 'Miner 3', '⛏️', 5000, 'EXTRAS', 'Unlock Miner 3'),
  I('miner4', 'Miner 4', '⛏️', 12000, 'EXTRAS', 'Unlock Miner 4'),
  I('speed', 'Speed Boost', '⚡', 2000, 'EXTRAS', 'Next mining takes 12h', { use: 'speed' }),
  I('cat', 'Cat Pet', '🐱', 4000, 'EXTRAS', '+5 coins on every .daily'),
  I('dog', 'Dog Pet', '🐶', 4000, 'EXTRAS', '+5 coins on every .daily'),
  I('dragon', 'Baby Dragon', '🐉', 15000, 'EXTRAS', '+20 coins on every .daily'),
  I('vip', 'VIP Pass', '💎', 20000, 'EXTRAS', 'Double .daily coins'),
];
for (const k of Object.keys(CHARMS)) {
  const c = CHARMS[k];
  SHOP.push(I('c_' + k, c.n, c.e, c.price, 'CHARMS', c.desc + ' | ' + c.notch + ' notch' + (c.notch > 1 ? 'es' : ''), { charmKey: k }));
}
const SHOP_MAP = {}; SHOP.forEach(s => { SHOP_MAP[s.id] = s; });
const CATS = ['BLADES', 'ARMOR', 'LEVELING', 'ATTRACTION', 'CHARMS', 'POTIONS', 'EXTRAS'];
const CATINFO = { BLADES: '⚔️', ARMOR: '🛡️', LEVELING: '📈', ATTRACTION: '💘', CHARMS: '📿', POTIONS: '🧪', EXTRAS: '🎁' };
function findItem(q) {
  q = String(q || '').toLowerCase().trim(); if (!q) return null;
  return SHOP_MAP[q] || SHOP_MAP['c_' + q] || SHOP.find(s => s.name.toLowerCase() === q) || SHOP.find(s => s.name.toLowerCase().indexOf(q) > -1) || null;
}

// ---------- Zones ----------
const ZONES = {
  dirtmouth: { n: 'Roma', e: '🏘️', lvl: 1, hub: true },
  crossroads: { n: 'Via Appia', e: '🪨', lvl: 1, enemies: [
    { n: 'Catacomb Rat', hp: 14, atk: 1, geo: [6, 12], xp: [8, 14] }, { n: 'Dust Mite', hp: 12, atk: 1, geo: [5, 10], xp: [7, 12] },
    { n: 'Bone Gnat', hp: 16, atk: 1, geo: [8, 14], xp: [9, 15] }, { n: 'Carrion Fly', hp: 20, atk: 1, geo: [10, 16], xp: [12, 18] }],
    boss: { n: 'Fallen Centurion', hp: 60, atk: 1, geo: [150, 220], xp: [180, 240], drop: 'soulcatcher' } },
  greenpath: { n: 'Silva Nera', e: '🌿', lvl: 5, enemies: [
    { n: 'Moss Crawler', hp: 24, atk: 1, geo: [12, 20], xp: [16, 24] }, { n: 'Thorn Wasp', hp: 22, atk: 1, geo: [12, 18], xp: [15, 22] },
    { n: 'Briar Archer', hp: 30, atk: 1, geo: [16, 26], xp: [20, 30] }, { n: 'Moss Legionary', hp: 38, atk: 2, geo: [22, 34], xp: [26, 38] }],
    boss: { n: 'Lady Vespera', hp: 90, atk: 2, geo: [300, 420], xp: [380, 480], drop: 'longnail' } },
  fungal: { n: 'Mushroom Marshes', e: '🍄', lvl: 10, enemies: [
    { n: 'Spore Imp', hp: 34, atk: 1, geo: [20, 30], xp: [28, 40] }, { n: 'Cap Warden', hp: 38, atk: 2, geo: [24, 36], xp: [32, 46] },
    { n: 'Bloom Brute', hp: 50, atk: 2, geo: [30, 44], xp: [40, 56] }, { n: 'Mantid Gladiator', hp: 56, atk: 2, geo: [36, 52], xp: [46, 62] }],
    boss: { n: 'Mantid Triumvirate', hp: 130, atk: 2, geo: [550, 750], xp: [700, 900], drop: 'unbreakable' } },
  city: { n: 'City of Ashes', e: '🌧️', lvl: 15, enemies: [
    { n: 'Stone Sentinel', hp: 54, atk: 2, geo: [34, 50], xp: [48, 66] }, { n: 'Winged Sentinel', hp: 50, atk: 2, geo: [34, 50], xp: [50, 68] },
    { n: 'Great Sentinel', hp: 80, atk: 2, geo: [52, 76], xp: [70, 96] }, { n: 'Spirit Twister', hp: 64, atk: 2, geo: [44, 64], xp: [60, 82] }],
    boss: { n: 'Spirit Magister', hp: 180, atk: 2, geo: [900, 1200], xp: [1100, 1400], drop: 'shamanstone' } },
  deepnest: { n: 'Deep Catacombs', e: '🕸️', lvl: 22, enemies: [
    { n: 'Tomb Digger', hp: 80, atk: 2, geo: [56, 80], xp: [84, 110] }, { n: 'Silk Weaver', hp: 70, atk: 2, geo: [50, 74], xp: [76, 100] },
    { n: 'Hooded Zealot', hp: 110, atk: 2, geo: [74, 104], xp: [110, 140] }, { n: 'Centipede Stalker', hp: 96, atk: 2, geo: [64, 92], xp: [96, 124] }],
    boss: { n: 'Maw of the Deep', hp: 240, atk: 2, geo: [1400, 1900], xp: [1700, 2200], drop: 'fragileheart' } },
  abyss: { n: 'The Void Pit', e: '🌑', lvl: 30, enemies: [
    { n: 'Dark Tendril', hp: 120, atk: 2, geo: [90, 130], xp: [140, 180] }, { n: 'Forsaken Kin', hp: 150, atk: 2, geo: [110, 150], xp: [170, 220] },
    { n: 'Umbral Creeper', hp: 130, atk: 2, geo: [96, 136], xp: [150, 196] }, { n: 'Shattered Wraith', hp: 170, atk: 2, geo: [120, 170], xp: [190, 250] }],
    boss: { n: 'Imperator Umbra', hp: 320, atk: 2, geo: [2500, 3500], xp: [3200, 4200], drop: 'quickfocus' } },
};

// ---------- Quests ----------
const Q = (id, name, zone, t, desc, geo, xp) => ({ id, name, zone, t, desc, geo, xp });
const QUESTS = [
  Q('q1', 'First Steps', 'crossroads', { type: 'explore', n: 5 }, 'Explore 5 times anywhere', 150, 100),
  Q('q2', 'Cleanse the Via Appia', 'crossroads', { type: 'kill', zone: 'crossroads', n: 10 }, 'Defeat 10 enemies in the Via Appia', 300, 220),
  Q('q3', 'Carrion Fly Hunt', 'crossroads', { type: 'kill', zone: 'crossroads', enemy: 'Carrion Fly', n: 6 }, 'Defeat 6 Carrion Flies', 250, 200),
  Q('q4', 'Treasure Hunter', 'crossroads', { type: 'treasure', n: 4 }, 'Find 4 treasure chests', 400, 250),
  Q('q5', 'The Fallen Centurion', 'crossroads', { type: 'boss', zone: 'crossroads', n: 1 }, 'Defeat the Fallen Centurion (.boss)', 600, 450),
  Q('q6', 'Silva Nera Pest Control', 'greenpath', { type: 'kill', zone: 'greenpath', n: 12 }, 'Defeat 12 enemies in Silva Nera', 600, 450),
  Q('q7', "Lady Vespera's Challenge", 'greenpath', { type: 'boss', zone: 'greenpath', n: 1 }, 'Defeat Lady Vespera (.boss)', 1000, 800),
  Q('q8', 'Fungal Cull', 'fungal', { type: 'kill', zone: 'fungal', n: 15 }, 'Defeat 15 enemies in the Mushroom Marshes', 1000, 800),
  Q('q9', 'Mantid Trial', 'fungal', { type: 'boss', zone: 'fungal', n: 1 }, 'Defeat the Mantid Triumvirate (.boss)', 1600, 1300),
  Q('q10', 'City Patrol', 'city', { type: 'kill', zone: 'city', n: 15 }, 'Defeat 15 enemies in the City of Ashes', 1600, 1300),
  Q('q11', 'Spirit Magister', 'city', { type: 'boss', zone: 'city', n: 1 }, 'Defeat the Spirit Magister (.boss)', 2400, 2000),
  Q('q12', 'Deep Catacombs Delve', 'deepnest', { type: 'kill', zone: 'deepnest', n: 20 }, 'Defeat 20 enemies in Deep Catacombs', 2400, 2000),
  Q('q13', 'Maw of the Deep', 'deepnest', { type: 'boss', zone: 'deepnest', n: 1 }, 'Defeat the Maw of the Deep (.boss)', 3200, 2800),
  Q('q14', 'Into the Void Pit', 'abyss', { type: 'kill', zone: 'abyss', n: 20 }, 'Defeat 20 enemies in the Void Pit', 3500, 3200),
  Q('q15', 'Imperator Umbra', 'abyss', { type: 'boss', zone: 'abyss', n: 1 }, 'Defeat Imperator Umbra (.boss)', 6000, 6000),
];
const QMAP = {}; QUESTS.forEach(q => { QMAP[q.id] = q; });

module.exports = { CHARS, CINFO, ALL, CHARMS, SHOP, SHOP_MAP, CATS, CATINFO, findItem, ZONES, QUESTS, QMAP };
