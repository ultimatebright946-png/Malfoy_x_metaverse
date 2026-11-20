const reg = require('../lib/registry');
const db = require('../lib/db');
const M = require('../lib/media');
const D = require('../lib/data');
const R = require('../lib/rpg');
const { between, rnd, pick, num, fmt } = require('../lib/util');
const PREFIX = process.env.PREFIX || '.';
const DAY = 86400000;

const lvlUp = (u, r) => r.ups ? '\n🎉 *LEVEL UP!* You are now level ' + u.level : '';

reg.add(['profile', 'me', 'stats'], 'ECONOMY', async c => {
  const u = c.u, s = R.stats(u), sm = D.ALL[(u.soulmate || 0) - 1], W = require('../lib/webcore');
  const rk = W.rankOf(u), pct = Math.floor(u.xp / u.xpNeeded * 100), linked = !!(u.web && (u.web.pfp || u.web.v));
  const dna = u.dna ? u.dna.parts.slice(0, 3).map(p => p.p + '% ' + p.n).join(', ') : 'none yet (' + PREFIX + 'animedna)';
  const t = '╭━━『 👤 *' + u.name + '* 』━━╮\n\n' +
    '🏅 Global rank: *#' + rk + '* of ' + Object.keys(db.data.users).length + '\n🎖️ Level *' + u.level + '*  ' + require('../lib/util').bar(pct, 10) + ' ' + pct + '%\n📊 XP: ' + u.xp + '/' + u.xpNeeded + '\n💰 Denarii: *' + u.coins + '*   💎 Gems: *' + u.gems + '*\n\n' +
    '⚔️ *Knight*\n' + R.masks(R.curHp(u), s.hp) + '\n🗡️ Damage ' + Math.round(s.dmg * (1 + s.dmgPct / 100)) + '  🎯 Crit ' + s.crit + '%  📈 XP +' + s.xp + '%\n📍 ' + D.ZONES[u.rpg.zone].e + ' ' + D.ZONES[u.rpg.zone].n + '\n☠️ Kills ' + u.rpg.kills + '  📜 Quests ' + u.rpg.done.length + '  👑 Bosses ' + Object.keys(u.rpg.bosses).length + '\n\n' +
    '💘 Charm: *' + s.charm + '*\n💞 Soulmate: ' + (sm ? sm.name + ' (bond ' + u.soulmateLv + ')' : 'none') + '\n🧬 DNA: ' + dna + '\n🔥 Daily streak: ' + u.streak + '\n\n' +
    '🌐 Website: ' + (linked ? '✅ profile set up' : 'not linked yet') + '\n🔗 ' + W.baseUrl() + (linked ? '' : '\nSend *' + PREFIX + 'website* to see how to sign up.') + '\n╰━━━━━━━━━━━━━━━━╯';
  const pic = W.pfpBuffer(u) || await M.pfp(c.sock, c.sender);
  return M.image(c.sock, c.jid, [pic], t, [], c.msg);
});
reg.add('register', 'ECONOMY', c => {
  const n = c.full.replace(/[^\w \-]/g, '').trim().slice(0, 20); if (!n) return c.reply('Use: ' + PREFIX + 'register YourName');
  c.u.name = n; c.u.registered = true; db.save(); return c.reply('✅ Name set to *' + n + '*');
});
reg.add(['balance', 'bal', 'wallet'], 'ECONOMY', c => c.reply('💰 Wallet: *' + c.u.coins + '* Denarii\n🏦 Bank: *' + ((c.u.bank && c.u.bank.bal) || 0) + '* Denarii\n💎 Gems: *' + c.u.gems + '*'));

