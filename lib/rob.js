'use strict';
// .rob: steal Denarii from another player's WALLET. Denarii kept in the bank cannot be robbed.
const db = require('./db');
const CFG = { COOLDOWN: 10 * 60000, IMMUNE: 15 * 60000, MIN_WALLET: 100, CHANCE: 0.45, TAKE: [0.10, 0.30], MAX_TAKE: 5000, FINE: 0.10, MAX_FINE: 1000 };
const fmt = n => Number(n).toLocaleString('en-US');
const wait = ms => { const m = Math.ceil(ms / 60000); return m + ' minute' + (m === 1 ? '' : 's'); };

function rob(thief, victim, rng) {
  rng = rng || Math.random; const now = Date.now();
  if (!victim) return { ok: false, msg: 'Who do you want to rob? Use *.rob @player* (or their player ID / exact username).' };
  if (victim.id === thief.id) return { ok: false, msg: 'You cannot rob yourself.' };
  if (victim.banned) return { ok: false, msg: 'That player is not available.' };
  const left = (thief.robAt || 0) + CFG.COOLDOWN - now;
  if (left > 0) return { ok: false, msg: '🕵️ You are laying low. You can rob again in ' + wait(left) + '.' };
  const safe = (victim.robbedAt || 0) + CFG.IMMUNE - now;
  if (safe > 0) return { ok: false, msg: '🛡️ ' + victim.name + ' was robbed recently and is on guard for ' + wait(safe) + '.' };
  const wallet = victim.coins || 0, banked = (victim.bank && victim.bank.bal) || 0;
  if (wallet < CFG.MIN_WALLET) return { ok: false, msg: banked > 0 ? '🏦 ' + victim.name + ' keeps their Denarii in the bank. Nothing in their wallet to steal.' : '💸 ' + victim.name + ' has almost nothing in their wallet (under ' + CFG.MIN_WALLET + ' Denarii).' };
  thief.robAt = now;                                                       // cooldown starts on every real attempt
  if (rng() < CFG.CHANCE) {
    const pct = CFG.TAKE[0] + rng() * (CFG.TAKE[1] - CFG.TAKE[0]);
    const take = Math.max(1, Math.min(CFG.MAX_TAKE, Math.floor(wallet * pct)));
    db.money(victim, -take, 'robbed', 'Robbed by ' + thief.name); db.money(thief, take, 'rob', 'Robbed ' + victim.name);
    victim.robbedAt = now; db.save();
    return { ok: true, win: true, amount: take, msg: '🥷 *Robbery successful!* You stole *' + fmt(take) + '* Denarii from ' + victim.name + '.\n💰 Wallet: ' + fmt(thief.coins) + ' Denarii' };
  }
  const fine = Math.min(CFG.MAX_FINE, Math.floor((thief.coins || 0) * CFG.FINE));
  if (fine > 0) { db.money(thief, -fine, 'rob-fine', 'Caught robbing ' + victim.name); db.money(victim, fine, 'rob-fine', 'Compensation from ' + thief.name); }
  db.save();
  return { ok: true, win: false, amount: fine, msg: '🚨 *Caught!* ' + victim.name + ' spotted you.' + (fine ? ' You paid a fine of *' + fmt(fine) + '* Denarii to them.' : ' You had nothing to fine.') };
}
module.exports = { rob, CFG };
