'use strict';
// Card collection: original card catalogue, expiring spawns with one-time claim codes, owned instances, packs,
// daily pulls, offers/trades, upgrades and fusion. All state is in the shared database (data.cards).
// Every mutating function does its checks and its writes in the same synchronous step, so two people claiming the
// same code (or accepting the same offer) at the same moment can never both succeed.
const crypto = require('crypto');
const db = require('./db');

// ---------- catalogue (original characters and art parameters, no third-party art or names) ----------
const RARITIES = [
  { id: 'common', name: 'Common', pts: 1, w: 560, color: '#8FA3A0', max: 10 },
  { id: 'uncommon', name: 'Uncommon', pts: 3, w: 250, color: '#3FBF86', max: 10 },
  { id: 'rare', name: 'Rare', pts: 8, w: 120, color: '#4F9BE8', max: 10 },
  { id: 'epic', name: 'Epic', pts: 20, w: 50, color: '#7957D5', max: 10 },
  { id: 'legendary', name: 'Legendary', pts: 60, w: 17, color: '#E8B13A', max: 10 },
  { id: 'mythic', name: 'Mythic', pts: 150, w: 3, color: '#E8504A', max: 10 },
];
const RMAP = {}; RARITIES.forEach((r, i) => { r.idx = i; RMAP[r.id] = r; });
const ELEMENTS = ['Ash', 'Void', 'Soul', 'Moss', 'Tide', 'Ember', 'Frost', 'Gale'];
const SYMBOLS = ['crow', 'moon', 'blade', 'eye', 'rune', 'leaf', 'flame', 'wave', 'crown', 'star'];
const PAL = [['#19D68A', '#0b3d2d'], ['#7957D5', '#241a45'], ['#E8B13A', '#4a3510'], ['#4F9BE8', '#12304f'], ['#E8504A', '#4a1512'], ['#9FB4B0', '#1d2a28'], ['#D45FA8', '#44183a'], ['#5FD4D4', '#123f3f']];

const NAMES = {
  common: ['Ashen Crawler', 'Lantern Moth', 'Hollow Pup', 'Mosskin Scout', 'Dusk Beetle', 'Tide Sprite', 'Cinder Mouse', 'Frost Hare', 'Gale Finch', 'Root Warden', 'Tin Squire', 'Ink Bat'],
  uncommon: ['Veilwalker', 'Ember Fox', 'Thorn Archer', 'Salt Hound', 'Lost Chorister', 'Gravel Giant', 'Silk Duelist', 'Mire Witch', 'Glass Drake', 'Night Courier'],
  rare: ['Sable Knight', 'Moonlit Seer', 'Stormcaller Ione', 'Bone Cartographer', 'Rimefang Wolf', 'Ashbound Monk', 'Tidal Oracle', 'Crimson Falconer'],
  epic: ['Void Regent', 'Soulforged Paladin', 'Mother of Moss', 'Eclipse Duelist', 'Wraith of Hollow Bell', 'Gale Sovereign'],
  legendary: ['Kaelith, Crow Queen', 'Oryn the Last Lantern', 'Vessel of Ten Moons', 'Thessaly Ember-Heart'],
  mythic: ['The Pale Choir', 'Nocturne, First Flame'],
};
const LORE = ['Whispered about in Roma taverns.', 'Seen only when the lanterns dim.', 'Bound to an oath nobody remembers.', 'Carries a map that redraws itself.', 'Sings to the dark and the dark answers.', 'Has never lost a duel, only forgotten them.'];
const CARDS = []; const CMAP = {};
(function build() {
  let n = 0;
  RARITIES.forEach(r => NAMES[r.id].forEach((name, i) => {
    n++; const h = crypto.createHash('sha1').update(name).digest();
    const c = {
      id: 'C' + String(n).padStart(2, '0'), name, rarity: r.id, element: ELEMENTS[h[0] % ELEMENTS.length], symbol: SYMBOLS[h[1] % SYMBOLS.length],
      pal: h[2] % PAL.length, power: 10 + r.idx * 18 + (h[3] % 9), lore: LORE[h[4] % LORE.length],
    };
    CARDS.push(c); CMAP[c.id] = c;
  }));
})();
const byRarity = id => CARDS.filter(c => c.rarity === id);
const cardView = c => ({ id: c.id, name: c.name, rarity: c.rarity, rarityName: RMAP[c.rarity].name, color: RMAP[c.rarity].color, element: c.element, symbol: c.symbol, palette: PAL[c.pal], power: c.power, lore: c.lore });

