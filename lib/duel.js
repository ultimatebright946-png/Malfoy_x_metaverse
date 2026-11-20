// Real-time 2D duels. The bot's .duel command opens a room; both players open the link and fight in the browser.
// The server runs the whole fight (30 ticks a second). Browsers only send which keys are pressed.
const crypto = require('crypto');
const db = require('./db');
const R = require('./rpg');
const W = require('./webcore');

const CFG = { OPEN_TTL: 15 * 60e3, LIFE: 45 * 60e3, MAX_BET: 5000, WIN_XP: 12, LOSE_XP: 3, WIN_GEO: 40, MAX_REWARDED_DAY: 5, PAIR_DAY: 2, FIGHT_SECS: 100, TEAM_SECS: 150, TEAM_WIN_XP: 10, TEAM_WIN_GEO: 30, COUNTDOWN: 3, AWAY_SECS: 10 };
const P = { W: 960, H: 540, GROUND: 470, HP: 5, SPEED: 250, ACC: 2600, JUMP: 640, G: 1900, DASH: 640, SOUL_MAX: 99, SOUL_HIT: 11, CAST_COST: 33, BW: 34, BH: 56 };
const PLATS = [{ x1: 190, x2: 390, y: 350 }, { x1: 570, x2: 770, y: 350 }];
const DT = 1 / 30;
const ROOMS = new Map();
const hooks = { notify: null };
const today = () => new Date().toISOString().slice(0, 10);
const link = id => W.baseUrl() + '/#/duel/' + id;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toward = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);

const CAP = { '1v1': 1, '4v4': 4 };
function spawn(team, slot) { return team === 0 ? 150 + slot * 62 : 810 - slot * 62; }
function fighter(u, team, slot) {
  return { id: u.id, team, x: spawn(team, slot), y: P.GROUND, vx: 0, vy: 0, face: team === 0 ? 1 : -1, hp: P.HP, soul: 0, jumps: 2, ground: true,
    inp: { l: false, r: false }, q: {}, atkT: 0, atkCd: 0, atkHit: false, dashT: 0, dashCd: 0, castCd: 0, healT: 0, hurtT: 0, invT: 0, seen: Date.now() };
}
const teamOf = (room, t) => room.players.filter(p => p.team === t);
function create(u, targetId, bet, jid, mode) {
  mode = mode === '4v4' ? '4v4' : '1v1';
  bet = mode === '4v4' ? 0 : Math.floor(Number(bet) || 0);
  if (bet < 0 || bet > CFG.MAX_BET) return { ok: false, msg: 'Bets go from 0 to ' + CFG.MAX_BET + ' Denarii.' };
  if (u.coins < bet) return { ok: false, msg: 'You only have ' + u.coins + ' Denarii.' };
  const target = mode === '1v1' && targetId ? db.getUser(targetId).id : null;
  if (target && target === u.id) return { ok: false, msg: 'You cannot duel yourself.' };
  if (target && db.getUser(target).coins < bet) return { ok: false, msg: 'They cannot afford that bet.' };
  ROOMS.forEach(r => { if (r.status === 'waiting' && r.players[0].id === u.id) r.status = 'cancelled'; });
  const id = crypto.randomBytes(4).toString('hex');
  const room = { id, jid, mode, bet, target, status: 'waiting', created: Date.now(), n: 0, cd: 0, left: mode === '4v4' ? CFG.TEAM_SECS : CFG.FIGHT_SECS, winner: null, reason: '', rewards: {}, players: [fighter(u, 0, 0)], proj: [], ev: [], socks: new Set() };
  ROOMS.set(id, room);
  return { ok: true, room, link: link(id) };
}
const get = id => ROOMS.get(String(id || '')) || null;
const idx = (room, u) => room.players.findIndex(p => p.id === u.id);
function begin(room) { room.status = 'countdown'; room.cd = CFG.COUNTDOWN + 1; room.players.forEach(p => p.seen = Date.now()); }   // one extra second so every browser can connect

