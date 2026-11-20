'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SCR = process.env.TEST_TMP || '/tmp/claude-0/-home-claude/77168c28-5af8-5b69-9be6-273084d73ce2/scratchpad';
fs.mkdirSync(SCR, { recursive: true });
let n = 0;
const tmpDir = (tag) => { const d = path.join(SCR, 'run-' + process.pid + '-' + (tag || 't') + '-' + (++n) + '-' + Date.now()); fs.mkdirSync(d, { recursive: true }); return d; };
// run a snippet in a fresh node process with its own DATA_DIR (the store is a per-process singleton)
function runIn(dataDir, code, env) {
  const r = cp.spawnSync(process.execPath, ['-e', code], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { DATA_DIR: dataDir, BACKUP_MINUTES: '1' }, env || {}), encoding: 'utf8' });
  const out = r.stdout.split('\n').filter(l => !/^\[store\]/.test(l)).join('\n').trim();
  return { out, err: r.stderr.trim(), code: r.status, raw: r.stdout };
}
module.exports = { SCR, tmpDir, runIn };
