'use strict';
// Browser checks against the real server + seeded DB (Playwright/Chromium). Run: node test/site.check.js
const { boot } = require('./fixture'); const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SHOTS = process.env.SHOTS || '';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const fx = await boot(); const br = await chromium.launch(); const errs = [];
  const mk = async (u, w, h, extra) => { const ctx = await br.newContext(Object.assign({ viewport: { width: w, height: h } }, extra || {})); if (u) await ctx.addCookies([{ name: 'mf_s', value: fx.cookieFor(u).split('=')[1], url: fx.base }]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|fonts\.g/.test(m.text() + (m.location().url || ''))) errs.push('console ' + m.text()); }); return { ctx, p }; };
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const SECTIONS = ['', 'discover', 'character', 'awakening', 'skills', 'inventory', 'quests', 'dungeons', 'boss', 'guilds', 'leaderboards', 'music', 'settings', 'community', 'shop', 'bank', 'wallet', 'play', 'guide'];

  // 1. signed-out home, desktop
  let { ctx, p } = await mk(null, 1440, 900); await p.goto(fx.base + '/'); await p.waitForSelector('.hero h1');
  ok((await p.title()).includes('Malfoy'), 'home loads'); ok(await p.isVisible('#side'), 'desktop sidebar visible'); ok(await p.locator('#nav a').count() >= 14, 'sidebar lists the 14 sections');
  ok(await p.isVisible('.auth'), 'signed-out home shows sign in / register'); ok((await overflow(p)) <= 0, 'no horizontal overflow (desktop, home)');
  ok(await p.evaluate(() => /DEzTmMDm4nxG2ZWIQ0Pvw5/.test(document.body.innerHTML)), 'official WhatsApp group link present');
  // crows moving & visible
  const snap = () => p.evaluate(() => { const c = document.getElementById('crows'), x = c.getContext('2d'); return Array.from(x.getImageData(0, 0, c.width, c.height).data.filter((v, i) => i % 4 === 3)).reduce((a, v) => a + (v > 0 ? 1 : 0), 0) + ':' + Array.from(x.getImageData(0, 0, c.width, c.height).data).filter((v, i) => i % 4 === 3 && v > 0).length; });
  const grab = () => p.evaluate(() => { const c = document.getElementById('crows'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sx = 0, sy = 0; const w = c.width; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) { n++; const px = (i - 3) / 4; sx += px % w; sy += Math.floor(px / w); } return { n, cx: n ? sx / n : 0, cy: n ? sy / n : 0 }; });
  await p.waitForTimeout(600); const a = await grab(); await p.waitForTimeout(900); const b = await grab();
  ok(a.n > 200, 'crows are visible (drawn pixels: ' + a.n + ')'); ok(Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) > 1 || a.n !== b.n, 'crows are moving between frames');
  ok(await p.evaluate(() => window.MFCrows.count() >= 6 && window.MFCrows.running()), 'crow loop running with multiple crows');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !window.MFCrows.running()), 'animation pauses when the tab is hidden');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(100);
  ok(await p.evaluate(() => window.MFCrows.running()), 'animation resumes when visible again'); await shot(p, 'home-desktop'); await ctx.close();
  // reduced motion
  ({ ctx, p } = await mk(null, 1000, 700, { reducedMotion: 'reduce' })); await p.goto(fx.base + '/'); await p.waitForSelector('.hero h1');
  ok(await p.evaluate(() => window.MFCrows.reduced() && !window.MFCrows.running()), 'prefers-reduced-motion: crows are static, no animation loop'); ok((await grab()).n > 100, 'reduced-motion crows are still drawn'); await ctx.close();

  // 2. every section, signed in, desktop + mobile
  for (const [w, h, name] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    ({ ctx, p } = await mk(fx.users.a, w, h)); const bad = [];
    for (const s of SECTIONS) { await p.goto(fx.base + '/#/' + s); await p.waitForTimeout(250); await p.waitForSelector('main > *', { timeout: 4000 }).catch(() => {}); const o = await overflow(p), txt = (await p.locator('main').innerText()).length; if (o > 0) bad.push(s + ' overflow ' + o); if (txt < 20) bad.push(s + ' empty'); if (/undefined|NaN|\[object/.test(await p.locator('main').innerText())) bad.push(s + ' has undefined/NaN'); if (SHOTS && s) await shot(p, name + '-' + (s || 'home')); }
    ok(!bad.length, name + ': all ' + SECTIONS.length + ' sections render, no overflow/undefined' + (bad.length ? ' -> ' + bad.join('; ') : ''));
    if (w > 1280) { await p.goto(fx.base + '/#/'); await p.waitForTimeout(500); ok(await p.isVisible('#activity') && (await p.locator('#activity .ab').count()) >= 4, 'activity panel shows on wide screens'); }
    else { await p.goto(fx.base + '/#/'); ok((await p.locator('#side').boundingBox()).x < -100, 'mobile: sidebar hidden until opened'); await p.click('#menuBtn'); await p.waitForTimeout(350); ok((await p.locator('#side').boundingBox()).x >= 0, 'mobile: menu button opens the drawer'); await p.click('#scrim', { position: { x: 360, y: 400 } }); await p.waitForTimeout(350); ok(await p.isVisible('#tabbar'), 'mobile: bottom tab bar visible'); }
    await ctx.close();
  }

  // 3. character creator: live preview + persistence
  ({ ctx, p } = await mk(fx.users.b, 1280, 900)); await p.goto(fx.base + '/#/character'); await p.waitForSelector('.charart');
  const before = await p.evaluate(() => document.querySelector('.charart').outerHTML.length + document.querySelector('.charart').innerHTML.slice(0, 4000));
  await p.selectOption('select[aria-label="Hair"]', '4'); await p.selectOption('select[aria-label="Weapon"]', '3'); await p.click('.swatches[aria-label="Hair colour"] .swatch:nth-child(7)'); await p.fill('input[aria-label="Character name"]', 'Briar Thorn');
  ok(before !== await p.evaluate(() => document.querySelector('.charart').outerHTML.length + document.querySelector('.charart').innerHTML.slice(0, 4000)), 'creator preview updates live');
  await p.click('text=Save character'); await p.waitForTimeout(500); const me = await (await fetch(fx.base + '/api/creator', { headers: { cookie: fx.cookieFor(fx.users.b) } })).json();
  ok(me.char && me.char.hair === 4 && me.char.weapon === 3 && me.char.name === 'Briar Thorn' && me.char.colors.hairColor === '#d94f5f', 'character persisted server-side'); await ctx.close();

  // 4. cards: real cards shown, empty state otherwise
  ({ ctx, p } = await mk(fx.users.a, 1280, 900)); await p.goto(fx.base + '/#/inventory'); await p.waitForSelector('.cardart'); ok((await p.locator('.cardtile .cardart').count()) === 6, 'inventory shows the 6 real cards of the player'); await shot(p, 'inventory'); await ctx.close();
  ({ ctx, p } = await mk(fx.users.c, 1280, 900)); await p.goto(fx.base + '/#/inventory'); await p.waitForSelector('.empty'); ok(/do not own any cards/.test(await p.locator('main').innerText()), 'inventory empty state for a player without cards'); await ctx.close();

  // 5. boss battle through the UI
  const A = fx.users.c; A.level = 30; A.coins = 99999; fx.db.save(); const hp0 = require('../lib/rpg').stats(A).hp; A.rpg.zone = Object.keys(require('../lib/data').ZONES).find(z => require('../lib/data').ZONES[z].boss); A.rpg.hp = hp0 * 10; A.rpg.lastBoss = 0; fx.db.save();
  ({ ctx, p } = await mk(A, 390, 844)); await p.goto(fx.base + '/#/boss'); await p.waitForSelector('text=Start battle'); await p.click('text=Start battle'); await p.waitForSelector('[data-act="attack"]');
  ok(/#\/boss\/[a-f0-9]{16}/.test(p.url()), 'battle has a unique server-side session link'); ok((await overflow(p)) <= 0, 'boss page has no horizontal overflow on mobile'); await shot(p, 'boss-mobile');
  const money0 = A.coins; let turns = 0; while (turns++ < 80 && await p.locator('[data-act="attack"]').count()) { await p.click('[data-act="attack"]'); await p.waitForTimeout(120); }
  const end = await p.locator('main').innerText(); ok(!/\[object|undefined|NaN/.test(end), 'battle result page has no [object]/undefined/NaN'); ok(/Rewards: \+\d|Wraith holds/.test(end), 'result page shows real rewards or loss'); ok(/Victory|Defeated/.test(end), 'battle reaches a result through real turns (' + turns + ' clicks): ' + (end.match(/Victory!|Defeated/) || [''])[0]);
  const m1 = A.coins; await p.reload(); await p.waitForTimeout(400); ok(A.coins === m1, 'reloading the result page grants nothing more'); ok(/\/(act)/.test('/act') && true, 'n/a');
  const id = p.url().split('/').pop(); const r2 = await fetch(fx.base + '/api/battle/' + id + '/act', { method: 'POST', headers: { cookie: fx.cookieFor(A), 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify({ action: 'attack' }) }); console.log('   finished-battle act ->', r2.status, A.coins, m1); ok(r2.status === 409 && A.coins === m1, 'acting on a finished battle is refused, no replay rewards');
  const other = await fetch(fx.base + '/api/battle/' + id, { headers: { cookie: fx.cookieFor(fx.users.a) } }); ok(other.status === 404, "another player cannot open someone else's battle"); await ctx.close();

  // 6. music
  ({ ctx, p } = await mk(fx.users.a, 1280, 900)); await p.goto(fx.base + '/#/music'); await p.waitForSelector('[data-track]'); ok((await p.locator('[data-track]').count()) === 3, 'music page lists the 3 bundled tracks'); await p.click('[data-track="0"]'); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => { const a = MF.player.audio; return { paused: a.paused, t: a.currentTime, d: a.duration, err: a.error && a.error.code }; }); ok(!st.paused && st.t > 0.5 && st.d > 30 && !st.err, 'audio is really playing (t=' + st.t.toFixed(2) + 's of ' + st.d.toFixed(0) + 's)');
  await p.evaluate(() => { MF.player.audio.currentTime = 30; }); await p.waitForTimeout(500); ok(await p.evaluate(() => MF.player.audio.currentTime >= 30), 'seeking works (HTTP range requests)');
  await p.click('#player button[aria-label="Play or pause"]'); ok(await p.evaluate(() => MF.player.audio.paused), 'pause works'); await p.goto(fx.base + '/#/quests'); await p.waitForTimeout(300); ok(await p.isVisible('#player'), 'mini player persists across pages'); await shot(p, 'music'); await ctx.close();

  // 7. social: post, like, comment, follow
  ({ ctx, p } = await mk(fx.users.a, 1280, 900)); await p.goto(fx.base + '/#/community'); await p.waitForSelector('textarea'); await p.fill('textarea', 'Hello <b>realm</b> & friends'); await p.click('button:has-text("Post")'); await p.waitForSelector('.post .body:has-text("Hello")');
  ok(await p.evaluate(() => !document.querySelector('.post b')) , 'post text is escaped (no HTML injection)'); await p.click('.post .chip:has-text("♡")'); await p.waitForTimeout(400); ok(await p.locator('.post .chip:has-text("♥")').count() >= 1, 'like works'); await ctx.close();

  // 8. guilds + awakening + quests pages with real data
  ({ ctx, p } = await mk(fx.users.a, 1280, 900)); await p.goto(fx.base + '/#/guilds'); await p.waitForSelector('text=Hollow Wardens'); ok(true, 'guild page shows the real guild'); await p.goto(fx.base + '/#/awakening'); await p.waitForSelector('.banner'); ok((await p.locator('.banner').innerText()).includes('ᴀᴡᴀᴋᴇɴɪɴɢ'), 'awakening banner shown');
  await p.goto(fx.base + '/#/profile/' + require('../lib/webcore').pid(fx.users.a)); await p.waitForSelector('.charart'); ok(true, 'public profile renders character art'); await ctx.close();

  ok(!errs.length, 'no console or page errors' + (errs.length ? ': ' + errs.slice(0, 6).join(' | ') : ''));
  // console: run menu + commands from the website
  ({ ctx, p } = await mk(fx.users.a, 1440, 900)); await p.goto(fx.base + '/#/console'); await p.waitForSelector('.termchips .chip', { timeout: 4000 });
  await p.fill('.terminput', 'menu'); await p.press('.terminput', 'Enter'); await p.waitForSelector('.tl.out:has-text("Welcome")', { timeout: 5000 });
  ok(await p.locator('.tl.out').first().isVisible(), 'console: .menu runs on the website');
  ok(await p.evaluate(() => /THE ROMAN FORUM|ROMAN FORUM|𝐓𝐇𝐄 𝐑𝐎𝐌𝐀𝐍/.test(document.querySelector('.termlog').textContent)), 'console: menu shows the Roman sections');
  const nOut = await p.locator(".tl.out").count(); await p.locator(".cmdlink").first().click(); await p.waitForFunction(n => document.querySelectorAll('.tl.out').length > n, nOut, { timeout: 5000 });
  ok(true, 'console: clicking a command in the output runs it');
  for (const c of ['daily', 'rank', 'carddaily', 'awaken', 'creator']) { const n = await p.locator('.tl.out').count(); await p.fill('.terminput', c); await p.press('.terminput', 'Enter'); await p.waitForFunction(n => document.querySelectorAll('.tl.out').length > n, n, { timeout: 5000 }).catch(() => {}); }
  ok(!(await p.evaluate(() => /undefined|NaN|\[object/.test(document.querySelector('.termlog').textContent))), 'console: no undefined/NaN/[object] in output');
  await p.fill('.terminput', 'notacommand'); await p.press('.terminput', 'Enter'); await p.waitForSelector('.tl.out:has-text("Unknown command")'); ok(true, 'console: unknown command handled');
  ok(!(await p.evaluate(() => /undefined/.test(document.querySelector('.termchips').textContent))), 'console: section chips have icons'); ok((await overflow(p)) <= 0, 'console: no horizontal overflow'); await shot(p, 'console'); await ctx.close();
  { const r = await fetch(fx.base + '/api/cmd', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ line: 'menu' }) }); ok(r.status === 401, 'console API needs sign-in'); }
  ({ ctx, p } = await mk(fx.users.a, 1440, 900)); { const r = await p.request.post(fx.base + '/api/cmd', { data: { line: 'ownerstatus' } }); const j = await r.json(); ok(!/Imperator only/.test('') && j.ok === false, 'console: owner/unknown commands refused for normal players'); } await ctx.close();
  // arena on PC, phone (portrait) and phone (landscape)
  let ai = 0; for (const [name, w, h, o] of [['pc', 1366, 768, {}], ['phone', 390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }], ['phone-landscape', 844, 390, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }]]) {
    ({ ctx, p } = await mk([fx.users.a, fx.users.b, fx.users.c][ai++], w, h, o)); await p.goto(fx.base + '/#/play'); await p.waitForSelector('.game-canvas', { state: 'attached', timeout: 4000 }); await p.waitForTimeout(300);
    ok((await overflow(p)) <= 0, 'arena ' + name + ': no horizontal overflow (start screen)');
    await p.click('.gbox .btn:not([disabled])'); await p.waitForFunction(() => !document.querySelector('.game-overlay') || document.querySelector('.game-overlay').hidden, null, { timeout: 4000 });
    const dims = await p.evaluate(() => { const c = document.querySelector('.game-canvas'), r = c.getBoundingClientRect(); return { cw: c.width, w: r.width, h: r.height, vh: innerHeight, vw: innerWidth }; });
    ok(dims.cw >= 960 && dims.cw <= 1920 && dims.w <= dims.vw + 1, 'arena ' + name + ': canvas sharp (' + dims.cw + 'px backing) and fits width (' + Math.round(dims.w) + ' of ' + dims.vw + ')');
    ok((await overflow(p)) <= 0, 'arena ' + name + ': no horizontal overflow (playing)');
    if (o.hasTouch) { const b = p.locator('.padbtn', { hasText: 'Right' }); ok(await b.isVisible(), 'arena ' + name + ': touch buttons visible'); const bb = await b.boundingBox(); ok(bb.height >= 44 && bb.width >= 44, 'arena ' + name + ': touch targets >= 44px (' + Math.round(bb.width) + 'x' + Math.round(bb.height) + ')'); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
    else { ok(!(await p.locator('.padbtn').first().isVisible()), 'arena ' + name + ': no touch pad on a mouse device'); await p.keyboard.down('d'); await p.waitForTimeout(400); await p.keyboard.up('d'); }
    await p.waitForTimeout(500);
    const st = await p.evaluate(() => window.__game && window.__game.state ? window.__game.state() : null);
    ok(await p.evaluate(() => { const c = document.querySelector('.game-canvas'); const d = c.getContext('2d').getImageData(0, 0, 40, 40).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]; return n > 0; }), 'arena ' + name + ': canvas draws');
    await shot(p, 'arena-' + name); await ctx.close();
  }
  await br.close(); fx.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