function join(room, u, want) {
  expire(room);
  if (idx(room, u) > -1) return { ok: false, msg: room.status === 'waiting' ? 'You are already in. Waiting for the others.' : 'You are already in this duel.' };
  if (room.status !== 'waiting') return { ok: false, msg: ['countdown', 'active'].indexOf(room.status) > -1 ? 'This duel already started.' : 'This room is closed.' };
  const cap = CAP[room.mode];
  if (room.mode === '1v1') {
    if (room.target && room.target !== u.id) return { ok: false, msg: 'This duel is for someone else.' };
    const host = db.getUser(room.players[0].id);
    if (u.coins < room.bet || host.coins < room.bet) return { ok: false, msg: 'Someone cannot afford the ' + room.bet + ' Denarii bet anymore.' };
    room.players.push(fighter(u, 1, 0)); begin(room);
    notify(room, '⚔️ *DUEL STARTED*\n@' + room.players[0].id.split('@')[0] + ' vs @' + u.id.split('@')[0] + '\nGood luck, Wanderers!', room.players.map(p => p.id));
    return { ok: true };
  }
  const a = teamOf(room, 0).length, b = teamOf(room, 1).length;
  let t = want === 0 || want === 1 ? want : (b < a ? 1 : a < b ? 0 : 1);
  if (teamOf(room, t).length >= cap) t = 1 - t;
  if (teamOf(room, t).length >= cap) return { ok: false, msg: 'Both teams are full.' };
  room.players.push(fighter(u, t, teamOf(room, t).length));
  const n = room.players.length;
  notify(room, '🛡️ @' + u.id.split('@')[0] + ' joined *Team ' + (t ? 'Ash' : 'Soul') + '* (' + n + '/' + cap * 2 + ')', [u.id]);
  if (n >= cap * 2) begin(room);
  return { ok: true };
}
function start(room, u) {
  if (room.mode !== '4v4' || room.status !== 'waiting') return { ok: false, msg: 'Nothing to start.' };
  if (room.players[0].id !== u.id) return { ok: false, msg: 'Only the host can start the match.' };
  if (!teamOf(room, 0).length || !teamOf(room, 1).length) return { ok: false, msg: 'Each team needs at least one player.' };
  begin(room); return { ok: true };
}
function expire(room) { if (room.status === 'waiting' && Date.now() - room.created > CFG.OPEN_TTL) room.status = 'expired'; }

// ---- input from a browser: held keys plus one-press actions ----
function input(room, u, m) {
  const i = idx(room, u); if (i < 0 || !m || typeof m !== 'object') return false;
  const p = room.players[i]; p.seen = Date.now();
  p.inp.l = m.l === 1 || m.l === true; p.inp.r = m.r === 1 || m.r === true;
  ['j', 'a', 'd', 'c', 'h'].forEach(k => { if (m[k]) p.q[k] = true; });
  return true;
}

