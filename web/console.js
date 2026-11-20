'use strict';
// Command Console: run .menu and every bot command from the website. Output is rendered with textContent only.
(function () {
  var MF = window.MF, h = MF.h, api = MF.api, state = MF.state, V = MF.views, view = MF.view, clear = MF.clear;
  var hist = [], hi = 0, CMDS = null, NAMES = {}, SECS = [], PRE = '.';

  function rich(parent, text, run) {
    String(text).split('\n').forEach(function (ln, i, all) {
      var re = /(\*[^*\n]+\*|_[^_\n]+_|(?:^|[\s◈])[./][a-z0-9]{2,20}\b)/g, last = 0, m;
      while ((m = re.exec(ln))) {
        if (m.index > last) parent.appendChild(document.createTextNode(ln.slice(last, m.index)));
        var t = m[0];
        if (t[0] === '*') parent.appendChild(h('strong', { text: t.slice(1, -1) }));
        else if (t[0] === '_') parent.appendChild(h('em', { text: t.slice(1, -1) }));
        else {
          var lead = /^[./]/.test(t) ? '' : t[0], cmd = t.slice(lead.length + 1);
          if (NAMES[cmd]) { if (lead) parent.appendChild(document.createTextNode(lead)); parent.appendChild(h('button', { type: 'button', class: 'cmdlink', text: t.slice(lead.length), title: 'Run ' + cmd, onclick: function () { run(cmd); } })); }
          else parent.appendChild(document.createTextNode(t));
        }
        last = m.index + t.length;
      }
      if (last < ln.length) parent.appendChild(document.createTextNode(ln.slice(last)));
      if (i < all.length - 1) parent.appendChild(document.createElement('br'));
    });
  }

  V.console = function () {
    view.appendChild(MF.head('Command Console', 'Every bot command, right here. Type menu to begin. Click any command in the output to run it.')); if (MF.need()) return;
    var screen = h('div', { class: 'term3d' }), log = h('div', { class: 'termlog', role: 'log', 'aria-live': 'polite' }), chips = h('div', { class: 'termchips' });
    var input = h('input', { type: 'text', class: 'terminput', placeholder: 'menu, daily, explore, boss, creator, card …', 'aria-label': 'Command', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '300' });
    var sug = h('div', { class: 'termsug', role: 'listbox' });
    var go = h('button', { type: 'button', class: 'btn', text: 'Run' });
    screen.appendChild(h('div', { class: 'termbar' }, h('span', { class: 'dot r' }), h('span', { class: 'dot y' }), h('span', { class: 'dot g' }), h('span', { class: 'termtitle', text: 'MALFOY IMPERIUM · ROMA AETERNA' })));
    screen.appendChild(chips); screen.appendChild(log); screen.appendChild(sug);
    screen.appendChild(h('form', { class: 'termform', onsubmit: function (e) { e.preventDefault(); run(input.value); } }, h('span', { class: 'prompt', text: '⚔' }), input, go));
    view.appendChild(h('div', { class: 'termwrap' }, screen));
    var busy = false;

    function line(cls, text) { var d = h('div', { class: 'tl ' + cls }); if (cls === 'out') rich(d, text, run); else d.textContent = text; log.appendChild(d); return d; }
    function bottom() { log.scrollTop = log.scrollHeight; }
    function run(cmd) {
      cmd = String(cmd || '').trim(); if (!cmd || busy) return;
      input.value = ''; sug.textContent = ''; hist.push(cmd); hi = hist.length; busy = true; go.disabled = true;
      line('in', '⚔ ' + cmd); var wait = line('wait', '…'); bottom();
      api('/api/cmd', { line: cmd }).then(function (r) {
        wait.remove();
        (r.out || [{ type: 'text', text: r.msg || 'No response.' }]).forEach(function (o) {
          if (o.type === 'text') { if (o.text) line('out', o.text); }
          else if (o.type === 'image' && /^data:image\//.test(o.data)) { var im = h('img', { class: 'termimg', alt: o.text || 'image', src: o.data }); log.appendChild(im); if (o.text) line('out', o.text); }
          else if (o.type === 'audio' && /^data:audio\//.test(o.data)) { var a = h('audio', { controls: 'controls', src: o.data }); log.appendChild(a); }
          else if (o.text) line('out', o.text);
        });
        if (r.me) { state.me = r.me; MF.renderWho && MF.renderWho(); }
      }).catch(function () { wait.remove(); line('err', 'Could not reach the server.'); }).then(function () { busy = false; go.disabled = false; bottom(); input.focus(); });
    }
    function suggest() {
      sug.textContent = ''; var q = input.value.trim().toLowerCase().replace(/^[./]/, ''); if (!q || q.indexOf(' ') > -1 || !CMDS) return;
      CMDS.filter(function (c) { return c.name.indexOf(q) === 0; }).slice(0, 6).forEach(function (c) { sug.appendChild(h('button', { type: 'button', class: 'sugitem', role: 'option', onclick: function () { input.value = c.name + ' '; sug.textContent = ''; input.focus(); } }, h('b', { text: c.name }), h('span', { text: ' ' + (c.desc || '') }))); });
    }
    input.addEventListener('input', suggest);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); hi = Math.max(0, hi - 1); input.value = hist[hi]; }
      else if (e.key === 'ArrowDown' && hist.length) { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; }
      else if (e.key === 'Tab') { var f = sug.querySelector('.sugitem'); if (f) { e.preventDefault(); f.click(); } }
    });
    function chipRow() {
      clear(chips);
      [['menu', 'Menu'], ['daily', 'Daily'], ['explore', 'Explore'], ['boss', 'Boss'], ['rest', 'Rest'], ['creator', 'Creator'], ['awaken', 'Awaken'], ['carddaily', 'Card']].forEach(function (c) { if (NAMES[c[0]]) chips.appendChild(h('button', { type: 'button', class: 'chip', text: c[1], onclick: function () { run(c[0]); } })); });
      SECS.forEach(function (s) { chips.appendChild(h('button', { type: 'button', class: 'chip sec', text: s.icon + ' ' + s.key, title: s.title, onclick: function () { run('menu ' + s.key); } })); });
    }
    api('/api/cmds').then(function (r) {
      if (!r.ok) return line('err', r.msg || 'Could not load commands.');
      CMDS = r.cmds; PRE = r.prefix; SECS = r.sections || []; NAMES = {}; CMDS.forEach(function (c) { NAMES[c.name] = 1; c.aliases.forEach(function (a) { NAMES[a] = 1; }); });
      chipRow(); line('out', '🏛️ *MALFOY IMPERIUM*\n' + CMDS.length + ' commands ready. Type *menu* or tap a section above.'); input.focus();
    });
  };
})();
