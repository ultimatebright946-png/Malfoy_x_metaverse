'use strict';
// Private player-to-player messages. Stored in the shared database and only returned to thread participants.
const crypto = require('crypto');
const db = require('./db');
const W = require('./webcore');
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
const keyOf = (a,b) => [a,b].sort().join('|');
const id = () => crypto.randomBytes(8).toString('hex');
function store() { if (!db.data.dmThreads || typeof db.data.dmThreads !== 'object') db.data.dmThreads = {}; return db.data.dmThreads; }
function thread(a,b,create) { const k=keyOf(a.id,b.id), d=store(); if (!d[k] && create) d[k]={ users:[a.id,b.id], messages:[], updated:Date.now() }; return d[k] || null; }
function viewMessage(m) { const u=db.data.users[m.from]; return { id:m.id, text:m.text, t:m.t, mine:false, from:u ? { name:u.name, pid:W.pid(u), pfp:W.pfpUrl(u) } : {name:'Unknown'} }; }
function conversations(u) {
  return Object.values(store()).filter(t=>t.users.includes(u.id)).map(t=>{
    const other=db.data.users[t.users.find(x=>x!==u.id)], last=t.messages[t.messages.length-1];
    if(!other || !last) return null;
    return { pid:W.pid(other), name:other.name, pfp:W.pfpUrl(other), level:other.level, preview:last.text, t:last.t, unread:t.messages.filter(m=>m.to===u.id && !m.read).length };
  }).filter(Boolean).sort((a,b)=>b.t-a.t).slice(0,100);
}
function players(q,u) {
  q=String(q||'').trim().toLowerCase();
  if(q.length<2) return [];
  return Object.values(db.data.users).filter(x=>x.id!==u.id && !x.banned && String(x.name||'').toLowerCase().includes(q)).slice(0,15).map(x=>({pid:W.pid(x),name:x.name,pfp:W.pfpUrl(x),level:x.level}));
}
function messages(u,pid) {
  const other=W.byPid(String(pid||'').replace(/[^a-f0-9]/g,''));
  if(!other || other.id===u.id || other.banned) return {ok:false,msg:'Player not found.'};
  const t=thread(u,other,false); if(!t) return {ok:true,player:{pid:W.pid(other),name:other.name,pfp:W.pfpUrl(other)},messages:[]};
  t.messages.forEach(m=>{if(m.to===u.id)m.read=true;}); db.save();
  return {ok:true,player:{pid:W.pid(other),name:other.name,pfp:W.pfpUrl(other)},messages:t.messages.slice(-100).map(m=>Object.assign(viewMessage(m),{mine:m.from===u.id}))};
}
function send(u,pid,text) {
  const other=W.byPid(String(pid||'').replace(/[^a-f0-9]/g,''));
  if(!other || other.id===u.id || other.banned || u.banned) return {ok:false,msg:'Player not found or unavailable.'};
  text=clean(text); if(!text) return {ok:false,msg:'Write a message first.'};
  if(text.length>1000) return {ok:false,msg:'Messages are limited to 1,000 characters.'};
  const now=Date.now(), s=u.dmRate||(u.dmRate={t:0,n:0});
  if(now-s.t>60000){s.t=now;s.n=0;} if(s.n>=20)return {ok:false,msg:'Slow down. You can send 20 messages per minute.'};
  const t=thread(u,other,true); if(t.messages.length>=1000)t.messages.splice(0,100);
  const m={id:id(),from:u.id,to:other.id,text,t:now,read:false}; t.messages.push(m);t.updated=now;s.n++;db.save();
  try { require('./social').notify(other,'dm','New private message from '+u.name+'.',u); } catch(e) {}
  return {ok:true,message:Object.assign(viewMessage(m),{mine:true})};
}
module.exports={conversations,players,messages,send};
