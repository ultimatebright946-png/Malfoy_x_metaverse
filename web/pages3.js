'use strict';
// Guilds, Leaderboards, Music (with a mini player that keeps playing across pages), Settings.
(function () {
  var MF = window.MF, h = MF.h, api = MF.api, state = MF.state, NF = MF.NF, V = MF.views, view = MF.view, clear = MF.clear, toast = MF.toast;

  // ---------- guilds ----------
  V.guilds = function () {
    view.appendChild(MF.head('Guilds', 'Found a guild or join one. Guild activity appears in the activity panel.')); if (MF.need()) return;
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    function done(r, okText) { toast(r.msg || (r.ok ? okText : 'That did not work.')); MF.fresh(load); }
    function load() {
      Promise.all([api('/api/guild'), api('/api/guilds')]).then(function (rs) {
        var mine = rs[0], all = rs[1]; clear(holder);
        if (mine.ok && mine.guild) {
          var g = mine.guild; var sec = h('section', { class: 'section' }, h('header', {}, h('h2', { text: '[' + g.tag + '] ' + g.name }), h('p', { class: 'muted', text: g.motto || 'No motto yet.' })));
          sec.appendChild(h('div', { class: 'grid g4' }, MF.stat('Level', g.level), MF.stat('Guild XP', NF.format(g.xp)), MF.stat('Members', g.members), MF.stat('Master', g.owner || '—')));
          var acts = h('div', { class: 'actions' }), amt = h('input', { type: 'number', min: '1', placeholder: 'Denarii to donate', 'aria-label': 'Donation' });
          acts.appendChild(amt); acts.appendChild(h('button', { class: 'btn small', type: 'button', text: 'Donate', onclick: function () { api('/api/guild/deposit', { amount: +amt.value }).then(function (r) { done(r, 'Donated'); }); } }));
          acts.appendChild(h('button', { class: 'btn small danger', type: 'button', text: 'Leave guild', onclick: function () { if (confirm('Leave ' + g.name + '?')) api('/api/guild/leave', {}).then(function (r) { done(r, 'Left'); }); } }));
          sec.appendChild(acts);
          if (mine.master) { var mt = h('input', { type: 'text', maxlength: '80', value: g.motto || '', 'aria-label': 'Motto' }); sec.appendChild(h('div', { class: 'actions' }, mt, h('button', { class: 'btn small quiet', type: 'button', text: 'Save motto', onclick: function () { api('/api/guild/motto', { motto: mt.value }).then(function (r) { done(r, 'Saved'); }); } }), h('button', { class: 'btn small quiet', type: 'button', text: g.open ? 'Close recruitment' : 'Open recruitment', onclick: function () { api('/api/guild/open', { open: !g.open }).then(function (r) { done(r, 'Updated'); }); } }))); }
          sec.appendChild(h('h3', { text: 'Top members' })); sec.appendChild(h('ul', { class: 'alist' }, g.top.map(function (t) { return h('li', {}, h('span', { text: t.name }), h('span', { class: 'muted', text: 'Lv ' + t.level })); })));
          sec.appendChild(h('h3', { text: 'Activity' })); sec.appendChild(h('ul', { class: 'alist' }, mine.activity.length ? mine.activity.slice(0, 10).map(function (e) { return h('li', {}, h('span', { text: e.text }), h('time', { text: MF.ago(e.t) })); }) : [h('li', { text: 'Quiet in the hall.' })]));
          holder.appendChild(sec);
        } else {
          var nm = h('input', { type: 'text', maxlength: '24', placeholder: 'Guild name', 'aria-label': 'Guild name' }), tg = h('input', { type: 'text', maxlength: '5', placeholder: 'TAG', 'aria-label': 'Guild tag' });
          holder.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Found a guild' }), h('p', { class: 'muted', text: 'Costs ' + NF.format(all.create || 0) + ' Denarii.' }), h('div', { class: 'formrow' }, nm, tg), h('button', { class: 'btn', type: 'button', text: 'Create guild', onclick: function () { api('/api/guild/create', { name: nm.value, tag: tg.value }).then(function (r) { done(r, 'Guild created'); }); } })));
        }
        var s2 = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'All guilds' }))); var lst = h('div', { class: 'grid g2' });
        (all.list || []).forEach(function (g) { lst.appendChild(h('div', { class: 'card' }, h('h3', { text: '[' + g.tag + '] ' + g.name }), h('p', { class: 'muted small', text: 'Level ' + g.level + ' · ' + g.members + ' members · ' + (g.open ? 'open' : 'closed') + (g.motto ? ' · ' + g.motto : '') }), g.mine ? h('span', { class: 'tag em', text: 'Your guild' }) : h('button', { class: 'btn small', type: 'button', disabled: !g.open || !!(mine.ok && mine.guild), text: 'Join', onclick: function () { api('/api/guild/join', { id: g.id }).then(function (r) { done(r, 'Joined'); }); } }))); });
        if (!all.list || !all.list.length) s2.appendChild(MF.empty('No guilds yet.')); else s2.appendChild(lst); holder.appendChild(s2);
      });
    }
    load();
  };

  // ---------- leaderboards ----------
  var lbBy = 'level';
  V.leaderboards = function () {
    view.appendChild(MF.head('Leaderboards', 'Every player from every platform, ranked together.'));
    var holder = h('div'), t = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Rank by' });
    [['level', 'Level'], ['coins', 'Denarii'], ['kills', 'Kills'], ['cards', 'Cards']].forEach(function (x) { t.appendChild(h('button', { class: 'chip', type: 'button', text: x[1], 'aria-pressed': String(lbBy === x[0]), onclick: function (e) { lbBy = x[0]; Array.prototype.forEach.call(t.children, function (c) { c.setAttribute('aria-pressed', 'false'); }); e.currentTarget.setAttribute('aria-pressed', 'true'); load(); } })); });
    view.appendChild(t); view.appendChild(holder);
    function load() { clear(holder); holder.appendChild(MF.loading()); api('/api/leaderboard?by=' + lbBy).then(function (r) { clear(holder); MF.lbList(r.list || [], lbBy, holder); }); }
    load();
  };

  // ---------- music ----------
  var P = MF.player = { audio: null, tracks: [], i: -1, ui: document.getElementById('player') };
  function ensureAudio() { if (P.audio) return P.audio; var a = new Audio(); a.preload = 'metadata'; P.audio = a; a.addEventListener('ended', function () { next(1); }); a.addEventListener('timeupdate', sync); a.addEventListener('play', sync); a.addEventListener('pause', sync); a.addEventListener('loadedmetadata', sync); return a; }
  function fmt(s) { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  var ui = {};
  function buildUI() {
    if (ui.ready) return; ui.ready = true; var box = P.ui;
    ui.title = h('div', { class: 't', text: '' }); ui.seek = h('input', { type: 'range', class: 'seek', min: '0', max: '1000', value: '0', 'aria-label': 'Seek' }); ui.time = h('span', { class: 'small muted', text: '0:00 / 0:00' });
    ui.play = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Play or pause', text: '▶' }); ui.prev = h('button', { class: 'btn small quiet', type: 'button', 'aria-label': 'Previous track', text: '⏮' }); ui.nxt = h('button', { class: 'btn small quiet', type: 'button', 'aria-label': 'Next track', text: '⏭' });
    ui.vol = h('input', { type: 'range', class: 'seek', min: '0', max: '100', value: '70', 'aria-label': 'Volume' }); ui.close = h('button', { class: 'btn small quiet', type: 'button', 'aria-label': 'Close player', text: '✕' });
    ui.play.addEventListener('click', function () { var a = ensureAudio(); if (a.paused) a.play().catch(function () { toast('Could not play this track.'); }); else a.pause(); });
    ui.prev.addEventListener('click', function () { next(-1); }); ui.nxt.addEventListener('click', function () { next(1); });
    ui.seek.addEventListener('input', function () { var a = ensureAudio(); if (a.duration) a.currentTime = a.duration * ui.seek.value / 1000; });
    ui.vol.addEventListener('input', function () { ensureAudio().volume = ui.vol.value / 100; });
    ui.close.addEventListener('click', function () { ensureAudio().pause(); box.hidden = true; });
    box.appendChild(ui.title); box.appendChild(h('div', { class: 'c' }, ui.prev, ui.play, ui.nxt, ui.time, ui.close)); box.appendChild(ui.seek); box.appendChild(h('div', { class: 'c' }, h('span', { class: 'small muted', text: 'Vol' }), ui.vol));
  }
  function sync() { var a = P.audio; if (!a || !ui.ready) return; ui.play.textContent = a.paused ? '▶' : '⏸'; if (a.duration && !ui.dragging) ui.seek.value = String(Math.round(a.currentTime / a.duration * 1000)); ui.time.textContent = fmt(a.currentTime) + ' / ' + fmt(a.duration); var t = P.tracks[P.i]; if (t) ui.title.textContent = t.title + (t.artist ? ' · ' + t.artist : ''); document.dispatchEvent(new CustomEvent('mf-track')); }
  function play(i) { var t = P.tracks[i]; if (!t) return; P.i = i; buildUI(); P.ui.hidden = false; var a = ensureAudio(); a.src = t.url; a.volume = ui.vol.value / 100; a.play().catch(function () { toast('Press play to start the music.'); }); sync(); }
  function next(d) { if (!P.tracks.length) return; play((P.i + d + P.tracks.length) % P.tracks.length); }
  V.music = function () {
    view.appendChild(MF.head('Music', 'Original tracks you can keep playing while you explore the site.'));
    var holder = h('div'); view.appendChild(holder); holder.appendChild(MF.loading());
    api('/api/music').then(function (r) {
      clear(holder); P.tracks = r.tracks || [];
      if (!P.tracks.length) return holder.appendChild(MF.empty('No tracks are installed yet. The owner can add audio files to the music folder.'));
      var ul = h('div', { class: 'grid' });
      P.tracks.forEach(function (t, i) { var b = h('button', { class: 'row', type: 'button', 'data-track': String(i), onclick: function () { if (P.i === i && P.audio && !P.audio.paused) P.audio.pause(); else if (P.i === i && P.audio) P.audio.play(); else play(i); } }, h('span', { text: '🎵' }), h('div', { class: 'nm' }, h('b', { text: t.title }), h('div', { class: 'small muted', text: (t.artist || 'Malfoy') + (t.mood ? ' · ' + t.mood : '') })), h('span', { class: 'small muted', text: t.duration ? fmt(t.duration) : '' })); b.style.textAlign = 'left'; b.style.cursor = 'pointer'; b.style.color = 'inherit'; ul.appendChild(b); });
      holder.appendChild(ul);
      holder.appendChild(h('p', { class: 'small muted', text: 'Tracks are original and bundled with the bot, or uploaded by the owner. No third-party streaming is used.' }));
    });
  };

  // ---------- private messages ----------
  V.messages = function (args) {
    if (MF.need()) return;
    var selected = String(args[0] || '').replace(/[^a-f0-9]/g, '');
    var root = h('div'); view.appendChild(MF.head('Private messages', 'One-to-one messages between Malfoy players.')); view.appendChild(root);
    var layout = h('div', { class: 'dm-layout' }), side = h('section', { class: 'card dm-list' }), chat = h('section', { class: 'card dm-chat' });
    layout.appendChild(side); layout.appendChild(chat); root.appendChild(layout);
    function open(pid) { selected = pid; drawChat(); }
    function drawList() {
      clear(side); side.appendChild(h('h2', { text: 'Inbox' }));
      var search = h('input', { type: 'search', placeholder: 'Find a player…', 'aria-label': 'Find a player' });
      var results = h('div', { class: 'dm-results' }); side.appendChild(search); side.appendChild(results);
      var timer;
      search.addEventListener('input', function () {
        clearTimeout(timer); timer = setTimeout(function () {
          if (search.value.trim().length < 2) { clear(results); return; }
          api('/api/dm/players?q=' + encodeURIComponent(search.value.trim())).then(function (r) {
            clear(results); (r.players || []).forEach(function (p) { results.appendChild(h('button', { class: 'dm-person', type: 'button', onclick: function () { open(p.pid); } }, MF.avatar(p.pfp,p.name), h('span', { text: p.name }), h('small', { text: 'Lv ' + p.level }))); });
            if (!results.children.length) results.appendChild(h('p',{class:'muted small',text:'No players found.'}));
          });
        }, 250);
      });
      var list = h('div', { class: 'dm-conversations' }); side.appendChild(h('h3',{text:'Recent chats'})); side.appendChild(list);
      api('/api/dm/conversations').then(function(r) {
        clear(list); (r.conversations||[]).forEach(function(c) {
          list.appendChild(h('button',{class:'dm-person'+(selected===c.pid?' active':''),type:'button',onclick:function(){open(c.pid);}},
            MF.avatar(c.pfp,c.name),h('span',{class:'dm-person-main'},h('b',{text:c.name}),h('small',{text:c.preview})),c.unread?h('i',{class:'dm-unread',text:String(c.unread)}):null));
        });
        if(!list.children.length) list.appendChild(h('p',{class:'muted small',text:'No private chats yet. Search for a player above to start one.'}));
      });
    }
    function drawChat() {
      var previousDraft = chat.querySelector('.dm-compose textarea'); previousDraft = previousDraft ? previousDraft.value : '';
      clear(chat);
      if (!selected) { chat.appendChild(h('div',{class:'dm-empty'},h('h2',{text:'Your private space'}),h('p',{class:'muted',text:'Choose a conversation or search for a player to start a private message.'}))); return; }
      chat.appendChild(h('div',{class:'dm-thread',text:'Loading conversation…'}));
      function load() {
        api('/api/dm/'+selected).then(function(r) {
          if(!r.ok){clear(chat);chat.appendChild(MF.empty(r.msg||'Conversation unavailable.'));return;}
          clear(chat);
          chat.appendChild(h('header',{class:'dm-header'},MF.avatar(r.player.pfp,r.player.name),h('div',{},h('b',{text:r.player.name}),h('small',{class:'muted',text:'Private conversation'}))));
          var body=h('div',{class:'dm-body'}); (r.messages||[]).forEach(function(m){
            body.appendChild(h('div',{class:'dm-bubble '+(m.mine?'mine':'')},h('p',{text:m.text}),h('time',{text:new Date(m.t).toLocaleString()})));
          });
          if(!r.messages.length) body.appendChild(h('p',{class:'muted small',text:'This is the beginning of your conversation.'}));
          chat.appendChild(body);
          var input=h('textarea',{rows:'2',maxlength:'1000',placeholder:'Write a private message…','aria-label':'Message'}); input.value=previousDraft;
          var send=h('button',{class:'btn',type:'button',text:'Send'});
          function submit(){var text=input.value.trim();if(!text)return;send.disabled=true;api('/api/dm/'+selected,{text:text}).then(function(x){send.disabled=false;if(!x.ok){toast(x.msg||'Could not send.');return;}input.value='';load();drawList();});}
          send.addEventListener('click',submit);input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}});
          chat.appendChild(h('div',{class:'dm-compose'},input,send)); body.scrollTop=body.scrollHeight;
        });
      }
      load();
    }
    drawList(); drawChat();
    var poll=setInterval(function(){if(document.hidden||!selected)return;drawChat();},12000);
    MF.state.stop=function(){clearInterval(poll);};
  };

  // ---------- settings ----------
  V.google = function (a) {
    var why = String(a[0] || ''), M = {
      linked: ['Google linked', 'You can now sign in with Google.'], ok: ['Signed in', 'Welcome back.'], off: ['Not available', 'Google sign-in is not turned on for this site.'],
      signin: ['Sign in first', 'Sign in with your WhatsApp account, then link Google from Settings.'], not_linked: ['No profile linked to this Google account', 'First sign in the normal way (WhatsApp number and password), then open Settings and choose Link my Google account.'],
      cancelled: ['Cancelled', 'Google sign-in was cancelled.'], unverified: ['Email not verified', 'Google says this email is not verified, so it cannot be used.'], banned: ['Account unavailable', 'This profile cannot sign in.'],
      taken: ['Already linked', 'This Google account is linked to a different profile.'], bad_state: ['Link expired', 'That sign-in attempt expired or came from another browser. Please try again.'], failed: ['Google sign-in failed', 'Something went wrong talking to Google. Please try again.']
    }, m = M[why] || M.failed, box = h('section', { class: 'card narrow' }, h('h2', { text: m[0] }), h('p', { class: 'muted', text: m[1] }));
    view.appendChild(box);
    if (why === 'ok' || why === 'linked') api('/api/me').then(function (r) { if (r && r.ok) { state.me = r.me; MF.renderWho(); } if (why === 'ok') location.hash = '#/'; else box.appendChild(h('a', { class: 'btn', href: '#/settings', text: 'Back to Settings' })); });
    else box.appendChild(h('a', { class: 'btn', href: '#/settings', text: why === 'not_linked' || why === 'signin' ? 'Sign in' : 'Back' }));
  };
  V.settings = function () {
    view.appendChild(MF.head('Settings', 'Your account, linked platforms and security.')); if (MF.need()) return;
    var m = state.me, link = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Linked accounts' }), h('p', { class: 'muted', text: 'Platform identities stay separate until you link them here. Codes are single use and expire in minutes. Nothing secret is ever sent through Discord.' })));
    var body = h('div'); link.appendChild(body);
    function drawLink() {
      clear(body); var lk = state.me.linked;
      body.appendChild(h('p', { text: 'This profile: ' + (state.me.platform || 'whatsapp') + (lk && lk.discord ? ' · Discord linked' : ' · no Discord linked') }));
      if (state.me.platform === 'discord') return body.appendChild(h('p', { class: 'muted', text: 'This is a Discord-origin profile. To share progress with WhatsApp, start the link from your WhatsApp or website account.' }));
      if (lk && lk.discord) body.appendChild(h('button', { class: 'btn danger', type: 'button', text: 'Unlink Discord', onclick: function () { if (confirm('Unlink Discord?')) api('/api/link/discord/unlink', {}).then(function (r) { toast(r.msg || 'Unlinked'); if (r.me) state.me = r.me; drawLink(); }); } }));
      else body.appendChild(h('button', { class: 'btn', type: 'button', text: 'Link a Discord account', onclick: function () { api('/api/link/discord/start', {}).then(function (r) { if (!r.ok) return toast(r.msg); clear(body); body.appendChild(h('p', {}, 'In Discord, run ', h('code', { text: '/link' }), ' and enter this code:')); body.appendChild(h('p', { class: 'banner', text: r.code })); body.appendChild(h('p', { class: 'small muted', text: 'Expires in ' + (r.expiresInMin || 15) + ' minutes. Do not share it.' })); body.appendChild(h('button', { class: 'btn quiet small', type: 'button', text: 'Done', onclick: function () { MF.fresh(drawLink); } })); }); } }));
    }
    drawLink(); view.appendChild(link);
    var old = h('input', { type: 'password', autocomplete: 'current-password', maxlength: '72', 'aria-label': 'Current password' }), nw = h('input', { type: 'password', autocomplete: 'new-password', maxlength: '72', 'aria-label': 'New password' });
    view.appendChild(h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Password' }), h('p', { class: 'muted', text: 'At least 8 characters.' })), h('div', { class: 'formrow' }, old, nw), h('button', { class: 'btn', type: 'button', text: 'Change password', onclick: function () { api('/api/auth/password', { old: old.value, password: nw.value }).then(function (r) { toast(r.msg || (r.ok ? 'Password changed' : 'Could not change it.')); if (r.ok) { old.value = ''; nw.value = ''; } }); } })));
    var gsec = h('section', { class: 'section' }, h('header', {}, h('h2', { text: 'Google sign-in' }), h('p', { class: 'muted', text: 'Link a Google account to sign in with one tap.' })));
    var gbody = h('div'); gsec.appendChild(gbody); view.appendChild(gsec);
    function drawGoogle() {
      clear(gbody);
      api('/api/info').then(function (r) {
        if (!r || !r.google) return gbody.appendChild(h('p', { class: 'muted', text: 'Google sign-in is not turned on for this site yet.' }));
        if (state.me.google) { gbody.appendChild(h('p', { text: 'Linked: ' + state.me.google })); gbody.appendChild(h('button', { class: 'btn danger', type: 'button', text: 'Unlink Google', onclick: function () { if (confirm('Unlink Google?')) api('/api/link/google/unlink', {}).then(function (x) { if (x.ok) { state.me = x.me; toast('Google unlinked'); drawGoogle(); } else toast(x.msg || 'Could not unlink'); }); } })); }
        else gbody.appendChild(h('a', { class: 'btn gbtn', href: '/auth/google/link', text: 'Link my Google account' }));
      });
    }
    drawGoogle();
    var wrap = h('div'); view.appendChild(wrap); MF.pages.account(); // profile editor: name, photo, gender, soulmate, DNA, sign out
  };
})();
