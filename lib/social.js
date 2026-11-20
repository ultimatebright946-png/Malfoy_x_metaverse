'use strict';
// Social layer for the website: feed posts, likes, comments, follows/friends, notifications, public events, achievements.
// Text is stored as plain text (the website renders it with textContent, so it can never inject HTML).
const crypto = require('crypto');
const db = require('./db');

const LIM = { POST: 280, COMMENT: 200, POSTS_KEEP: 2000, EVENTS_KEEP: 150, NOTES_KEEP: 60, COMMENTS_MAX: 100, POST_MIN_GAP: 4000, POSTS_PER_DAY: 40, COMMENTS_PER_DAY: 120 };
const store = () => { const d = db.data; if (!Array.isArray(d.posts)) d.posts = []; if (!Array.isArray(d.events)) d.events = []; if (!d.follows || typeof d.follows !== 'object') d.follows = {}; if (!Array.isArray(d.reports)) d.reports = []; return d; };
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const newId = () => crypto.randomBytes(5).toString('hex');
const day = () => new Date().toISOString().slice(0, 10);
function quota(u, key, max) {
  const q = u.social || (u.social = {}); const k = key + 'Day';
  if (q[k] !== day()) { q[k] = day(); q[key + 'N'] = 0; }
  if (q[key + 'N'] >= max) return false; q[key + 'N']++; return true;
}
const W = () => require('./webcore');
const pubUser = u => u ? { name: u.name, pid: W().pid(u), pfp: W().pfpUrl(u), level: u.level } : { name: 'Unknown', pid: null, pfp: null, level: 1 };

// ---------- notifications ----------
function notify(u, kind, text, from) {
  if (!u) return; const n = u.notes || (u.notes = []);
  n.push({ id: newId(), t: Date.now(), k: kind, text: clean(text, 160), from: from ? W().pid(from) : null, read: false });
  if (n.length > LIM.NOTES_KEEP) n.splice(0, n.length - LIM.NOTES_KEEP); db.save();
}
function notes(u, markRead) { const n = (u.notes || []).slice().reverse(); const unread = n.filter(x => !x.read).length; if (markRead) { (u.notes || []).forEach(x => { x.read = true; }); db.save(); } return { unread, list: n.slice(0, 30) }; }

// ---------- public events (activity panel) ----------
function event(kind, u, text, extra) {
  const d = store(); d.events.push(Object.assign({ id: newId(), t: Date.now(), k: kind, who: u ? { name: u.name, pid: W().pid(u) } : null, text: clean(text, 140) }, extra || {}));
  if (d.events.length > LIM.EVENTS_KEEP) d.events.splice(0, d.events.length - LIM.EVENTS_KEEP); db.save();
}
const events = (n, kind) => store().events.filter(e => !kind || e.k === kind).slice(-(n || 20)).reverse();

