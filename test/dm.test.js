'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const H=require('./helpers');
process.env.DATA_DIR=H.tmpDir('dm');
const db=require('../lib/db'),DM=require('../lib/dm');
const a=db.getUser('1111111111@s.whatsapp.net','Alpha'),b=db.getUser('2222222222@s.whatsapp.net','Beta');
test('private messages are participant-only, saved and mark recipient messages read',()=>{
 const pid=require('../lib/webcore').pid(b);
 assert.equal(DM.messages(a,pid).messages.length,0);
 const sent=DM.send(a,pid,'hello Beta');assert.ok(sent.ok);
 const inbox=DM.conversations(b);assert.equal(inbox.length,1);assert.equal(inbox[0].unread,1);
 const got=DM.messages(b,require('../lib/webcore').pid(a));assert.equal(got.messages[0].text,'hello Beta');assert.equal(got.messages[0].mine,false);
 assert.equal(DM.conversations(b)[0].unread,0);
 assert.equal(DM.messages(a,'deadbeef').ok,false);
 assert.equal(DM.send(a,require('../lib/webcore').pid(a),'self').ok,false);
});
