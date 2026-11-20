'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'malfoy-roles-'));
process.env.OWNER_NUMBER = '2348000000000';
process.env.DISCORD_OWNER_IDS = '999999999999999999';
const db = require('../lib/db');
const R = require('../lib/roles');
const king = db.getUser('2348000000000@s.whatsapp.net', 'King');
const mod = db.getUser('2348111111111@s.whatsapp.net', 'Moderator');
const player = db.getUser('2348222222222@s.whatsapp.net', 'Player');

test('hierarchy defaults players to Peasant and resolves owner as King', () => {
  assert.equal(R.info(king).title, 'King');
  assert.equal(R.info(player).title, 'Peasant');
  assert.deepEqual(R.hierarchy().map(x => x.title), ['King', 'Moderator', 'Noble', 'Knight', 'Citizen', 'Peasant', 'Exiled']);
});

test('only King appoints moderators; moderators can exile and pardon ordinary players', () => {
  assert.equal(R.setModerator(mod, true, king).ok, true);
  assert.equal(R.isModerator(mod), true);
  assert.equal(R.exile(player, mod, 'test reason').ok, true);
  assert.equal(R.isExiled(player), true);
  assert.equal(R.pardon(player, mod).ok, true);
  assert.equal(R.isExiled(player), false);
  assert.equal(R.info(player).title, 'Peasant');
});

test('moderators cannot exile or pardon the King or another Moderator', () => {
  assert.equal(R.exile(king, mod, 'no').ok, false);
  assert.equal(R.exile(mod, mod, 'self').ok, false);
  assert.equal(R.exile(mod, king, 'king action').ok, true);
  assert.equal(R.pardon(mod, mod).ok, false);
  assert.equal(R.pardon(mod, king).ok, true);
  assert.equal(R.isModerator(mod), true);
});

test('King can assign court titles and warnings are recorded', () => {
  assert.equal(R.setTitle(player, 'knight', king).ok, true);
  assert.equal(R.info(player).title, 'Knight');
  assert.equal(R.warn(player, mod, 'unauthorised warning').ok, true);
  assert.equal(player.warns, 1);
  assert.equal(R.warn(player, king, 'please follow rules').ok, true);
  assert.equal(player.warns, 2);
});