// ---------- achievements (computed from real progress, recorded once) ----------
const ACH = [
  { id: 'first_blood', name: 'First Blood', desc: 'Defeat your first enemy.', test: u => u.rpg.kills >= 1 },
  { id: 'lvl_10', name: 'Rising Wanderer', desc: 'Reach level 10.', test: u => u.level >= 10 },
  { id: 'lvl_25', name: 'Seasoned Knight', desc: 'Reach level 25.', test: u => u.level >= 25 },
  { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat an area boss.', test: u => Object.keys(u.rpg.bosses || {}).length >= 1 },
  { id: 'quest_3', name: 'Quest Giver’s Friend', desc: 'Complete 3 quests.', test: u => (u.rpg.done || []).length >= 3 },
  { id: 'awakened', name: 'Awakened', desc: 'Reach stage 1 on an awakening path.', test: u => u.awaken && u.awaken.stage >= 1 },
  { id: 'collector', name: 'Collector', desc: 'Own 10 different cards.', test: u => require('./cards').stats(u).unique >= 10 },
  { id: 'rare_find', name: 'Rare Find', desc: 'Own a Rare or better card.', test: u => { const s = require('./cards').stats(u).byRarity; return s.rare + s.epic + s.legendary + s.mythic > 0; } },
  { id: 'guildmate', name: 'Guildmate', desc: 'Join a guild.', test: u => !!u.guildId },
  { id: 'social', name: 'Voice of the Hall', desc: 'Write a post in the community feed.', test: u => !!(u.social && u.social.postsEver) },
  { id: 'rich', name: 'Denarii Hoarder', desc: 'Hold 50,000 Denarii.', test: u => u.coins + ((u.bank && u.bank.bal) || 0) >= 50000 },
  { id: 'creator', name: 'Face of Your Own', desc: 'Create your character.', test: u => !!u.char },
];
function checkAch(u) {
  const a = u.ach || (u.ach = {}); const gained = [];
  ACH.forEach(x => { if (!a[x.id]) { let ok = false; try { ok = !!x.test(u); } catch (e) {} if (ok) { a[x.id] = Date.now(); gained.push(x); } } });
  if (gained.length) { gained.forEach(x => { notify(u, 'achievement', 'Achievement unlocked: ' + x.name, null); event('achievement', u, 'unlocked ' + x.name); }); db.save(); }
  return gained;
}
const achList = u => ACH.map(x => ({ id: x.id, name: x.name, desc: x.desc, at: (u.ach || {})[x.id] || null }));

// ---------- follows / friends ----------
const follows = u => store().follows[u.id] || (store().follows[u.id] = []);
function follow(u, t) {
  if (!t || t.id === u.id) return { ok: false, msg: 'You cannot follow yourself.' };
  const f = follows(u); if (f.indexOf(t.id) > -1) return { ok: false, msg: 'You already follow ' + t.name + '.' };
  if (f.length >= 500) return { ok: false, msg: 'You follow too many players.' };
  f.push(t.id); notify(t, 'follow', u.name + ' followed you.', u); db.save(); return { ok: true, msg: 'Following ' + t.name + '.' };
}
function unfollow(u, t) { const f = follows(u), i = t ? f.indexOf(t.id) : -1; if (i < 0) return { ok: false, msg: 'You do not follow them.' }; f.splice(i, 1); db.save(); return { ok: true, msg: 'Unfollowed.' }; }
function followersOf(u) { const d = store().follows; return Object.keys(d).filter(k => d[k].indexOf(u.id) > -1); }
function friends(u) { const mineF = follows(u); return mineF.filter(id => (store().follows[id] || []).indexOf(u.id) > -1).map(id => db.data.users[id]).filter(Boolean); }

// ---------- posts ----------
function postView(p, viewer) {
  const author = db.data.users[p.uid];
  return { id: p.id, t: p.t, text: p.text, kind: p.kind, author: pubUser(author), likes: p.likes.length, liked: !!viewer && p.likes.indexOf(viewer.id) > -1, mine: !!viewer && p.uid === viewer.id,
    comments: p.comments.slice(-3).map(c => ({ id: c.id, t: c.t, text: c.text, author: pubUser(db.data.users[c.uid]) })), commentCount: p.comments.length };
}
function post(u, text, kind) {
  if (u.banned) return { ok: false, msg: 'Your account cannot post.' };
  text = clean(text, LIM.POST); if (text.length < 1) return { ok: false, msg: 'Write something first.' };
  const now = Date.now(), s = u.social || (u.social = {});
  if (now - (s.lastPost || 0) < LIM.POST_MIN_GAP) return { ok: false, msg: 'Slow down a little.' };
  if (!quota(u, 'posts', LIM.POSTS_PER_DAY)) return { ok: false, msg: 'Daily post limit reached.' };
  s.lastPost = now; s.postsEver = (s.postsEver || 0) + 1;
  const p = { id: newId(), uid: u.id, t: now, text, kind: kind || 'post', likes: [], comments: [] };
  const d = store(); d.posts.push(p); if (d.posts.length > LIM.POSTS_KEEP) d.posts.splice(0, d.posts.length - LIM.POSTS_KEEP);
  checkAch(u); db.save(); return { ok: true, post: postView(p, u) };
}
const findPost = id => store().posts.find(p => p.id === String(id || '')) || null;
function feed(viewer, opts) {
  opts = opts || {}; const d = store(); let list = d.posts;
  if (opts.mode === 'following' && viewer) { const f = follows(viewer); list = list.filter(p => p.uid === viewer.id || f.indexOf(p.uid) > -1); }
  if (opts.uid) list = list.filter(p => p.uid === opts.uid);
  if (opts.before) list = list.filter(p => p.t < opts.before);
  return list.slice(-(opts.limit || 20)).reverse().map(p => postView(p, viewer));
}
function like(u, id) {
  const p = findPost(id); if (!p) return { ok: false, msg: 'Post not found.' };
  const i = p.likes.indexOf(u.id); if (i > -1) p.likes.splice(i, 1); else { if (p.likes.length >= 5000) return { ok: false, msg: 'Too many likes.' }; p.likes.push(u.id); if (p.uid !== u.id) notify(db.data.users[p.uid], 'like', u.name + ' liked your post.', u); }
  db.save(); return { ok: true, liked: i < 0, likes: p.likes.length };
}
function comment(u, id, text) {
  const p = findPost(id); if (!p) return { ok: false, msg: 'Post not found.' };
  text = clean(text, LIM.COMMENT); if (!text) return { ok: false, msg: 'Write a comment first.' };
  if (p.comments.length >= LIM.COMMENTS_MAX) return { ok: false, msg: 'This post has reached its comment limit.' };
  if (!quota(u, 'comments', LIM.COMMENTS_PER_DAY)) return { ok: false, msg: 'Daily comment limit reached.' };
  const c = { id: newId(), uid: u.id, t: Date.now(), text }; p.comments.push(c);
  if (p.uid !== u.id) notify(db.data.users[p.uid], 'comment', u.name + ' commented on your post.', u);
  db.save(); return { ok: true, comment: { id: c.id, t: c.t, text, author: pubUser(u) } };
}
function comments(id) { const p = findPost(id); return p ? p.comments.map(c => ({ id: c.id, t: c.t, text: c.text, author: pubUser(db.data.users[c.uid]) })) : null; }
function removePost(u, id, isOwner) {
  const d = store(), i = d.posts.findIndex(p => p.id === String(id || '')); if (i < 0) return { ok: false, msg: 'Post not found.' };
  if (d.posts[i].uid !== u.id && !isOwner) return { ok: false, msg: 'You can only delete your own posts.' };
  d.posts.splice(i, 1); db.save(); return { ok: true };
}
function report(u, id, why) {
  const p = findPost(id); if (!p) return { ok: false, msg: 'Post not found.' };
  const d = store(); if (d.reports.some(r => r.post === p.id && r.by === u.id)) return { ok: false, msg: 'You already reported this post.' };
  d.reports.push({ post: p.id, by: u.id, why: clean(why, 100), t: Date.now() }); if (d.reports.length > 500) d.reports.shift(); db.save(); return { ok: true, msg: 'Thanks, the owner has been notified.' };
}

module.exports = { LIM, notify, notes, event, events, ACH, checkAch, achList, follow, unfollow, follows, followersOf, friends, post, feed, like, comment, comments, removePost, report, pubUser, clean };
