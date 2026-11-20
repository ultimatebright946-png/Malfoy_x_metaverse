'use strict';
// Supervisor. `node index.js` always runs through this file:
//   1. puts the WhatsApp login + player database back from Neon if this disk does not have them (so a redeploy never logs you out)
//   2. runs the bot as a child process and starts it again whenever it stops, with a growing pause if it keeps crashing
//   3. keeps a copy of the login and database in Neon while the bot runs, and one last copy on shutdown
try { require('dotenv').config(); } catch (e) { /* optional */ }
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function dataDir() {                              // same rules as lib/store.js, without loading the database
  const want = process.env.DATA_DIR || '/var/data';
  try { fs.mkdirSync(path.join(want, 'database'), { recursive: true }); fs.accessSync(want, fs.constants.W_OK); return path.resolve(want); }
  catch (e) { if (process.env.DATA_DIR) throw e; const alt = path.resolve('./data'); fs.mkdirSync(path.join(alt, 'database'), { recursive: true }); return alt; }
}
const cloud = require('./lib/cloud').create({ dataDir: dataDir() });
const log = (...a) => console.log('[supervisor]', ...a);
let child = null, stopping = false, fails = 0;

function run() {
  const t0 = Date.now();
  child = spawn(process.execPath, [path.join(__dirname, 'index.js')], { stdio: 'inherit', env: Object.assign({}, process.env, { MALFOY_CHILD: '1' }) });
  child.on('exit', async (code, sig) => {
    child = null; if (stopping) return;
    fails = Date.now() - t0 > 60000 ? 0 : fails + 1;
    const wait = Math.min(60000, 1000 * Math.pow(2, Math.min(fails, 6)));
    log('bot stopped (' + (sig || 'code ' + code) + '). Starting it again in ' + Math.round(wait / 1000) + 's.');
    setTimeout(() => { if (!stopping) cloud.restore().then(run, run); }, wait);
  });
}
async function shutdown(sig) {
  if (stopping) return; stopping = true; log(sig + ': stopping the bot, saving a last copy.');
  const done = new Promise(res => { if (!child) return res(); child.once('exit', res); try { child.kill('SIGTERM'); } catch (e) { res(); } setTimeout(res, 8000).unref(); });
  await done; try { await cloud.flush(); } catch (e) {} process.exit(0);
}
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, () => shutdown(s)));
process.on('uncaughtException', e => log('error: ' + (e && e.stack || e)));
(async () => {
  if (cloud.enabled) log('Neon backup is ON: the WhatsApp login and player data survive redeploys.'); else log('Neon backup is OFF (set NEON_DATABASE_URL to turn it on).');
  await cloud.restore(); run(); cloud.start((parseInt(process.env.NEON_SYNC_SECONDS, 10) || 15) * 1000);
})();
