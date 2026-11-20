'use strict';
// Card collection commands. Rules and race-safety live in lib/cards.js.
const reg = require('../lib/registry');
const CD = require('../lib/cards');
const M = require('../lib/menu');
const n = (name, c) => M.note(name, c.platform || 'whatsapp');
const line = d => '`' + d.iid + '` ' + (d.fav ? '⭐' : '') + d.rarityName + ' · *' + d.name + '* (' + d.element + ') Lv' + d.lvl + ' ⚔' + d.power;
const cv = (c, x) => '🃏 ' + x.rarityName + ' · *' + x.name + '*\n' + x.element + ' · power ' + x.power + '\n_' + x.lore + '_';
const ids = s => String(s || '').split(/[,\s]+/).filter(Boolean);
const page = (list, p, size) => { const pages = Math.max(1, Math.ceil(list.length / size)); p = Math.min(Math.max(1, p || 1), pages); return { items: list.slice((p - 1) * size, p * size), p, pages }; };

reg.add('card', 'CARDS', c => {
  const q = c.full; if (!q) return c.reply(M.helpFor('cardhelp', c.platform || 'whatsapp'));
  const i = CD.instById(q); if (i) { const d = CD.describe(i); return c.reply(cv(c, d) + '\nOwner id: `' + d.iid + '` Lv' + d.lvl + (i.owner === c.u.id ? ' (yours)' : '')); }
  const inf = CD.info(q); return c.reply(inf ? cv(c, inf.card || inf) : '❌ No card matches *' + q + '*.');
}, 'Look up a card by id or name');
reg.add('cards', 'CARDS', c => { const inv = CD.inventory(c.u); const pg = page(inv.cards, parseInt(c.args[0], 10) || 1, 15);
  return c.reply(inv.cards.length ? '🃏 *Your cards* (' + inv.cards.length + ') page ' + pg.p + '/' + pg.pages + '\n' + pg.items.map(line).join('\n') : '🃏 You own no cards yet. Try ' + n('carddaily', c) + ' or wait for a spawn and ' + n('claim', c) + ' it.'); }, 'List your cards', { usage: 'cards [page]' });
reg.add('cardinventory', 'CARDS', c => { const inv = CD.inventory(c.u), s = inv.stats, pk = Object.keys(inv.packs).filter(k => inv.packs[k] > 0).map(k => k + ' ×' + inv.packs[k]);
  return c.reply('🎒 *Card inventory*\nCards: ' + s.total + ' (' + s.unique + ' unique)\nPacks: ' + (pk.join(', ') || 'none') + '\nFavourites: ' + s.favorites); }, 'Your cards and packs');
reg.add('cardprofile', 'CARDS', c => { const s = CD.stats(c.u);
  return c.reply('🃏 *' + c.u.name + '\'s collection*\nScore: *' + s.score + '*\nCards: ' + s.total + ' · Unique: ' + s.unique + '/' + s.catalog + ' (' + s.completion + '%)\n' + Object.keys(s.byRarity).map(k => k + ' ' + s.byRarity[k]).join(' · ') + '\nClaims: ' + s.claims + (s.best ? '\nBest: ' + s.best.rarityName + ' ' + s.best.name : '')); }, 'Your card profile');
reg.add('cardcollection', 'CARDS', c => { const s = CD.stats(c.u); return c.reply('📚 Collection: *' + s.unique + '/' + s.catalog + '* unique (' + s.completion + '%)\nSee what you are missing: ' + n('carddex', c)); }, 'Collection progress');
reg.add('carddex', 'CARDS', c => { const d = CD.dex(c.u), pg = page(d, parseInt(c.args[0], 10) || 1, 20);
  return c.reply('📖 *Card dex* ' + d.filter(x => x.owned).length + '/' + d.length + ' · page ' + pg.p + '/' + pg.pages + '\n' + pg.items.map(x => (x.owned ? '✅' : '▫️') + ' ' + x.id + ' ' + x.rarityName + ' ' + (x.owned ? x.name : '???')).join('\n')); }, 'The full card catalogue', { usage: 'carddex [page]' });
