'use strict';
// Awakening: persistent discovery -> trial -> tier progression system. Everything is decided on the server.
// State lives on the player: u.awaken = { discovered:[pathId], path:pathId|null, stage:0..5, trial:null, history:[...], lastTrial:ms }
// All paths are fictional game mechanics: they scale the same stats the rest of the game already uses.
const db = require('./db');
const D = require('./data');

const MAX_STAGE = 5;
const TRIAL_COOLDOWN = 10 * 60000;
const HISTORY_MAX = 60;

// tier 1 = approachable, tier 3 = rare. `discover` is checked server-side against real progress.
const PATHS = {
  system: {
    id: 'system', tier: 1, icon: '🟢', name: 'System Awakening',
    blurb: 'Safe, structured evolution of your class or weapon style. Steady, reliable and open to every wanderer.',
    discover: { level: 5 },
    discoverText: 'Reach level 5.',
    scale: { dmgPct: 6, hp: 0.5, xp: 3 },
    stageNames: ['Dormant', 'Initiate', 'Adept', 'Ascendant', 'Paragon', 'Sovereign'],
    abilities: [
      { id: 'status_window', stage: 1, name: 'Status Window', kind: 'passive', text: 'See exact numbers for your power in .gear.' },
      { id: 'class_evolution', stage: 3, name: 'Class Evolution', kind: 'skill', mp: 33, cd: 3, effect: { type: 'strike', mult: 2.2 }, text: 'A refined strike for 2.2x damage.' },
      { id: 'limit_break', stage: 5, name: 'Limit Break', kind: 'skill', mp: 60, cd: 5, effect: { type: 'strike', mult: 3.6 }, text: 'Release everything for 3.6x damage.' },
    ],
  },
  heritage: {
    id: 'heritage', tier: 1, icon: '🩸', name: 'Heritage Technique',
    blurb: 'Powers passed down through a fictional lineage. Each trial unlocks another echo of your ancestors.',
    discover: { quests: 3 },
    discoverText: 'Complete 3 quests.',
    scale: { dmgPct: 5, crit: 2, soulGain: 1 },
    stageNames: ['Dormant', 'Echo', 'Kin', 'Bloodbound', 'Lineage Heir', 'Ancestor'],
    abilities: [
      { id: 'ancestral_echo', stage: 1, name: 'Ancestral Echo', kind: 'passive', text: 'Your soul fills faster as you strike.' },
      { id: 'bloodline_surge', stage: 3, name: 'Bloodline Surge', kind: 'skill', mp: 33, cd: 3, effect: { type: 'strike', mult: 1.8, heal: 8 }, text: '1.8x damage and recover 8 HP.' },
      { id: 'ancestors_verdict', stage: 5, name: "Ancestor's Verdict", kind: 'skill', mp: 66, cd: 5, effect: { type: 'strike', mult: 3.2, heal: 15 }, text: '3.2x damage and recover 15 HP.' },
    ],
  },
  truemagic: {
    id: 'truemagic', tier: 2, icon: '🔮', name: 'True Magic Breakthrough',
    blurb: 'Advanced fictional magic that follows the rules of the Imperium: soul is the price of every spell.',
    discover: { level: 15, bosses: 2 },
    discoverText: 'Reach level 15 and defeat 2 area bosses.',
    scale: { spell: 15, soul: 8, dmgPct: 2 },
    stageNames: ['Dormant', 'Spark', 'Weaver', 'Arcanist', 'Magister', 'Archmage'],
    abilities: [
      { id: 'soul_wellspring', stage: 1, name: 'Soul Wellspring', kind: 'passive', text: 'Bigger soul reserve.' },
      { id: 'arcane_burst', stage: 3, name: 'Arcane Burst', kind: 'skill', mp: 40, cd: 2, effect: { type: 'spell', mult: 2.4 }, text: 'A focused spell for 2.4x spell damage.' },
      { id: 'void_tempest', stage: 5, name: 'Void Tempest', kind: 'skill', mp: 70, cd: 4, effect: { type: 'spell', mult: 4.2 }, text: 'A storm of void for 4.2x spell damage.' },
    ],
  },
  calamity: {
    id: 'calamity', tier: 3, icon: '☄️', name: 'Calamity-Related Power',
    blurb: 'Rare abilities tied to extraordinary in-game events. Powerful, hard to earn, and costly to advance.',
    discover: { level: 25, bosses: 4, shades: 1 },
    discoverText: 'Reach level 25, defeat 4 area bosses and destroy your own Wraith once.',
    scale: { dmgPct: 9, crit: 3, spell: 10 },
    stageNames: ['Dormant', 'Omen', 'Harbinger', 'Cataclysm', 'Worldbreaker', 'Calamity'],
    abilities: [
      { id: 'omens_mark', stage: 1, name: "Omen's Mark", kind: 'passive', text: 'Critical strikes land more often.' },
      { id: 'catastrophe_mark', stage: 3, name: 'Catastrophe Mark', kind: 'skill', mp: 50, cd: 3, effect: { type: 'strike', mult: 2.8 }, text: '2.8x damage, marked by catastrophe.' },
      { id: 'world_ender', stage: 5, name: 'World Ender', kind: 'skill', mp: 80, cd: 6, effect: { type: 'strike', mult: 5 }, text: '5x damage. The world ends.' },
    ],
  },
};
const PATH_LIST = Object.keys(PATHS);

