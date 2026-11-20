'use strict';
// Imperium Arena: a 60 second mini gladiator run. The server decides the reward (see /api/game/*).
(function () {
  var W = 960, H = 540, GROUND = 446;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hit(a, b) { return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]; }
  function clock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  var TYPES = {
    crawlid: { hp: 14, w: 46, h: 28, speed: 58, geo: 1, fly: false },
    vengefly: { hp: 20, w: 40, h: 34, speed: 92, geo: 2, fly: true },
    husk: { hp: 30, w: 44, h: 68, speed: 40, geo: 3, fly: false },
    warlord: { hp: 110, w: 76, h: 108, speed: 34, geo: 12, fly: false },
  };

  function mount(root, opts) {
    var canvas = el('canvas', 'game-canvas'), dpr = 1, lowfx = false; canvas.width = W; canvas.height = H;
    function fit() { dpr = lowfx ? 1 : Math.min(matchMedia('(pointer: coarse)').matches ? 1.5 : 2, window.devicePixelRatio || 1); var w = Math.round(W * dpr); if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(H * dpr); } }
    canvas.style.touchAction = 'none'; canvas.style.display = 'block';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Imperium Arena game. Move with arrow keys or A and D, jump with Space, attack with J, heal with F.');
    var ctx = canvas.getContext('2d');
    var overlay = el('div', 'game-overlay');
    var wrap = el('div', 'game-wrap'); wrap.appendChild(canvas); wrap.appendChild(overlay);
    var keys = { left: false, right: false, jump: false, attack: false, focus: false };
    var pad = el('div', 'pad');
    function btn(label, aria, down, up) {
      var b = el('button', 'padbtn', label); b.type = 'button'; b.setAttribute('aria-label', aria);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); down(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { b.addEventListener(n, function (e) { e.preventDefault(); if (up) up(); }); });
      return b;
    }
    var left = el('div', 'padgrp joystick-wrap'), right = el('div', 'padgrp');
    var stick = el('div', 'joystick'); stick.setAttribute('role', 'group'); stick.setAttribute('aria-label', 'Circular directional movement control');
    var stickBase = el('div', 'joystick-base'), stickKnob = el('div', 'joystick-knob');
    stickBase.appendChild(stickKnob); stick.appendChild(stickBase); left.appendChild(stick);
    var stickPointer = null;
    function moveStick(e) {
      var r = stickBase.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy, max = r.width * .34, len = Math.sqrt(dx * dx + dy * dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      stickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      keys.left = dx < -max * .18; keys.right = dx > max * .18;
      // The arena is a side-scroller: the upward direction on the stick triggers a jump.
      if (dy < -max * .38 && !keys.jump) keys.jump = true;
      else if (dy >= -max * .18) keys.jump = false;
    }
    stick.addEventListener('pointerdown', function (e) { e.preventDefault(); stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
    stick.addEventListener('pointermove', function (e) { if (stickPointer === e.pointerId) { e.preventDefault(); moveStick(e); } });
    function releaseStick(e) { if (stickPointer !== null && (!e || e.pointerId === stickPointer)) { stickPointer = null; keys.left = keys.right = keys.jump = false; stickKnob.style.transform = 'translate(0,0)'; } }
    stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick); stick.addEventListener('lostpointercapture', releaseStick);
    right.appendChild(btn('Jump', 'Jump', function () { keys.jump = true; }, function () { keys.jump = false; }));
    right.appendChild(btn('Attack', 'Attack', function () { keys.attack = true; }));
    right.appendChild(btn('Heal', 'Focus to heal', function () { keys.focus = true; }));
    right.appendChild(btn('Pause', 'Pause', function () { if (mode === 'playing') paused = !paused; }));
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    pad.appendChild(left); pad.appendChild(right);
    var help = el('p', 'game-help', 'PC: arrows or A/D to move, Space to jump, J to attack, F to heal, P to pause. Phone: drag the circular joystick to move; push up to jump.');
    var fs = el('button', 'btn small ghost fsbtn', 'Fullscreen'); fs.type = 'button';
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fs.hidden = true;
    fs.addEventListener('click', function () { try { if (document.fullscreenElement) document.exitFullscreen(); else (root.requestFullscreen || root.webkitRequestFullscreen).call(root); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} });
    root.appendChild(wrap); root.appendChild(pad); root.appendChild(help); root.appendChild(fs);

    // ---------- background (drawn once) ----------
    var bg = document.createElement('canvas'); bg.width = W + 120; bg.height = H;
    (function () {
      var g = bg.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#0a1020'); grd.addColorStop(0.6, '#141d38'); grd.addColorStop(1, '#0c1226');
      g.fillStyle = grd; g.fillRect(0, 0, bg.width, H);
      for (var i = 0; i < 9; i++) { // distant arches and pillars
        var x = i * 140 + rnd(-20, 20), h = rnd(150, 300);
        g.fillStyle = 'rgba(30,42,78,' + rnd(0.35, 0.6) + ')'; g.fillRect(x, GROUND - h, rnd(26, 44), h);
        g.beginPath(); g.arc(x + 70, GROUND - h + 4, 60, Math.PI, 0); g.lineTo(x + 130, GROUND - h + 4); g.lineTo(x + 10, GROUND - h + 4); g.fill();
      }
      for (var j = 0; j < 40; j++) { g.fillStyle = 'rgba(143,214,234,' + rnd(0.04, 0.16) + ')'; g.beginPath(); g.arc(rnd(0, bg.width), rnd(30, 330), rnd(0.8, 2.2), 0, 7); g.fill(); }
    })();
    var fog = []; for (var f = 0; f < 22; f++) fog.push({ x: rnd(0, W), y: rnd(250, 470), r: rnd(40, 110), s: rnd(6, 16) });

    // ---------- game state ----------
    var cfg = null, S = null, P = null, mode = 'ready', raf = 0, last = 0, paused = false, dead = false;
    var enemies = [], coins = [], parts = [], texts = [];

    function reset(c) {
      cfg = c; enemies = []; coins = []; parts = []; texts = [];
      S = { t: 0, left: c.duration, kills: 0, geo: 0, spawn: 1.2, swing: 0, shake: 0, tip: 4.5 };
      P = { x: W / 2, y: GROUND, vx: 0, vy: 0, kx: 0, face: 1, hp: c.masks, max: c.masks, soul: 0, inv: 0, atkT: 0, atkCD: 0, focus: 0, ground: true };
    }
    function pbox() { return [P.x - 14, P.y - 58, 28, 58]; }
    function ebox(e) { return e.fly ? [e.x - e.w / 2, e.y - e.h / 2, e.w, e.h] : [e.x - e.w / 2, e.y - e.h, e.w, e.h]; }
    function spark(x, y, n, col) { for (var i = 0; i < n; i++) parts.push({ x: x, y: y, vx: rnd(-220, 220), vy: rnd(-260, 40), life: rnd(0.2, 0.5), col: col || '#ecf2ff' }); }
    function say(x, y, s, col) { texts.push({ x: x, y: y, s: s, t: 0.8, col: col || '#ecf2ff' }); }

    function spawn() {
      var pool = ['crawlid']; if (S.t > 10) pool.push('vengefly', 'crawlid'); if (S.t > 28) pool.push('husk'); if (S.t > 45) pool.push('warlord');
      var k = pool[Math.floor(Math.random() * pool.length)], T = TYPES[k], side = Math.random() < 0.5 ? -1 : 1;
      enemies.push({ k: k, fly: T.fly, w: T.w, h: T.h, hp: T.hp, max: T.hp, speed: T.speed * rnd(0.9, 1.15), geo: T.geo, x: side < 0 ? -30 : W + 30, y: T.fly ? rnd(190, 330) : GROUND, kx: 0, flash: 0, swing: -1, bob: rnd(0, 6), dir: -side });
    }
    function die(e) {
      S.kills++; spark(e.x, e.fly ? e.y : e.y - e.h / 2, 14, '#dcb560');
      for (var i = 0; i < e.geo; i++) coins.push({ x: e.x, y: e.fly ? e.y : e.y - e.h / 2, vx: rnd(-130, 130), vy: rnd(-380, -200), life: 9 });
    }
    function hurt(e) {
      P.hp--; P.inv = 1.3; P.kx = (P.x < e.x ? -1 : 1) * 330; P.vy = -330; P.ground = false; P.focus = 0; S.shake = 0.25; spark(P.x, P.y - 34, 10, '#8fd6ea');
      if (P.hp <= 0) finish(false);
    }
    function attack() {
      P.atkT = 0.14; P.atkCD = 0.33; S.swing++;
    }

    // ---------- update ----------
    function update(dt) {
      S.t += dt; S.left -= dt; S.tip -= dt;
      var dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      if (P.focus > 0) { P.vx = 0; P.focus -= dt; if (P.focus <= 0) { P.hp = Math.min(P.max, P.hp + 1); P.soul -= cfg.focusCost; say(P.x, P.y - 80, '+1 mask', '#8fd6ea'); spark(P.x, P.y - 34, 12, '#8fd6ea'); } }
      else { P.vx = dir * 262; if (dir) P.face = dir; }
      if (keys.jump) { if (P.ground && P.focus <= 0) { P.vy = -740; P.ground = false; } keys.jump = false; }
      if (keys.attack) { if (P.atkCD <= 0 && P.focus <= 0) attack(); keys.attack = false; }
      if (keys.focus) { if (P.soul >= cfg.focusCost && P.hp < P.max && P.focus <= 0 && P.ground) P.focus = 0.8; keys.focus = false; }
      P.x += (P.vx + P.kx) * dt; P.kx -= P.kx * Math.min(1, 9 * dt);
      P.vy += 1900 * dt; P.y += P.vy * dt; if (P.y >= GROUND) { P.y = GROUND; P.vy = 0; P.ground = true; }
      P.x = Math.max(24, Math.min(W - 24, P.x));
      P.atkT -= dt; P.atkCD -= dt; P.inv -= dt; S.shake = Math.max(0, S.shake - dt);

      S.spawn -= dt;
      if (S.spawn <= 0 && enemies.length < 7) { spawn(); S.spawn = Math.max(0.7, 2.1 - S.t * 0.022) + rnd(0, 0.4); }

      var hb = P.atkT > 0 ? [P.face > 0 ? P.x + 8 : P.x - 94, P.y - 74, 86, 84] : null;
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i], dx = P.x - e.x;
        e.flash -= dt; e.x += e.kx * dt; e.kx -= e.kx * Math.min(1, 8 * dt);
        if (e.fly) { e.x += Math.sign(dx) * e.speed * dt; e.y += ((P.y - 56) - e.y) * Math.min(1, 1.1 * dt) + Math.sin(S.t * 5 + e.bob) * 26 * dt; e.dir = Math.sign(dx) || 1; }
        else { e.dir = Math.sign(dx) || 1; e.x += e.dir * e.speed * dt; }
        if (hb && e.swing !== S.swing && hit(hb, ebox(e))) {
          e.swing = S.swing;
          var crit = Math.random() * 100 < cfg.crit, dmg = Math.round(cfg.damage * (crit ? 1.6 : 1));
          e.hp -= dmg; e.flash = 0.12; e.kx = P.face * (e.k === 'husk' ? 150 : 260);
          P.soul = Math.min(99, P.soul + cfg.soulGain); spark(e.x, e.fly ? e.y : e.y - e.h / 2, 6); say(e.x, e.y - e.h - 6, String(dmg), crit ? '#dcb560' : '#ecf2ff');
          if (e.hp <= 0) { die(e); enemies.splice(i, 1); continue; }
        }
        if (P.inv <= 0 && hit(pbox(), ebox(e).map(function (v, n) { return n < 2 ? v + 5 : v - 10; }))) { hurt(e); if (mode !== 'playing') return; }
      }
      for (var c = coins.length - 1; c >= 0; c--) {
        var g = coins[c]; g.life -= dt; g.vy += 1500 * dt; g.x += g.vx * dt; g.y += g.vy * dt;
        if (g.y > GROUND - 6) { g.y = GROUND - 6; g.vy *= -0.4; g.vx *= 0.7; if (Math.abs(g.vy) < 40) g.vy = 0; }
        if (Math.abs(g.x - P.x) < 30 && Math.abs(g.y - (P.y - 30)) < 44) { S.geo++; coins.splice(c, 1); say(P.x, P.y - 76, '+1 Denarii', '#dcb560'); continue; }
        if (g.life <= 0) coins.splice(c, 1);
      }
      parts.forEach(function (p) { p.life -= dt; p.vy += 800 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }); parts = parts.filter(function (p) { return p.life > 0; });
      texts.forEach(function (t) { t.t -= dt; t.y -= 40 * dt; }); texts = texts.filter(function (t) { return t.t > 0; });
      fog.forEach(function (f) { f.x += f.s * dt; if (f.x - f.r > W) f.x = -f.r; });
      if (S.left <= 0) finish(true);
    }

    // ---------- drawing ----------
    function maskShape(x, y, s, full) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(10, -10, 11, 2, 6, 10); ctx.lineTo(0, 13); ctx.lineTo(-6, 10); ctx.bezierCurveTo(-11, 2, -10, -10, 0, -10); ctx.closePath();
      ctx.fillStyle = full ? '#ecf2ff' : 'rgba(236,242,255,0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(236,242,255,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      if (full) { ctx.fillStyle = '#0a0f1d'; ctx.beginPath(); ctx.ellipse(-3.5, -1, 1.8, 3.2, 0.3, 0, 7); ctx.ellipse(3.5, -1, 1.8, 3.2, -0.3, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    function drawKnight() {
      if (P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0) return;
      ctx.save();
      var depthScale = 0.94 + Math.max(0, Math.min(1, (P.y - 250) / (GROUND - 250))) * 0.10;
      ctx.translate(P.x, P.y); ctx.scale(P.face * depthScale, depthScale);
      var run = P.ground && Math.abs(P.vx) > 1 ? Math.sin(S.t * 18) : 0;
      var bob = P.ground && Math.abs(P.vx) > 1 ? Math.abs(run) * 1.8 : Math.sin(S.t * 3) * 0.8;
      if (P.focus > 0) { var r = 20 + (0.8 - P.focus) * 60; var aura = ctx.createRadialGradient(0, -38, 4, 0, -38, r); aura.addColorStop(0, 'rgba(143,214,234,.62)'); aura.addColorStop(1, 'rgba(143,214,234,0)'); ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, -38, r, 0, 7); ctx.fill(); }
      ctx.translate(0, bob);
      // Flowing split cloak and shoulder mantle.
      var cape = ctx.createLinearGradient(-22, -48, 20, -8); cape.addColorStop(0, '#080d1a'); cape.addColorStop(.45, '#35466a'); cape.addColorStop(1, '#070b14');
      ctx.fillStyle = cape; ctx.beginPath(); ctx.moveTo(-12,-48); ctx.quadraticCurveTo(-28,-34,-19,-7); ctx.lineTo(-8,-15); ctx.lineTo(0,-39); ctx.lineTo(11,-15); ctx.lineTo(20,-7); ctx.quadraticCurveTo(26,-39,12,-49); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(143,214,234,.5)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-15,-34); ctx.lineTo(-9,-13); ctx.moveTo(15,-34); ctx.lineTo(9,-13); ctx.stroke();
      // Legs, articulated greaves and boots.
      function limb(x,y,angle,len,w,c1,c2){ ctx.save(); ctx.translate(x,y); ctx.rotate(angle); var g=ctx.createLinearGradient(-w/2,0,w/2,0); g.addColorStop(0,c2);g.addColorStop(.48,c1);g.addColorStop(1,'#070a12');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(-w/2,0,w,len,4);ctx.fill();ctx.fillStyle='#8fa2c5';ctx.fillRect(-w/2, len*.22,w,2);ctx.fillStyle='#111b31';ctx.fillRect(-w/2-2,len-5,w+4,6);ctx.restore(); }
      limb(-5,-15,run*.28,14,7,'#71819d','#101729'); limb(5,-15,-run*.28,14,7,'#71819d','#101729');
      // Torso armour with layered breastplate, trim and glowing core.
      var torso=ctx.createLinearGradient(-15,-49,15,-20);torso.addColorStop(0,'#dce7f8');torso.addColorStop(.22,'#778ba9');torso.addColorStop(.55,'#263957');torso.addColorStop(1,'#090f1e');
      ctx.fillStyle=torso;ctx.beginPath();ctx.moveTo(-10,-49);ctx.lineTo(10,-49);ctx.lineTo(15,-25);ctx.lineTo(8,-17);ctx.lineTo(-8,-17);ctx.lineTo(-15,-25);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#a9c4e8';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-10,-46);ctx.lineTo(0,-39);ctx.lineTo(10,-46);ctx.moveTo(0,-39);ctx.lineTo(0,-20);ctx.stroke();
      ctx.fillStyle='#8fd6ea';ctx.shadowColor='#8fd6ea';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(0,-34,3.1,0,7);ctx.fill();ctx.shadowBlur=0;
      // Shoulder plates and animated arms.
      var armSwing=run*.32-(P.atkT>0?.65:0);
      limb(-12,-45,-.16+armSwing,18,7,'#a9b8d0','#202c45');
      ctx.fillStyle='#8295b4';ctx.beginPath();ctx.arc(-13,-45,5,0,7);ctx.fill();ctx.strokeStyle='#dce7f8';ctx.stroke();
      ctx.save();ctx.translate(12,-44);ctx.rotate(-.18-armSwing);ctx.fillStyle='#536783';ctx.beginPath();ctx.ellipse(0,0,6,7,.2,0,7);ctx.fill();ctx.strokeStyle='#dce7f8';ctx.stroke();ctx.fillStyle='#aebdd4';ctx.fillRect(-3,5,6,12);ctx.restore();
      // Masked helm, crest, eye slits and side horns.
      var helm=ctx.createLinearGradient(-13,-70,13,-47);helm.addColorStop(0,'#f5f8ff');helm.addColorStop(.35,'#aebdd4');helm.addColorStop(.72,'#536783');helm.addColorStop(1,'#111a2d');
      ctx.fillStyle=helm;ctx.beginPath();ctx.moveTo(-11,-64);ctx.quadraticCurveTo(-13,-78,0,-79);ctx.quadraticCurveTo(14,-77,11,-63);ctx.lineTo(9,-51);ctx.lineTo(0,-46);ctx.lineTo(-9,-51);ctx.closePath();ctx.fill();ctx.strokeStyle='#f7fbff';ctx.lineWidth=1.1;ctx.stroke();
      ctx.fillStyle='#07101e';ctx.beginPath();ctx.moveTo(-8,-61);ctx.lineTo(8,-61);ctx.lineTo(5,-56);ctx.lineTo(-5,-56);ctx.closePath();ctx.fill();
      ctx.fillStyle='#8fd6ea';ctx.shadowColor='#8fd6ea';ctx.shadowBlur=6;ctx.fillRect(-6,-59,4,2);ctx.fillRect(2,-59,4,2);ctx.shadowBlur=0;
      ctx.fillStyle='#dce7f8';ctx.beginPath();ctx.moveTo(-8,-70);ctx.lineTo(-17,-84);ctx.lineTo(-4,-75);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(8,-70);ctx.lineTo(17,-84);ctx.lineTo(4,-75);ctx.closePath();ctx.fill();
      // Sword arm and blade, with a bright slash arc during attacks.
      ctx.save();ctx.translate(13,-40);ctx.rotate(P.atkT>0?-.95:-.35+run*.12);ctx.fillStyle='#8b6844';ctx.fillRect(-2,0,4,9);ctx.fillStyle='#d7e4f6';ctx.fillRect(-7,7,14,3);var blade=ctx.createLinearGradient(-3,0,3,0);blade.addColorStop(0,'#536783');blade.addColorStop(.5,'#fff');blade.addColorStop(1,'#8fd6ea');ctx.fillStyle=blade;ctx.beginPath();ctx.moveTo(-2,9);ctx.lineTo(2,9);ctx.lineTo(1,-28);ctx.lineTo(0,-34);ctx.lineTo(-1,-28);ctx.closePath();ctx.fill();ctx.restore();
      if(P.atkT>0){var a=1-P.atkT/.14;ctx.strokeStyle='rgba(236,248,255,'+(.9-a*.55)+')';ctx.lineWidth=8;ctx.lineCap='round';ctx.shadowColor='#8fd6ea';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(12,-39,62,-1.15+a*.5,.95-a*.3);ctx.stroke();ctx.shadowBlur=0;}
      ctx.restore();
    }
    function drawEnemy(e) {
      ctx.save();
      var enemyDepth = 0.90 + Math.max(0, Math.min(1, (e.y - 220) / (GROUND - 220))) * 0.12;
      ctx.translate(e.x, e.y); ctx.scale((e.dir < 0 ? -1 : 1) * enemyDepth, enemyDepth);
      if (e.k === 'warlord') ctx.scale(1.55, 1.55);
      var fl = e.flash > 0, wob = Math.sin(S.t * 14 + e.bob);
      if (e.k === 'crawlid') {
        ctx.fillStyle = fl ? '#fff' : '#6b5645'; ctx.beginPath(); ctx.ellipse(0, -14, 23, 14, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(-23, -14, 46, 6);
        ctx.fillStyle = fl ? '#fff' : '#3d3027'; for (var i = -1; i <= 1; i++) ctx.fillRect(i * 12 - 2 + wob * 2 * i, -8, 4, 8);
        ctx.fillStyle = '#e8d6a8'; ctx.beginPath(); ctx.arc(15, -12, 2.4, 0, 7); ctx.fill();
      } else if (e.k === 'vengefly') {
        ctx.fillStyle = 'rgba(180,200,235,' + (0.45 + wob * 0.2) + ')'; ctx.beginPath(); ctx.ellipse(-4, -14 + wob * 4, 10, 18, -0.6, 0, 7); ctx.ellipse(8, -14 - wob * 4, 10, 18, 0.6, 0, 7); ctx.fill();
        var flyGrad = ctx.createLinearGradient(-12, -14, 12, 14); flyGrad.addColorStop(0, fl ? '#fff' : '#879bc4'); flyGrad.addColorStop(.5, fl ? '#fff' : '#3a4a6e'); flyGrad.addColorStop(1, fl ? '#ddd' : '#111a31');
        ctx.fillStyle = flyGrad; ctx.beginPath(); ctx.ellipse(0, 0, 17, 15, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(220,235,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(8, -3, 3, 0, 7); ctx.arc(2, -4, 2.4, 0, 7); ctx.fill();
      } else {
        // Armoured humanoid sentinel: layered plates, articulated limbs and a glowing visor.
        var gait = Math.sin(S.t * 8 + e.bob) * 2.5;
        var metal = ctx.createLinearGradient(-19,-62,20,-8); metal.addColorStop(0, fl?'#fff':'#d6c9aa'); metal.addColorStop(.28, fl?'#fff':'#88785f'); metal.addColorStop(.62, fl?'#fff':'#3d3a3a'); metal.addColorStop(1, fl?'#ddd':'#151820');
        ctx.fillStyle='#090d16';ctx.beginPath();ctx.moveTo(-13,-48);ctx.lineTo(13,-48);ctx.lineTo(19,-14);ctx.lineTo(10,-8);ctx.lineTo(-10,-8);ctx.lineTo(-19,-14);ctx.closePath();ctx.fill();
        ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(-12,-51);ctx.lineTo(12,-51);ctx.lineTo(15,-22);ctx.lineTo(9,-15);ctx.lineTo(-9,-15);ctx.lineTo(-15,-22);ctx.closePath();ctx.fill();
        ctx.strokeStyle='rgba(255,225,170,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-12,-45);ctx.lineTo(0,-38);ctx.lineTo(12,-45);ctx.moveTo(0,-38);ctx.lineTo(0,-18);ctx.stroke();
        ctx.fillStyle=metal;ctx.beginPath();ctx.ellipse(0,-59,13,14,0,0,7);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.stroke();
        ctx.fillStyle='#17130f';ctx.beginPath();ctx.moveTo(-10,-61);ctx.lineTo(10,-61);ctx.lineTo(7,-55);ctx.lineTo(-7,-55);ctx.closePath();ctx.fill();
        ctx.fillStyle='#ff9d4a';ctx.shadowColor='#ff6b35';ctx.shadowBlur=7;ctx.fillRect(-7,-59,5,2.5);ctx.fillRect(2,-59,5,2.5);ctx.shadowBlur=0;
        ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(-9,-68);ctx.lineTo(-17,-79);ctx.lineTo(-5,-73);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(9,-68);ctx.lineTo(17,-79);ctx.lineTo(5,-73);ctx.closePath();ctx.fill();
        ctx.fillStyle=metal;ctx.save();ctx.translate(-12,-43);ctx.rotate(-.2+gait*.025);ctx.fillRect(-4,0,8,19);ctx.fillRect(-5,15,10,5);ctx.restore();ctx.save();ctx.translate(12,-43);ctx.rotate(.2-gait*.025);ctx.fillRect(-4,0,8,19);ctx.fillRect(-5,15,10,5);ctx.restore();
        ctx.fillStyle='#111722';ctx.fillRect(-10+gait,-15,8,15);ctx.fillRect(2-gait,-15,8,15);ctx.fillStyle='#b9a37c';ctx.fillRect(-11+gait,-4,10,4);ctx.fillRect(1-gait,-4,10,4);
        ctx.fillStyle='#d6c9aa';ctx.fillRect(15,-38,3,25);ctx.fillStyle='#8fd6ea';ctx.fillRect(14,-40,5,3);
      }
      ctx.restore();
      if (e.hp < e.max || e.k === 'warlord') { var bw = e.k === 'warlord' ? 64 : 36, bx = e.x - bw / 2, by = (e.fly ? e.y - e.h / 2 : e.y - e.h) - 12; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(bx, by, bw, 5); ctx.fillStyle = e.k === 'warlord' ? '#ff9d4a' : '#e07b7b'; ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.max), 5); }
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (S && S.shake > 0) ctx.translate(rnd(-1, 1) * S.shake * 14, rnd(-1, 1) * S.shake * 14);
      var off = P ? (P.x - W / 2) * 0.05 : 0; ctx.drawImage(bg, -60 - off, 0);
      if (!lowfx) fog.forEach(function (f) { var g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r); g.addColorStop(0, 'rgba(120,150,210,.10)'); g.addColorStop(1, 'rgba(120,150,210,0)'); ctx.fillStyle = g; ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); });
      // 3D depth: second parallax layer, then a perspective floor whose lines converge on the horizon and slide with the player
      if (!lowfx) { ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(bg, -60 - off * 2.4 - 90, 40, W + 120, H - 40); ctx.restore(); }
      var fl = ctx.createLinearGradient(0, GROUND, 0, H); fl.addColorStop(0, '#0d1428'); fl.addColorStop(1, '#03050c');
      ctx.fillStyle = fl; ctx.fillRect(0, GROUND, W, H - GROUND);
      var sx = P ? P.x : W / 2, shift = P ? (P.x * 0.9) % 60 : 0;
      ctx.strokeStyle = 'rgba(110,140,220,.22)'; ctx.lineWidth = 1; ctx.beginPath();
      for (var gx = -12; gx <= 12; gx++) { ctx.moveTo(W / 2 + gx * 14 - (sx - W / 2) * 0.02, GROUND); ctx.lineTo(W / 2 + gx * 120 - shift * 2 - (sx - W / 2) * 0.05, H); }
      for (var gy = 1; gy <= 5; gy++) { var yy = GROUND + Math.pow(gy / 5, 1.8) * (H - GROUND); ctx.moveTo(0, yy); ctx.lineTo(W, yy); }
      ctx.stroke();
      ctx.fillStyle = '#2b3b6b'; ctx.fillRect(0, GROUND, W, 3);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; // contact shadows
      if (P) { ctx.beginPath(); ctx.ellipse(P.x, GROUND + 6, 20 * Math.max(0.4, 1 - Math.max(0, GROUND - P.y) / 260), 6, 0, 0, 7); ctx.fill(); }
      enemies.forEach(function (e) { ctx.beginPath(); ctx.ellipse(e.x, GROUND + 6, e.w * 0.5, 5, 0, 0, 7); ctx.fill(); });
      if (P) {
        coins.forEach(function (g) { ctx.fillStyle = '#dcb560'; ctx.beginPath(); ctx.arc(g.x, g.y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff3c7'; ctx.beginPath(); ctx.arc(g.x - 2, g.y - 2, 2, 0, 7); ctx.fill(); });
        enemies.forEach(drawEnemy); drawKnight();
        parts.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life * 2.4); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 3, 3); }); ctx.globalAlpha = 1;
        ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center';
        texts.forEach(function (t) { ctx.globalAlpha = Math.min(1, t.t * 2); ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y); }); ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (P) { // HUD (scaled up on small screens so it stays readable)
        var hs = Math.max(1, Math.min(2.3, 640 / (canvas.clientWidth || W))), Wh = W / hs; ctx.save(); ctx.scale(hs, hs);
        for (var i = 0; i < P.max; i++) maskShape(30 + i * 26, 34, 1, i < P.hp);
        var so = Math.min(1, P.soul / 99); ctx.fillStyle = 'rgba(236,242,255,.14)'; ctx.beginPath(); ctx.arc(32, 76, 15, 0, 7); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(32, 76, 14, 0, 7); ctx.clip(); ctx.fillStyle = P.soul >= cfg.focusCost ? '#8fd6ea' : '#4c7d90'; ctx.fillRect(16, 90 - 28 * so, 32, 28 * so); ctx.restore();
        ctx.strokeStyle = '#ecf2ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(32, 76, 15, 0, 7); ctx.stroke();
        ctx.fillStyle = '#dcb560'; ctx.beginPath(); ctx.arc(66, 76, 6, 0, 7); ctx.fill();
        ctx.font = '600 18px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#ecf2ff'; ctx.fillText(String(S.geo), 78, 82);
        ctx.textAlign = 'center'; ctx.font = '600 30px Cinzel, Georgia, serif'; ctx.fillText(clock(S.left), Wh / 2, 44);
        ctx.textAlign = 'right'; ctx.font = '600 18px system-ui, sans-serif'; ctx.fillText('Defeated ' + S.kills, Wh - 24, 38);
        if (S.tip > 0 && mode === 'playing') { ctx.textAlign = 'center'; ctx.font = '500 17px system-ui, sans-serif'; ctx.fillStyle = 'rgba(236,242,255,' + Math.min(1, S.tip) + ')'; ctx.fillText(hs > 1.4 ? 'Slash enemies. Collect Denarii.' : 'Slash enemies with J or the Attack button. Collect Denarii. Heal with F when your soul is full.', Wh / 2, 120); }
        ctx.restore();
        if (!lowfx) { var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); }
      if (paused) { ctx.fillStyle = 'rgba(5,8,18,.6)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#ecf2ff'; ctx.font = '600 34px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('Paused', W / 2, H / 2); }
      }
    }

    // ---------- flow ----------
    var ph = null;
    // on a phone held sideways the arena is moved to <body> while a run is active, so it can fill the screen
    function portal(on) {
      try {
        if (on && !ph && root.parentNode && matchMedia('(orientation: landscape) and (max-height: 560px) and (pointer: coarse)').matches) { ph = document.createComment('arena'); root.parentNode.insertBefore(ph, root); document.body.appendChild(root); }
        else if (!on && ph) { if (ph.parentNode) ph.parentNode.insertBefore(root, ph); ph.remove(); ph = null; }
      } catch (e) {}
    }
    var wasPlaying = false, STEP = 1 / 60, acc = 0, slow = 0, frames = 0;
    function loop(ts) {
      raf = requestAnimationFrame(loop);
      var pl = mode === 'playing'; if (pl !== wasPlaying) { wasPlaying = pl; root.classList.toggle('is-playing', pl); document.body.classList.toggle('arena-full', pl); portal(pl); }
      var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
      // adaptive quality: if the device keeps missing 30fps, drop to 1x resolution and skip the heavy effects
      if (!lowfx && dt > 0.034) { if (++slow > 40) { lowfx = true; fit(); } } else if (slow > 0 && dt < 0.02) slow--;
      if (mode === 'playing' && !paused) { acc += dt; var n = 0; while (acc >= STEP && n++ < 6) { update(STEP); acc -= STEP; } if (n >= 6) acc = 0; }
      else { acc = 0; if (fog) fog.forEach(function (f) { f.x += f.s * dt; if (f.x - f.r > W) f.x = -f.r; }); }
      draw();
    }
    function showOverlay(build) { while (overlay.firstChild) overlay.removeChild(overlay.firstChild); if (!build) { overlay.hidden = true; wrap.classList.remove('has-overlay'); return; } overlay.hidden = false; wrap.classList.add('has-overlay'); build(overlay); }
    function row(parent, k, v) { var d = el('div', 'gstat'); d.appendChild(el('span', '', k)); d.appendChild(el('strong', '', v)); parent.appendChild(d); }

    function readyScreen(info, note) {
      mode = 'ready';
      showOverlay(function (o) {
        var box = el('div', 'gbox');
        box.appendChild(el('h3', '', 'Imperium Arena'));
        box.appendChild(el('p', 'muted', 'Survive 60 seconds. Every enemy you defeat earns XP and Denarii. Your blade damage and masks come from your real gear.'));
        if (info) { row(box, 'Runs left today', info.runsLeft + ' of ' + info.maxRuns); row(box, 'XP earned today', info.xpToday + ' of ' + info.xpCap); row(box, 'Best run', info.best + ' defeated'); }
        var msg = el('p', 'msg' + (note ? ' bad' : ''), note || ''); box.appendChild(msg);
        var b = el('button', 'btn', 'Start run'); b.type = 'button';
        if (info && info.runsLeft <= 0) { b.disabled = true; }
        b.addEventListener('click', function () {
          b.disabled = true; msg.className = 'msg'; msg.textContent = '';
          opts.start().then(function (r) {
            if (!r || !r.ok) { b.disabled = false; msg.className = 'msg bad'; msg.textContent = (r && r.msg) || 'Could not start a run.'; if (r && r.info) { } return; }
            reset(r); mode = 'playing'; dead = false; showOverlay(null); window.focus();
          });
        });
        box.appendChild(b); o.appendChild(box);
      });
    }
    function finish(survived) {
      if (mode !== 'playing') return; mode = 'ending';
      var rep = { kills: S.kills, geo: S.geo, survived: !!survived };
      showOverlay(function (o) { var b = el('div', 'gbox'); b.appendChild(el('h3', '', survived ? 'Run complete' : 'You fell')); b.appendChild(el('p', 'muted', 'Counting your rewards...')); o.appendChild(b); });
      opts.finish(rep).then(function (r) {
        mode = 'over';
        showOverlay(function (o) {
          var b = el('div', 'gbox');
          b.appendChild(el('h3', '', survived ? 'Run complete' : 'You fell'));
          if (!r || !r.ok) { b.appendChild(el('p', 'msg bad', (r && r.msg) || 'Your rewards could not be saved.')); }
          else {
            row(b, 'Enemies defeated', String(r.kills)); row(b, 'Denarii earned', '+' + r.geo); row(b, 'XP earned', '+' + r.xp);
            if (r.levelUps) b.appendChild(el('p', 'owned', 'Level up! You are now level ' + r.level + '.'));
            if (r.capped) b.appendChild(el('p', 'muted', 'You reached the daily XP limit, so some XP was not counted.'));
          }
          var again = el('button', 'btn', 'Run again'); again.type = 'button';
          again.addEventListener('click', function () { readyScreen(r && r.info, ''); });
          b.appendChild(again); o.appendChild(b);
        });
        if (opts.onDone) opts.onDone(r);
      });
    }

    // ---------- input ----------
    var MAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', j: 'attack', J: 'attack', z: 'attack', Z: 'attack', x: 'attack', X: 'attack', f: 'focus', F: 'focus' };
    function kd(e) { var k = MAP[e.key]; if (!k || mode !== 'playing') return; e.preventDefault(); if (k === 'left' || k === 'right') keys[k] = true; else if (!e.repeat) keys[k] = true; }
    function ku(e) { var k = MAP[e.key]; if (k === 'left' || k === 'right') keys[k] = false; }
    function vis() { paused = document.hidden && mode === 'playing'; }
    function pk(e) { if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && mode === 'playing') { paused = !paused; } }
    function rz() { fit(); }
    window.addEventListener('keydown', pk); window.addEventListener('resize', rz); fit();
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', function () { keys.left = keys.right = keys.jump = false; releaseStick(); });

    readyScreen(opts.info, '');
    raf = requestAnimationFrame(loop);
    return {
      destroy: function () { cancelAnimationFrame(raf); document.body.classList.remove('arena-full'); portal(false); if (root.parentNode === document.body) root.remove(); window.removeEventListener('keydown', kd); window.removeEventListener('keydown', pk); window.removeEventListener('resize', rz); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', vis); },
      state: function () { return { mode: mode, kills: S && S.kills, geo: S && S.geo, hp: P && P.hp, left: S && S.left, enemies: enemies.length }; },
      press: function (k) { keys[k] = true; },
    };
  }
  window.MalfoyGame = { mount: mount };
})();