reg.add('cardinfo', 'CARDS', c => { const inf = CD.info(c.full); if (!inf) return c.reply('Use: ' + n('cardinfo', c) + ' <id or name>'); return c.reply(cv(c, inf.card || inf) + (inf.owners != null ? '\nOwned copies: ' + inf.owners : '')); }, 'Details about a card');
reg.add('cardview', 'CARDS', c => { const i = CD.instById(c.args[0]); if (!i) return c.reply('Use: ' + n('cardview', c) + ' <your card id>'); const d = CD.describe(i); return c.reply(cv(c, d) + '\nLv' + d.lvl + (d.fav ? ' ⭐' : '') + ' · id `' + d.iid + '`'); }, 'View one of your cards');
reg.add('cardsearch', 'CARDS', c => { const r = CD.search(c.full); return c.reply(r.length ? '🔎 ' + r.length + ' result(s)\n' + r.slice(0, 20).map(x => x.id + ' ' + x.rarityName + ' · ' + x.name + ' (' + x.element + ')').join('\n') : '🔎 Nothing found. Try a name, an element or a rarity.'); }, 'Search the catalogue', { usage: 'cardsearch <text>' });
reg.add('carddaily', 'CARDS', c => { const r = CD.daily(c.u); return c.reply(r.ok ? '🎁 Daily card!\n' + cv(c, r.card) + '\nid `' + r.inst.id + '`' : '⏳ ' + r.msg); }, 'Free card every day');
reg.add('cardpack', 'CARDS', c => { const r = CD.buyPack(c.u, c.args[0]); return c.reply((r.ok ? '🛍️ ' : '❌ ') + r.msg); }, 'Buy a card pack', { usage: 'cardpack [type]' });
reg.add('cardopen', 'CARDS', c => { const r = CD.openPack(c.u, c.args[0]); return c.reply(r.ok ? '📦 *' + r.pack + '*\n' + r.cards.map(x => x.card.rarityName + ' · *' + x.card.name + '* `' + x.inst.id + '`').join('\n') : '❌ ' + r.msg); }, 'Open a pack', { usage: 'cardopen [type]' });
reg.add('cardfavorite', 'CARDS', c => { const r = CD.favorite(c.u, c.args[0]); return c.reply((r.ok ? '⭐ ' : '❌ ') + r.msg); }, 'Toggle a favourite', { usage: 'cardfavorite <id>' });
reg.add('cardupgrade', 'CARDS', c => { const r = CD.upgrade(c.u, c.args[0]); return c.reply((r.ok ? '⬆️ ' : '❌ ') + r.msg); }, 'Upgrade a card using a spare copy', { usage: 'cardupgrade <id>' });
reg.add('cardfusion', 'CARDS', c => { const r = CD.fusion(c.u, ids(c.full)); return c.reply(r.ok ? '🔥 ' + r.msg + '\nid `' + r.inst.id + '`' : '❌ ' + r.msg); }, 'Fuse three cards of one rarity', { usage: 'cardfusion <id> <id> <id>' });
reg.add('cardduplicates', 'CARDS', c => { const d = CD.duplicates(c.u); return c.reply(d.length ? '♊ *Duplicates*\n' + d.slice(0, 20).map(x => x.card.rarityName + ' ' + x.card.name + ' ×' + x.count + ' (' + x.ids.map(i => '`' + i + '`').join(' ') + ')').join('\n') : '♊ No duplicates.'); }, 'Your spare copies');
reg.add('cardleaderboard', 'CARDS', c => { const l = CD.leaderboard(10); return c.reply(l.length ? '🏆 *Card leaderboard*\n' + l.map(r => r.rank + '. ' + r.name + ' — ' + r.score + ' pts (' + r.unique + ' unique)').join('\n') : '🏆 Nobody has cards yet.'); }, 'Top collectors');
reg.add('cardoffer', 'CARDS', c => {
  // .cardoffer <player> <my ids, comma separated> [their ids, comma separated]
  if (c.args.length < 2) return c.reply('Use: ' + n('cardoffer', c) + ' <player> <your card ids> [their card ids]\nExample: ' + n('cardoffer', c) + ' Ash K3F9A,K2B7C K9D2E');
  const r = CD.makeOffer(c.u, c.args[0], ids(c.args[1]), ids(c.args[2])); return c.reply((r.ok ? '🤝 ' : '❌ ') + r.msg);
}, 'Offer a trade', { usage: 'cardoffer <player> <your ids> [their ids]' });
reg.add('cardtrade', 'CARDS', c => {
  const o = CD.offersFor(c.u), f = x => '`' + x.oid + '` ' + x.give.map(g => g.name).join(', ') + ' ⇄ ' + (x.want.map(g => g.name).join(', ') || 'nothing');
  if (!o.incoming.length && !o.outgoing.length) return c.reply('🤝 No open offers. Start one with ' + n('cardoffer', c) + '.');
  return c.reply('🤝 *Trades*\n' + (o.incoming.length ? '📥 Incoming:\n' + o.incoming.map(x => f(x) + ' (from ' + x.fromName + ')').join('\n') + '\n' : '') + (o.outgoing.length ? '📤 Outgoing:\n' + o.outgoing.map(x => f(x) + ' (to ' + x.toName + ')').join('\n') : '') + '\n' + n('cardaccept', c) + ' <id> / ' + n('carddecline', c) + ' <id>');
}, 'Your open trade offers');
reg.add('cardaccept', 'CARDS', c => { const r = CD.acceptOffer(c.u, c.args[0]); return c.reply((r.ok ? '✅ ' : '❌ ') + r.msg); }, 'Accept a trade offer', { usage: 'cardaccept <offer id>' });
reg.add('carddecline', 'CARDS', c => { const r = CD.declineOffer(c.u, c.args[0]); return c.reply((r.ok ? '🚫 ' : '❌ ') + r.msg); }, 'Decline or cancel an offer', { usage: 'carddecline <offer id>' });
reg.add('cardhelp', 'CARDS', c => c.reply('🃏 *Cards*\nSpawns appear in chats with a claim code: ' + n('claim', c) + ' <code> (first one wins).\n' + ['carddaily', 'cardpack', 'cardopen', 'cards', 'cardprofile', 'carddex', 'cardinfo', 'cardsearch', 'cardfavorite', 'cardupgrade', 'cardfusion', 'cardduplicates', 'cardoffer', 'cardtrade', 'cardaccept', 'carddecline', 'cardleaderboard'].filter(x => reg.has(x, c.platform || 'whatsapp')).map(x => '• ' + n(x, c)).join('\n')), 'How cards work');
reg.add('claim', 'CARDS', c => { const r = CD.claim(c.u, c.args[0]); return c.reply(r.ok ? '🎉 *Claimed!* ' + r.card.rarityName + ' · *' + r.card.name + '*\nid `' + r.inst.id + '`' : '❌ ' + r.msg); }, 'Claim a spawned card', { usage: 'claim <code>' });