// What each stage needs. Level and Denarii grow with the path tier. A trial must be won to pass the stage.
function stageReq(path, stage) {                       // stage = the stage you are trying to reach (1..5)
  const p = PATHS[path], t = p.tier;
  return {
    level: [0, 5, 12, 20, 30, 40][stage] + (t - 1) * 3,
    geo: Math.round([0, 500, 2000, 6000, 15000, 40000][stage] * (1 + (t - 1) * 0.6)),
    bosses: stage >= 3 ? stage - 1 : 0,
    kills: stage * 15 * t,
  };
}
function trialEnemy(path, stage) {
  const p = PATHS[path], t = p.tier;
  return { n: p.stageNames[stage] + ' Trial', hp: Math.round((50 + stage * 45) * (0.85 + 0.15 * t)), atk: t >= 3 || stage >= 4 ? 3 : 2, shade: false };
}

// ---------- state ----------
function st(u) {
  const a = u.awaken || (u.awaken = {});
  a.discovered = a.discovered || []; a.history = a.history || []; if (a.stage === undefined) a.stage = 0; if (a.path === undefined) a.path = null; if (a.lastTrial === undefined) a.lastTrial = 0;
  return a;
}
function progress(u) {
  return { level: u.level, quests: (u.rpg.done || []).length, bosses: Object.keys(u.rpg.bosses || {}).length, shades: u.rpg.shadesSlain || 0, kills: u.rpg.kills || 0 };
}
function log(u, type, extra) {
  const a = st(u); a.history.push(Object.assign({ t: Date.now(), type }, extra || {}));
  if (a.history.length > HISTORY_MAX) a.history.splice(0, a.history.length - HISTORY_MAX);
}
function meets(need, pr) { return Object.keys(need).every(k => (pr[k] || 0) >= need[k]); }

// Discovery: paths reveal themselves when the real requirements are met. Idempotent.
function discover(u) {
  const a = st(u), pr = progress(u), found = [];
  PATH_LIST.forEach(id => {
    if (a.discovered.indexOf(id) > -1) return;
    if (meets(PATHS[id].discover, pr)) { a.discovered.push(id); found.push(id); log(u, 'discovered', { path: id }); }
  });
  if (found.length) db.save();
  return found;
}

