'use strict';
// HTTP routes for the website. Shares the bot's in-memory database, so everything is live.
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const mini = require('./mini');
const db = require('./db');
const W = require('./webcore');
const S = require('./shop');
const ROLES = require('./roles');

function token(req) { const m = /(?:^|;\s*)mf_s=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m ? m[1] : null; }

const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = req.ip + req.path, now = Date.now(); let h = hits.get(k);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
    if (++h.n > max) return res.status(429).json({ ok: false, msg: 'Too many tries. Wait a minute and try again.' });
    next();
  };
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 60000).unref();

const OWNERS = () => (process.env.OWNER_NUMBER || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean);
const OWNER_DISCORD = () => (process.env.DISCORD_OWNER_IDS || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean);
const isOwnerUser = u => OWNERS().indexOf(String(u.id).split('@')[0]) > -1 || OWNER_DISCORD().indexOf(String(u.id).replace('discord:', '')) > -1;

function loadTracks() {
  const out = [];
  const read = (dir, urlBase, source) => { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'tracks.json'), 'utf8')); (j.tracks || []).forEach(t => { if (t && t.file && fs.existsSync(path.join(dir, path.basename(t.file)))) out.push(Object.assign({}, t, { url: urlBase + path.basename(t.file), source })); }); } catch (e) {} };
  read(path.join(W.WEB, 'music'), '/music/', 'bundled');
  read(path.join(process.env.DATA_DIR || (db.store && db.store.paths.DATA_DIR) || '.', 'music'), '/music-user/', 'owner');
  return out;
}

