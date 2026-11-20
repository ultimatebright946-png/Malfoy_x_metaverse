'use strict';
// Boots the real website + API on a random port against a throwaway, seeded database. Used by tests and the browser checks.
const H = require('./helpers');
function boot(opts) {
  opts = opts || {};
  process.env.DATA_DIR = process.env.DATA_DIR || H.tmpDir('fx'); process.env.PORT = '0'; process.env.OWNER_NUMBER = '2349000000000';
  process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'http://127.0.0.1';
  ['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'owner'].forEach(f => require('../commands/' + f));
  const db = require('../lib/db'), W = require('../lib/webcore'), C = require('../lib/cards'), S = require('../lib/social'), GL = require('../lib/guilds'), CR = require('../lib/creator');
  const mk = (n, name, lvl) => { const u = db.getUser(n + '@s.whatsapp.net', name); u.registered = true; u.level = lvl; u.coins = 20000; u.web = u.web || {}; return u; };
  const a = mk('2348000000001', 'Ashen', 12), b = mk('2348000000002', 'Briar', 8), c = mk('2348000000003', 'Cinder', 20);
  GL.create(a, 'Hollow Wardens', 'HW'); GL.join(b, 'Hollow Wardens');
  CR.save(a, { name: 'Ashen', cls: CR.CLASSES[0] });
  for (let i = 0; i < 6; i++) C.newInstance(a.id, C.CARDS[i * 5].id, 'seed');
  C.newInstance(b.id, C.CARDS[3].id, 'seed');
  S.follow(b, a); S.follow(a, b);
  S.post(a, 'First light in the Imperium. Who is diving tonight?'); S.post(b, 'Cleared the Mushroom Marshes boss without taking a hit.');
  S.notify(a, 'info', 'Welcome to the arena.', null);
  db.save();
  const { server } = require('../lib/server').start({});
  return new Promise(res => server.on('listening', () => { const port = server.address().port; res({ port, base: 'http://127.0.0.1:' + port, db, W, C, S, GL, users: { a, b, c }, cookieFor: u => 'mf_s=' + W.newSession(u.id, 'test'), close: () => server.close() }); }));
}
module.exports = { boot };
