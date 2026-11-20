/* Malfoy duels: a real-time 3D arena (drawn with a small built-in 3D engine, no libraries), 1v1 and 4v4.
   The server runs the fight; this page draws it and sends your keys. */
(function () {
  'use strict';
  function h(tag, props) {
    var e = document.createElement(tag); props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k]; if (v == null || v === false) return;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  var W = 960, H = 540, GROUND = 470, PLATS = [{ x1: 190, x2: 390, y: 350 }, { x1: 570, x2: 770, y: 350 }];
  var TEAM = [{ name: 'Soul', col: '#8fd6ea' }, { name: 'Ash', col: '#e8a05a' }];
  var DISPLAY = '600 15px Cinzel, "Trajan Pro", Georgia, serif';

  // ---------- character looks (the server only stores the numbers) ----------
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  var PAL = {
    cloak: ['#1b2440', '#7a2433', '#1f5a46', '#52317f', '#80582a', '#2a6a94', '#3b3f4a', '#8a2f66', '#cfc8b4', '#0f0f16'],
    mask: ['#ece7d6', '#e6c872', '#a3a9b8', '#d9747d', '#8fd0b2', '#2b2b3a'],
    eyes: ['#0a0a12', '#8fd6ea', '#ff5a5a', '#ffd24a', '#7cff9a', '#c77dff', '#ffffff', '#ff8a2a'],
    blade: ['#cfd6e6', '#ff8a3a', '#a07bff', '#8fe6ff', '#ffd36a'],
    names: {
      cloak: ['Midnight', 'Crimson', 'Moss', 'Violet', 'Amber', 'Tide', 'Slate', 'Orchid', 'Bone', 'Void'],
      mask: ['Bone', 'Gold', 'Ash', 'Rose', 'Jade', 'Obsidian'],
      eyes: ['Shadow', 'Soul', 'Blood', 'Sun', 'Moss', 'Dream', 'Pale', 'Ember'],
      hat: ['None', 'Horns', 'Crown', 'Wizard', 'Helm', 'Halo'],
      cape: ['None', 'Short', 'Long', 'Wings'],
      blade: ['Blade', 'Ember', 'Void', 'Ice', 'Gold']
    }
  };
  var DEFAULT_LOOK = { cloak: 0, mask: 0, eyes: 0, hat: 0, cape: 0, blade: 0 };
  function lk(look) { var o = {}; Object.keys(DEFAULT_LOOK).forEach(function (k) { var v = look && look[k]; o[k] = typeof v === 'number' && v >= 0 ? v : 0; }); return o; }

  // ---------- a tiny 3D engine: boxes, perspective, flat shading, painter's order ----------
  var LIGHT = (function () { var x = -.45, y = .8, z = .55, l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();
  function makeCam(px, py, pz, tx, ty, tz, F, cx, cy) {
    var f = [tx - px, ty - py, tz - pz], l = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]); f = [f[0] / l, f[1] / l, f[2] / l];
    var r = [-f[2], 0, f[0]], rl = Math.sqrt(r[0] * r[0] + r[2] * r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return {
      pos: [px, py, pz],
      p: function (x, y, z) {
        var dx = x - px, dy = y - py, dz = z - pz, d = dx * f[0] + dy * f[1] + dz * f[2];
        if (d < 30) return null;
        return [cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / d, cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / d, d, F / d];
      }
    };
  }
  var shadeCache = {};
  function shade(col, f) { var k = (col[0] << 16 | col[1] << 8 | col[2]) + ':' + Math.round(f * 24); return shadeCache[k] || (shadeCache[k] = 'rgb(' + Math.min(255, Math.round(col[0] * f)) + ',' + Math.min(255, Math.round(col[1] * f)) + ',' + Math.min(255, Math.round(col[2] * f)) + ')'); }

  // M = model placement: X,Y,Z world position of the feet, f facing (1 / -1), fall (radians), yaw
  function boxOut(out, cm, M, c, hh, col, rot, pv, emis, flash) {
    rot = rot || 0; pv = pv || [0, 0];
    var cr = Math.cos(rot), sr = Math.sin(rot), cf = Math.cos(M.fall || 0), sf = Math.sin(M.fall || 0), cy = Math.cos(M.yaw || 0), sy = Math.sin(M.yaw || 0);
    function dir(x, y, z) {
      var a = x * cr - y * sr, b = x * sr + y * cr; x = a; y = b;
      a = x * cf - y * sf; b = x * sf + y * cf; x = a * M.f; y = b;
      return [x * cy + z * sy, y, -x * sy + z * cy];
    }
    // centre = rot(c - pv) + pv, then fall / mirror / yaw
    var lx = (c[0] - pv[0]) * cr - (c[1] - pv[1]) * sr + pv[0], ly = (c[0] - pv[0]) * sr + (c[1] - pv[1]) * cr + pv[1];
    var fx = lx * cf - ly * sf, fy = lx * sf + ly * cf; fx *= M.f;
    var C = [M.X + fx * cy + c[2] * sy, M.Y + fy, M.Z - fx * sy + c[2] * cy];
    var A = [dir(hh[0], 0, 0), dir(0, hh[1], 0), dir(0, 0, hh[2])], base = flash ? [255, 255, 255] : col;
    for (var i = 0; i < 3; i++) {
      var j = (i + 1) % 3, k = (i + 2) % 3, a = A[i], al = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
      for (var s = -1; s <= 1; s += 2) {
        var fc = [C[0] + s * a[0], C[1] + s * a[1], C[2] + s * a[2]], n = [s * a[0] / al, s * a[1] / al, s * a[2] / al];
        if (n[0] * (cm.pos[0] - fc[0]) + n[1] * (cm.pos[1] - fc[1]) + n[2] * (cm.pos[2] - fc[2]) <= 0) continue;
        var pts = [], ok = true, q, sj, sk;
        for (q = 0; q < 4; q++) {
          sj = q < 2 ? -1 : 1; sk = (q === 0 || q === 3) ? -1 : 1;
          var p = cm.p(fc[0] + sj * A[j][0] + sk * A[k][0], fc[1] + sj * A[j][1] + sk * A[k][1], fc[2] + sj * A[j][2] + sk * A[k][2]);
          if (!p) { ok = false; break; } pts.push(p);
        }
        if (!ok) continue;
        var dp = cm.p(fc[0], fc[1], fc[2]), lt = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        out.push({ pts: pts, d: dp ? dp[2] : pts[0][2], col: shade(base, emis ? .92 + .08 * lt : .42 + .62 * lt) });
      }
    }
  }
  function drawFaces(c, faces) {
    faces.sort(function (a, b) { return b.d - a.d; });
    c.lineJoin = 'round'; c.lineWidth = 1; c.strokeStyle = 'rgba(4,6,16,.6)';
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i], p = f.pts; c.fillStyle = f.col; c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(p[1][0], p[1][1]); c.lineTo(p[2][0], p[2][1]); c.lineTo(p[3][0], p[3][1]); c.closePath(); c.fill(); c.stroke();
    }
  }

  // one knight, built from boxes. st: attack a, heal hl, hurt hu, invincible iv, dead, walk phase, air
  function knight(out, cm, M, look, st, tm) {
    var L = lk(look), cloak = rgb(PAL.cloak[L.cloak] || PAL.cloak[0]), mask = rgb(PAL.mask[L.mask] || PAL.mask[0]), blade = rgb(PAL.blade[L.blade] || PAL.blade[0]);
    var eyeHex = PAL.eyes[L.eyes] || PAL.eyes[0]; if (L.eyes === 0 && L.mask === 5) eyeHex = '#8fd6ea'; var eye = rgb(eyeHex), fl = !!st.hu, dark = shade(cloak, .6);
    var sw = st.air ? 0 : Math.sin(st.walk) * (st.moving ? .75 : 0), bob = st.moving || st.air ? 0 : Math.sin(tm / 380 + M.X) * 1.2;
    function B(c, hh, col, rot, pv, em) { boxOut(out, cm, M, c, hh, col, rot, pv, em, fl); }
    var cl2 = [Math.min(255, cloak[0] + 40), Math.min(255, cloak[1] + 40), Math.min(255, cloak[2] + 40)];
    B([0, 9, -6], [4, 9, 3.5], [30, 34, 54], st.air ? -.5 : sw, [0, 16]); B([0, 9, 6], [4, 9, 3.5], [30, 34, 54], st.air ? .4 : -sw, [0, 16]);      // legs
    B([0, 28 + bob, 0], [9, 12, 8], cloak); B([0, 19 + bob, 0], [10, 3, 9], cl2);                                                                         // body + hem
    if (L.cape === 1) B([-11, 26 + bob, 0], [2, 11, 8], cloak, .12 + sw * .15, [-11, 36]);
    if (L.cape === 2) B([-11, 22 + bob, 0], [2, 18, 8.5], cloak, .1 + sw * .2, [-11, 38]);
    if (L.cape === 3) { B([-11, 36 + bob, -15], [3, 13, 5], cl2, .35, [-11, 28]); B([-11, 36 + bob, 15], [3, 13, 5], cl2, .35, [-11, 28]); }
    B([0, 47 + bob, 0], [11, 10, 10.5], mask);                                                                                                            // head
    B([11.3, 48.5 + bob, -4.6], [.8, 2.6, 1.8], eye, 0, null, true); B([11.3, 48.5 + bob, 4.6], [.8, 2.6, 1.8], eye, 0, null, true);                       // eyes
    if (L.hat === 1) { B([-2, 60 + bob, -7], [2, 7, 2], mask, .18, [-2, 55]); B([-2, 60 + bob, 7], [2, 7, 2], mask, .18, [-2, 55]); }
    if (L.hat === 2) { var gold = [236, 196, 96]; B([0, 58 + bob, 0], [11.5, 2.5, 11], gold); for (var i = -1; i <= 1; i++) B([i * 7, 63 + bob, 0], [2.2, 4, 2.2], gold); }
    if (L.hat === 3) { var pu = [82, 49, 127]; B([0, 57.5 + bob, 0], [16, 1.8, 16], pu); B([0, 64 + bob, 0], [10, 5, 10], pu); B([0, 73 + bob, 0], [6, 5, 6], pu); B([2, 80 + bob, 0], [2.6, 3, 2.6], [236, 196, 96], 0, null, true); }
    if (L.hat === 4) { B([0, 54 + bob, 0], [12.4, 5.5, 11.6], [136, 144, 168]); B([-5, 62 + bob, 0], [2.2, 6, 1.2], [210, 60, 70], .25, [-5, 58]); }
    if (L.hat === 5) { for (var q = 0; q < 8; q++) { var an = q / 8 * 6.283 + tm / 700; B([Math.cos(an) * 12, 70 + bob, Math.sin(an) * 12], [2.4, 1.2, 2.4], [255, 224, 130], 0, null, true); } }
    // sword arm: rest, swing, or raised for heal
    var ang = st.a ? 2.6 - st.a * 2.3 : (st.hl ? 2.2 : (st.air ? 1.6 : .75 + sw * .1));
    B([6, 28 + bob, 10], [3, 8, 3], cloak, ang, [6, 36 + bob]);
    B([6, 18 + bob, 10], [4.2, 1.6, 4.2], [150, 150, 170], ang, [6, 36 + bob]);
    B([6, -8 + bob, 10], [1.8, 26, 1.8], blade, ang, [6, 36 + bob], L.blade > 0);
    B([6, 28 + bob, -10], [3, 8, 3], cloak, -sw * .5, [6, 36 + bob]);
  }

  // ---------- scene: arena floor, platforms, pillars ----------
  function sceneBack(c, cm, tm, camT) {
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#080d1e'); g.addColorStop(.55, '#151f3e'); g.addColorStop(1, '#0b1226'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var m = cm.p(-120, 330, -900); if (m) { var mg = c.createRadialGradient(m[0], m[1], 4, m[0], m[1], 150 * m[3] * 4); mg.addColorStop(0, 'rgba(220,235,255,.9)'); mg.addColorStop(.12, 'rgba(160,200,230,.35)'); mg.addColorStop(1, 'rgba(143,214,234,0)'); c.fillStyle = mg; c.fillRect(0, 0, W, H); }
    // floor slab
    var corners = [[-560, 0, -230], [560, 0, -230], [560, 0, 190], [-560, 0, 190]].map(function (q) { return cm.p(q[0], q[1], q[2]); });
    if (corners.every(Boolean)) { var fg = c.createLinearGradient(0, corners[0][1], 0, corners[2][1]); fg.addColorStop(0, '#1b2648'); fg.addColorStop(1, '#0d1430'); c.fillStyle = fg; c.beginPath(); corners.forEach(function (q, i) { i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(120,150,210,.16)'; c.lineWidth = 1; c.beginPath();
      for (var x = -560; x <= 560; x += 80) { var a = cm.p(x, 0, -230), b = cm.p(x, 0, 190); if (a && b) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } }
      for (var z = -230; z <= 190; z += 70) { var a2 = cm.p(-560, 0, z), b2 = cm.p(560, 0, z); if (a2 && b2) { c.moveTo(a2[0], a2[1]); c.lineTo(b2[0], b2[1]); } }
      c.stroke(); }
    // drifting soul motes
    c.fillStyle = 'rgba(143,214,234,.55)';
    for (var i = 0; i < 28; i++) { var px = ((i * 211 + camT * 9 * (1 + i % 3)) % 1400) - 700, py = 40 + ((i * 97) % 300) + Math.sin(camT * 1.3 + i) * 12, pz = -300 - (i % 5) * 120, p = cm.p(px, py, pz); if (p) c.fillRect(p[0], p[1], Math.max(1.5, 3 * p[3]), Math.max(1.5, 3 * p[3])); }
  }
  function sceneSolids(out, cm) {
    var M = { X: 0, Y: 0, Z: 0, f: 1 }, stone = [62, 76, 120], edge = [86, 104, 158], i;
    for (i = -4; i <= 4; i++) { M.X = i * 150; M.Z = -330; boxOut(out, cm, M, [0, 90, 0], [26, 90, 26], [34, 44, 80]); boxOut(out, cm, M, [0, 184, 0], [34, 5, 34], edge); }
    M.X = 0; M.Z = -330; boxOut(out, cm, M, [0, 205, 0], [640, 8, 24], [30, 40, 74]);
    PLATS.forEach(function (pl) { M.X = (pl.x1 + pl.x2) / 2 - 480; M.Z = 0; var hw = (pl.x2 - pl.x1) / 2, top = GROUND - pl.y; boxOut(out, cm, M, [0, top - 7, 0], [hw, 7, 44], stone); boxOut(out, cm, M, [0, top - 1, 0], [hw + 2, 1.5, 45], edge); });
    M.X = 0; M.Z = 0; [-1, 1].forEach(function (s) { boxOut(out, cm, M, [s * 566, 24, 0], [8, 24, 200], [48, 60, 104]); });
  }

  // ================= lobby + arena =================
  function mount(root, o) {
    var alive = true, meta = null, game = null, metaT = null, box = h('div', { class: 'duel' });
    root.appendChild(box);

    function av(p) { return p.pfp ? h('img', { class: 'fp', src: p.pfp, alt: '', width: '56', height: '56' }) : h('div', { class: 'fp ph', 'aria-hidden': 'true', text: (p.name || '?').charAt(0).toUpperCase() }); }
    function side(p, label) { return h('div', { class: 'fighter' }, av(p), h('div', { class: 'fi' }, h('div', { class: 'fn', text: label + p.name }), h('div', { class: 'muted', text: 'Level ' + p.level }))); }
    function clearBox() { while (box.firstChild) box.removeChild(box.firstChild); }
    function teamsBox(d, joinFn) {
      var wrap = h('div', { class: 'teams' });
      [0, 1].forEach(function (t) {
        var col = h('div', { class: 'team t' + t }, h('h3', { text: 'Team ' + TEAM[t].name }));
        var mem = (d.players || []).filter(function (p) { return p.team === t; });
        for (var i = 0; i < d.cap; i++) col.appendChild(mem[i] ? h('div', { class: 'slot' }, av(mem[i]), h('span', { text: mem[i].name + (mem[i].host ? ' (host)' : '') })) : h('div', { class: 'slot empty', text: 'Open slot' }));
        if (joinFn && mem.length < d.cap) col.appendChild(h('button', { class: 'btn small', type: 'button', text: 'Join ' + TEAM[t].name, onclick: function () { joinFn(t); } }));
        wrap.appendChild(col);
      });
      return wrap;
    }
    function showMeta() {
      if (!alive || !meta) return;
      var d = meta, team = d.mode === '4v4', bet = d.bet ? d.bet + ' Denarii bet each' : 'No bet';
      if (d.status === 'countdown' || d.status === 'active') { if (!game) startGame(); return; }
      if (game) { game.destroy(); game = null; }
      clearBox();
      var sec = h('section', { class: 'section' });
      if (!d.member) {
        sec.appendChild(h('h2', { text: team ? '4 vs 4 with ' + d.host.name : 'Duel with ' + d.host.name }));
        sec.appendChild(h('p', { class: 'muted', text: (team ? 'A team match: up to 4 knights per side. ' : bet + '. ') + 'Real-time 3D fight: nail, dash and Spirit Bolt. Last team standing wins.' }));
        if (team) sec.appendChild(teamsBox(d, d.canJoin ? join : null));
        else sec.appendChild(d.canJoin ? h('button', { class: 'btn', type: 'button', text: 'Join duel', onclick: function () { join(); } }) : h('p', { class: 'msg bad', text: d.status === 'waiting' ? 'This duel is for someone else.' : 'This room is closed.' }));
        if (team && d.canJoin) sec.appendChild(h('p', {}, h('button', { class: 'btn quiet small', type: 'button', text: 'Auto join the smaller team', onclick: function () { join(); } })));
        if (team && !d.canJoin) sec.appendChild(h('p', { class: 'msg bad', text: d.status === 'waiting' ? 'Both teams are full.' : 'This room is closed.' }));
      } else if (d.status === 'waiting') {
        sec.appendChild(h('h2', { text: team ? '4 vs 4 lobby' : 'Duel' })); sec.appendChild(h('p', { class: 'muted', text: team ? d.n + ' of ' + d.cap * 2 + ' players in. It starts at ' + d.cap * 2 + ', or when the host presses Start.' : bet }));
        if (team) {
          sec.appendChild(teamsBox(d, null));
          if (d.canStart) sec.appendChild(h('p', {}, h('button', { class: 'btn', type: 'button', text: 'Start the match', onclick: function () { o.api('/api/duel/' + o.id + '/start', {}).then(function (r) { if (r.ok === false && r.msg) o.toast(r.msg); fetchMeta(); }); } })));
          else if (d.me === 0) sec.appendChild(h('p', { class: 'muted', text: 'You need at least one player on each team to start.' }));
          else sec.appendChild(h('p', { class: 'muted', text: 'Waiting for the host to start.' }));
        } else sec.appendChild(h('div', { class: 'wait' }, side(d.you, ''), h('p', { class: 'muted', text: 'Waiting for your opponent. Share the link the bot sent to the chat.' })));
        sec.appendChild(help());
      } else if (d.status === 'done') {
        var win = d.result === 'win', dr = d.result === 'draw';
        var res = h('div', { class: 'result ' + (win ? 'won' : dr ? 'drew' : 'lost') }, h('h3', { text: win ? 'Your side won' : dr ? 'The duel was a draw' : 'Your side was defeated' }));
        if (d.reward) {
          var parts = []; if (d.reward.xp) parts.push('+' + d.reward.xp + ' XP'); if (d.reward.geo) parts.push('+' + d.reward.geo + ' Denarii'); if (d.reward.bet) parts.push((d.reward.bet > 0 ? '+' : '') + d.reward.bet + ' Denarii bet');
          res.appendChild(h('p', { text: parts.length ? parts.join('   ') : 'No reward this time.' }));
          if (!d.reward.counted) res.appendChild(h('p', { class: 'muted', text: 'Daily duel limit reached or same opponent too often, so no XP.' }));
        }
        res.appendChild(h('p', { class: 'muted', text: 'Start another from WhatsApp: .duel @friend or .duel 4v4' })); sec.appendChild(h('h2', { text: 'Duel over' })); sec.appendChild(res);
      } else sec.appendChild(h('p', { class: 'msg bad', text: 'This room closed before the duel started.' }));
      box.appendChild(sec);
    }
    function help() {
      return h('details', {}, h('summary', { text: 'Controls' }), h('p', { class: 'muted', text: 'Move: arrow keys or A / D. Jump: W, Up or Space (twice for a double jump). Blade: J or Z. Dash: K or X (you cannot be hit while dashing). Spirit Bolt: L or C, costs 33 soul. Focus to heal: F, costs 33 soul, stand still, any hit breaks it. Each nail hit gives 11 soul. 5 masks each. On a phone, use the buttons under the arena.' }));
    }
    function fetchMeta(cb) { o.api('/api/duel/' + o.id).then(function (r) {
      if (!alive) return;
      if (!r.ok) { clearBox(); box.appendChild(h('section', { class: 'section' }, h('h2', { text: 'Duel not found' }), h('p', { class: 'muted', text: r.msg || 'This room has closed.' }))); stopMeta(); return; }
      var prev = meta && meta.status, was = meta && meta.n; meta = r.d; if (prev !== meta.status || !prev || (meta.status === 'waiting' && was !== meta.n)) showMeta();
      if (prev && prev !== 'done' && meta.status === 'done' && o.onChange) o.onChange();
      if (cb) cb();
    }); }
    function stopMeta() { if (metaT) { clearInterval(metaT); metaT = null; } }
    function join(team) { o.api('/api/duel/' + o.id + '/join', team === 0 || team === 1 ? { team: team } : {}).then(function (r) { if (r.ok === false && r.msg) o.toast(r.msg); fetchMeta(); }); }

    // ---------------- the arena ----------------
    function startGame() {
      clearBox();
      var sec = h('section', { class: 'section' }), wrap = h('div', { class: 'game-wrap' });
      var cv = h('canvas', { class: 'game-canvas', width: String(W), height: String(H), 'aria-label': 'Duel arena' }); wrap.appendChild(cv); sec.appendChild(wrap);
      var pad = h('div', { class: 'dpad', 'aria-label': 'Touch controls' });
      var left = h('div', { class: 'padgrp' }), right = h('div', { class: 'padgrp' });
      [['◀', 'l'], ['▶', 'r']].forEach(function (x) { var b = h('button', { class: 'pb mv', type: 'button', 'aria-label': x[1] === 'l' ? 'Move left' : 'Move right', text: x[0] }); b.setAttribute('data-k', x[1]); b.setAttribute('data-hold', '1'); left.appendChild(b); });
      [['⤒', 'j', 'Jump'], ['⚔', 'a', 'Blade'], ['⇢', 'd', 'Dash'], ['✦', 'c', 'Spirit'], ['♥', 'h', 'Heal']].forEach(function (x) { var b = h('button', { class: 'pb ac', type: 'button', 'aria-label': x[2], text: x[0] }); b.setAttribute('data-k', x[1]); right.appendChild(b); });
      pad.appendChild(left); pad.appendChild(right); sec.appendChild(pad); sec.appendChild(help()); box.appendChild(sec);
      game = arena(cv, pad);
    }
    function arena(cv, pad) {
      var ctx = cv.getContext('2d'), dead = false, ws = null, poll = null, gotMsg = false, wsFailed = false, held = { l: 0, r: 0 };
      var buf = [], lastN = -1, parts = [], shake = 0, finished = false, raf = 0, keepT = null, lastFrame = 0, walk = {}, pl = meta.players || [];
      function fit() { var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 640; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * H / W); }
      fit(); window.addEventListener('resize', fit);

      function onSnap(s) {
        if (dead) return; gotMsg = true; var now = performance.now(); buf.push({ t: now, s: s }); if (buf.length > 12) buf.shift();
        if (s.n > lastN) { lastN = s.n; (s.ev || []).forEach(function (e) { fx(e[0], e[1], e[2]); }); }
        if (s.s === 'done' && !finished) { finished = true; setTimeout(function () { if (!dead) fetchMeta(); }, 900); }
      }
      function fx(t, x, y) {
        var i, n = t === 'hit' ? 16 : t === 'cast' ? 9 : t === 'heal' ? 12 : 7, col = t === 'heal' || t === 'cast' ? '#8fd6ea' : t === 'dash' ? '#9aa4c8' : '#ffffff';
        for (i = 0; i < n; i++) parts.push({ x: x - 480, y: GROUND - y, z: (Math.random() - .5) * 30, vx: (Math.random() - .5) * (t === 'hit' ? 420 : 200), vy: (t === 'heal' ? 1 : (Math.random() - .3)) * (t === 'heal' ? 120 : 340), vz: (Math.random() - .5) * 160, life: .45 + Math.random() * .35, t: 0, c: col });
        if (t === 'hit') shake = .22;
      }
      // ---- sending keys ----
      function post(msg) {
        if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch (e) {} return; }
        if (wsFailed || (!ws)) { o.api('/api/duel/' + o.id + '/input', msg); }
      }
      function send(edges) { var m = { l: held.l, r: held.r }; if (edges) Object.keys(edges).forEach(function (k) { m[k] = 1; }); post(m); }
      var KEYS = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'j', w: 'j', W: 'j', ' ': 'j', j: 'a', J: 'a', z: 'a', Z: 'a', k: 'd', K: 'd', x: 'd', X: 'd', l: 'c', L: 'c', c: 'c', C: 'c', f: 'h', F: 'h', h: 'h', H: 'h' };
      function kd(e) { var k = KEYS[e.key]; if (!k || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return; e.preventDefault(); if (k === 'l' || k === 'r') { if (held[k]) return; held[k] = 1; send(); } else if (!e.repeat) { var ed = {}; ed[k] = 1; send(ed); } }
      function ku(e) { var k = KEYS[e.key]; if (k === 'l' || k === 'r') { held[k] = 0; send(); } }
      function blur() { held.l = held.r = 0; send(); }
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
      Array.prototype.forEach.call(pad.querySelectorAll('.pb'), function (b) {
        var k = b.getAttribute('data-k'), hold = b.getAttribute('data-hold') === '1';
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} b.classList.add('on'); if (hold) { held[k] = 1; send(); } else { var ed = {}; ed[k] = 1; send(ed); } });
        function up() { b.classList.remove('on'); if (hold) { held[k] = 0; send(); } }
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      });
      keepT = setInterval(function () { send(); }, 1000);   // tells the server you are still here

      // ---- connection: WebSocket first, plain polling if that fails ----
      function startPolling() {
        if (poll || dead) return; wsFailed = true; var busy = false;
        poll = setInterval(function () { if (busy || dead) return; busy = true; o.api('/api/duel/' + o.id + '/state').then(function (s) { busy = false; if (s && s.s) onSnap(s); }); }, 80);
      }
      try {
        var proto = location.protocol === 'https:' ? 'wss:' : 'ws:'; ws = new WebSocket(proto + '//' + location.host + '/ws/duel/' + o.id);
        ws.onmessage = function (m) { try { onSnap(JSON.parse(m.data)); } catch (e) {} };
        ws.onclose = ws.onerror = function () { if (!dead && !finished) { ws = null; startPolling(); } };
        setTimeout(function () { if (!gotMsg && !dead) { try { ws && ws.close(); } catch (e) {} ws = null; startPolling(); } }, 3000);
      } catch (e) { startPolling(); }

      // ---- smooth motion: draw a little in the past, between two server snapshots, so jitter never shows ----
      var DELAY = 95;
      function sample(now) {
        if (!buf.length) return null;
        var rt = now - DELAY, a = null, b = null, i;
        for (i = buf.length - 1; i >= 0; i--) { if (buf[i].t <= rt) { a = buf[i]; b = buf[i + 1] || null; break; } }
        if (!a) return { s: buf[0].s, f: 0, a: buf[0].s };
        if (!b) return { s: a.s, f: 0, a: a.s, still: true };
        return { s: b.s, a: a.s, f: Math.max(0, Math.min(1, (rt - a.t) / Math.max(1, b.t - a.t))) };
      }
      function lerp(a, b, t) { return a + (b - a) * t; }
      function frame(now) {
        if (dead) return; raf = requestAnimationFrame(frame);
        var dt = Math.min(.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
        var c = ctx, k = cv.width / W; c.setTransform(k, 0, 0, k, 0, 0);
        var sm = sample(now), tm = now, camT = now / 1000;
        var sx = 0, sy = 0; if (shake > 0) { shake = Math.max(0, shake - dt); sx = (Math.random() - .5) * 30 * shake; sy = (Math.random() - .5) * 18 * shake; }
        var cm = makeCam(Math.sin(camT * .35) * 50 + sx, 205 + sy, 690, 0, 96, 0, 790, W / 2, H * .52);
        sceneBack(c, cm, tm, camT);
        if (!sm) { c.fillStyle = '#ece7d6'; c.font = '600 30px Cinzel, Georgia, serif'; c.textAlign = 'center'; c.fillText('Connecting...', W / 2, H / 2); return; }
        var cur = sm.s, A = sm.a, f = sm.f, me = cur.you, faces = [], tags = [];
        sceneSolids(faces, cm);
        var order = cur.p.map(function (p, i) { return i; });
        cur.p.forEach(function (p, i) {
          var q = A.p[i] || p, jump = Math.abs(q.x - p.x) > 260, x = jump ? p.x : lerp(q.x, p.x, f), y = jump ? p.y : lerp(q.y, p.y, f);
          var mv = Math.abs(p.x - q.x) > .6 && p.hp > 0, w = walk[i] || (walk[i] = { ph: 0 }); if (mv) w.ph += dt * 13;
          var team = p.tm, slot = 0; for (var j = 0; j < i; j++) if (cur.p[j].tm === team) slot++;
          var z = ((slot % 4) - 1.5) * 26 + (team ? 10 : -10), X = x - 480, Y = GROUND - y;
          var look = pl[i] ? pl[i].look : null, dead = p.hp <= 0, st = { a: p.a, hl: p.hl, hu: p.hu, moving: mv, air: y < GROUND - 3, walk: w.ph };
          w.fall = dead ? Math.min(1, (w.fall || 0) + dt * 4) : 0;
          // ground shadow + team ring
          var sh = cm.p(X, 0, z), col = TEAM[team].col;
          if (sh) { c.save(); c.translate(sh[0], sh[1]); c.scale(1, .28); c.fillStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.arc(0, 0, 24 * sh[3], 0, 7); c.fill(); c.strokeStyle = col; c.globalAlpha = i === me ? .95 : .55; c.lineWidth = i === me ? 6 : 4; c.beginPath(); c.arc(0, 0, 31 * sh[3], 0, 7); c.stroke(); c.restore(); }
          if (p.iv && !p.hu && Math.floor(tm / 70) % 2) return;
          if (p.ds) { for (var g = 1; g < 4; g++) { var gp = cm.p(X - p.f * g * 26, Y + 28, z); if (gp) { c.globalAlpha = .2 / g; c.fillStyle = col; c.beginPath(); c.ellipse(gp[0], gp[1], 13 * gp[3], 26 * gp[3], 0, 0, 7); c.fill(); c.globalAlpha = 1; } } }
          knight(faces, cm, { X: X, Y: Y, Z: z, f: p.f, fall: w.fall * 1.45 }, look, st, tm);
          if (!dead) { var hp = cm.p(X, Y + 92, z); if (hp) tags.push({ x: hp[0], y: hp[1], i: i, col: col, p: p, me: i === me }); }
          if (p.hl) { var rp = cm.p(X, Y + 30, z); if (rp) { c.globalAlpha = .6; c.strokeStyle = '#8fd6ea'; c.lineWidth = 3; c.beginPath(); c.arc(rp[0], rp[1], (20 + p.hl * 24) * rp[3] * 1.4, 0, 7); c.stroke(); c.globalAlpha = 1; } }
        });
        drawFaces(c, faces);
        // spells
        cur.pr.forEach(function (q) { var pp = cm.p(q.x - 480, GROUND - q.y, 0); if (!pp) return; var r = 26 * pp[3] * 1.5, gr = c.createRadialGradient(pp[0], pp[1], 2, pp[0], pp[1], r); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, TEAM[q.tm || 0].col); gr.addColorStop(1, 'rgba(143,214,234,0)'); c.fillStyle = gr; c.beginPath(); c.arc(pp[0], pp[1], r, 0, 7); c.fill(); });
        // particles (3D points)
        for (var i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.t += dt; if (q.t > q.life) { parts.splice(i, 1); continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vy -= 500 * dt; var pp2 = cm.p(q.x, q.y, q.z); if (!pp2) continue; c.globalAlpha = 1 - q.t / q.life; c.fillStyle = q.c; var sz = Math.max(2, 5 * pp2[3]); c.fillRect(pp2[0] - sz / 2, pp2[1] - sz / 2, sz, sz); } c.globalAlpha = 1;
        // name tags
        c.textAlign = 'center'; c.font = '600 13px Cinzel, Georgia, serif';
        tags.forEach(function (t) { var nm = (pl[t.i] ? pl[t.i].name : '?'); if (nm.length > 12) nm = nm.slice(0, 11) + '…'; c.fillStyle = 'rgba(8,12,24,.65)'; var w = c.measureText(nm).width + 12; c.fillRect(t.x - w / 2, t.y - 14, w, 18); c.fillStyle = t.col; c.fillText(nm, t.x, t.y); if (t.me) { c.fillStyle = '#ece7d6'; c.fillText('▼', t.x, t.y - 17); } });
        hud(c, cur, me);
        if (cur.s === 'countdown') { c.textAlign = 'center'; c.font = '700 110px Cinzel, Georgia, serif'; c.fillStyle = 'rgba(236,231,214,.92)'; c.fillText(cur.cd > 0 ? String(cur.cd) : 'FIGHT', W / 2, H / 2 + 10); }
        if (cur.s === 'done') { c.fillStyle = 'rgba(8,12,24,.55)'; c.fillRect(0, 0, W, H); c.textAlign = 'center'; c.fillStyle = '#ece7d6'; c.font = '700 56px Cinzel, Georgia, serif'; c.fillText('FINISHED', W / 2, H / 2); }
      }
      function mask(c, x, y, full, col) { c.save(); c.translate(x, y); c.beginPath(); c.moveTo(0, -8); c.lineTo(6, -6); c.lineTo(7, 0); c.lineTo(4, 6); c.lineTo(0, 8); c.lineTo(-4, 6); c.lineTo(-7, 0); c.lineTo(-6, -6); c.closePath(); c.fillStyle = full ? '#ece7d6' : '#2b3556'; c.fill(); c.strokeStyle = col; c.lineWidth = 1.2; c.stroke(); c.restore(); }
      function hud(c, cur, me) {
        var rows = [0, 0], i;
        c.font = '600 14px Cinzel, Georgia, serif';
        for (i = 0; i < cur.p.length; i++) {
          var p = cur.p[i], t = p.tm, r = rows[t]++, x = t ? W - 20 : 20, dir = t ? -1 : 1, y = 26 + r * 27, col = TEAM[t].col, nm = pl[i] ? pl[i].name : '?'; if (nm.length > 10) nm = nm.slice(0, 9) + '…';
          c.globalAlpha = p.hp > 0 ? 1 : .4; c.fillStyle = 'rgba(8,12,24,.55)'; c.fillRect(t ? x - 252 : x, y - 14, 252, 24);
          c.textAlign = t ? 'right' : 'left'; c.fillStyle = i === me ? '#fff' : col; c.fillText(nm, x + dir * 8, y + 3);
          for (var m = 0; m < 5; m++) mask(c, x + dir * (112 + m * 17) + (t ? -8 : 8), y - 2, m < p.hp, col);
          c.fillStyle = '#16213f'; c.fillRect(t ? x - 252 + 4 : x + 164, y + 5, 80, 3); c.fillStyle = col; var w = 80 * p.so / 99; c.fillRect(t ? x - 4 - w : x + 164, y + 5, w, 3);
          c.globalAlpha = 1;
        }
        c.textAlign = 'center'; c.fillStyle = '#ece7d6'; c.font = '700 30px Cinzel, Georgia, serif'; c.fillText(cur.s === 'active' ? String(cur.t) : '', W / 2, 40);
      }
      raf = requestAnimationFrame(frame);
      return { destroy: function () { dead = true; cancelAnimationFrame(raf); clearInterval(keepT); if (poll) clearInterval(poll); try { ws && ws.close(); } catch (e) {} window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); window.removeEventListener('resize', fit); } };
    }

    fetchMeta(); metaT = setInterval(fetchMeta, 1500);
    return { destroy: function () { alive = false; stopMeta(); if (game) game.destroy(); while (root.firstChild) root.removeChild(root.firstChild); }, state: function () { return meta; } };
  }

  // ---------- character preview for the Customize page: a slowly turning knight on a plinth ----------
  function preview(cv, getLook) {
    var ctx = cv.getContext('2d'), raf = 0, dead = false, t0 = performance.now();
    function frame(now) {
      if (dead) return; raf = requestAnimationFrame(frame);
      var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 320, hh = Math.round(w * 1.15);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
      var c = ctx, k = cv.width / 300; c.setTransform(k, 0, 0, k, 0, 0);
      var g = c.createLinearGradient(0, 0, 0, 345); g.addColorStop(0, '#101a36'); g.addColorStop(1, '#0a1020'); c.fillStyle = g; c.fillRect(0, 0, 300, 345);
      var t = (now - t0) / 1000, cm = makeCam(0, 58, 250, 0, 34, 0, 330, 150, 168), faces = [], M = { X: 0, Y: 0, Z: 0, f: 1, yaw: t * .8 + .5 };
      boxOut(faces, cm, { X: 0, Y: 0, Z: 0, f: 1, yaw: 0 }, [0, -6, 0], [44, 6, 44], [52, 66, 112]);
      knight(faces, cm, M, getLook(), { a: 0, hl: 0, hu: 0, moving: false, air: false, walk: 0 }, now);
      drawFaces(c, faces);
    }
    raf = requestAnimationFrame(frame);
    return { destroy: function () { dead = true; cancelAnimationFrame(raf); } };
  }
  window.MalfoyDuel = { mount: mount, preview: preview, PAL: PAL, DEFAULT_LOOK: DEFAULT_LOOK };
})();
