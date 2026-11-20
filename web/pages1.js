'use strict';
// Home, Discover, Community (feed + notifications), public Profile, login-by-link.
(function () {
  var MF = window.MF, h = MF.h, api = MF.api, state = MF.state, NF = MF.NF, V = MF.views, view = MF.view, clear = MF.clear, toast = MF.toast;
  var FEATS = [
    ['character', 'Character', 'Design your hero with a live preview.'], ['awakening', 'Awakening', 'Discover a path and pass its trials.'], ['boss', 'Boss Battles', 'Turn-based fights with real rewards.'],
    ['inventory', 'Inventory', 'Your cards, gear and charms.'], ['quests', 'Quests', 'Accept contracts and track progress.'], ['dungeons', 'Dungeons', 'Travel the zones of the Imperium.'],
    ['guilds', 'Guilds', 'Found or join a guild.'], ['leaderboards', 'Leaderboards', 'Levels, Denarii, kills and cards.'], ['music', 'Music', 'Listen while you play.'], ['community', 'Community', 'Post, follow and make friends.']
  ];
  function featGrid(list) { var g = h('div', { class: 'grid g3' }); list.forEach(function (f) { g.appendChild(h('a', { class: 'feat', href: '#/' + f[0] }, h('b', { text: f[1] }), h('span', { text: f[2] }))); }); return g; }
  function lbList(list, by, holder) {
    clear(holder); if (!list.length) { holder.appendChild(MF.empty('No players yet. Play on WhatsApp or Discord to take first place.')); return; }
    var box = h('div', { class: 'grid' });
    list.forEach(function (p) {
      var val = by === 'coins' ? NF.format(p.coins) + ' Denarii' : by === 'kills' ? NF.format(p.kills) + ' kills' : by === 'cards' ? NF.format(p.score) + ' pts · ' + p.cards + ' cards' : 'Level ' + p.level;
      box.appendChild(h('div', { class: 'lbrow' + (p.rank === 1 ? ' top1' : '') + (state.me && state.me.pid === p.pid ? ' mine' : '') }, h('span', { class: 'rk', text: String(p.rank) }), MF.avatar(p.pfp, p.name, 'sm'),
        h('div', { class: 'nm' }, h('a', { href: '#/profile/' + p.pid, text: p.name }), h('div', { class: 'sub', text: 'Level ' + p.level + ' · ' + NF.format(p.xp) + ' XP' })), h('span', { class: 'val', text: val })));
    });
    holder.appendChild(box);
  }
  MF.lbList = lbList;

  V.home = function () {
    var m = state.me, hero = h('section', { class: 'hero scene3d' });
    hero.appendChild(h('div', {}, h('span', { class: 'tag em', text: 'Dark-fantasy anime RPG' }), h('h1', { text: m ? 'Welcome back, ' + m.name : 'Malfoy' }),
      h('p', { class: 'lede', text: m ? 'You are ranked #' + NF.format(m.rank) + ' of ' + NF.format(m.players) + '. Pick up where you left off.' : 'Build a character, awaken a power, fight bosses, collect cards and climb the ranks. Play on WhatsApp or Discord and everything shows up here.' })));
    if (m) {
      var hud = h('div', { class: 'grid g4' });
      hud.appendChild(h('div', { class: 'stat' }, h('span', { class: 'k', text: 'Level ' + m.level }), MF.bar(m.xp, m.xpNeeded, 'xp', 'XP progress'), h('span', { class: 'small muted', text: NF.format(m.xp) + ' / ' + NF.format(m.xpNeeded) + ' XP' })));
      hud.appendChild(h('div', { class: 'stat' }, h('span', { class: 'k', text: 'HP' }), MF.bar(m.hp, m.masks, 'hp', 'HP'), h('span', { class: 'small muted', text: m.hp + ' / ' + m.masks + ' masks' })));
      hud.appendChild(h('div', { class: 'stat' }, h('span', { class: 'k', text: 'MP (soul)' }), MF.bar(m.mp, m.soul, 'mp', 'MP'), h('span', { class: 'small muted', text: m.mp + ' / ' + m.soul })));
      hud.appendChild(MF.stat('Denarii', NF.format(m.coins)));
      hero.appendChild(hud);
      if (m.court) hero.appendChild(h('p', { class: 'tag em', text: m.court.icon + ' ' + m.court.title }));
      hero.appendChild(h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/boss', text: 'Boss battle' }), h('a', { class: 'btn quiet', href: '#/quests', text: 'Quests' }), h('a', { class: 'btn quiet', href: '#/character', text: 'Character' }), h('a', { class: 'btn quiet', href: '#/community', text: 'Community' })));
    } else hero.appendChild(MF.authBox());
    hero.appendChild(h('p', { class: 'small muted' }, 'Official community: ', h('a', { href: MF.GROUP, target: '_blank', rel: 'noopener noreferrer', text: MF.GROUP })));
    view.appendChild(hero);
    var top = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Top hunters' })), MF.loading()); view.appendChild(top);
    api('/api/leaderboard?by=level').then(function (r) { var holder = h('div'); top.replaceChild(holder, top.lastChild); lbList((r.list || []).slice(0, 5), 'level', holder); top.appendChild(h('p', { class: 'small' }, h('a', { href: '#/leaderboards', text: 'Full leaderboards' }))); });
    view.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Explore the realm' })), featGrid(FEATS)));
  };

  V.login = function (a) {
    var box = h('section', { class: 'card narrow' }, h('h2', { text: 'Signing you in' }), h('p', { class: 'muted', text: 'Checking your one-time link…' })); view.appendChild(box);
    api('/api/auth/code', { code: String(a[0] || '') }).then(function (r) {
      if (r.ok) { state.me = r.me; MF.renderWho(); toast('Signed in as ' + r.me.name); location.hash = '#/'; }
      else { clear(box); box.appendChild(h('h2', { text: 'Link not valid' })); box.appendChild(h('p', { class: 'muted', text: r.msg || 'This sign-in link has expired or was already used. Ask the bot for a new one.' })); box.appendChild(h('a', { class: 'btn', href: '#/', text: 'Go to sign in' })); }
    });
  };

  V.discover = function () {
    view.appendChild(MF.head('Discover', 'Find players, guilds and ways to play.'));
    view.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Features' })), featGrid(FEATS.concat([['shop', 'Shop', 'Spend Denarii on gear.'], ['play', 'Arena', 'A 60 second action run.']]))));
    var g = h('div', { class: 'two' }), a = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Rising players' })), MF.loading()), b = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Guilds to join' })), MF.loading());
    g.appendChild(a); g.appendChild(b); view.appendChild(g);
    api('/api/leaderboard?by=level').then(function (r) { var holder = h('div'); a.replaceChild(holder, a.lastChild); lbList((r.list || []).slice(0, 6), 'level', holder); });
    api('/api/guilds').then(function (r) {
      var holder = h('div', { class: 'grid' }); b.replaceChild(holder, b.lastChild);
      if (!r.ok || !r.list.length) return holder.appendChild(MF.empty('No guilds yet.'));
      r.list.slice(0, 5).forEach(function (x) { holder.appendChild(h('div', { class: 'row' }, h('div', { style: null }, h('b', { text: '[' + x.tag + '] ' + x.name }), h('div', { class: 'small muted', text: 'Level ' + x.level + ' · ' + x.members + ' members' })), h('a', { class: 'btn small quiet', href: '#/guilds', text: 'View' }))); });
    });
    var cs = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Card rarities' }), h('p', { class: 'muted', text: 'Collect them from daily rewards, packs and spawns in chats.' })), MF.loading()); view.appendChild(cs);
    api('/api/cards/catalog').then(function (r) {
      if (!r.ok) return clear(cs), cs.appendChild(MF.empty('Sign in to see the full catalog.'));
      var box = h('div', { class: 'cardgrid' }); cs.replaceChild(box, cs.lastChild);
      var shown = {}; r.cards.forEach(function (c) { if (!shown[c.rarity]) { shown[c.rarity] = 1; box.appendChild(h('div', { class: 'cardtile' }, MFART.cardArt(c))); } });
    });
  };

  // ---------- posts ----------
  function postCard(p, reload) {
    var el = h('article', { class: 'post' }), cm = h('div', { class: 'cm', hidden: true });
    el.appendChild(h('div', { class: 'who2' }, MF.avatar(p.author.pfp, p.author.name, 'sm'), h('div', {}, h('a', { href: '#/profile/' + p.author.pid, text: p.author.name }), h('div', { class: 'small muted', text: 'Level ' + p.author.level + ' · ' + MF.ago(p.t) + ' ago' }))));
    el.appendChild(h('div', { class: 'body', text: p.text }));
    var like = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!!p.liked), text: (p.liked ? '♥ ' : '♡ ') + p.likes, onclick: function () { api('/api/post/' + p.id + '/like', {}).then(function (r) { if (r.ok) reload(); else toast(r.msg); }); } });
    var cb = h('button', { class: 'chip', type: 'button', text: '💬 ' + p.commentCount, onclick: function () { cm.hidden = !cm.hidden; if (!cm.hidden && !cm.firstChild) loadComments(); } });
    var meta = h('div', { class: 'meta' }, like, cb);
    if (p.mine) meta.appendChild(h('button', { class: 'chip', type: 'button', text: 'Delete', onclick: function () { api('/api/post/' + p.id + '/delete', {}).then(function (r) { toast(r.msg || 'Deleted'); reload(); }); } }));
    else meta.appendChild(h('button', { class: 'chip', type: 'button', text: 'Report', onclick: function () { api('/api/post/' + p.id + '/report', {}).then(function (r) { toast(r.msg || 'Reported'); }); } }));
    el.appendChild(meta); el.appendChild(cm);
    function loadComments() {
      api('/api/post/' + p.id + '/comments').then(function (r) {
        clear(cm); (r.comments || []).forEach(function (c) { cm.appendChild(h('div', {}, h('b', { text: c.author.name + ': ' }), h('span', { text: c.text }))); });
        var inp = h('input', { type: 'text', maxlength: '300', placeholder: 'Write a comment', 'aria-label': 'Comment' });
        var f = h('form', { class: 'field', onsubmit: function (e) { e.preventDefault(); api('/api/post/' + p.id + '/comment', { text: inp.value }).then(function (r2) { if (r2.ok) { inp.value = ''; loadComments(); } else toast(r2.msg); }); } }, inp, h('button', { class: 'btn small', type: 'submit', text: 'Send' }));
        cm.appendChild(f);
      });
    }
    return el;
  }
  V.community = function () {
    view.appendChild(MF.head('Community', 'Post updates, follow players and join the conversation.', h('a', { class: 'btn quiet', href: MF.GROUP, target: '_blank', rel: 'noopener noreferrer', text: 'Join the WhatsApp group' })));
    if (MF.need()) return;
    var feed = h('div'), box = h('section', { class: 'card' });
    var ta = h('textarea', { maxlength: '500', placeholder: 'Share something with the realm…', 'aria-label': 'New post' }), cnt = h('span', { class: 'small muted', text: '0 / 500' });
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length + ' / 500'; });
    box.appendChild(ta); box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', text: 'Post', onclick: function () { api('/api/post', { text: ta.value }).then(function (r) { if (r.ok) { ta.value = ''; cnt.textContent = '0 / 500'; load(); } else toast(r.msg); }); } }), cnt));
    var two = h('div', { class: 'two' }), left = h('div'), right = h('div');
    left.appendChild(box); left.appendChild(feed); two.appendChild(left); two.appendChild(right); view.appendChild(two);
    function load() { api('/api/feed').then(function (r) { clear(feed); if (!r.ok || !r.posts.length) return feed.appendChild(MF.empty('No posts yet. Be the first to write one.')); r.posts.forEach(function (p) { feed.appendChild(postCard(p, load)); }); }); }
    load();
    var nb = h('section', { class: 'card' }, h('h3', { text: 'Notifications' }), MF.loading()); right.appendChild(nb);
    api('/api/notifications?read=1').then(function (r) {
      clear(nb); nb.appendChild(h('h3', { text: 'Notifications' })); if (!r.ok || !r.list.length) nb.appendChild(h('p', { class: 'muted', text: 'Nothing yet.' }));
      var ul = h('ul', { class: 'alist' }); (r.list || []).slice(0, 12).forEach(function (n) { ul.appendChild(h('li', {}, h('span', { text: n.text }), h('time', { text: MF.ago(n.t) }))); }); nb.appendChild(ul);
      if (state.me) { state.me.unread = 0; MF.renderWho(); }
    });
    var pl = h('section', { class: 'card' }, h('h3', { text: 'Players to follow' }), MF.loading()); right.appendChild(pl);
    api('/api/leaderboard?by=level').then(function (r) {
      clear(pl); pl.appendChild(h('h3', { text: 'Players to follow' })); var ul = h('ul', { class: 'alist' });
      (r.list || []).filter(function (p) { return !state.me || p.pid !== state.me.pid; }).slice(0, 6).forEach(function (p) { ul.appendChild(h('li', {}, h('a', { href: '#/profile/' + p.pid, text: p.name }), h('button', { class: 'chip', type: 'button', text: 'Follow', onclick: function (e) { var b = e.currentTarget; api('/api/follow', { pid: p.pid }).then(function (x) { toast(x.msg); if (x.ok) { b.disabled = true; b.textContent = 'Following'; } }); } }))); });
      pl.appendChild(ul);
    });
  };

  V.profile = function (a) {
    var pid = String(a[0] || '').replace(/[^a-f0-9]/g, ''); if (!pid && state.me) pid = state.me.pid;
    if (MF.need()) return;
    var box = h('div'); view.appendChild(box); box.appendChild(MF.loading());
    function load() {
      api('/api/profile/' + pid).then(function (r) {
        clear(box); if (!r.ok) return box.appendChild(MF.empty(r.msg || 'Player not found.'));
        var p = r.profile, head = h('section', { class: 'section' }), two = h('div', { class: 'two' });
        two.appendChild(h('div', { class: 'stage' }, p.char ? MFART.avatar(p.char) : h('div', { class: 'empty' }, h('p', { text: 'No character created yet.' }))));
        var info = h('div', {}, h('div', { class: 'who2 actions' }, MF.avatar(p.pfp, p.name, 'lg'), h('div', {}, h('h1', { text: p.name }), h('p', { class: 'muted', text: (p.court ? p.court.icon + ' ' + p.court.title + ' · ' : '') + p.cls + ' · Level ' + p.level + ' · Rank #' + p.rank + (p.platform ? ' · ' + p.platform : '') }))));
        var tags = h('div', { class: 'actions' }); if (p.guild) tags.appendChild(h('span', { class: 'tag em', text: '🏰 ' + p.guild })); if (p.awaken) tags.appendChild(h('span', { class: 'tag vio', text: p.awaken.pathName || p.awaken.name || 'Awakened' }));
        info.appendChild(tags);
        info.appendChild(h('div', { class: 'grid g4' }, MF.stat('Kills', NF.format(p.kills)), MF.stat('Bosses', NF.format(p.bosses)), MF.stat('Quests', NF.format(p.quests)), MF.stat('Followers', p.followers), MF.stat('Following', p.following)));
        if (p.cards) info.appendChild(h('p', { class: 'muted', text: 'Cards: ' + p.cards.total + ' (' + p.cards.unique + ' unique)' + (p.cards.best ? ' · best: ' + p.cards.best.name : '') }));
        if (!p.isMe) info.appendChild(h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/messages/' + p.pid, text: 'Private message' }), h('button', { class: 'btn quiet', type: 'button', text: p.following_them ? 'Unfollow' : 'Follow', onclick: function () { api(p.following_them ? '/api/unfollow' : '/api/follow', { pid: p.pid }).then(function (x) { toast(x.msg); load(); }); } })));
        else info.appendChild(h('div', { class: 'actions' }, h('a', { class: 'btn quiet', href: '#/character', text: 'Edit character' }), h('a', { class: 'btn quiet', href: '#/settings', text: 'Settings' })));
        two.appendChild(info); head.appendChild(two); box.appendChild(head);
        box.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Achievements' })), (p.achievements && p.achievements.length) ? h('div', { class: 'actions' }, p.achievements.map(function (x) { return h('span', { class: 'tag', title: x.desc, text: '🏆 ' + x.name }); })) : MF.empty('No achievements yet.')));
        var ps = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Posts' }))); if (!r.posts.length) ps.appendChild(MF.empty('No posts yet.')); r.posts.forEach(function (x) { ps.appendChild(postCard(x, load)); }); box.appendChild(ps);
      });
    }
    load();
  };
})();
