'use strict';
// Shell: sidebar + mobile tab bar + activity panel (real data from /api/activity). Sections live in pages1-3.js.
(function () {
  var MF = window.MF, h = MF.h, api = MF.api, state = MF.state, clear = MF.clear;
  var NAV = [
    ['home', 'Home', 'M3 11l9-8 9 8v10h-6v-6H9v6H3z'], ['discover', 'Discover', 'M12 3a9 9 0 100 18 9 9 0 000-18zm3 6l-2 5-5 2 2-5z'],
    ['character', 'Character', 'M12 4a4 4 0 110 8 4 4 0 010-8zm-7 16c0-4 3-6 7-6s7 2 7 6z'], ['awakening', 'Awakening', 'M12 2l2.5 7H22l-6 4.5 2.3 7.5L12 16.5 5.7 21 8 13.5 2 9h7.5z'],
    ['skills', 'Skills', 'M13 2L4 14h6l-1 8 9-12h-6z'], ['inventory', 'Inventory', 'M4 8h16v12H4zM8 8V5h8v3'], ['quests', 'Quests', 'M6 3h12v18l-6-4-6 4z'],
    ['dungeons', 'Dungeons', 'M3 21V9l9-6 9 6v12h-6v-7H9v7z'], ['boss', 'Boss Battles', 'M12 3c5 0 8 3 8 8 0 3-1 5-3 6v4h-3v-3h-4v3H7v-4c-2-1-3-3-3-6 0-5 3-8 8-8zM9 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z'],
    ['guilds', 'Guilds', 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z'], ['leaderboards', 'Leaderboards', 'M5 21V11h4v10zm5 0V3h4v18zm5 0v-7h4v7z'],
    ['music', 'Music', 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm11-2a3 3 0 11-6 0 3 3 0 016 0z'], ['settings', 'Settings', 'M12 8a4 4 0 100 8 4 4 0 000-8zM3 13v-2l2.4-.6.8-1.8-1.3-2.1 1.4-1.4 2.1 1.3 1.8-.8L10.8 3h2l.6 2.5 1.8.8 2.1-1.3 1.4 1.4-1.3 2.1.8 1.8L21 11v2l-2.4.6-.8 1.8 1.3 2.1-1.4 1.4-2.1-1.3-1.8.8-.6 2.4h-2l-.6-2.4-1.8-.8-2.1 1.3-1.4-1.4 1.3-2.1-.8-1.8z'],
    ['community', 'Community', 'M4 5h16v11H9l-5 4z'], ['messages', 'Private DM', 'M3 5h18v14H3zM3 7l9 7 9-7']
  ];
  var MORE = [['console', 'Command Console'], ['shop', 'Shop'], ['bank', 'Bank'], ['wallet', 'Wallet'], ['play', 'Arena'], ['guide', 'Guide']];
  function icon(d) { var s = MFART.s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'ic' }); s.appendChild(MFART.s('path', { d: d, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); return s; }
  var nav = document.getElementById('nav');
  NAV.forEach(function (n) { nav.appendChild(h('a', { href: '#/' + (n[0] === 'home' ? '' : n[0]), 'data-r': n[0] }, icon(n[2]), h('span', { text: n[1] }))); });
  nav.appendChild(h('div', { class: 'navhead', text: 'More' }));
  MORE.forEach(function (n) { nav.appendChild(h('a', { href: '#/' + n[0], 'data-r': n[0], class: 'sub' }, h('span', { text: n[1] }))); });
  var tab = document.getElementById('tabbar');
  [['home', 'Home', NAV[0][2]], ['discover', 'Discover', NAV[1][2]], ['quests', 'Quests', NAV[6][2]], ['community', 'Social', NAV[13][2]], ['messages', 'DMs', NAV[14][2]]].forEach(function (n) { tab.appendChild(h('a', { href: '#/' + (n[0] === 'home' ? '' : n[0]), 'data-r': n[0] }, icon(n[2]), h('span', { text: n[1] }))); });
  var mb = h('button', { type: 'button', class: 'tabmore' }, icon('M4 6h16M4 12h16M4 18h16'), h('span', { text: 'Menu' })); mb.addEventListener('click', function () { document.body.classList.toggle('nav-open'); }); tab.appendChild(mb);
  document.getElementById('menuBtn').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  document.getElementById('scrim').addEventListener('click', function () { document.body.classList.remove('nav-open'); });

  // ---------- activity panel ----------
  var act = document.getElementById('activity'), timer = null;
  function ago(t) { var s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; }
  MF.ago = ago;
  function block(title, body) { return h('section', { class: 'ab' }, h('h3', { text: title }), body); }
  function list(items, empty, fn) { if (!items || !items.length) return h('p', { class: 'muted small', text: empty }); var ul = h('ul', { class: 'alist' }); items.slice(0, 6).forEach(function (x) { ul.appendChild(fn(x)); }); return ul; }
  function drawActivity(r) {
    clear(act);
    if (!r) { act.appendChild(h('section', { class: 'ab' }, h('h3', { text: 'Activity' }), h('p', { class: 'muted small', text: 'Sign in to see notifications, friends, guild activity and achievements.' }))); return; }
    act.appendChild(block('Notifications' + (r.notifications.unread ? ' · ' + r.notifications.unread : ''), list(r.notifications.list, 'Nothing new.', function (n) { return h('li', { class: n.read ? '' : 'unread' }, h('span', { text: n.text }), h('time', { text: ago(n.t) })); })));
    act.appendChild(block('Friends', list(r.friends, 'Follow players back to become friends.', function (f) { return h('li', {}, h('a', { href: '#/profile/' + f.pid, text: f.name }), h('span', { class: 'muted', text: 'Lv ' + f.level })); })));
    act.appendChild(block(r.guildName ? r.guildName : 'Guild', list(r.guildActivity, r.guildName ? 'Quiet in the hall.' : 'You are not in a guild. Find one in Guilds.', function (e) { return h('li', {}, h('span', { text: e.text }), h('time', { text: ago(e.t) })); })));
    act.appendChild(block('Events', list(r.events, 'No events yet.', function (e) { return h('li', {}, h('span', {}, h('a', { href: '#/profile/' + e.pid, text: e.who }), ' ' + e.text), h('time', { text: ago(e.t) })); })));
    var got = (r.achievements || []).filter(function (a) { return a.at; });
    act.appendChild(block('Achievements ' + got.length + '/' + (r.achievements || []).length, list(got.sort(function (a, b) { return b.at - a.at; }), 'None unlocked yet.', function (a) { return h('li', { title: a.desc }, h('span', { text: '🏆 ' + a.name }), h('time', { text: ago(a.at) })); })));
  }
  function loadActivity() { if (!state.me) return drawActivity(null); api('/api/activity').then(function (r) { drawActivity(r && r.ok ? r : null); }); }
  MF.loadActivity = loadActivity;
  var last = null; MF.onWho = function () { var k = state.me ? state.me.pid : ''; if (k !== last) { last = k; loadActivity(); } };
  clearInterval(timer); timer = setInterval(function () { if (!document.hidden && state.me) loadActivity(); }, 60000);

  // ---------- shared page helpers ----------
  MF.need = function () {
    if (state.me) return false;
    MF.view.appendChild(h('section', { class: 'card narrow' }, h('h2', { text: 'Sign in to continue' }), h('p', { class: 'muted', text: 'This page shows your own real progress, so it needs your account.' }), h('a', { class: 'btn', href: '#/', text: 'Go to sign in' }))); return true;
  };
  MF.head = function (title, sub, actions) { return h('header', { class: 'pagehead' }, h('div', {}, h('h1', { text: title }), sub ? h('p', { class: 'muted', text: sub }) : null), actions || null); };
  MF.bar = function (cur, max, cls, label) { var f = h('div', { class: 'bar-fill' }); f.style.width = Math.max(0, Math.min(100, max ? cur / max * 100 : 0)) + '%'; return h('div', { class: 'bar ' + (cls || ''), role: 'progressbar', 'aria-valuenow': String(Math.round(cur)), 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-label': label || '' }, f); };
  MF.stat = function (k, v) { return h('div', { class: 'stat' }, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: String(v) })); };
  MF.empty = function (t, link) { return h('div', { class: 'empty' }, h('p', { text: t }), link || null); };
  MF.loading = function () { return h('div', { class: 'skeleton', 'aria-busy': 'true' }, h('span'), h('span'), h('span')); };
  MF.fresh = function (fn) { return api('/api/me').then(function (r) { if (r.ok) { state.me = r.me; MF.renderWho(); } if (fn) fn(); }); };
})();