// ---- physics ----
function box(p) { return { x1: p.x - P.BW / 2, x2: p.x + P.BW / 2, y1: p.y - P.BH, y2: p.y }; }
const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
function ev(room, t, x, y) { if (room.ev.length < 12) room.ev.push([t, Math.round(x), Math.round(y)]); }
function hurt(room, tgt, src, dmg, dir, nail) {
  if (tgt.invT > 0 || tgt.hp <= 0) return false;
  tgt.hp = Math.max(0, tgt.hp - dmg); tgt.hurtT = 0.28; tgt.invT = 0.75; tgt.vx = dir * 360; tgt.vy = -300; tgt.healT = 0; tgt.dashT = 0; tgt.ground = false;
  if (nail && src) src.soul = Math.min(P.SOUL_MAX, src.soul + P.SOUL_HIT);
  ev(room, 'hit', tgt.x, tgt.y - 30); return true;
}
function stepPlayer(room, p) {
  if (p.hp <= 0) { p.vx = toward(p.vx, 0, P.ACC * DT); p.vy += P.G * DT; p.x = clamp(p.x + p.vx * DT, 24, P.W - 24); p.y = Math.min(P.GROUND, p.y + p.vy * DT); if (p.y >= P.GROUND) p.vy = 0; return; }
  ['atkT', 'atkCd', 'dashCd', 'castCd', 'hurtT', 'invT', 'dashT'].forEach(k => { p[k] = Math.max(0, p[k] - DT); });
  const q = p.q; p.q = {};
  const dir = (p.inp.r ? 1 : 0) - (p.inp.l ? 1 : 0);
  if (p.hurtT <= 0 && p.hp > 0) {
    if (p.healT > 0) {
      if (dir || q.j || q.a || q.d || q.c) p.healT = 0;
      else { p.healT -= DT; p.vx = 0; if (p.healT <= 0) { p.hp = Math.min(P.HP, p.hp + 1); ev(room, 'heal', p.x, p.y - 30); } }
    } else if (p.dashT <= 0) {
      if (dir) p.face = dir;
      p.vx = dir ? toward(p.vx, dir * P.SPEED, P.ACC * DT) : toward(p.vx, 0, P.ACC * DT);
      if (q.j && p.jumps > 0) { p.vy = -P.JUMP; p.jumps--; p.ground = false; }
      if (q.a && p.atkCd <= 0) { p.atkT = 0.24; p.atkCd = 0.4; p.atkHit = false; }
      if (q.d && p.dashCd <= 0) { p.dashT = 0.18; p.dashCd = 0.85; p.invT = Math.max(p.invT, 0.22); p.vy = 0; ev(room, 'dash', p.x, p.y - 20); }
      if (q.c && p.castCd <= 0 && p.soul >= P.CAST_COST) { p.soul -= P.CAST_COST; p.castCd = 0.6; room.proj.push({ x: p.x + p.face * 26, y: p.y - 30, f: p.face, o: room.players.indexOf(p), tm: p.team, life: 0.9 }); ev(room, 'cast', p.x, p.y - 30); }
      if (q.h && p.soul >= P.CAST_COST && p.hp < P.HP && p.ground && !dir) { p.soul -= P.CAST_COST; p.healT = 0.9; p.vx = 0; }
    }
  }
  if (p.dashT > 0) { p.vx = p.face * P.DASH; p.vy = 0; }
  else p.vy += P.G * DT;
  const py = p.y; p.x = clamp(p.x + p.vx * DT, 24, P.W - 24); p.y += p.vy * DT;
  p.ground = false;
  if (p.vy >= 0) {
    if (p.y >= P.GROUND) { p.y = P.GROUND; p.vy = 0; p.ground = true; }
    else PLATS.forEach(pl => { if (py <= pl.y + 1 && p.y >= pl.y && p.x >= pl.x1 && p.x <= pl.x2) { p.y = pl.y; p.vy = 0; p.ground = true; } });
  }
  if (p.ground) p.jumps = 2; else if (p.jumps === 2) p.jumps = 1;
  // nail strike: a short swing in front of the knight
  if (p.atkT > 0 && !p.atkHit && p.atkT < 0.19 && p.hp > 0) {
    const x1 = p.face > 0 ? p.x + 6 : p.x - 76, hb = { x1, x2: x1 + 70, y1: p.y - 64, y2: p.y - 2 };
    room.players.forEach(o => { if (o.team !== p.team && overlap(hb, box(o)) && hurt(room, o, p, 1, p.face, true)) p.atkHit = true; });
  }
}
function stepRoom(room) {
  const now = Date.now();
  if (room.status === 'countdown') {
    room.cd -= DT; room.players.forEach(p => { p.q = {}; });
    if (room.cd <= 0) { room.status = 'active'; room.cd = 0; }
    return;
  }
  if (room.status !== 'active') return;
  room.players.forEach(p => { if (p.hp > 0 && now - p.seen > CFG.AWAY_SECS * 1000) { p.hp = 0; p.gone = true; } });
  room.players.forEach(p => stepPlayer(room, p));
  room.proj = room.proj.filter(pr => {
    pr.life -= DT; pr.x += pr.f * 520 * DT;
    const pb = { x1: pr.x - 16, x2: pr.x + 16, y1: pr.y - 14, y2: pr.y + 14 };
    const hit = room.players.find(t => t.team !== pr.tm && t.invT <= 0 && t.hp > 0 && overlap(pb, box(t)));
    if (hit) { hurt(room, hit, null, 2, pr.f, false); return false; }
    return pr.life > 0 && pr.x > -20 && pr.x < P.W + 20;
  });
  room.left = Math.max(0, room.left - DT);
  const hp = t => teamOf(room, t).reduce((n, p) => n + Math.max(0, p.hp), 0), alive = t => teamOf(room, t).filter(p => p.hp > 0).length;
  if (!alive(0) && !alive(1)) return finish(room, null, 'both fell');
  if (!alive(0)) return finish(room, 1, room.players.some(p => p.team === 0 && p.gone) && !room.players.some(p => p.team === 0 && !p.gone) ? 'forfeit' : 'defeat');
  if (!alive(1)) return finish(room, 0, room.players.some(p => p.team === 1 && p.gone) && !room.players.some(p => p.team === 1 && !p.gone) ? 'forfeit' : 'defeat');
  if (room.left <= 0) return finish(room, hp(0) === hp(1) ? null : hp(0) > hp(1) ? 0 : 1, 'time');
}

