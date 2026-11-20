'use strict';
// Background crow animation: canvas, several flight paths, speeds and depths (scale, opacity, soft ground shadow).
// Light on CPU (about 8 crows, one rAF loop), pauses when the tab is hidden, and shows still crows when reduced motion is requested.
(function () {
  var cv = document.getElementById('crows'); if (!cv || !cv.getContext) return;
  var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var ctx = cv.getContext('2d', { alpha: true, desynchronized: true }), W = 0, H = 0,
      dpr = touch ? 1 : Math.min(window.devicePixelRatio || 1, 2), raf = 0, last = 0, t = 0, lastDraw = 0;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var crows = [];
  function resize() { W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // paths: 0 left to right glide, 1 right to left, 2 wide circling loop, 3 diagonal climb, 4 sine wave
  function make(i) {
    var depth = rnd(0, 1), kind = i % 5;
    return { kind: kind, depth: depth, scale: 0.55 + depth * 1.0, speed: (30 + depth * 90) * rnd(0.8, 1.3), x: rnd(0, W), y: rnd(0.08, 0.7) * H, phase: rnd(0, 6.28), flap: rnd(5, 9), cx: rnd(0.25, 0.75) * W, cy: rnd(0.2, 0.55) * H, rx: rnd(120, 380), ry: rnd(50, 140), ang: rnd(0, 6.28), dir: Math.random() < .5 ? 1 : -1 };
  }
  function init() { crows = []; var n = touch ? 3 : (W < 700 ? 6 : 9); for (var i = 0; i < n; i++) crows.push(make(i)); }
  function step(c, dt) {
    if (c.kind === 0 || c.kind === 1 || c.kind === 4 || c.kind === 3) {
      var d = c.kind === 1 ? -1 : 1; c.x += d * c.speed * dt;
      if (c.kind === 4) c.y = c.cy + Math.sin(c.x / 90 + c.phase) * (40 + 30 * c.depth); else if (c.kind === 3) c.y -= c.speed * 0.18 * dt; else c.y += Math.sin(t * .8 + c.phase) * 8 * dt;
      c.vx = d; if (c.x > W + 80) { c.x = -80; c.y = rnd(0.1, 0.7) * H; } if (c.x < -80) { c.x = W + 80; c.y = rnd(0.1, 0.7) * H; } if (c.y < -60) { c.y = H * 0.7; c.x = rnd(0, W); }
    } else { c.ang += c.dir * (c.speed / 260) * dt; c.x = c.cx + Math.cos(c.ang) * c.rx; c.y = c.cy + Math.sin(c.ang) * c.ry; c.vx = -Math.sin(c.ang) * c.dir >= 0 ? 1 : -1; }
  }
  function draw(c, still) {
    var s = c.scale, flap = still ? 0.2 : Math.sin(t * c.flap + c.phase), face = c.vx < 0 ? -1 : 1, a = 0.42 + c.depth * 0.5;
    // ground shadow, softer and fainter for crows that are higher or deeper
    ctx.save(); ctx.globalAlpha = 0.18 * a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(c.x + 18 * s, Math.min(H - 6, c.y + 90 + c.depth * 40), 20 * s, 5 * s, 0, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(face * s, s); ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(25,214,138,.55)'; ctx.shadowBlur = 8 + c.depth * 8; ctx.fillStyle = '#26323a'; ctx.strokeStyle = 'rgba(25,214,138,.65)'; ctx.lineWidth = 1.1;
    // body + head + beak
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.5, -0.1, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, -3, 4.6, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18, -4); ctx.lineTo(25, -2); ctx.lineTo(18, -1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-27, 3); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill();
    // wings (flap by rotating them about the shoulder)
    var up = -26 * flap - 6;
    [[-1], [1]].forEach(function (w) {
      ctx.save(); ctx.translate(-1, -3); ctx.rotate((up * 0.0175) * (w[0] === -1 ? 1 : 1)); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-12, -34 - 8 * flap, -38, -30 + 10 * flap); ctx.quadraticCurveTo(-26, -14, -10, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    ctx.restore();
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    // Limit decorative canvas work on touch devices to about 24fps.
    if (touch && ts - lastDraw < 41) return;
    lastDraw = ts;
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts; t += dt;
    ctx.clearRect(0, 0, W, H); crows.slice().sort(function (a, b) { return a.depth - b.depth; }).forEach(function (c) { step(c, dt); draw(c, false); });
  }
  function start() { if (raf || reduce) return; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function still() { ctx.clearRect(0, 0, W, H); crows.forEach(function (c) { c.vx = 1; draw(c, true); }); }
  resize(); init();
  window.addEventListener('resize', function () {
    var nextTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (nextTouch !== touch) { touch = nextTouch; dpr = touch ? 1 : Math.min(window.devicePixelRatio || 1, 2); init(); }
    resize(); if (reduce) still();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-reduced-motion: reduce)'); var ch = function () { reduce = mq.matches; stop(); if (reduce) still(); else start(); }; if (mq.addEventListener) mq.addEventListener('change', ch); }
  if (reduce) still(); else start();
  window.MFCrows = { count: function () { return crows.length; }, running: function () { return !!raf; }, reduced: function () { return reduce; } };
})();