// ---------- storage ----------
function S() {
  const d = db.data;
  if (!d.cards || typeof d.cards !== 'object') d.cards = {};
  const c = d.cards; c.inst = c.inst || {}; c.spawns = c.spawns || {}; c.offers = c.offers || {}; c.seq = c.seq || 0; c.cool = c.cool || {};
  return c;
}
const CFG = {
  SPAWN_TTL: (parseInt(process.env.CARD_SPAWN_MINUTES, 10) || 10) * 60000,
  SPAWN_CHANCE: process.env.CARD_SPAWN_CHANCE !== undefined ? Number(process.env.CARD_SPAWN_CHANCE) : 0.04,   // per eligible message
  SPAWN_COOLDOWN: (parseInt(process.env.CARD_SPAWN_COOLDOWN_MIN, 10) || 12) * 60000,
  OFFER_TTL: 24 * 3600e3, MAX_OFFERS: 10, DAILY_MS: 20 * 3600e3, MAX_LEVEL: 5,
  PACKS: { basic: { name: 'Basic Pack', geo: 1500, gems: 0, n: 3, minRarity: 0 }, premium: { name: 'Premium Pack', geo: 0, gems: 10, n: 5, minRarity: 2 } },
  CLAIM_GAP: 3000,
};
let idx = null;                                         // owner -> Set(instance id), rebuilt lazily
function index() { if (idx) return idx; idx = new Map(); const i = S().inst; Object.keys(i).forEach(k => { const o = i[k].owner; if (!idx.has(o)) idx.set(o, new Set()); idx.get(o).add(k); }); return idx; }
const owned = uid => { const s = index().get(uid); return s ? Array.from(s).map(k => S().inst[k]) : []; };
const norm = s => String(s || '').replace(/^#/, '').trim().toUpperCase();
const instById = id => S().inst[norm(id)] || null;
function newInstance(uid, cid, src) {
  const c = S(); c.seq++; const id = 'K' + c.seq.toString(36).toUpperCase();
  const inst = { id, cid, owner: uid, lvl: 1, fav: false, t: Date.now(), src: src || 'unknown' }; c.inst[id] = inst;
  if (!index().has(uid)) index().set(uid, new Set()); index().get(uid).add(id);
  db.save(); return inst;
}
function setOwner(inst, uid) { index().get(inst.owner).delete(inst.id); inst.owner = uid; if (!index().has(uid)) index().set(uid, new Set()); index().get(uid).add(inst.id); }
function destroy(inst) { index().get(inst.owner).delete(inst.id); delete S().inst[inst.id]; }
const userRec = uid => db.data.users[uid] || null;
const meta = u => { u.cardMeta = u.cardMeta || { lastDaily: 0, packs: {}, claims: 0 }; u.cardMeta.packs = u.cardMeta.packs || {}; return u.cardMeta; };

// ---------- random ----------
const rint = n => crypto.randomInt(0, n);
function rollRarity(minIdx, boost) {
  const ws = RARITIES.map(r => r.idx < (minIdx || 0) ? 0 : r.w * (boost && r.idx >= 2 ? boost : 1)), tot = ws.reduce((a, b) => a + b, 0);
  let x = rint(Math.max(1, Math.floor(tot))), i = 0; while (i < ws.length - 1 && x >= ws[i]) { x -= ws[i]; i++; }
  return RARITIES[i];
}
function rollCard(minIdx, boost) { const l = byRarity(rollRarity(minIdx, boost).id); return l[rint(l.length)]; }

// ---------- spawns and claiming ----------
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() { for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += CODE_ALPHA[rint(CODE_ALPHA.length)]; if (!S().spawns[c]) return c; } }
function purge(now) {
  const sp = S().spawns, keys = Object.keys(sp);
  keys.forEach(k => { const s = sp[k]; if ((!s.claimedBy && s.exp < now - 3600e3) || (s.claimedBy && s.claimedAt < now - 86400e3)) delete sp[k]; });
  const of = S().offers; Object.keys(of).forEach(k => { const o = of[k]; if (o.status !== 'open' || o.exp < now) { if (o.status === 'open') o.status = 'expired'; if ((o.closedAt || o.exp) < now - 86400e3) delete of[k]; } });
}
// force=true skips chance and cooldown (owner command)
function spawn(chan, force, forceCard) {
  const now = Date.now(), c = S(); purge(now);
  if (!force) {
    if (now - (c.cool[chan] || 0) < CFG.SPAWN_COOLDOWN) return null;
    const open = Object.values(c.spawns).filter(s => s.chan === chan && !s.claimedBy && s.exp > now);
    if (open.length) return null;
  }
  const card = forceCard ? CMAP[forceCard] : rollCard(0);
  const code = newCode();
  const s = c.spawns[code] = { code, cid: card.id, chan, t: now, exp: now + CFG.SPAWN_TTL, claimedBy: null, claimedAt: 0, inst: null };
  c.cool[chan] = now; db.save();
  return { code, card: cardView(card), expiresInMs: CFG.SPAWN_TTL, spawn: s };
}
// called for each eligible chat message; returns a spawn or null
function maybeSpawn(chan) { if (Math.random() >= CFG.SPAWN_CHANCE) return null; return spawn(chan, false); }

