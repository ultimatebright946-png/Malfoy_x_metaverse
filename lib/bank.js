// Bank: Denarii kept here is safe from your Wraith and from .give/.slots mistakes, and earns daily interest.
const db = require('./db');
const RATE = 0.01, MAX_DAYS = 7, DAY = 24 * 3600e3;
const cap = u => 5000 + u.level * 2000;
function state(u) { if (!u.bank) u.bank = { bal: 0, at: Date.now() }; return u.bank; }
function accrue(u) {
  const b = state(u), now = Date.now(); let days = Math.min(MAX_DAYS, Math.floor((now - b.at) / DAY));
  if (days <= 0) return 0;
  b.at += Math.floor((now - b.at) / DAY) * DAY;
  if (b.bal <= 0) return 0;
  const gain = Math.min(Math.floor(b.bal * RATE * days), Math.max(0, cap(u) - b.bal));
  if (gain > 0) {
    b.bal += gain;
    if (!u.tx) u.tx = []; u.tx.push({ t: now, a: 0, b: u.coins, k: 'interest', n: 'Bank interest +' + gain + ' Denarii (kept in your bank)' });
    if (u.tx.length > 200) u.tx.shift();
  }
  db.save(); return gain;
}
function info(u) { accrue(u); const b = state(u); return { bank: b.bal, wallet: u.coins, cap: cap(u), rate: RATE * 100, next: Math.max(0, b.at + DAY - Date.now()) }; }
function parse(u, v, max) { if (String(v).toLowerCase() === 'all') return max; const n = Math.floor(Number(String(v).replace(/[,_]/g, ''))); return n > 0 ? n : 0; }
function deposit(u, v) {
  accrue(u); const b = state(u), room = Math.max(0, cap(u) - b.bal), n = parse(u, v, Math.min(u.coins, room));
  if (!n) return { ok: false, msg: 'Enter an amount of 1 Denarii or more.' };
  if (n > u.coins) return { ok: false, msg: 'You only have ' + u.coins + ' Denarii in your wallet.' };
  if (n > room) return { ok: false, msg: 'Your bank holds at most ' + cap(u) + ' Denarii at level ' + u.level + '. Room left: ' + room + '.' };
  db.money(u, -n, 'deposit', 'Deposited to bank'); b.bal += n; db.save();
  return { ok: true, msg: 'Deposited ' + n + ' Denarii.', n };
}
function withdraw(u, v) {
  accrue(u); const b = state(u), n = parse(u, v, b.bal);
  if (!n) return { ok: false, msg: 'Enter an amount of 1 Denarii or more.' };
  if (n > b.bal) return { ok: false, msg: 'You only have ' + b.bal + ' Denarii in the bank.' };
  b.bal -= n; db.money(u, n, 'withdraw', 'Withdrew from bank'); db.save();
  return { ok: true, msg: 'Withdrew ' + n + ' Denarii.', n };
}
module.exports = { info, deposit, withdraw, accrue, cap };