// ---- snapshot sent to browsers ----
function snap(room, you) {
  const r1 = v => Math.round(v);
  return { n: room.n, s: room.status, cd: Math.min(CFG.COUNTDOWN, Math.max(0, Math.ceil(room.cd))), t: Math.ceil(room.left), you: you,
    p: room.players.map(p => ({ tm: p.team, x: r1(p.x), y: r1(p.y), f: p.face, hp: p.hp, so: p.soul, a: p.atkT > 0 ? +(1 - p.atkT / 0.24).toFixed(2) : 0, ds: p.dashT > 0 ? 1 : 0, hu: p.hurtT > 0 ? 1 : 0, hl: p.healT > 0 ? +(1 - p.healT / 0.9).toFixed(2) : 0, iv: p.invT > 0 ? 1 : 0, cc: +Math.max(0, p.dashCd).toFixed(2) })),
    pr: room.proj.map(pr => ({ x: r1(pr.x), y: r1(pr.y), f: pr.f, tm: pr.tm })), ev: room.ev };
}
function broadcast(room) {
  if (!room.socks.size) return;
  room.socks.forEach(s => { try { if (s.readyState === 1) s.send(JSON.stringify(snap(room, s.pidx))); } catch (e) {} });
}
setInterval(() => {
  const now = Date.now();
  ROOMS.forEach((room, id) => {
    expire(room);
    if (room.status === 'countdown' || room.status === 'active') { room.n++; room.ev = []; stepRoom(room); broadcast(room); }
    else if (room.status === 'done' && room.socks.size && !room.sentDone) { room.n++; room.ev = []; broadcast(room); room.sentDone = true; }
    if (now - room.created > CFG.LIFE) { room.socks.forEach(s => { try { s.close(); } catch (e) {} }); ROOMS.delete(id); }
  });
}, Math.round(DT * 1000)).unref();

// ---- results and rewards ----
function eligible(u, oppId) {
  const d = u.duel || (u.duel = { day: today(), n: 0, pairs: {}, w: 0, l: 0 });
  if (d.day !== today()) { d.day = today(); d.n = 0; d.pairs = {}; }
  return d.n < CFG.MAX_REWARDED_DAY && (d.pairs[oppId] || 0) < CFG.PAIR_DAY;
}
function finish(room, w, reason) {
  if (room.status === 'done') return;
  room.status = 'done'; room.reason = reason; room.winner = w; room.proj = [];
  const us = room.players.map(p => db.getUser(p.id)), ids = room.players.map(p => p.id);
  const tag = u => '@' + u.id.split('@')[0];
  if (w === null) { notify(room, '🤝 *DUEL ENDED IN A DRAW*\n' + us.map(u => u.name).join(' vs ') + ' (' + reason + ')', ids); return; }
  const wins = us.filter((u, i) => room.players[i].team === w), loses = us.filter((u, i) => room.players[i].team !== w);
  us.forEach(u => { if (!u.duel) u.duel = { day: today(), n: 0, pairs: {}, w: 0, l: 0 }; if (u.duel.day !== today()) { u.duel.day = today(); u.duel.n = 0; u.duel.pairs = {}; } });
  wins.forEach(u => u.duel.w++); loses.forEach(u => u.duel.l++);
  const duo = wins.length === 1 && loses.length === 1;
  let line = '';
  if (duo) {
    const win = wins[0], lose = loses[0], ok = eligible(win, lose.id) && eligible(lose, win.id);
    room.rewards[win.id] = { xp: 0, geo: 0, bet: 0, counted: ok }; room.rewards[lose.id] = { xp: 0, geo: 0, bet: 0, counted: ok };
    if (room.bet) {
      const pay = Math.min(room.bet, lose.coins);
      if (pay > 0) { db.money(lose, -pay, 'duel_bet', 'Lost duel bet to ' + win.name); db.money(win, pay, 'duel_bet', 'Won duel bet against ' + lose.name); }
      room.rewards[win.id].bet = pay; room.rewards[lose.id].bet = -pay;
    }
    if (ok) {
      const rw = R.gainXp(win, CFG.WIN_XP); db.money(win, CFG.WIN_GEO, 'duel', 'Won a duel against ' + lose.name);
      const rl = R.gainXp(lose, CFG.LOSE_XP);
      room.rewards[win.id].xp = rw.gain; room.rewards[win.id].geo = CFG.WIN_GEO; room.rewards[lose.id].xp = rl.gain;
      win.duel.n++; lose.duel.n++; win.duel.pairs[lose.id] = (win.duel.pairs[lose.id] || 0) + 1; lose.duel.pairs[win.id] = (lose.duel.pairs[win.id] || 0) + 1;
    }
    line = tag(win) + ' defeated ' + tag(lose) + (reason === 'forfeit' ? ' (opponent left)' : '') + (room.bet ? '\n💰 Bet: *' + room.rewards[win.id].bet + '* Denarii' : '') +
      (ok ? '\n🎖️ +' + room.rewards[win.id].xp + ' XP, +' + CFG.WIN_GEO + ' Denarii' : '\n_(No XP: daily duel limit or same opponent too often.)_');
  } else {
    // team match: everyone is paid for themselves; the daily cap stops farming
    us.forEach((u, i) => {
      const winner = room.players[i].team === w, ok = u.duel.n < CFG.MAX_REWARDED_DAY, rw = { xp: 0, geo: 0, bet: 0, counted: ok };
      if (ok) { rw.xp = R.gainXp(u, winner ? CFG.TEAM_WIN_XP : CFG.LOSE_XP).gain; if (winner) { rw.geo = CFG.TEAM_WIN_GEO; db.money(u, rw.geo, 'duel', 'Won a team duel'); } u.duel.n++; }
      room.rewards[u.id] = rw;
    });
    line = 'Team *' + (w ? 'Ash' : 'Soul') + '* wins the ' + room.mode + '!\n🏆 ' + wins.map(tag).join(' ') + '\n🎖️ Winners: +' + CFG.TEAM_WIN_XP + ' XP, +' + CFG.TEAM_WIN_GEO + ' Denarii (daily cap applies)';
  }
  db.save();
  notify(room, '🏆 *DUEL OVER*\n' + line, ids);
}
function notify(room, text, mentions) { try { if (hooks.notify && room.jid) hooks.notify(room.jid, text, mentions || []); } catch (e) {} }

