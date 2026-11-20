'use strict';
// Publishes the slash commands to Discord. Run by hand once (and after adding commands): npm run discord:register
try { require('dotenv').config(); } catch (e) {}
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'roles', 'owner'].forEach(f => require('./commands/' + f));
require('./platforms/discord').register().then(r => console.log('Registered ' + r.count + ' slash commands (' + r.scope + ').' + (r.overflow.length ? ' Via /run: ' + r.overflow.join(', ') : '')), e => { console.error(e.message); process.exit(1); });