function bonus(u) {
  const a = u.awaken; const out = {};
  if (!a || !a.path || !PATHS[a.path] || !(a.stage > 0)) return out;
  const sc = PATHS[a.path].scale, s = Math.min(MAX_STAGE, a.stage);
  Object.keys(sc).forEach(k => { out[k] = Math.floor(sc[k] * s * 10) / 10; });
  if (out.hp) out.hp = Math.floor(out.hp * 1);            // whole masks only
  // passive abilities
  PATHS[a.path].abilities.forEach(ab => {
    if (ab.stage > s || ab.kind !== 'passive') return;
    if (ab.id === 'ancestral_echo') out.soulGain = (out.soulGain || 0) + 2;
    if (ab.id === 'soul_wellspring') out.soul = (out.soul || 0) + 15;
    if (ab.id === 'omens_mark') out.crit = (out.crit || 0) + 5;
  });
  return out;
}
function abilities(u) {
  const a = u.awaken; if (!a || !a.path || !PATHS[a.path]) return [];
  return PATHS[a.path].abilities.filter(ab => ab.stage <= a.stage);
}

// ---------- actions ----------
function choosePath(u, id) {
  const a = st(u); id = String(id || '').toLowerCase();
  const p = PATHS[id]; if (!p) return { ok: false, msg: 'Unknown path. Paths: ' + PATH_LIST.join(', ') + '.' };
  discover(u);
  if (a.discovered.indexOf(id) === -1) return { ok: false, msg: 'You have not discovered ' + p.name + ' yet. ' + p.discoverText };
  if (a.path && a.path !== id) return { ok: false, msg: 'You already walk the ' + PATHS[a.path].name + ' path. A path cannot be changed once begun.' };
  if (a.path === id) return { ok: false, msg: 'You already walk this path.' };
  a.path = id; a.stage = 0; log(u, 'path_chosen', { path: id }); db.save();
  return { ok: true, msg: 'You begin the ' + p.name + ' path. Face its first trial to awaken.' };
}

// Runs the trial for the NEXT stage. `fight` is injectable so tests (and the website) use the same server-side combat.
function trial(u, id, fight) {
  const a = st(u); id = String(id || a.path || '').toLowerCase();
  if (!PATHS[id]) return { ok: false, msg: 'Choose a path first: ' + PATH_LIST.join(', ') + '.' };
  discover(u);
  if (a.discovered.indexOf(id) === -1) return { ok: false, msg: PATHS[id].name + ' is still hidden. ' + PATHS[id].discoverText };
  if (!a.path) { const r = choosePath(u, id); if (!r.ok) return r; }
  if (a.path !== id) return { ok: false, msg: 'You walk the ' + PATHS[a.path].name + ' path. A path cannot be changed once begun.' };
  if (a.stage >= MAX_STAGE) return { ok: false, msg: 'You have reached the final stage of this path.' };
  const now = Date.now();
  if (now - a.lastTrial < TRIAL_COOLDOWN) return { ok: false, msg: 'Your spirit is still recovering. Next trial in ' + Math.ceil((TRIAL_COOLDOWN - (now - a.lastTrial)) / 60000) + ' min.' };
  const next = a.stage + 1, req = stageReq(id, next), pr = progress(u), miss = [];
  if (u.level < req.level) miss.push('level ' + req.level + ' (you are ' + u.level + ')');
  if (pr.bosses < req.bosses) miss.push(req.bosses + ' area bosses defeated (you have ' + pr.bosses + ')');
  if (pr.kills < req.kills) miss.push(req.kills + ' total kills (you have ' + pr.kills + ')');
  if (u.coins < req.geo) miss.push(req.geo + ' Denarii (you have ' + u.coins + ')');
  if (miss.length) return { ok: false, msg: 'Requirements for ' + PATHS[id].stageNames[next] + ': ' + miss.join(', ') + '.', req };
  const R = require('./rpg'); const s = R.stats(u);
  if (R.curHp(u) < s.hp) return { ok: false, msg: 'Rest first. A trial needs full masks.' };
  db.money(u, -req.geo, 'awaken', 'Awakening trial fee: ' + PATHS[id].stageNames[next]);   // the fee is paid for entering, win or lose
  a.lastTrial = now;
  const e = trialEnemy(id, next), res = (fight || R.fight)(u, e, true);
  u.rpg.hp = Math.max(1, res.hp);
  if (!res.won) { log(u, 'trial_failed', { path: id, stage: next }); db.save(); return { ok: true, won: false, msg: 'You fell in the ' + e.n + '. The fee is spent, but the path remains open. Rest and try again in 10 minutes.', res, stage: a.stage }; }
  a.stage = next; log(u, 'stage_reached', { path: id, stage: next });
  const unlocked = PATHS[id].abilities.filter(ab => ab.stage === next);
  const g = R.gainXp(u, 100 * next * PATHS[id].tier);
  db.save();
  return { ok: true, won: true, msg: 'Trial passed! You are now *' + PATHS[id].stageNames[next] + '* (stage ' + next + '/' + MAX_STAGE + ').', stage: next, unlocked, xp: g.gain, ups: g.ups, res };
}