function mount(app) {
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '1', 10));
  app.disable('x-powered-by');
  // gzip text API responses
  app.use((req, res, next) => {
    if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '') || req.path.indexOf('/api/') !== 0) return next();
    const write = res.write, end = res.end; let gz = null, decided = false;
    function decide() {
      decided = true; const type = String(res.getHeader('Content-Type') || ''), len = parseInt(res.getHeader('Content-Length') || '0', 10);
      if (res.getHeader('Content-Encoding') || !/text|json|javascript|svg/.test(type) || (len && len < 700) || res.statusCode === 304 || res.statusCode === 204) return;
      gz = zlib.createGzip({ level: 5 }); res.setHeader('Content-Encoding', 'gzip'); res.removeHeader('Content-Length'); res.setHeader('Vary', 'Accept-Encoding');
      gz.on('data', c => write.call(res, c)); gz.on('end', () => end.call(res));
    }
    res.write = function (c, e, cb) { if (!decided) decide(); return gz ? gz.write(c, e, cb) : write.call(res, c, e, cb); };
    res.end = function (c, e, cb) { if (!decided) decide(); if (!gz) return end.call(res, c, e, cb); if (c) gz.write(c, e); gz.end(); return res; };
    next();
  });
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  app.use('/api', mini.json({ limit: 700 * 1024 }));
  // POST requests must be JSON sent by our own script (blocks cross-site form posts)
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && (!req.is('application/json') || req.get('X-Requested-With') !== 'fetch')) return res.status(400).json({ ok: false, msg: 'Bad request.' });
    next();
  });
  app.use('/api', (err, req, res, next) => res.status(err && err.status === 413 ? 413 : 400).json({ ok: false, msg: 'That request was too large or invalid.' }));

  const cookieOpts = req => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 86400000, path: '/' });
  const who = (req, res) => { const f = {}; const u = W.sessionUser(token(req), f); if (u && f.renewed) res.cookie('mf_s', token(req), cookieOpts(req)); if (u && ROLES.isExiled(u) && !isOwnerUser(u)) return null; if (u) require('./guilds').adopt(u); return u; };
  const auth = (req, res, next) => { const u = who(req, res); if (!u) return res.status(401).json({ ok: false, msg: 'Your session ended. Please sign in again.' }); req.u = u; next(); };

  const AU = require('./auth');
  const signIn = (req, res, u, via) => { const t = W.newSession(u.id, via); res.cookie('mf_s', t, cookieOpts(req)); res.json({ ok: true, me: W.me(u) }); };
  const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.log('API ERROR', e && e.stack || e); res.status(500).json({ ok: false, msg: 'Something went wrong. Try again.' }); });
  const B = req => req.body || {};
  const out = (res, r, extra) => res.status(r.ok ? 200 : (r.code || 400)).json(extra ? Object.assign({}, r, extra) : r);
  const meOf = u => W.me(u);

  // ---------- auth ----------
  app.post('/api/auth/register', limit(20, 3600e3), wrap(async (req, res) => { const r = await AU.register(B(req).number, B(req).username, B(req).password); res.status(r.ok ? 200 : 400).json(r); }));
  app.post('/api/auth/verify', limit(40, 600e3), wrap(async (req, res) => { const r = AU.verifyRegister(B(req).number, B(req).code); if (!r.ok) return res.status(400).json(r); signIn(req, res, r.user); }));
  app.post('/api/auth/login', limit(60, 900e3), wrap(async (req, res) => { const r = await AU.login(B(req).id, B(req).password); if (!r.ok) return res.status(400).json(r); signIn(req, res, r.user); }));
  app.post('/api/auth/forgot', limit(20, 3600e3), wrap(async (req, res) => { const r = await AU.forgot(B(req).id); res.status(r.ok ? 200 : 429).json(r); }));
  app.post('/api/auth/reset', limit(40, 600e3), wrap(async (req, res) => { const r = await AU.reset(B(req).id, B(req).code, B(req).password); if (!r.ok) return res.status(400).json(r); signIn(req, res, r.user); }));
  app.post('/api/auth/password', limit(10, 600e3), auth, wrap(async (req, res) => { const r = await AU.changePassword(req.u, B(req).old, B(req).password); res.status(r.ok ? 200 : 400).json(r); }));
  // single-use sign-in link created by the bot (/website on Discord, .weblogin on WhatsApp)
  app.post('/api/auth/code', limit(30, 600e3), wrap(async (req, res) => { const uid = W.redeem(B(req).code); const u = uid && db.data.users[uid]; if (!u) return res.status(400).json({ ok: false, msg: 'That sign-in link is not valid any more. Ask the bot for a new one.' }); signIn(req, res, u, 'link'); }));
  // a player who signed in through a bot link (last 15 minutes) can set or reset a password: no email, no OTP, no password in chat
  app.post('/api/auth/setpassword', limit(10, 600e3), auth, wrap(async (req, res) => {
    const m = W.sessionMeta(token(req)); const fresh = m && m.via === 'link' && Date.now() - m.t0 < 15 * 60000;
    if (!fresh) return res.status(403).json({ ok: false, msg: 'For safety, ask the bot for a new sign-in link first, then set your password within 15 minutes.' });
    const r = await AU.setPasswordVerified(req.u, B(req).username, B(req).password); res.status(r.ok ? 200 : 400).json(r);
  }));
  app.post('/api/logout', (req, res) => { W.endSession(token(req)); res.clearCookie('mf_s', { path: '/' }); res.json({ ok: true }); });
  // ---- Continue with Google
  const GG = require('./google');
  const cookieOf = (req, n) => { const m = new RegExp('(?:^|;\\s*)' + n + '=([a-f0-9]{32})').exec(req.headers.cookie || ''); return m ? m[1] : null; };
  const gStart = (req, res, mode, uid) => { const r = GG.start(mode, uid); res.cookie('mf_gs', r.bind, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 60000, path: '/auth/google' }); res.redirect(r.url); };
  app.get('/auth/google', limit(30, 600e3), (req, res) => { if (!GG.enabled()) return res.redirect('/#/google/off'); gStart(req, res, 'login'); });
  app.get('/auth/google/link', limit(30, 600e3), (req, res) => { if (!GG.enabled()) return res.redirect('/#/google/off'); const u = who(req, res); if (!u) return res.redirect('/#/google/signin'); gStart(req, res, 'link', u.id); });
  app.get('/auth/google/callback', limit(60, 600e3), wrap(async (req, res) => {
    const r = await GG.finish(req.query || {}, cookieOf(req, 'mf_gs')); res.clearCookie('mf_gs', { path: '/auth/google' });
    if (!r.ok) return res.redirect('/#/google/' + r.reason);
    if (r.mode === 'link') return res.redirect('/#/google/linked');
    const t = W.newSession(r.user.id, 'google'); res.cookie('mf_s', t, cookieOpts(req)); res.redirect('/#/google/ok');
  }));
  app.post('/api/link/google/unlink', limit(10, 600e3), auth, (req, res) => { const r = GG.unlink(req.u); res.status(r.ok ? 200 : 400).json(Object.assign({}, r, r.ok ? { me: meOf(req.u) } : {})); });
  app.get('/api/info', (req, res) => res.json({ ok: true, google: GG.enabled(), bot: (process.env.BOT_PUBLIC_NUMBER || '').replace(/\D/g, ''), group: W.GROUP_URL, prefix: process.env.PREFIX || '.', discord: !!process.env.DISCORD_APP_ID, discordInvite: process.env.DISCORD_APP_ID ? 'https://discord.com/oauth2/authorize?client_id=' + encodeURIComponent(process.env.DISCORD_APP_ID) + '&scope=applications.commands' : null }));
  app.get('/api/me', (req, res) => { const u = who(req, res); res.json(u ? { ok: true, me: meOf(u), owner: isOwnerUser(u) } : { ok: false }); });
  app.get('/health', (req, res) => res.send('ok'));

  // ---------- existing features ----------
  app.get('/api/leaderboard', (req, res) => res.json({ ok: true, list: W.leaderboard(['level', 'coins', 'kills', 'cards'].indexOf(req.query.by) > -1 ? req.query.by : 'level', 50) }));
  app.get('/api/transactions', auth, (req, res) => res.json({ ok: true, coins: req.u.coins, pid: W.pid(req.u), list: W.transactions(req.u, 100) }));
  app.post('/api/give', limit(20, 60000), auth, (req, res) => { const r = W.give(req.u, req.body && req.body.to, req.body && req.body.amount); res.status(r.ok ? 200 : 400).json(r); });
  const DU = require('./duel');
  const room = (req, res) => { const r = /^[a-f0-9]{8}$/.test(req.params.id) && DU.get(req.params.id); if (!r) { res.status(404).json({ ok: false, msg: 'This duel room does not exist or has closed.' }); return null; } return r; };
  app.get('/api/duel/:id', limit(240, 60000), auth, (req, res) => { const r = room(req, res); if (r) res.json({ ok: true, d: DU.view(r, req.u) }); });
  app.post('/api/duel/:id/start', limit(20, 60000), auth, (req, res) => { const r = room(req, res); if (!r) return; const x = DU.start(r, req.u); res.status(x.ok ? 200 : 400).json(Object.assign({}, x, x.ok ? { d: DU.view(r, req.u) } : {})); });
  app.post('/api/look', limit(30, 60000), auth, (req, res) => { const r = W.setLook(req.u, req.body); res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, me: meOf(req.u) } : r); });
  app.post('/api/duel/:id/join', limit(30, 60000), auth, (req, res) => { const r = room(req, res); if (!r) return; const x = DU.join(r, req.u, req.body && (req.body.team === 0 || req.body.team === 1) ? req.body.team : null); res.status(x.ok ? 200 : 400).json(Object.assign({}, x, x.ok ? { d: DU.view(r, req.u) } : {})); });
  app.get('/api/duel/:id/state', limit(1500, 60000), auth, (req, res) => { const r = room(req, res); if (!r) return; const i = r.players.findIndex(p => p.id === req.u.id); if (i < 0) return res.status(403).json({ ok: false }); r.players[i].seen = Date.now(); res.json(DU.snap(r, i)); });
  app.post('/api/duel/:id/input', limit(3000, 60000), auth, (req, res) => { const r = room(req, res); if (!r) return; res.json({ ok: DU.input(r, req.u, req.body) }); });
  const BK = require('./bank');
  app.post('/api/gender', limit(20, 60000), auth, (req, res) => { const r = W.setGender(req.u, req.body && req.body.gender); res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, me: meOf(req.u) } : r); });
  app.get('/api/bank', auth, (req, res) => res.json(Object.assign({ ok: true }, BK.info(req.u))));
  app.post('/api/bank/deposit', limit(40, 60000), auth, (req, res) => { const r = BK.deposit(req.u, req.body && req.body.amount); res.status(r.ok ? 200 : 400).json(Object.assign({}, r, BK.info(req.u), { ok: r.ok, msg: r.msg })); });
  app.post('/api/bank/withdraw', limit(40, 60000), auth, (req, res) => { const r = BK.withdraw(req.u, req.body && req.body.amount); res.status(r.ok ? 200 : 400).json(Object.assign({}, r, BK.info(req.u), { ok: r.ok, msg: r.msg })); });
  app.get('/api/shop', (req, res) => { const u = W.sessionUser(token(req)); res.json({ ok: true, cats: W.CATS, items: W.shopList(u), coins: u ? u.coins : null }); });
  app.post('/api/buy', limit(40, 60000), auth, (req, res) => {
    const r = S.buy(req.u, String(req.body && req.body.id || ''));
    if (r.ok) db.save();
    res.status(r.ok ? 200 : 400).json({ ok: r.ok, msg: r.msg, coins: req.u.coins });
  });
  app.post('/api/pfp', limit(15, 60000), auth, (req, res) => { const r = W.savePfp(req.u, req.body && req.body.data); res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, me: meOf(req.u) } : r); });
  app.post('/api/pfp/gallery', limit(30, 60000), auth, (req, res) => { const r = W.setGallery(req.u, req.body && req.body.key); res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, me: meOf(req.u) } : r); });
  app.post('/api/pfp/clear', auth, (req, res) => { W.clearPfp(req.u); res.json({ ok: true, me: meOf(req.u) }); });
  app.post('/api/name', limit(15, 60000), auth, (req, res) => { const r = W.setName(req.u, req.body && req.body.name); res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, me: meOf(req.u) } : r); });
  app.post('/api/game/start', limit(20, 60000), auth, (req, res) => { const r = W.gameStart(req.u); res.status(r.ok ? 200 : 400).json(r); });
  app.post('/api/game/finish', limit(20, 60000), auth, (req, res) => { const b = req.body || {}; const r = W.gameFinish(req.u, b.runId, { kills: b.kills, geo: b.geo, survived: b.survived }); res.status(r.ok ? 200 : 400).json(r); });

  // ---------- character, gear, quests, world ----------
  const QL = require('./questlog'), CR = require('./creator'), A = require('./awaken'), CD = require('./cards'), BT = require('./battle'), GL = require('./guilds'), SO = require('./social');
  app.get('/api/creator', auth, (req, res) => res.json({ ok: true, options: CR.options(), char: CR.view(req.u), name: req.u.name }));
  app.post('/api/creator', limit(40, 60000), auth, (req, res) => { const r = CR.save(req.u, req.body); out(res, r, r.ok ? { me: meOf(req.u) } : null); });
  app.get('/api/gear', auth, (req, res) => res.json(Object.assign({ ok: true }, QL.gear(req.u))));
  app.post('/api/charm/equip', limit(60, 60000), auth, (req, res) => out(res, QL.equip(req.u, B(req).id), { gear: QL.gear(req.u) }));
  app.post('/api/charm/unequip', limit(60, 60000), auth, (req, res) => out(res, QL.unequip(req.u, B(req).id), { gear: QL.gear(req.u) }));
  app.get('/api/quests', auth, (req, res) => res.json(Object.assign({ ok: true }, QL.quests(req.u))));
  app.post('/api/quests/accept', limit(60, 60000), auth, (req, res) => out(res, QL.accept(req.u, B(req).id), { quests: QL.quests(req.u) }));
  app.post('/api/quests/abandon', limit(60, 60000), auth, (req, res) => out(res, QL.abandon(req.u, B(req).id), { quests: QL.quests(req.u) }));
  app.get('/api/world', auth, (req, res) => res.json({ ok: true, zones: QL.world(req.u) }));
  app.post('/api/travel', limit(60, 60000), auth, (req, res) => out(res, QL.travel(req.u, B(req).zone), { zones: QL.world(req.u) }));
  app.post('/api/rest', limit(30, 60000), auth, (req, res) => {
    const u = req.u, now = Date.now(), s = require('./rpg').stats(u);
    if (now - u.rpg.lastRest < 120000) return res.status(400).json({ ok: false, msg: 'The campfire is warm. Wait ' + Math.ceil((120000 - (now - u.rpg.lastRest)) / 1000) + 's.' });
    u.rpg.lastRest = now; u.rpg.hp = s.hp; db.save(); res.json({ ok: true, msg: 'You rest at the campfire. Fully healed.', me: meOf(u) });
  });

  // ---------- awakening ----------
  app.get('/api/awaken', auth, (req, res) => res.json(Object.assign({ ok: true, banner: A.banner(req.u) }, A.view(req.u))));
  app.post('/api/awaken/choose', limit(20, 60000), auth, (req, res) => { const r = A.choosePath(req.u, B(req).path); out(res, r, { view: A.view(req.u), banner: A.banner(req.u) }); });
  app.post('/api/awaken/trial', limit(20, 60000), auth, (req, res) => { const r = A.trial(req.u, B(req).path); if (r.ok) require('./social').checkAch(req.u); out(res, { ok: r.ok, won: r.won, msg: r.msg, stage: r.stage, unlocked: r.unlocked && r.unlocked.map(x => x.name), xp: r.xp }, { view: A.view(req.u), me: meOf(req.u) }); });

  // ---------- private messages ----------
  const DM = require('./dm');
  app.get('/api/dm/conversations', auth, (req, res) => res.json({ ok: true, conversations: DM.conversations(req.u) }));
  app.get('/api/dm/players', limit(120, 60000), auth, (req, res) => res.json({ ok: true, players: DM.players(req.query.q, req.u) }));
  app.get('/api/dm/:pid', limit(240, 60000), auth, (req, res) => { const r = DM.messages(req.u, req.params.pid); res.status(r.ok ? 200 : 404).json(r); });
  app.post('/api/dm/:pid', limit(60, 60000), auth, (req, res) => { const r = DM.send(req.u, req.params.pid, B(req).text); res.status(r.ok ? 200 : 400).json(r); });

  // ---------- cards ----------
  app.get('/api/cards', auth, (req, res) => { SO.checkAch(req.u); res.json(Object.assign({ ok: true, packTypes: CD.CFG.PACKS }, CD.inventory(req.u))); });
  app.get('/api/cards/catalog', (req, res) => { const u = W.sessionUser(token(req)); res.json({ ok: true, rarities: CD.RARITIES, cards: u ? CD.dex(u) : CD.CARDS.map(CD.cardView) }); });
  app.get('/api/cards/leaderboard', (req, res) => res.json({ ok: true, list: CD.leaderboard(25) }));
  app.get('/api/cards/offers', auth, (req, res) => res.json(Object.assign({ ok: true }, CD.offersFor(req.u))));
  const cardOut = (req, res, r) => out(res, r.ok ? { ok: true, msg: r.msg, card: r.card, cards: r.cards, inst: r.inst && CD.describe(r.inst), oid: r.oid } : r, { inventory: CD.inventory(req.u), coins: req.u.coins, gems: req.u.gems });
  app.post('/api/cards/daily', limit(30, 60000), auth, (req, res) => cardOut(req, res, CD.daily(req.u)));
  app.post('/api/cards/buy', limit(40, 60000), auth, (req, res) => cardOut(req, res, CD.buyPack(req.u, B(req).type)));
  app.post('/api/cards/open', limit(40, 60000), auth, (req, res) => cardOut(req, res, CD.openPack(req.u, B(req).type)));
  app.post('/api/cards/claim', limit(30, 60000), auth, (req, res) => cardOut(req, res, CD.claim(req.u, B(req).code)));
  app.post('/api/cards/favorite', limit(120, 60000), auth, (req, res) => cardOut(req, res, CD.favorite(req.u, B(req).id)));
  app.post('/api/cards/upgrade', limit(60, 60000), auth, (req, res) => cardOut(req, res, CD.upgrade(req.u, B(req).id)));
  app.post('/api/cards/fusion', limit(30, 60000), auth, (req, res) => cardOut(req, res, CD.fusion(req.u, B(req).ids)));
  app.post('/api/cards/offer', limit(30, 60000), auth, (req, res) => cardOut(req, res, CD.makeOffer(req.u, B(req).to, B(req).give, B(req).want)));
  app.post('/api/cards/accept', limit(30, 60000), auth, (req, res) => cardOut(req, res, CD.acceptOffer(req.u, B(req).oid)));
  app.post('/api/cards/decline', limit(30, 60000), auth, (req, res) => cardOut(req, res, CD.declineOffer(req.u, B(req).oid)));

  // ---------- boss battles ----------
  app.get('/api/battle/current', auth, (req, res) => { const s = BT.active(req.u); res.json({ ok: true, view: s ? BT.view(s) : null }); });
  app.post('/api/battle/start', limit(20, 60000), auth, (req, res) => { const r = BT.create(req.u); if (!r.ok) return res.status(400).json(r); res.json({ ok: true, id: r.id, resumed: r.resumed, view: BT.view(r.session) }); });
  app.get('/api/battle/:id', limit(600, 60000), auth, (req, res) => { const s = /^[a-f0-9]{16}$/.test(req.params.id) && BT.get(req.params.id); if (!s || s.uid !== req.u.id) return res.status(404).json({ ok: false, msg: 'This battle does not exist or is not yours.' }); res.json({ ok: true, view: BT.view(s) }); });
  app.post('/api/battle/:id/act', limit(600, 60000), auth, (req, res) => {
    const s = /^[a-f0-9]{16}$/.test(req.params.id) && BT.get(req.params.id);
    const r = BT.act(s, req.u, String(B(req).action || ''), String(B(req).skill || ''));
    if (!r.ok) return res.status(r.code || 400).json({ ok: false, msg: r.msg });
    res.json({ ok: true, view: r.view, me: r.view.status !== 'active' ? meOf(req.u) : undefined });
  });

  // ---------- guilds ----------
  app.get('/api/guilds', (req, res) => { const u = who(req, res); res.json({ ok: true, list: GL.list(u), create: GL.CFG.CREATE_COST }); });
  app.get('/api/guild', auth, (req, res) => { const g = GL.mine(req.u); res.json({ ok: true, guild: g ? GL.pub(g, req.u) : null, activity: GL.activity(req.u, 20), master: !!g && g.owner === req.u.id }); });
  const gOut = (req, res, r) => { const g = GL.mine(req.u); out(res, r, { guild: g ? GL.pub(g, req.u) : null, me: meOf(req.u), activity: GL.activity(req.u, 20) }); };
  app.post('/api/guild/create', limit(10, 60000), auth, (req, res) => gOut(req, res, GL.create(req.u, B(req).name, B(req).tag)));
  app.post('/api/guild/join', limit(20, 60000), auth, (req, res) => gOut(req, res, GL.join(req.u, B(req).id)));
  app.post('/api/guild/leave', limit(20, 60000), auth, (req, res) => gOut(req, res, GL.leave(req.u)));
  app.post('/api/guild/deposit', limit(30, 60000), auth, (req, res) => gOut(req, res, GL.deposit(req.u, B(req).amount)));
  app.post('/api/guild/open', limit(20, 60000), auth, (req, res) => gOut(req, res, GL.setOpen(req.u, !!B(req).open)));
  app.post('/api/guild/motto', limit(20, 60000), auth, (req, res) => gOut(req, res, GL.setMotto(req.u, B(req).motto)));

  // ---------- community ----------
  app.get('/api/feed', limit(240, 60000), (req, res) => { const u = who(req, res); const before = parseInt(req.query.before, 10) || 0; res.json({ ok: true, posts: SO.feed(u, { mode: req.query.mode === 'following' ? 'following' : 'all', before: before || undefined, limit: 20 }) }); });
  app.post('/api/post', limit(30, 60000), auth, (req, res) => out(res, SO.post(req.u, B(req).text)));
  app.post('/api/post/:id/like', limit(120, 60000), auth, (req, res) => out(res, SO.like(req.u, req.params.id)));
  app.post('/api/post/:id/comment', limit(60, 60000), auth, (req, res) => out(res, SO.comment(req.u, req.params.id, B(req).text)));
  app.get('/api/post/:id/comments', limit(240, 60000), (req, res) => { const c = SO.comments(req.params.id); if (!c) return res.status(404).json({ ok: false, msg: 'Post not found.' }); res.json({ ok: true, comments: c }); });
  app.post('/api/post/:id/delete', limit(60, 60000), auth, (req, res) => out(res, SO.removePost(req.u, req.params.id, isOwnerUser(req.u))));
  app.post('/api/post/:id/report', limit(30, 60000), auth, (req, res) => out(res, SO.report(req.u, req.params.id, B(req).why)));
  app.get('/api/profile/:pid', limit(240, 60000), (req, res) => {
    const t = W.byPid(String(req.params.pid).replace(/[^a-f0-9]/g, '')); if (!t) return res.status(404).json({ ok: false, msg: 'Player not found.' });
    const me = who(req, res); const CDs = CD.stats(t), a = t.awaken || {};
    const court = ROLES.info(t);
    res.json({ ok: true, profile: { name: t.name, pid: W.pid(t), pfp: W.pfpUrl(t), court: { title: court.title, icon: court.icon, key: court.key }, level: t.level, rank: W.rankOf(t), cls: t.char ? t.char.cls : null, char: CR.view(t), kills: t.rpg.kills, bosses: Object.keys(t.rpg.bosses).length, quests: t.rpg.done.length,
      awaken: a.path ? { path: A.PATHS[a.path].name, stage: a.stage, stageName: A.PATHS[a.path].stageNames[a.stage] } : null, guild: (GL.mine(t) || {}).name || null, platform: t.platform || (/^discord:/.test(t.id) ? 'discord' : 'whatsapp'),
      achievements: SO.achList(t).filter(x => x.at), cards: { total: CDs.total, unique: CDs.unique, best: CDs.best && { name: CDs.best.name, rarity: CDs.best.rarity, color: CDs.best.color } }, followers: SO.followersOf(t).length, following: SO.follows(t).length,
      isMe: !!me && me.id === t.id, following_them: !!me && SO.follows(me).indexOf(t.id) > -1 }, posts: SO.feed(me, { uid: t.id, limit: 10 }) });
  });
  app.post('/api/follow', limit(60, 60000), auth, (req, res) => { const t = W.byPid(String(B(req).pid || '').replace(/[^a-f0-9]/g, '')); out(res, t ? SO.follow(req.u, t) : { ok: false, msg: 'Player not found.' }); });
  app.post('/api/unfollow', limit(60, 60000), auth, (req, res) => { const t = W.byPid(String(B(req).pid || '').replace(/[^a-f0-9]/g, '')); out(res, SO.unfollow(req.u, t)); });
  app.get('/api/friends', auth, (req, res) => res.json({ ok: true, friends: SO.friends(req.u).map(f => ({ name: f.name, pid: W.pid(f), pfp: W.pfpUrl(f), level: f.level })), following: SO.follows(req.u).length, followers: SO.followersOf(req.u).length }));
  app.get('/api/notifications', auth, (req, res) => res.json(Object.assign({ ok: true }, SO.notes(req.u, req.query.read === '1'))));
  const WC = require('./webcmd');
  app.get('/api/cmds', auth, (req, res) => res.json({ ok: true, prefix: process.env.PREFIX || '.', sections: (() => { const M = require('./menu'); return M.sections('whatsapp', isOwnerUser(req.u)).map(x => { const d = M.SECTIONS.find(y => y.key === x.key) || {}; return { key: x.key, icon: d.icon || '📦', title: d.title || x.key }; }); })(), cmds: WC.list(isOwnerUser(req.u)) }));
  app.post('/api/cmd', limit(90, 60000), auth, wrap(async (req, res) => { const r = await WC.run(req.u, B(req).line, isOwnerUser(req.u)); res.json(Object.assign({}, r, { me: meOf(req.u) })); }));
  app.get('/api/activity', limit(240, 60000), (req, res) => {
    const u = who(req, res); const evs = SO.events(15);
    const r = { ok: true, events: evs.map(e => ({ t: e.t, k: e.k, text: e.text, who: e.who && e.who.name, pid: e.who && e.who.pid })) };
    if (u) { const g = GL.mine(u); Object.assign(r, { notifications: SO.notes(u, false), friends: SO.friends(u).slice(0, 8).map(f => ({ name: f.name, pid: W.pid(f), level: f.level, pfp: W.pfpUrl(f) })), guildActivity: g ? GL.activity(u, 8) : [], guildName: g ? g.name : null, achievements: SO.achList(u) }); }
    res.json(r);
  });
  app.get('/api/achievements', auth, (req, res) => { SO.checkAch(req.u); res.json({ ok: true, list: SO.achList(req.u) }); });

  // ---------- Discord linking (website side) ----------
  const ID = require('./identity');
  app.post('/api/link/discord/start', limit(10, 600e3), auth, (req, res) => out(res, ID.startDiscordLink(req.u)));
  app.post('/api/link/discord/unlink', limit(10, 600e3), auth, (req, res) => out(res, ID.unlinkDiscord(req.u), { me: meOf(req.u) }));

  // ---------- music ----------
  app.get('/api/music', (req, res) => res.json({ ok: true, tracks: loadTracks() }));
  app.use('/music-user', mini.static(path.join(process.env.DATA_DIR || (db.store && db.store.paths.DATA_DIR) || '.', 'music'), { maxAge: 3600e3 }));

  app.get('/pfp/:pid', (req, res) => {
    const u = W.byPid(String(req.params.pid).replace(/[^a-f0-9]/g, ''));
    const p = u && W.pfpPath(u); if (!p) return res.status(404).end();
    res.set({ 'Content-Type': p.type, 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.sendFile(path.resolve(p.file), err => { if (err && !res.headersSent) res.status(404).end(); });
  });
  app.use(mini.static(W.WEB, { maxAge: 3600e3, index: 'index.html' }));
}
module.exports = { mount, isOwnerUser, userFromReq: req => { const m = /(?:^|;\s*)mf_s=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return W.sessionUser(m ? m[1] : null); } };