reg.add('daily', 'ECONOMY', c => {
  const u = c.u, now = Date.now();
  if (now - u.lastDaily < DAY) return c.reply('⏳ Come back in *' + fmt(DAY - (now - u.lastDaily)) + '*');
  u.streak = (now - u.lastDaily < DAY * 2) ? u.streak + 1 : 1; u.lastDaily = now;
  let g = 500 + Math.min(u.streak, 14) * 50;
  if (R.has(u, 'cat')) g += 5; if (R.has(u, 'dog')) g += 5; if (R.has(u, 'dragon')) g += 20; if (R.has(u, 'vip')) g *= 2;
  db.money(u, g, 'daily', 'Daily reward, streak ' + u.streak); u.gems += 1; const r = R.gainXp(u, 80); db.save();
  return c.reply('🎁 *DAILY*\n+' + g + ' Denarii, +1 💎, +' + r.gain + ' XP\n🔥 Streak: ' + u.streak + lvlUp(u, r));
});
const JOBS = ['mined Denarii in the silver mines', 'sold relics in Roma', 'guarded the city gate', 'ran errands for the Senator', 'hunted bandits'];
reg.add('work', 'ECONOMY', c => {
  const u = c.u, now = Date.now();
  if (now - u.lastWork < 3600000) return c.reply('⏳ Rest for *' + fmt(3600000 - (now - u.lastWork)) + '*');
  u.lastWork = now; const g = between(100, 300) + u.level * 4, r = R.gainXp(u, 15); db.money(u, g, 'work', 'Work'); db.save();
  return c.reply('💼 You ' + pick(JOBS) + '\n+' + g + ' Denarii, +' + r.gain + ' XP' + lvlUp(u, r));
});
// .give @user 500  |  reply to a message with .give 500  |  .give 2348012345678 500  |  .give <website player id> 500
reg.add(['give', 'pay', 'send', 'transfer'], 'ECONOMY', async c => {
  const W = require('../lib/webcore');
  let t = c.target() || null, amount = 0, rest = [];
  c.args.forEach(a => {
    const x = a.replace(/[,_]/g, '').toLowerCase();
    if (/^@/.test(a)) { const d = a.replace(/\D/g, ''); if (!t && d.length >= 8) t = d + '@s.whatsapp.net'; return; }
    if (/^\d+(\.\d+)?k$/.test(x)) { amount = Math.round(parseFloat(x) * 1000); return; }
    if (/^[a-f0-9]{10}$/.test(x) && !/^\d+$/.test(x)) { const pu = W.byPid(x); if (pu && !t) t = pu.id; return; }
    if (/^\d+$/.test(x)) rest.push(x);
  });
  if (rest.length) {   // a long number is a phone number, a short one is the amount
    const phone = rest.find(n => n.length >= 9); if (phone && !t) t = phone + '@s.whatsapp.net';
    const amt = rest.filter(n => n !== phone); if (amt.length) amount = parseInt(amt[amt.length - 1]);
    else if (!amount && !phone) amount = parseInt(rest[0]);
  }
  if (!t || !amount || amount < 1) return c.reply('Use: *' + PREFIX + 'give @user 500*\nor reply to their message with *' + PREFIX + 'give 500*');
  const me = db.getUser(c.sender), them = db.getUser(t);
  if (them.id === me.id) return c.reply('You cannot send Denarii to yourself.');
  if (c.sock.user && them.id === c.sock.user.id.split(':')[0] + '@s.whatsapp.net') return c.reply('The bot does not need Denarii.');
  if (me.coins < amount) return c.reply('💸 You only have *' + me.coins + '* Denarii.');
  const who = '@' + num(t);
  db.money(me, -amount, 'give_out', 'Sent to ' + (them.name || num(t)));
  db.money(them, amount, 'give_in', 'Received from ' + (me.name || 'a player'));
  return c.reply('✅ Sent *' + amount + '* Denarii to ' + who + '\n💰 Your balance: *' + me.coins + '* Denarii\n🧾 See ' + PREFIX + 'transactions', [t]);
});
const TX_ICON = { daily: '🎁', work: '💼', mine: '⛏️', fight: '⚔️', boss: '👑', chest: '🧰', quest: '📜', levelup: '🎉', shade: '👤', shop: '🛒', give_out: '📤', give_in: '📥', slots: '🎰', arena: '🎮', date: '💘', deposit: '🏦', withdraw: '🏦', interest: '📈', duel: '⚔️', duel_bet: '⚔️' };
const fmtTime = ts => new Date(ts).toLocaleString('en-GB', { timeZone: process.env.TIMEZONE || 'Africa/Lagos', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
reg.add(['transactions', 'tx', 'history', 'statement'], 'ECONOMY', c => {
  const u = c.u, n = Math.max(1, Math.min(25, parseInt(c.args[0]) || 10)), list = (u.tx || []).slice(-n).reverse();
  if (!list.length) return c.reply('🧾 *TRANSACTIONS*\n\nNothing yet. Earn Denarii with ' + PREFIX + 'daily, ' + PREFIX + 'work or ' + PREFIX + 'explore.');
  let inn = 0, out = 0; list.forEach(x => { if (x.a > 0) inn += x.a; else out += -x.a; });
  return c.reply('🧾 *TRANSACTIONS* (last ' + list.length + ')\n💰 Balance: *' + u.coins + '* Denarii\n➕ In: ' + inn + '   ➖ Out: ' + out + '\n\n' + list.map(x => (TX_ICON[x.k] || '💱') + ' ' + (x.a === 0 ? '' : '*' + (x.a > 0 ? '+' : '') + x.a + '*  ') + x.n + '\n    ' + fmtTime(x.t) + '  balance ' + x.b).join('\n\n') + '\n\nSee the full list on the website: ' + PREFIX + 'website');
});
reg.add(['slots', 'gamble'], 'ECONOMY', c => {
  const bet = parseInt(c.args[0]); if (!bet || bet < 10 || bet > c.u.coins) return c.reply('Use: ' + PREFIX + 'slots 100  (min 10, you have ' + c.u.coins + ')');
  const S = ['🍒', '🔔', '💎', '⚔️', '🐝']; const r = [pick(S), pick(S), pick(S)];
  let w = 0; if (r[0] === r[1] && r[1] === r[2]) w = bet * 5; else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) w = Math.floor(bet * 1.5);
  db.money(c.u, w - bet, 'slots', w ? 'Slots win (bet ' + bet + ')' : 'Slots loss'); db.save();
  return c.reply('🎰 ' + r.join(' ') + '\n' + (w ? '✅ Won *' + w + '* Denarii' : '❌ Lost *' + bet + '* Denarii'));
});

// ---------- miners ----------
reg.add(['miners', 'mine'], 'ECONOMY', c => {
  const u = c.u, now = Date.now(), n = parseInt(c.args[0]);
  if (n) {
    const m = u.miners[n - 1]; if (!m) return c.reply('Miner 1-4 only.');
    if (m.status === 'LOCKED') return c.reply('🔒 Miner ' + n + ' is locked. Buy it in ' + PREFIX + 'shop extras');
    if (m.status !== 'IDLE') return c.reply('⛏️ Miner ' + n + ' is busy: ' + fmt(m.endsAt - now) + ' left');
    let dur = 24 * 3600000; const si = u.inventory.indexOf('speed'); if (si > -1) { u.inventory.splice(si, 1); dur = 12 * 3600000; }
    m.status = 'WORKING'; m.startedAt = now; m.endsAt = now + dur; db.save();
    return c.reply('⛏️ Miner ' + n + ' sent underground for ' + fmt(dur) + '. Use *' + PREFIX + 'collect* later.');
  }
  return c.reply('⛏️ *MINERS*\n\n' + u.miners.map(m => 'Miner ' + m.id + ': ' + (m.status === 'LOCKED' ? '🔒 Locked' : m.status === 'IDLE' ? '💤 Idle' : (m.endsAt <= now ? '✅ Ready' : '⏳ ' + fmt(m.endsAt - now)))).join('\n') + '\n\n' + PREFIX + 'mine <1-4> to start • ' + PREFIX + 'collect');
});
reg.add('collect', 'ECONOMY', c => {
  const u = c.u, now = Date.now(); let g = 0, gem = 0, k = 0;
  u.miners.forEach(m => { if (m.status === 'WORKING' && m.endsAt <= now) { g += between(400, 900) + u.level * 8; if (rnd(4) === 0) gem++; m.status = 'IDLE'; k++; } });
  if (!k) return c.reply('Nothing to collect yet. See ' + PREFIX + 'miners');
  db.money(u, g, 'mine', 'Mining haul from ' + k + ' miner(s)'); u.gems += gem; db.save(); return c.reply('⛏️ Collected from ' + k + ' miner(s): +' + g + ' Denarii' + (gem ? ', +' + gem + ' 💎' : ''));
});

// ---------- shop ----------
const line = i => i.emoji + ' *' + i.name + '* — ' + i.price + ' Denarii\n   _' + i.desc + '_  [' + i.id.replace(/^c_/, '') + ']';
reg.add(['shop', 'store'], 'ECONOMY', async c => {
  const q = (c.args[0] || '').toUpperCase();
  const cat = D.CATS.find(x => x === (q === 'NAILS' ? 'BLADES' : q) || x.indexOf(q) === 0 && q.length >= 3);
  if (!cat) {
    const t = '🛒 *THE MARKET*  •  💰 ' + c.u.coins + ' Denarii\n\n' + D.CATS.map(k => D.CATINFO[k] + ' *' + PREFIX + 'shop ' + k.toLowerCase() + '* — ' + D.SHOP.filter(i => i.cat === k).length + ' items').join('\n') + '\n\nBuy: *' + PREFIX + 'buy <item>*';
    return M.image(c.sock, c.jid, [M.local('shop')], t, [], c.msg);
  }
  const items = D.SHOP.filter(i => i.cat === cat);
  const t = D.CATINFO[cat] + ' *' + cat + '*  •  💰 ' + c.u.coins + ' Denarii\n\n' + items.map(i => (R.has(c.u, i.id) || (i.charmKey && c.u.rpg.charms.indexOf(i.charmKey) > -1) ? '✅ ' : '') + line(i)).join('\n\n') + '\n\nBuy: *' + PREFIX + 'buy <id>*';
  return c.reply(t);
});
reg.add('buy', 'ECONOMY', c => {
  const r = require('../lib/shop').buy(c.u, c.full);
  if (r.ok) db.save();
  return c.reply((r.ok ? '✅ ' : '❌ ') + r.msg);
});
reg.add(['inventory', 'inv', 'bag'], 'ECONOMY', c => {
  const cnt = {}; c.u.inventory.forEach(id => { cnt[id] = (cnt[id] || 0) + 1; });
  const l = Object.keys(cnt).map(id => { const it = D.SHOP_MAP[id]; return it ? it.emoji + ' ' + it.name + (cnt[id] > 1 ? ' x' + cnt[id] : '') : null; }).filter(Boolean);
  const ch = c.u.rpg.charms.map(k => D.CHARMS[k].e + ' ' + D.CHARMS[k].n + (c.u.rpg.equipped.indexOf(k) > -1 ? ' (equipped)' : ''));
  return c.reply('🎒 *INVENTORY*\n\n' + (l.length ? l.join('\n') : 'Empty') + '\n\n📿 *Charms*\n' + (ch.length ? ch.join('\n') : 'None'));
});
reg.add('use', 'ECONOMY', c => {
  const it = D.findItem(c.full); const u = c.u;
  if (!it || !it.use) return c.reply('Use: ' + PREFIX + 'use lifeblood | soultonic | xpscroll | speed');
  const i = u.inventory.indexOf(it.id); if (i === -1) return c.reply('You do not have *' + it.name + '*.');
  if (it.use === 'speed') return c.reply('⚡ Speed Boost is used automatically on your next ' + PREFIX + 'mine.');
  u.inventory.splice(i, 1);
  if (it.use === 'heal') { u.rpg.hp = R.stats(u).hp; db.save(); return c.reply('🧪 All masks restored!\n' + R.masks(u.rpg.hp, u.rpg.hp)); }
  if (it.use === 'soul') { u.rpg.soul = R.stats(u).soul; db.save(); return c.reply('🔵 Your next fight starts with full soul (spells & focus ready).'); }
  if (it.use === 'xp') { const r = R.gainXp(u, 400); db.save(); return c.reply('📜 +' + r.gain + ' XP' + lvlUp(u, r)); }
});

// .rob: wallet only. Denarii in the bank is safe.
reg.add('rob', 'ECONOMY', c => {
  const W = require('../lib/webcore');
  let v = null; const t = c.target && c.target();
  if (t) v = db.data.users[db.resolve ? db.resolve(t) : t] || null;
  if (!v && c.args[0]) v = W.find(c.args[0]);
  return c.reply(require('../lib/rob').rob(c.u, v).msg);
}, 'Steal Denarii from a player\'s wallet (Denarii in the bank is safe)', { usage: 'rob @player' });