function claim(u, rawCode) {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return { ok: false, msg: 'Use: .claim <code>' };
  const c = S(), now = Date.now(), m = meta(u);
  if (now - (m.lastClaimTry || 0) < CFG.CLAIM_GAP) return { ok: false, msg: 'Slow down a moment.' };
  m.lastClaimTry = now;
  const s = c.spawns[code];
  if (!s) return { ok: false, msg: 'That code is not valid.' };
  if (s.claimedBy) return { ok: false, msg: s.claimedBy === u.id ? 'You already claimed this card.' : 'Too late, someone else claimed that card.' };
  if (s.exp < now) return { ok: false, msg: 'That card has expired.' };
  s.claimedBy = u.id; s.claimedAt = now;                // the single decisive write, in the same tick as the checks above
  const inst = newInstance(u.id, s.cid, 'spawn'); s.inst = inst.id; m.claims = (m.claims || 0) + 1;
  require('./social').event('card', u, 'claimed ' + CMAP[s.cid].name, { rarity: CMAP[s.cid].rarity });
  db.save();
  return { ok: true, card: cardView(CMAP[s.cid]), inst };
}

// ---------- daily, packs ----------
function daily(u) {
  const m = meta(u), now = Date.now();
  if (now - m.lastDaily < CFG.DAILY_MS) return { ok: false, msg: 'Your daily card is not ready. Come back in ' + Math.ceil((CFG.DAILY_MS - (now - m.lastDaily)) / 60000) + ' minutes.' };
  m.lastDaily = now; const card = rollCard(0); const inst = newInstance(u.id, card.id, 'daily'); db.save();
  return { ok: true, card: cardView(card), inst };
}
function buyPack(u, type) {
  type = String(type || 'basic').toLowerCase(); const p = CFG.PACKS[type];
  if (!p) return { ok: false, msg: 'Pack types: ' + Object.keys(CFG.PACKS).map(k => k + ' (' + (CFG.PACKS[k].geo ? CFG.PACKS[k].geo + ' Denarii' : CFG.PACKS[k].gems + ' gems') + ')').join(', ') + '.' };
  if (p.geo && u.coins < p.geo) return { ok: false, msg: 'You need ' + p.geo + ' Denarii (you have ' + u.coins + ').' };
  if (p.gems && (u.gems || 0) < p.gems) return { ok: false, msg: 'You need ' + p.gems + ' gems (you have ' + (u.gems || 0) + ').' };
  if (p.geo) db.money(u, -p.geo, 'cardpack', 'Bought ' + p.name); if (p.gems) u.gems -= p.gems;
  const m = meta(u); m.packs[type] = (m.packs[type] || 0) + 1; db.save();
  return { ok: true, msg: 'Bought a ' + p.name + '. Open it with .cardopen ' + type + '.', type };
}
function openPack(u, type) {
  type = String(type || '').toLowerCase(); const m = meta(u);
  if (!type) type = Object.keys(m.packs).find(k => m.packs[k] > 0) || 'basic';
  const p = CFG.PACKS[type]; if (!p) return { ok: false, msg: 'Unknown pack type.' };
  if (!(m.packs[type] > 0)) return { ok: false, msg: 'You have no ' + p.name + '. Buy one with .cardpack ' + type + '.' };
  m.packs[type]--;
  const got = []; for (let i = 0; i < p.n; i++) { const card = rollCard(i === 0 ? p.minRarity : 0); got.push({ card: cardView(card), inst: newInstance(u.id, card.id, 'pack') }); }
  db.save(); return { ok: true, pack: p.name, cards: got };
}

