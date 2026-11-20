'use strict';
// Character creator, Awakening, Skills, Inventory (cards + gear), Quests, Dungeons, Boss battles. All numbers come from the server.
(function () {
  var MF = window.MF, h = MF.h, api = MF.api, state = MF.state, NF = MF.NF, V = MF.views, view = MF.view, clear = MF.clear, toast = MF.toast;
  function msg(r, ok) { toast(r.msg || (r.ok ? ok : 'That did not work.')); }
  function tabs(items, cur, on) { var t = h('div', { class: 'tabs', role: 'group' }); items.forEach(function (i) { var b = h('button', { class: 'chip', type: 'button', text: i[1], 'aria-pressed': String(cur === i[0]), onclick: function () { on(i[0]); } }); t.appendChild(b); }); return t; }

  // ---------- character ----------
  var FIELDS = ['body', 'face', 'hair', 'clothes', 'armor', 'accessory', 'weapon'], COLS = ['hairColor', 'eyeColor', 'skin'], NICE = { body: 'Body', face: 'Face', hair: 'Hair', clothes: 'Clothes', armor: 'Armor', accessory: 'Accessory', weapon: 'Weapon', hairColor: 'Hair colour', eyeColor: 'Eye colour', skin: 'Skin tone' };
  V.character = function () {
    view.appendChild(MF.head('Character', 'Design your hero. Your choices are saved to your profile and shown everywhere.')); if (MF.need()) return;
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    api('/api/creator').then(function (r) {
      clear(holder); if (!r.ok) return holder.appendChild(MF.empty(r.msg || 'Could not load the creator.'));
      var O = r.options, saved = r.char, d = {}; var base = Object.assign({}, O.default, { name: r.name });
      Object.keys(base).forEach(function (k) { d[k] = saved && saved[k] !== undefined ? saved[k] : base[k]; });
      if (saved && saved.colors) COLS.forEach(function (c) { var i = O.colors[c].indexOf(saved.colors[c]); d[c] = i > -1 ? i : saved.colors[c]; });
      var stage = h('div', { class: 'stage' }), two = h('div', { class: 'two' }), form = h('div', { class: 'card' }), info = h('p', { class: 'muted small' });
      function colors() { var o = {}; COLS.forEach(function (c) { o[c] = typeof d[c] === 'string' ? d[c] : O.colors[c][d[c]]; }); return o; }
      function draw() { clear(stage); stage.appendChild(MFART.avatar(Object.assign({}, d, { colors: colors() }))); info.textContent = d.name + ' · ' + d.cls + (saved ? '' : ' · not saved yet'); }
      var nm = h('input', { type: 'text', maxlength: '24', value: d.name, 'aria-label': 'Character name' }); nm.addEventListener('input', function () { d.name = nm.value; draw(); });
      form.appendChild(h('div', { class: 'opt' }, h('label', { text: 'Name' }), nm));
      var cls = h('select', { 'aria-label': 'Class' }); O.classes.forEach(function (c) { var o = h('option', { value: c, text: c }); if (c === d.cls) o.selected = true; cls.appendChild(o); }); cls.addEventListener('change', function () { d.cls = cls.value; draw(); });
      form.appendChild(h('div', { class: 'opt' }, h('label', { text: 'Class' }), cls));
      var selects = {};
      FIELDS.forEach(function (f) { var s = h('select', { 'aria-label': NICE[f] }); O.choices[f].forEach(function (t, i) { var o = h('option', { value: String(i), text: t }); if (i === d[f]) o.selected = true; s.appendChild(o); }); s.addEventListener('change', function () { d[f] = +s.value; draw(); }); selects[f] = s; form.appendChild(h('div', { class: 'opt' }, h('label', { text: NICE[f] }), s)); });
      COLS.forEach(function (c) {
        var row = h('div', { class: 'swatches', role: 'group', 'aria-label': NICE[c] });
        O.colors[c].forEach(function (hex, i) { var b = h('button', { class: 'swatch', type: 'button', 'aria-label': NICE[c] + ' ' + (i + 1), 'aria-pressed': String(d[c] === i) }); b.style.background = hex; b.addEventListener('click', function () { d[c] = i; Array.prototype.forEach.call(row.children, function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); draw(); }); row.appendChild(b); });
        form.appendChild(h('div', { class: 'opt' }, h('label', { text: NICE[c] }), row));
      });
      var save = h('button', { class: 'btn', type: 'button', text: 'Save character', onclick: function () {
        save.disabled = true; var body = Object.assign({}, d); api('/api/creator', body).then(function (x) { save.disabled = false; if (x.ok) { saved = x.char || {}; if (x.me) { state.me = x.me; MF.renderWho(); } toast('Character saved'); draw(); } else toast(x.msg || 'Could not save.'); });
      } });
      var rnd = h('button', { class: 'btn quiet', type: 'button', text: 'Randomize', onclick: function () { FIELDS.forEach(function (f) { d[f] = Math.floor(Math.random() * O.choices[f].length); selects[f].value = String(d[f]); }); COLS.forEach(function (c) { d[c] = Math.floor(Math.random() * O.colors[c].length); }); draw(); } });
      var rst = h('button', { class: 'btn quiet', type: 'button', text: 'Reset', onclick: function () { route(); function route() { MF.route(); } } });
      form.appendChild(h('div', { class: 'actions' }, save, rnd, rst));
      two.appendChild(h('div', {}, stage, info)); two.appendChild(form); holder.appendChild(two); draw();
    });
  };

  // ---------- awakening ----------
  V.awakening = function () {
    view.appendChild(MF.head('Awakening', 'Four paths of power. Discover them, choose one and pass its trials.')); if (MF.need()) return;
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    function load() {
      api('/api/awaken').then(function (r) {
        clear(holder); if (!r.ok) return holder.appendChild(MF.empty(r.msg || 'Could not load.'));
        holder.appendChild(h('pre', { class: 'banner', text: r.banner }));
        var pr = r.progress; holder.appendChild(h('p', { class: 'muted small', text: 'Level ' + pr.level + ' · ' + pr.quests + ' quests · ' + pr.bosses + ' bosses · ' + pr.shades + ' shades slain' + (r.cooldownMs ? ' · next trial in ' + Math.ceil(r.cooldownMs / 60000) + ' min' : '') }));
        var g = h('div', { class: 'grid g2' });
        r.paths.forEach(function (p) {
          var el = h('section', { class: 'card path' + (p.active ? ' active' : '') + (p.discovered ? '' : ' locked') });
          el.appendChild(h('h3', {}, h('span', { text: p.icon + ' ' + (p.discovered ? p.name : 'Hidden path') }), h('span', { class: 'tag', text: 'Tier ' + p.tier })));
          if (!p.discovered) { el.appendChild(h('p', { class: 'muted', text: p.hint || 'Keep playing to reveal this path.' })); g.appendChild(el); return; }
          el.appendChild(h('p', { class: 'muted', text: p.blurb }));
          if (p.stageNames) { var st = h('div', { class: 'stages' }); p.stageNames.forEach(function (n, i) { if (i === 0) return; st.appendChild(h('span', { class: 'stagedot' + (p.active && r.stage >= i ? ' done' : ''), text: i + '. ' + n })); }); el.appendChild(st); }
          if (p.scale) el.appendChild(h('p', { class: 'small muted', text: 'Per stage: +' + p.scale.dmgPct + '% damage, +' + p.scale.hp + ' HP, +' + p.scale.xp + '% XP' }));
          var acts = h('div', { class: 'actions' });
          if (!r.path) acts.appendChild(h('button', { class: 'btn', type: 'button', text: 'Choose this path', onclick: function () { if (!confirm('Choose ' + p.name + '? Choosing a path is permanent.')) return; api('/api/awaken/choose', { path: p.id }).then(function (x) { msg(x, 'Path chosen'); load(); }); } }));
          else if (p.active) acts.appendChild(h('button', { class: 'btn vio', type: 'button', disabled: r.stage >= r.maxStage || r.cooldownMs > 0, text: r.stage >= r.maxStage ? 'Fully awakened' : 'Take the next trial', onclick: function (e) { e.currentTarget.disabled = true; api('/api/awaken/trial', { path: p.id }).then(function (x) { msg(x, x.won ? 'Trial passed' : 'Trial failed'); if (x.me) { state.me = x.me; MF.renderWho(); } load(); }); } }));
          el.appendChild(acts); g.appendChild(el);
        });
        holder.appendChild(g);
        if (r.history.length) holder.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'History' })), h('ul', { class: 'alist' }, r.history.slice(-8).reverse().map(function (e) { return h('li', {}, h('span', { text: String(e.type).replace(/_/g, ' ') + (e.path ? ' (' + e.path + ')' : '') }), h('time', { text: MF.ago(e.t) })); }))));
      });
    }
    load();
  };

  // ---------- skills ----------
  V.skills = function () {
    view.appendChild(MF.head('Skills', 'Battle skills and the abilities your awakening path grants.')); if (MF.need()) return;
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    Promise.all([api('/api/awaken'), api('/api/gear')]).then(function (rs) {
      var a = rs[0], g = rs[1]; clear(holder);
      holder.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Core skills' })), h('div', { class: 'grid g2' },
        h('div', { class: 'card' }, h('h3', { text: 'Focus' }), h('p', { class: 'muted', text: 'Heal one mask (10 HP) for ' + (g.ok ? g.stats.focusCost : '?') + ' soul.' })),
        h('div', { class: 'card' }, h('h3', { text: 'Spirit Bolt' }), h('p', { class: 'muted', text: 'Cast a soul spell (' + (g.ok ? '+' + g.stats.spell + '% spell power' : '') + ').' })))));
      var abil = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Awakening abilities' })));
      var act = a.ok && a.paths.filter(function (p) { return p.active; })[0];
      if (!act) abil.appendChild(MF.empty('Choose an awakening path to unlock abilities.', h('a', { class: 'btn', href: '#/awakening', text: 'Open Awakening' })));
      else { var gr = h('div', { class: 'grid g2' }); act.abilities.forEach(function (ab) { var on = a.stage >= ab.stage; gr.appendChild(h('div', { class: 'card path' + (on ? ' active' : ' locked') }, h('h3', { text: ab.name }), h('p', { class: 'muted', text: ab.text }), h('span', { class: 'tag', text: (on ? 'Unlocked' : 'Stage ' + ab.stage) + ' · ' + ab.kind }))); }); abil.appendChild(gr); }
      holder.appendChild(abil);
      if (a.ok && Object.keys(a.bonus).length) holder.appendChild(h('p', { class: 'muted', text: 'Active bonuses: ' + Object.keys(a.bonus).map(function (k) { return '+' + a.bonus[k] + ' ' + k; }).join(', ') }));
    });
  };

  // ---------- inventory ----------
  var invTab = 'cards';
  V.inventory = function () {
    view.appendChild(MF.head('Inventory', 'Your cards, gear and charms.', h('a', { class: 'btn quiet', href: '#/shop', text: 'Shop' }))); if (MF.need()) return;
    var holder = h('div'), t = tabs([['cards', 'Cards'], ['gear', 'Gear & charms'], ['trades', 'Trades']], invTab, function (k) { invTab = k; MF.route(); });
    view.appendChild(t); view.appendChild(holder); holder.appendChild(MF.loading());
    if (invTab === 'gear') return gearTab(holder); if (invTab === 'trades') return tradesTab(holder); cardsTab(holder);
  };
  function gearTab(holder) {
    api('/api/gear').then(function (g) {
      clear(holder); if (!g.ok) return holder.appendChild(MF.empty(g.msg || 'Could not load gear.'));
      var s = g.stats; holder.appendChild(h('div', { class: 'grid g4' }, MF.stat('Masks', s.masks), MF.stat('Damage', s.damage || s.dmg), MF.stat('Crit', s.crit + '%'), MF.stat('Soul', s.soul), MF.stat('XP bonus', '+' + s.xpBonus + '%'), MF.stat('Denarii bonus', '+' + s.geoBonus + '%'), MF.stat('Weapon', g.weapon || 'None'), MF.stat('Armor', g.armor || 'None')));
      var sec = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Charms' }), h('p', { class: 'muted', text: 'Notches ' + g.notches.used + ' / ' + g.notches.max })));
      if (!g.charms.length) sec.appendChild(MF.empty('No charms yet. Buy some in the shop.', h('a', { class: 'btn', href: '#/shop', text: 'Open shop' })));
      else { var ul = h('div', { class: 'grid' }); g.charms.forEach(function (c) { ul.appendChild(h('div', { class: 'row' }, h('div', {}, h('b', { text: c.name }), h('div', { class: 'small muted', text: c.desc || '' })), h('button', { class: 'btn small quiet', type: 'button', text: c.equipped ? 'Unequip' : 'Equip', onclick: function () { api(c.equipped ? '/api/charm/unequip' : '/api/charm/equip', { id: c.id }).then(function (x) { msg(x, 'Done'); MF.route(); }); } }))); }); sec.appendChild(ul); }
      holder.appendChild(sec);
      if (g.items && g.items.length) holder.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Items' })), h('ul', { class: 'alist' }, g.items.map(function (i) { return h('li', {}, h('span', { text: (i.emoji || '') + ' ' + i.name }), h('span', { class: 'muted', text: '×' + (i.qty || 1) })); }))));
    });
  }
  function cardsTab(holder) {
    api('/api/cards').then(function (r) {
      clear(holder); if (!r.ok) return holder.appendChild(MF.empty(r.msg || 'Could not load cards.'));
      var s = r.stats, sel = {}, selCount = 0;
      holder.appendChild(h('div', { class: 'grid g4' }, MF.stat('Cards', s.total), MF.stat('Unique', s.unique + ' / ' + s.catalog), MF.stat('Completion', s.completion + '%'), MF.stat('Score', s.score)));
      var act = h('div', { class: 'actions' });
      act.appendChild(h('button', { class: 'btn', type: 'button', text: 'Daily card', onclick: function () { api('/api/cards/daily', {}).then(function (x) { msg(x, 'Card received'); MF.route(); }); } }));
      Object.keys(r.packTypes).forEach(function (k) { var p = r.packTypes[k]; act.appendChild(h('button', { class: 'btn quiet', type: 'button', text: 'Buy ' + p.name + ' (' + (p.geo ? NF.format(p.geo) + ' Denarii' : p.gems + ' gems') + ')', onclick: function () { api('/api/cards/buy', { type: k }).then(function (x) { msg(x, 'Bought'); MF.route(); }); } })); if (r.packs && r.packs[k]) act.appendChild(h('button', { class: 'btn vio', type: 'button', text: 'Open ' + p.name + ' ×' + r.packs[k], onclick: function () { api('/api/cards/open', { type: k }).then(function (x) { if (x.ok) toast('Opened: ' + (x.cards || []).map(function (c) { return c.card ? c.card.name : c.name; }).join(', ')); else msg(x); MF.route(); }); } })); });
      holder.appendChild(act);
      if (!r.cards.length) return holder.appendChild(MF.empty('You do not own any cards yet. Claim your daily card, buy a pack, or watch for card spawns in WhatsApp and Discord chats.'));
      var fuse = h('button', { class: 'btn quiet small', type: 'button', disabled: true, text: 'Fuse 3 selected', onclick: function () { api('/api/cards/fusion', { ids: Object.keys(sel) }).then(function (x) { msg(x, 'Fused'); MF.route(); }); } });
      holder.appendChild(h('p', { class: 'small muted' }, 'Tap cards to select. Select three of the same rarity to fuse. Click ⭐ to favourite. ', fuse));
      var grid = h('div', { class: 'cardgrid' }); holder.appendChild(grid);
      r.cards.forEach(function (c) {
        var t = h('button', { class: 'cardtile', type: 'button', 'aria-label': c.rarityName + ' ' + c.name + ', id ' + c.iid }, MFART.cardArt(c), c.fav ? h('span', { class: 'fav', text: '⭐' }) : null);
        t.addEventListener('click', function () { if (sel[c.iid]) { delete sel[c.iid]; t.classList.remove('sel'); } else { sel[c.iid] = 1; t.classList.add('sel'); } selCount = Object.keys(sel).length; fuse.disabled = selCount !== 3; detail(c); });
        grid.appendChild(t);
      });
      var det = h('section', { class: 'card', hidden: true }); holder.appendChild(det);
      function detail(c) {
        det.hidden = false; clear(det); det.appendChild(h('h3', { text: c.name + ' · ' + c.rarityName })); det.appendChild(h('p', { class: 'muted', text: c.element + ' · power ' + c.power + ' · level ' + c.lvl + ' · id ' + c.iid + ' — ' + c.lore }));
        det.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn small quiet', type: 'button', text: c.fav ? 'Unfavourite' : 'Favourite', onclick: function () { api('/api/cards/favorite', { id: c.iid }).then(function (x) { msg(x, 'Done'); MF.route(); }); } }), h('button', { class: 'btn small', type: 'button', text: 'Upgrade (uses a spare copy)', onclick: function () { api('/api/cards/upgrade', { id: c.iid }).then(function (x) { msg(x, 'Upgraded'); MF.route(); }); } })));
      }
    });
  }
  function tradesTab(holder) {
    api('/api/cards/offers').then(function (r) {
      clear(holder); function list(title, arr, mine) { var s = h('section', { class: 'section' }, h('header', {}, h('h2', { text: title }))); if (!arr.length) s.appendChild(MF.empty('None.')); arr.forEach(function (o) { var names = function (a) { return a.map(function (x) { return x.name; }).join(', ') || 'nothing'; }; s.appendChild(h('div', { class: 'row' }, h('div', {}, h('b', { text: names(o.give) + ' ⇄ ' + names(o.want) }), h('div', { class: 'small muted', text: (mine ? 'to ' + o.toName : 'from ' + o.fromName) })), mine ? h('button', { class: 'btn small danger', type: 'button', text: 'Cancel', onclick: function () { api('/api/cards/decline', { oid: o.oid }).then(function (x) { msg(x); MF.route(); }); } }) : h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', text: 'Accept', onclick: function () { api('/api/cards/accept', { oid: o.oid }).then(function (x) { msg(x); MF.route(); }); } }), h('button', { class: 'btn small danger', type: 'button', text: 'Decline', onclick: function () { api('/api/cards/decline', { oid: o.oid }).then(function (x) { msg(x); MF.route(); }); } })))); }); holder.appendChild(s); }
      list('Incoming offers', r.incoming || [], false); list('Your offers', r.outgoing || [], true);
      var to = h('input', { type: 'text', placeholder: 'Player name', 'aria-label': 'Player' }), gv = h('input', { type: 'text', placeholder: 'Your card ids, e.g. K1,K2', 'aria-label': 'Your card ids' }), wt = h('input', { type: 'text', placeholder: 'Their card ids (optional)', 'aria-label': 'Their card ids' });
      holder.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Make an offer' }), h('div', { class: 'formrow' }, to, gv, wt), h('button', { class: 'btn', type: 'button', text: 'Send offer', onclick: function () { var sp = function (v) { return v.value.split(/[,\s]+/).filter(Boolean); }; api('/api/cards/offer', { to: to.value, give: sp(gv), want: sp(wt) }).then(function (x) { msg(x, 'Offer sent'); MF.route(); }); } })));
    });
  }

  // ---------- quests ----------
  V.quests = function () {
    view.appendChild(MF.head('Quests', 'Accept contracts, track progress and earn Denarii and XP.')); if (MF.need()) return;
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    api('/api/quests').then(function (r) {
      clear(holder); if (!r.ok) return holder.appendChild(MF.empty(r.msg || 'Could not load quests.'));
      function q(x, mode) { return h('div', { class: 'card' }, h('div', { class: 'actions' }, h('h3', { text: x.name }), h('span', { class: 'tag', text: x.zone })), h('p', { class: 'muted', text: x.desc }), MF.bar(x.have, x.need, '', 'Quest progress'), h('p', { class: 'small muted', text: x.have + ' / ' + x.need + ' · reward ' + NF.format(x.geo) + ' Denarii, ' + NF.format(x.xp) + ' XP' + (mode === 'locked' ? ' · needs level ' + x.needLevel : '') }),
        mode === 'avail' ? h('button', { class: 'btn small', type: 'button', disabled: r.active.length >= r.max, text: 'Accept', onclick: function () { api('/api/quests/accept', { id: x.id }).then(function (z) { msg(z, 'Accepted'); MF.route(); }); } }) : mode === 'active' ? h('button', { class: 'btn small danger', type: 'button', text: 'Abandon', onclick: function () { api('/api/quests/abandon', { id: x.id }).then(function (z) { msg(z, 'Abandoned'); MF.route(); }); } }) : null); }
      function sec(t, arr, mode, empty) { var s = h('section', { class: 'section' }, h('header', {}, h('h2', { text: t }))); if (!arr.length) s.appendChild(MF.empty(empty)); else { var g = h('div', { class: 'grid g2' }); arr.forEach(function (x) { g.appendChild(q(x, mode)); }); s.appendChild(g); } holder.appendChild(s); }
      sec('Active (' + r.active.length + ' / ' + r.max + ')', r.active, 'active', 'No active quests. Accept one below.'); sec('Available', r.available, 'avail', 'Nothing available right now.'); sec('Locked', r.locked, 'locked', 'Nothing locked.');
      if (r.done.length) holder.appendChild(h('p', { class: 'muted', text: 'Completed: ' + r.done.length + ' of ' + r.total }));
    });
  };

  // ---------- dungeons ----------
  V.dungeons = function () {
    view.appendChild(MF.head('Dungeons', 'Travel between the zones of the Imperium.')); if (MF.need()) return;
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    function load() {
      api('/api/world').then(function (r) {
        clear(holder); if (!r.ok) return holder.appendChild(MF.empty('Could not load the world.'));
        var g = h('div', { class: 'grid g2' });
        r.zones.forEach(function (z) {
          var el = h('div', { class: 'card path' + (z.here ? ' active' : '') + (z.unlocked ? '' : ' locked') });
          el.appendChild(h('h3', {}, h('span', { text: z.emoji + ' ' + z.name }), h('span', { class: 'tag', text: 'Lv ' + z.level + '+' })));
          if (z.enemies.length) el.appendChild(h('p', { class: 'small muted', text: 'Enemies: ' + z.enemies.join(', ') }));
          if (z.boss) el.appendChild(h('p', { class: 'small', text: '👑 Boss: ' + z.boss.name + ' (' + z.boss.hp + ' HP, beaten ' + z.boss.beaten + '×)' }));
          el.appendChild(z.here ? h('span', { class: 'tag em', text: 'You are here' }) : h('button', { class: 'btn small', type: 'button', disabled: !z.unlocked, text: z.unlocked ? 'Travel' : 'Locked', onclick: function () { api('/api/travel', { zone: z.id }).then(function (x) { msg(x, 'Travelled'); MF.fresh(load); }); } }));
          g.appendChild(el);
        });
        holder.appendChild(g);
        holder.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', text: 'Rest at a campfire', onclick: function () { api('/api/rest', {}).then(function (x) { msg(x, 'Rested'); MF.fresh(); }); } }), h('a', { class: 'btn', href: '#/boss', text: 'Boss battle here' })));
      });
    }
    load();
  };

  // ---------- boss battles ----------
  function bossView(s) {
    var wrap = h('div', { class: 'arena' }), logb = h('div', { class: 'blog', 'aria-live': 'polite' }), acts = h('div', { class: 'acts' });
    function pct(v) { return Math.max(0, v); }
    wrap.appendChild(h('div', { class: 'fighters' },
      h('div', { class: 'fcard boss' }, h('b', { text: '👑 ' + s.boss.name }), MF.bar(pct(s.boss.hp), s.boss.max, 'boss', 'Boss HP'), h('span', { class: 'small muted', text: 'HP ' + pct(s.boss.hp) + ' / ' + s.boss.max + (s.boss.intent ? ' · intends to ' + s.boss.intent : '') })),
      h('div', { class: 'fcard' }, h('b', { text: s.player.name + (s.player.guard ? ' 🛡️' : '') }), MF.bar(pct(s.player.hp), s.player.max, 'hp', 'Your HP'), h('span', { class: 'small muted', text: 'HP ' + pct(s.player.hp) + ' / ' + s.player.max }), MF.bar(s.player.mp, s.player.maxMp, 'mp', 'Your MP'), h('span', { class: 'small muted', text: 'MP ' + s.player.mp + ' / ' + s.player.maxMp + ' · attack ' + s.player.attack }))));
    s.log.forEach(function (l) { logb.appendChild(h('div', { text: typeof l === 'string' ? l : l.m })); }); wrap.appendChild(logb); setTimeout(function () { logb.scrollTop = logb.scrollHeight; }, 0);
    if (s.status === 'active') {
      acts.appendChild(h('button', { class: 'btn', type: 'button', 'data-act': 'attack', text: '🗡️ Attack' })); acts.appendChild(h('button', { class: 'btn quiet', type: 'button', 'data-act': 'defend', text: '🛡️ Defend' }));
      s.skills.forEach(function (k) { acts.appendChild(h('button', { class: 'btn vio', type: 'button', 'data-act': 'skill', 'data-skill': k.id, disabled: !k.ready, title: k.text, text: '✨ ' + k.name + ' (' + k.mp + ')' + (k.wait ? ' · ' + k.wait + 't' : '') })); });
      acts.appendChild(h('button', { class: 'btn danger', type: 'button', 'data-act': 'flee', text: '🏃 Flee' })); wrap.appendChild(acts);
    } else {
      var res = s.result || {}; wrap.appendChild(h('section', { class: 'card path ' + (s.status === 'won' ? 'active' : '') }, h('h2', { text: s.status === 'won' ? 'Victory!' : s.status === 'lost' ? 'Defeated' : s.status === 'fled' ? 'You fled' : 'Battle over' }), res.geo != null ? h('p', { text: 'Rewards: +' + NF.format(res.geo) + ' Denarii, +' + NF.format(res.xp) + ' XP' + (res.levelUps ? ' · level up!' : '') + (res.charm ? ' · new charm: ' + res.charm : '') + (res.unlocked ? ' · unlocked ' + res.unlocked : '') }) : res.lostGeo != null ? h('p', { class: 'muted', text: 'Your Wraith holds ' + NF.format(res.lostGeo) + ' Denarii where you fell. Rest and recover it.' }) : h('p', { class: 'muted', text: 'No rewards this time.' }), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/boss', text: 'Back to boss battles' }), h('a', { class: 'btn quiet', href: '#/inventory', text: 'Inventory' }))));
    }
    return wrap;
  }
  V.boss = function (a) {
    view.appendChild(MF.head('Boss Battles', 'Server-validated turn-based fights. Your stats and rewards cannot be edited from the browser.')); if (MF.need()) return;
    var id = a[0] && /^[a-f0-9]{16}$/.test(a[0]) ? a[0] : null, holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    function render(s) {
      clear(holder); var el = bossView(s); holder.appendChild(el);
      Array.prototype.forEach.call(el.querySelectorAll('[data-act]'), function (b) { b.addEventListener('click', function () { Array.prototype.forEach.call(el.querySelectorAll('[data-act]'), function (x) { x.disabled = true; }); api('/api/battle/' + s.id + '/act', { action: b.getAttribute('data-act'), skill: b.getAttribute('data-skill') || '' }).then(function (r) { if (r.ok) { if (r.me) { state.me = r.me; MF.renderWho(); MF.loadActivity && MF.loadActivity(); } render(r.view); } else { toast(r.msg || 'That action failed.'); load(); } }); }); });
    }
    function load() {
      if (id) return api('/api/battle/' + id).then(function (r) { if (r.ok) render(r.view); else { clear(holder); holder.appendChild(MF.empty(r.msg || 'This battle does not exist or is not yours.', h('a', { class: 'btn', href: '#/boss', text: 'Back' }))); } });
      api('/api/battle/current').then(function (r) {
        if (r.ok && r.view) { location.hash = '#/boss/' + r.view.id; return; }
        clear(holder); var z = state.me && state.me.zone;
        holder.appendChild(h('section', { class: 'card' }, h('h2', { text: 'Challenge the boss of ' + (z || 'your zone') }), h('p', { class: 'muted', text: 'You need full masks (use rest) and a zone with a boss. You can also start from the bot with .boss and open the link it sends.' }),
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', text: 'Start battle', onclick: function (e) { e.currentTarget.disabled = true; api('/api/battle/start', {}).then(function (x) { if (x.ok) location.hash = '#/boss/' + x.id; else { toast(x.msg || 'Cannot start.'); e.currentTarget.disabled = false; } }); } }), h('button', { class: 'btn quiet', type: 'button', text: 'Rest first', onclick: function () { api('/api/rest', {}).then(function (x) { msg(x, 'Rested'); MF.fresh(); }); } }), h('a', { class: 'btn quiet', href: '#/dungeons', text: 'Change zone' }))));
      });
    }
    load();
  };
})();
