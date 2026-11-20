'use strict';
// Always run under the supervisor (auto-restart + Neon login/database backup). The supervisor starts this file again as a child.
if (!process.env.MALFOY_CHILD && !process.env.MALFOY_NO_SUPERVISOR) { require('./start'); return; }
// MALFOY-MD Discord edition. Website + game API + Discord slash commands (HTTP Interactions). No WhatsApp connection.
try { require('dotenv').config(); } catch (e) { /* dotenv is optional: Render sets env vars itself */ }
const db = require('./lib/db');
['general', 'media', 'social', 'admin', 'economy', 'quest', 'web', 'guide', 'meters', 'play', 'awakening', 'cards', 'guild', 'roles', 'owner'].forEach(f => require('./commands/' + f));
if (!process.env.DISCORD_PUBLIC_KEY) console.log('[discord] DISCORD_PUBLIC_KEY is not set: the website runs, but /discord/interactions is disabled.');
const { server } = require('./lib/server').start({});
const stop = sig => { console.log('[shutdown] ' + sig); try { db.store.close(); } catch (e) {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 4000).unref(); };
process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));

process.on('uncaughtException', e => { console.log('FATAL', e && e.stack || e); process.exit(1); });
process.on('unhandledRejection', e => console.log('UNHANDLED', e && e.message || e));