// ---------- favourites, offers, trades ----------
function mine(u, id) { const i = instById(id); return i && i.owner === u.id ? i : null; }
function favorite(u, id) { const i = mine(u, id); if (!i) return { ok: false, msg: 'You do not own a card with id ' + norm(id) + '.' }; i.fav = !i.fav; db.save(); return { ok: true, inst: i, msg: CMAP[i.cid].name + (i.fav ? ' is now a favourite (protected from trades, upgrades and fusion).' : ' is no longer a favourite.') }; }
function findPlayer(q) { return require('./webcore').find(q); }
function makeOffer(u, targetQuery, giveIds, wantIds) {
  const t = findPlayer(targetQuery); if (!t) return { ok: false, msg: 'Player not found.' };
  if (t.id === u.id) return { ok: false, msg: 'You cannot trade with yourself.' };
  const give = Array.from(new Set((giveIds || []).map(norm))), want = Array.from(new Set((wantIds || []).map(norm)));
  if (!give.length || give.length > 5 || want.length > 5) return { ok: false, msg: 'Offer between 1 and 5 of your cards.' };
  for (const g of give) { const i = mine(u, g); if (!i) return { ok: false, msg: 'You do not own card ' + g + '.' }; if (i.fav) return { ok: false, msg: CMAP[i.cid].name + ' is a favourite. Remove the favourite first.' }; }
  for (const w of want) { const i = instById(w); if (!i || i.owner !== t.id) return { ok: false, msg: 'That player does not own card ' + w + '.' }; }
  const c = S(), now = Date.now(); purge(now);
  const open = Object.values(c.offers).filter(o => o.from === u.id && o.status === 'open');
  if (open.length >= CFG.MAX_OFFERS) return { ok: false, msg: 'You already have ' + CFG.MAX_OFFERS + ' open offers. Cancel some first.' };
  if (open.some(o => o.give.some(g => give.indexOf(g) > -1))) return { ok: false, msg: 'One of those cards is already in another open offer.' };
  const oid = 'T' + crypto.randomBytes(3).toString('hex').toUpperCase();
  c.offers[oid] = { oid, from: u.id, to: t.id, give, want, t: now, exp: now + CFG.OFFER_TTL, status: 'open' };
  require('./social').notify(t, 'trade', (u.name || 'A player') + ' sent you a card offer (' + oid + ').', u);
  db.save(); return { ok: true, oid, to: t, msg: 'Offer ' + oid + ' sent to ' + t.name + '. It expires in 24 hours.' };
}
function offersFor(u) {
  const c = S(), now = Date.now(); purge(now);
  const all = Object.values(c.offers).filter(o => o.status === 'open' && o.exp > now);
  const fmt = o => ({ oid: o.oid, from: o.from, to: o.to, fromName: (userRec(o.from) || {}).name, toName: (userRec(o.to) || {}).name, give: o.give.map(i => describe(instById(i))).filter(Boolean), want: o.want.map(i => describe(instById(i))).filter(Boolean), expiresInMs: o.exp - now });
  return { incoming: all.filter(o => o.to === u.id).map(fmt), outgoing: all.filter(o => o.from === u.id).map(fmt) };
}
function acceptOffer(u, oid) {
  const o = S().offers[norm(oid)]; const now = Date.now();
  if (!o || o.status !== 'open') return { ok: false, msg: 'That offer is not open.' };
  if (o.to !== u.id) return { ok: false, msg: 'That offer is not addressed to you.' };
  if (o.exp < now) { o.status = 'expired'; o.closedAt = now; return { ok: false, msg: 'That offer expired.' }; }
  const a = userRec(o.from); if (!a) return { ok: false, msg: 'The sender no longer exists.' };
  const give = o.give.map(instById), want = o.want.map(instById);
  if (give.some(i => !i || i.owner !== o.from || i.fav) || want.some(i => !i || i.owner !== u.id || i.fav)) { o.status = 'void'; o.closedAt = now; db.save(); return { ok: false, msg: 'The offer is no longer valid because the cards changed hands or became favourites.' }; }
  o.status = 'accepted'; o.closedAt = now;                // closes it first, so a second accept in the same tick fails above
  give.forEach(i => setOwner(i, u.id)); want.forEach(i => setOwner(i, o.from));
  require('./social').notify(a, 'trade', (u.name || 'A player') + ' accepted your offer ' + o.oid + '.', u);
  db.save(); return { ok: true, msg: 'Trade complete: you received ' + give.map(i => CMAP[i.cid].name).join(', ') + (want.length ? ' and gave ' + want.map(i => CMAP[i.cid].name).join(', ') : '') + '.' };
}
function declineOffer(u, oid) {
  const o = S().offers[norm(oid)]; if (!o || o.status !== 'open') return { ok: false, msg: 'That offer is not open.' };
  if (o.to !== u.id && o.from !== u.id) return { ok: false, msg: 'That offer is not yours.' };
  o.status = o.to === u.id ? 'declined' : 'cancelled'; o.closedAt = Date.now();
  const other = userRec(o.to === u.id ? o.from : o.to); if (other && o.to === u.id) require('./social').notify(other, 'trade', (u.name || 'A player') + ' declined your offer ' + o.oid + '.', u);
  db.save(); return { ok: true, msg: o.status === 'declined' ? 'Offer declined.' : 'Offer cancelled.' };
}