// ---- what the page shows around the fight ----
function pview(p, i) { const u = db.getUser(p.id); return { name: u.name, pfp: W.pfpUrl(u), level: u.level, team: p.team, host: i === 0, look: W.look(u) }; }
function view(room, u) {
  expire(room);
  const i = idx(room, u), host = db.getUser(room.players[0].id), cap = CAP[room.mode];
  const v = { id: room.id, mode: room.mode, cap, status: room.status, bet: room.bet, host: { name: host.name, pfp: W.pfpUrl(host) }, forYou: !room.target || room.target === u.id, member: i > -1, secs: room.mode === '4v4' ? CFG.TEAM_SECS : CFG.FIGHT_SECS, n: room.players.length };
  if (i < 0) { v.canJoin = room.status === 'waiting' && v.forYou && (room.mode === '1v1' || room.players.length < cap * 2); v.players = room.players.map(pview); return v; }
  v.you = pview(room.players[i], i); v.me = i; v.team = room.players[i].team; v.players = room.players.map(pview);
  v.opp = room.mode === '1v1' && room.players[1 - i] ? pview(room.players[1 - i], 1 - i) : null;
  v.canStart = room.mode === '4v4' && room.status === 'waiting' && i === 0 && teamOf(room, 0).length > 0 && teamOf(room, 1).length > 0;
  if (room.status === 'done') { v.result = room.winner === null ? 'draw' : room.winner === room.players[i].team ? 'win' : 'loss'; v.reason = room.reason; v.reward = room.rewards[u.id] || null; }
  return v;
}

// ---- WebSocket: same-origin, signed-in players only ----
function attach(server, authFn) {
  let WS; try { WS = require('ws'); } catch (e) { console.log('ws not installed, duels use polling'); return; }
  const wss = new WS.WebSocketServer({ noServer: true, maxPayload: 512 });
  server.on('upgrade', (req, socket, head) => {
    const m = /^\/ws\/duel\/([a-f0-9]{8})(?:\?|$)/.exec(req.url || '');
    if (!m) return;     // not ours
    try {
      const origin = req.headers.origin; if (origin && new URL(origin).host !== req.headers.host) throw new Error('origin');
      const u = authFn(req), room = get(m[1]); if (!u || !room || idx(room, u) < 0) throw new Error('auth');
      wss.handleUpgrade(req, socket, head, ws => {
        ws.pidx = idx(room, u); room.socks.add(ws); let last = 0, count = 0;
        ws.on('message', d => {
          const now = Date.now(); if (now - last > 1000) { last = now; count = 0; } if (++count > 90) return;
          let j; try { j = JSON.parse(d.toString()); } catch (e) { return; } input(room, u, j);
        });
        ws.on('close', () => room.socks.delete(ws)); ws.on('error', () => room.socks.delete(ws));
        try { ws.send(JSON.stringify(snap(room, ws.pidx))); } catch (e) {}
      });
    } catch (e) { try { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); } catch (x) {} }
  });
}
module.exports = { CFG, P, PLATS, create, get, join, start, input, snap, view, hooks, link, attach, stepRoom };
