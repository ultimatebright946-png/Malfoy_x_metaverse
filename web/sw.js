'use strict';
const CACHE='malfoy-shell-v2';
const SHELL=['/','/style.css','/app.js','/shell.js','/pages1.js','/pages2.js','/pages3.js','/game.js','/duel.js','/art.js','/console.js','/crows.js','/depth.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('malfoy-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/')) return;
 if(SHELL.includes(u.pathname)){
   e.respondWith(caches.open(CACHE).then(async c=>{
     const cached=await c.match(e.request);
     const update=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>null);
     if(cached){e.waitUntil(update);return cached;}
     return (await update)||c.match('/');
   }));
 }
});