// ---------- upgrade, fusion ----------
const powerOf = i => Math.round(CMAP[i.cid].power * (1 + 0.2 * (i.lvl - 1)));
function upgradeCost(i) { return 400 * i.lvl * (1 + RMAP[CMAP[i.cid].rarity].idx); }
function upgrade(u, id) {
  const i = mine(u, id); if (!i) return { ok: false, msg: 'You do not own that card.' };
  if (i.lvl >= CFG.MAX_LEVEL) return { ok: false, msg: 'That card is already at the maximum level (' + CFG.MAX_LEVEL + ').' };
  const dup = owned(u.id).find(x => x.id !== i.id && x.cid === i.cid && !x.fav);
  if (!dup) return { ok: false, msg: 'Upgrading consumes a spare copy of the same card (not a favourite). You have none.' };
  const cost = upgradeCost(i); if (u.coins < cost) return { ok: false, msg: 'You need ' + cost + ' Denarii (you have ' + u.coins + ').' };
  db.money(u, -cost, 'cardupgrade', 'Upgraded ' + CMAP[i.cid].name); destroy(dup); i.lvl++; db.save();
  return { ok: true, inst: i, msg: CMAP[i.cid].name + ' is now level ' + i.lvl + ' (power ' + powerOf(i) + '). Spent ' + cost + ' Denarii and one spare copy.' };
}
function fusion(u, ids) {
  ids = Array.from(new Set((ids || []).map(norm))); if (ids.length !== 3) return { ok: false, msg: 'Fusion needs exactly 3 different cards of the same rarity.' };
  const list = ids.map(x => mine(u, x)); if (list.some(x => !x)) return { ok: false, msg: 'You must own all three cards.' };
  if (list.some(x => x.fav)) return { ok: false, msg: 'Favourite cards cannot be fused.' };
  const r = CMAP[list[0].cid].rarity; if (list.some(x => CMAP[x.cid].rarity !== r)) return { ok: false, msg: 'All three cards must have the same rarity.' };
  const ri = RMAP[r].idx; if (ri >= RARITIES.length - 1) return { ok: false, msg: 'Mythic cards cannot be fused further.' };
  const cost = 500 * (ri + 1); if (u.coins < cost) return { ok: false, msg: 'Fusion costs ' + cost + ' Denarii (you have ' + u.coins + ').' };
  db.money(u, -cost, 'cardfusion', 'Card fusion');
  list.forEach(destroy);
  const pool = byRarity(RARITIES[ri + 1].id), card = pool[rint(pool.length)], inst = newInstance(u.id, card.id, 'fusion'); db.save();
  return { ok: true, card: cardView(card), inst, cost, msg: 'The three cards fuse into ' + card.name + ' (' + RMAP[card.rarity].name + ')!' };
}