function view(u) {
  const a = st(u); discover(u);
  const b = bonus(u), pr = progress(u);
  return {
    maxStage: MAX_STAGE, path: a.path, stage: a.stage, stageName: a.path ? PATHS[a.path].stageNames[a.stage] : null, cooldownMs: Math.max(0, TRIAL_COOLDOWN - (Date.now() - a.lastTrial)),
    bonus: b, abilities: abilities(u).map(x => ({ id: x.id, name: x.name, kind: x.kind, text: x.text, mp: x.mp || 0, cd: x.cd || 0 })),
    history: a.history.slice(-15).reverse(),
    progress: pr,
    paths: PATH_LIST.map(id => {
      const p = PATHS[id], disc = a.discovered.indexOf(id) > -1, active = a.path === id;
      const next = active && a.stage < MAX_STAGE ? stageReq(id, a.stage + 1) : null;
      return { id, name: p.name, tier: p.tier, icon: p.icon, discovered: disc, active, locked: !!a.path && !active, blurb: disc ? p.blurb : '???', hint: disc ? null : p.discoverText, stageNames: disc ? p.stageNames : null, scale: disc ? p.scale : null, abilities: disc ? p.abilities.map(x => ({ id: x.id, name: x.name, stage: x.stage, kind: x.kind, text: x.text })) : null, next };
    }),
  };
}
const bar = (n, of) => '▰'.repeat(n) + '▱'.repeat(Math.max(0, of - n));
// the display block requested for the menu and the status screen
function banner(u) {
  const a = u && u.awaken, on = a && a.path && a.stage > 0;
  const cells = bar(on ? Math.round(a.stage / MAX_STAGE * 8) : 0, 8);
  return '⬤ 🟢 ᴀᴡᴀᴋᴇɴɪɴɢ | sᴛᴀᴛ sᴄᴀʟᴇ ⬤\n' + cells + '\n' + (on ? '☫ ' + PATHS[a.path].name + ' — ' + PATHS[a.path].stageNames[a.stage] + '\n☫ ᴛʜᴇ ᴘᴀᴛʜ ʙᴇɢɪɴs ᴛᴏ ʀᴇsᴘᴏɴᴅ.' : '☫ ʏᴏᴜʀ ᴘᴏᴛᴇɴᴛɪᴀʟ sʟᴇᴇᴘs ᴅᴏʀᴍᴀɴᴛ...\n☫ ᴅɪsᴄᴏᴠᴇʀ ʏᴏᴜʀ ᴛʀᴜᴇ ᴘᴀᴛʜ.');
}

module.exports = { PATHS, PATH_LIST, MAX_STAGE, TRIAL_COOLDOWN, stageReq, trialEnemy, discover, choosePath, trial, bonus, abilities, view, banner, progress };
