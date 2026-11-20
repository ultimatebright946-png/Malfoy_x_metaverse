'use strict';
// Original vector art for cards and characters (no third-party assets). Everything is built with createElementNS, so there is no innerHTML.
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); }); return e;
  }
  function txt(str, attrs) { var t = s('text', attrs); t.textContent = str; return t; }
  var uid = 0;
  // 100x100 symbol paths, drawn in the card centre
  var SYM = {
    crow: 'M14 60 C30 40 44 38 58 44 L74 30 L70 48 C80 54 86 62 90 74 C74 66 62 66 52 70 C44 80 30 78 22 72 Z',
    moon: 'M62 14 C38 18 26 40 34 62 C42 82 66 88 84 74 C60 78 46 60 52 40 C54 30 58 22 62 14 Z',
    blade: 'M50 8 L58 60 L50 70 L42 60 Z M36 70 L64 70 L64 76 L36 76 Z M46 76 L54 76 L54 92 L46 92 Z',
    eye: 'M8 50 C26 24 74 24 92 50 C74 76 26 76 8 50 Z M50 38 A12 12 0 1 0 50.1 38 Z',
    rune: 'M50 10 L50 90 M26 30 L50 50 L74 30 M26 70 L50 50 L74 70',
    leaf: 'M18 82 C14 40 40 16 84 14 C86 56 62 84 18 82 Z M18 82 L60 40',
    flame: 'M50 8 C58 30 78 40 74 64 C72 82 58 92 50 92 C36 92 24 80 28 62 C30 52 38 46 40 36 C46 40 48 30 50 8 Z',
    wave: 'M8 60 C22 40 34 40 46 56 C58 72 72 72 92 44 M8 80 C22 60 34 60 46 76 C58 92 72 92 92 64',
    crown: 'M12 72 L18 30 L36 52 L50 22 L64 52 L82 30 L88 72 Z M12 80 L88 80 L88 88 L12 88 Z',
    star: 'M50 8 L61 38 L92 38 L67 57 L77 88 L50 69 L23 88 L33 57 L8 38 L39 38 Z'
  };
  var LINEY = { rune: 1, wave: 1 };
  function cardArt(c, opt) {
    opt = opt || {}; var id = 'cg' + (++uid), pal = c.palette || ['#19D68A', '#0b3d2d'];
    var svg = s('svg', { viewBox: '0 0 200 280', role: 'img', 'aria-label': c.rarityName + ' card: ' + c.name + ', ' + c.element + ', power ' + c.power, class: 'cardart' + (opt.owned === false ? ' unowned' : '') });
    svg.appendChild(s('defs', {}, [
      s('linearGradient', { id: id, x1: '0', y1: '0', x2: '1', y2: '1' }, [s('stop', { offset: '0', 'stop-color': pal[0], 'stop-opacity': '.85' }), s('stop', { offset: '1', 'stop-color': pal[1] })]),
      s('radialGradient', { id: id + 'r', cx: '.5', cy: '.42', r: '.6' }, [s('stop', { offset: '0', 'stop-color': c.color, 'stop-opacity': '.45' }), s('stop', { offset: '1', 'stop-color': c.color, 'stop-opacity': '0' })])
    ]));
    svg.appendChild(s('rect', { x: 3, y: 3, width: 194, height: 274, rx: 14, fill: '#0d1114', stroke: c.color, 'stroke-width': 3 }));
    svg.appendChild(s('rect', { x: 10, y: 10, width: 180, height: 260, rx: 10, fill: 'url(#' + id + ')', opacity: '.55' }));
    svg.appendChild(s('rect', { x: 10, y: 10, width: 180, height: 260, rx: 10, fill: 'url(#' + id + 'r)' }));
    svg.appendChild(txt(c.id, { x: 20, y: 28, fill: '#cfe', 'font-size': 11, 'font-family': 'monospace', opacity: '.8' }));
    svg.appendChild(txt(c.element, { x: 180, y: 28, fill: '#cfe', 'font-size': 11, 'text-anchor': 'end', opacity: '.9' }));
    var g = s('g', { transform: 'translate(50 48) scale(1.0)' });
    var line = LINEY[c.symbol];
    g.appendChild(s('path', { d: SYM[c.symbol] || SYM.star, fill: line ? 'none' : c.color, stroke: line ? c.color : '#e8fff4', 'stroke-width': line ? 6 : 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: line ? '1' : '.92' }));
    svg.appendChild(g);
    svg.appendChild(s('rect', { x: 10, y: 178, width: 180, height: 92, fill: '#05080a', opacity: '.72' }));
    svg.appendChild(txt(c.name.length > 20 ? c.name.slice(0, 19) + '…' : c.name, { x: 100, y: 204, fill: '#fff', 'font-size': 16, 'font-weight': 700, 'text-anchor': 'middle' }));
    svg.appendChild(txt(c.rarityName, { x: 100, y: 224, fill: c.color, 'font-size': 12, 'text-anchor': 'middle', 'letter-spacing': '2' }));
    svg.appendChild(txt('PWR ' + c.power + (c.lvl ? '  ·  LV ' + c.lvl : ''), { x: 100, y: 250, fill: '#bfe', 'font-size': 13, 'text-anchor': 'middle', 'font-family': 'monospace' }));
    return svg;
  }

  // ---------- character ----------
  var CLOTH = ['#2c3a4a', '#4a2f6b', '#3b4a2c', '#6b2f3a', '#2a2f36', '#8a6b3a', '#244a44', '#6b4a6b'];
  var METAL = ['none', '#7a5a3a', '#8e99a3', '#b7c0c8', '#4a4f58', '#3a2a5a'];
  function hairShape(i, col, y0) {
    var A = { fill: col, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 }, g = s('g', {});
    function P(d) { g.appendChild(s('path', Object.assign({ d: d }, A))); }
    var cap = 'M56 ' + (y0 + 30) + ' C52 ' + (y0 - 8) + ' 148 ' + (y0 - 8) + ' 144 ' + (y0 + 30) + ' C130 ' + (y0 + 6) + ' 70 ' + (y0 + 6) + ' 56 ' + (y0 + 30) + ' Z';
    if (i === 9) return g;
    P(cap);
    if (i === 1) { P('M54 ' + (y0 + 26) + ' L50 ' + (y0 + 120) + ' L70 ' + (y0 + 104) + ' L68 ' + (y0 + 30) + ' Z'); P('M146 ' + (y0 + 26) + ' L150 ' + (y0 + 120) + ' L130 ' + (y0 + 104) + ' L132 ' + (y0 + 30) + ' Z'); }
    if (i === 2) P('M138 ' + (y0 + 10) + ' C176 ' + (y0 + 20) + ' 178 ' + (y0 + 80) + ' 160 ' + (y0 + 110) + ' C158 ' + (y0 + 70) + ' 146 ' + (y0 + 46) + ' 132 ' + (y0 + 34) + ' Z');
    if (i === 3) { P('M56 ' + (y0 + 26) + ' L46 ' + (y0 + 116) + ' L64 ' + (y0 + 116) + ' L68 ' + (y0 + 30) + ' Z'); P('M144 ' + (y0 + 26) + ' L154 ' + (y0 + 116) + ' L136 ' + (y0 + 116) + ' L132 ' + (y0 + 30) + ' Z'); }
    if (i === 4) P('M62 ' + (y0 + 8) + ' L70 ' + (y0 - 26) + ' L86 ' + (y0 - 2) + ' L100 ' + (y0 - 34) + ' L114 ' + (y0 - 2) + ' L130 ' + (y0 - 26) + ' L138 ' + (y0 + 8) + ' Z');
    if (i === 5) P('M54 ' + (y0 + 30) + ' C44 ' + (y0 + 70) + ' 56 ' + (y0 + 84) + ' 74 ' + (y0 + 80) + ' L72 ' + (y0 + 34) + ' Z M146 ' + (y0 + 30) + ' C156 ' + (y0 + 70) + ' 144 ' + (y0 + 84) + ' 126 ' + (y0 + 80) + ' L128 ' + (y0 + 34) + ' Z');
    if (i === 6) { /* undercut: short sides, taller top */ P('M70 ' + (y0 + 4) + ' C90 ' + (y0 - 22) + ' 112 ' + (y0 - 22) + ' 130 ' + (y0 + 4) + ' Z'); }
    if (i === 7) P('M56 ' + (y0 + 20) + ' C30 ' + (y0 + 24) + ' 20 ' + (y0 + 60) + ' 36 ' + (y0 + 78) + ' C40 ' + (y0 + 56) + ' 56 ' + (y0 + 40) + ' 70 ' + (y0 + 34) + ' Z');
    if (i === 8) g.appendChild(s('circle', Object.assign({ cx: 100, cy: y0 - 16, r: 16 }, A)));
    return g;
  }
  function avatar(ch, o) {
    o = o || {}; var col = ch.colors || {}, skin = col.skin || '#eec2a0', hairC = col.hairColor || '#0b0b10', eyeC = col.eyeColor || '#3f8fe0';
    var svg = s('svg', { viewBox: '0 0 200 280', role: 'img', 'aria-label': 'Character preview: ' + (ch.name || 'unnamed') + ', ' + (ch.cls || 'Knight'), class: 'charart' });
    var wide = [-6, 6, 0, 16][ch.body | 0] || 0, cloth = CLOTH[(ch.clothes | 0) % CLOTH.length], y0 = 34;
    svg.appendChild(s('ellipse', { cx: 100, cy: 266, rx: 56, ry: 8, fill: '#000', opacity: '.45' }));
    if (ch.clothes === 4) svg.appendChild(s('path', { d: 'M62 118 L40 262 L160 262 L138 118 Z', fill: '#101418' }));
    // torso
    svg.appendChild(s('path', { d: 'M' + (66 - wide) + ' 128 C' + (60 - wide) + ' 176 ' + (62 - wide / 2) + ' 232 ' + (66 - wide / 2) + ' 262 L' + (134 + wide / 2) + ' 262 C' + (138 + wide / 2) + ' 232 ' + (140 + wide) + ' 176 ' + (134 + wide) + ' 128 C120 118 80 118 ' + (66 - wide) + ' 128 Z', fill: cloth }));
    if (ch.clothes === 1 || ch.clothes === 7) svg.appendChild(s('path', { d: 'M66 190 L50 262 L150 262 L134 190 Z', fill: cloth, opacity: '.9' }));
    if (ch.clothes === 3 || ch.clothes === 6) svg.appendChild(s('path', { d: 'M100 124 L100 262', stroke: '#e8d9a8', 'stroke-width': 3 }));
    if (ch.clothes === 5) svg.appendChild(s('path', { d: 'M74 130 L126 200 M126 130 L74 200', stroke: '#e8d9a8', 'stroke-width': 5, opacity: '.8' }));
    // armor
    var mc = METAL[ch.armor | 0];
    if (mc && mc !== 'none') {
      svg.appendChild(s('path', { d: 'M72 128 C80 150 120 150 128 128 L132 196 C112 208 88 208 68 196 Z', fill: mc, stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1.5 }));
      if (ch.armor === 3 || ch.armor === 5) { svg.appendChild(s('circle', { cx: 62, cy: 134, r: 14, fill: mc })); svg.appendChild(s('circle', { cx: 138, cy: 134, r: 14, fill: mc })); }
      if (ch.armor === 4) svg.appendChild(s('path', { d: 'M82 128 L100 112 L118 128 Z', fill: mc }));
      if (ch.armor === 5) svg.appendChild(s('path', { d: 'M100 138 L100 192', stroke: '#7957D5', 'stroke-width': 3 }));
    }
    // arms
    svg.appendChild(s('rect', { x: 48 - wide / 2, y: 130, width: 16, height: 84, rx: 8, fill: cloth })); svg.appendChild(s('rect', { x: 136 + wide / 2, y: 130, width: 16, height: 84, rx: 8, fill: cloth }));
    svg.appendChild(s('circle', { cx: 56 - wide / 2, cy: 218, r: 9, fill: skin })); svg.appendChild(s('circle', { cx: 144 + wide / 2, cy: 218, r: 9, fill: skin }));
    // neck + head
    svg.appendChild(s('rect', { x: 90, y: 102, width: 20, height: 24, fill: skin }));
    if (ch.hair === 1 || ch.hair === 3 || ch.hair === 5 || ch.hair === 7) svg.appendChild(hairShape(ch.hair, hairC, y0));
    svg.appendChild(s('ellipse', { cx: 100, cy: 74, rx: 38, ry: 42, fill: skin, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1.5 }));
    if (!(ch.hair === 1 || ch.hair === 3 || ch.hair === 5 || ch.hair === 7)) svg.appendChild(hairShape(ch.hair, hairC, y0));
    else svg.appendChild(s('path', { d: 'M62 60 C80 36 120 36 138 60 C124 48 76 48 62 60 Z', fill: hairC }));
    // face
    var f = ch.face | 0, brow = [0, -5, 3, -2, 0, 2][f] || 0;
    [[84, -1], [116, 1]].forEach(function (e) {
      svg.appendChild(s('ellipse', { cx: e[0], cy: 78, rx: 8, ry: f === 3 ? 4 : 6.5, fill: '#fff' }));
      svg.appendChild(s('circle', { cx: e[0], cy: 78, r: f === 3 ? 3.4 : 4.6, fill: eyeC })); svg.appendChild(s('circle', { cx: e[0] + 1.5, cy: 76, r: 1.4, fill: '#fff' }));
      svg.appendChild(s('path', { d: 'M' + (e[0] - 10) + ' ' + (66 + brow * e[1]) + ' L' + (e[0] + 10) + ' ' + (66 - brow * e[1]), stroke: hairC, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    });
    svg.appendChild(s('path', { d: f === 5 ? 'M88 96 Q100 108 112 96' : f === 1 ? 'M90 100 L110 100' : f === 2 ? 'M90 98 Q100 104 110 98' : f === 3 ? 'M90 100 Q102 100 112 94' : 'M90 100 Q100 103 110 100', stroke: '#6b2f3a', 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round' }));
    // accessories
    var a = ch.accessory | 0;
    if (a === 1) svg.appendChild(s('path', { d: 'M74 116 C90 130 110 130 126 116 L126 128 C110 142 90 142 74 128 Z', fill: '#d94f5f' }));
    if (a === 2) { svg.appendChild(s('circle', { cx: 62, cy: 90, r: 4, fill: '#e8b13a' })); svg.appendChild(s('circle', { cx: 138, cy: 90, r: 4, fill: '#e8b13a' })); }
    if (a === 3) { svg.appendChild(s('circle', { cx: 84, cy: 78, r: 12, fill: 'none', stroke: '#ddd', 'stroke-width': 2.5 })); svg.appendChild(s('circle', { cx: 116, cy: 78, r: 12, fill: 'none', stroke: '#ddd', 'stroke-width': 2.5 })); svg.appendChild(s('path', { d: 'M96 78 L104 78', stroke: '#ddd', 'stroke-width': 2.5 })); }
    if (a === 4) svg.appendChild(s('path', { d: 'M66 36 L74 14 L88 30 L100 8 L112 30 L126 14 L134 36 Z', fill: '#e8b13a', stroke: '#8a6b1a' }));
    if (a === 5) { svg.appendChild(s('path', { d: 'M64 40 C50 24 52 10 58 4 C60 20 72 28 78 34 Z', fill: '#d9d9e4' })); svg.appendChild(s('path', { d: 'M136 40 C150 24 148 10 142 4 C140 20 128 28 122 34 Z', fill: '#d9d9e4' })); }
    if (a === 6) { svg.appendChild(s('ellipse', { cx: 116, cy: 78, rx: 12, ry: 10, fill: '#111' })); svg.appendChild(s('path', { d: 'M74 50 L126 98', stroke: '#111', 'stroke-width': 2.5 })); }
    if (a === 7) { svg.appendChild(s('path', { d: 'M158 204 L158 236', stroke: '#8a6b3a', 'stroke-width': 3 })); svg.appendChild(s('rect', { x: 148, y: 236, width: 20, height: 26, rx: 4, fill: '#19D68A', opacity: '.9' })); svg.appendChild(s('circle', { cx: 158, cy: 249, r: 20, fill: '#19D68A', opacity: '.15' })); }
    // weapon (held at the right hand)
    var w = ch.weapon | 0, W = s('g', { transform: 'translate(150 214)' }), st = { stroke: '#b9c4cc', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' };
    var wd = ['M0 0 L-4 -92 L4 -92 Z', 'M0 0 L0 -110 M-12 -26 L12 -26', 'M0 10 L0 -130 M0 -130 L-7 -108 L7 -108 Z', 'M0 10 L0 -120', 'M-4 20 C34 -40 -4 -100 -4 -120', 'M0 0 L-10 -56 M0 0 L10 -56', 'M0 12 L0 -100 M0 -100 C26 -100 26 -66 0 -66', 'M-14 -20 L14 -20 L14 14 L-14 14 Z M0 -20 L0 14'][w];
    W.appendChild(s('path', w === 0 ? { d: wd, fill: '#cfd8dc' } : Object.assign({ d: wd }, st))); if (w === 3) W.appendChild(s('circle', { cx: 0, cy: -126, r: 9, fill: '#7957D5' })); svg.appendChild(W);
    return svg;
  }
  window.MFART = { s: s, cardArt: cardArt, avatar: avatar };
})();