// ---------- read helpers ----------
function describe(i) { if (!i) return null; const c = CMAP[i.cid]; return Object.assign(cardView(c), { iid: i.id, lvl: i.lvl, fav: !!i.fav, power: powerOf(i), since: i.t, source: i.src }); }
function inventory(u) {
  const list = owned(u.id).sort((a, b) => RMAP[CMAP[b.cid].rarity].idx - RMAP[CMAP[a.cid].rarity].idx || a.cid.localeCompare(b.cid) || a.t - b.t).map(describe);
  return { cards: list, packs: Object.assign({}, meta(u).packs), stats: stats(u) };
}
function stats(u) {
  const list = owned(u.id), uniq = new Set(list.map(i => i.cid));
  const byR = {}; RARITIES.forEach(r => byR[r.id] = 0); list.forEach(i => byR[CMAP[i.cid].rarity]++);
  const score = list.reduce((a, i) => a + RMAP[CMAP[i.cid].rarity].pts * i.lvl, 0);
  const best = list.slice().sort((a, b) => RMAP[CMAP[b.cid].rarity].idx - RMAP[CMAP[a.cid].rarity].idx || powerOf(b) - powerOf(a))[0];
  return { total: list.length, unique: uniq.size, catalog: CARDS.length, completion: Math.round(uniq.size / CARDS.length * 100), score, byRarity: byR, favorites: list.filter(i => i.fav).length, best: best ? describe(best) : null, claims: meta(u).claims || 0 };
}
function duplicates(u) {
  const g = {}; owned(u.id).forEach(i => { (g[i.cid] = g[i.cid] || []).push(i); });
  return Object.keys(g).filter(k => g[k].length > 1).map(k => ({ card: cardView(CMAP[k]), count: g[k].length, ids: g[k].map(i => i.id) })).sort((a, b) => b.count - a.count);
}
function dex(u) { const have = new Set(owned(u.id).map(i => i.cid)); return CARDS.map(c => Object.assign(cardView(c), { owned: have.has(c.id) })); }
function search(q) {
  q = String(q || '').toLowerCase().trim(); if (!q) return [];
  return CARDS.filter(c => c.name.toLowerCase().indexOf(q) > -1 || c.rarity === q || c.element.toLowerCase() === q || c.id.toLowerCase() === q).map(cardView);
}
function info(q) { q = String(q || '').trim(); const c = CMAP[q.toUpperCase()] || CARDS.find(x => x.name.toLowerCase() === q.toLowerCase()) || CARDS.find(x => x.name.toLowerCase().indexOf(q.toLowerCase()) > -1); if (!c) return null; const have = Object.values(S().inst).filter(i => i.cid === c.id).length; return Object.assign(cardView(c), { inGame: have }); }
function leaderboard(n) {
  const rows = []; index().forEach((set, uid) => { const u = userRec(uid); if (!u || !set.size) return; const s = stats(u); rows.push({ uid, name: u.name, pid: require('./webcore').pid(u), score: s.score, total: s.total, unique: s.unique }); });
  return rows.sort((a, b) => b.score - a.score || b.unique - a.unique).slice(0, n || 10).map((r, i) => Object.assign({ rank: i + 1 }, r));
}

module.exports = { CFG, RARITIES, RMAP, CARDS, CMAP, ELEMENTS, SYMBOLS, PAL, cardView, spawn, maybeSpawn, claim, daily, buyPack, openPack, favorite, makeOffer, offersFor, acceptOffer, declineOffer, upgrade, upgradeCost, fusion, inventory, stats, duplicates, dex, search, info, leaderboard, describe, owned, instById, newInstance, powerOf, purge, _reset: () => { idx = null; } };
