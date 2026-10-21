import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBattleReplay } from '../battle-report.mjs';
import { battleReportMarkup } from '../battle-report-view.mjs';
import { buildPet } from '../catalog.mjs';
import { newBattle, resolve, finishOnClock } from '../combat.mjs';
import { exportReplay, fingerprint } from '../replay-export.mjs';
const loadout = ['market_order', 'reversal', 'touch_grass', 'pepe_breakout'];
function record({ gear = false, choices = [], xp = 17950, lineages = ['emerald_sprout', 'solar_peach'], finish = 'CONCEDED' } = {}) {
  const builds = lineages.map((lineageId, side) => buildPet({ lineageId, xp, ...(xp >= 180 ? { loadout } : {}), ...(gear && side === 0 ? { gearStats: { CON: 3, INT: 2 } } : {}) }));
  let battle = newBattle(builds);
  for (const moves of choices) battle = resolve(battle, moves);
  if (battle.status === 'playing') {
    if (finish === '180_SECOND_LIMIT') battle = finishOnClock(battle);
    else { battle.status = 'won'; battle.winner = 0; battle.reason = finish; }
  }
  return exportReplay({ battle, status: battle.status, players: builds.map(build => ({ build, pet: { name: 'PRIVATE', ownerAddress: 'PRIVATE' } })), startedAt: 1000, finishedAt: 21000 });
}

test('legacy replay reports preserve exact XP and contain no Pet identities or preview choices', async () => {
  const input = record({ choices: [['market_order', 'market_order']] }), original = structuredClone(input);
  const { report } = await analyzeBattleReplay(input);
  assert.equal(report.schemaVersion, 'AXO_ARENA_BATTLE_REPORT_V1'); assert.equal(report.exchangeCount, 1);
  assert.equal(report.fighters[0].xp, 17950); assert.equal(report.fighters[0].level, 10);
  assert.equal(report.fighters[0].attributes.every(row => row.gear === 0), true);
  assert.equal(report.durationMs, 20000); assert.deepEqual(input, original);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|ownerAddress|genesisId|appearanceSeed|previewOutfit|gearLoadout/);
});

test('gear report uses the frozen build and retains independent pre-gear, gear and entry totals', async () => {
  const input = record({ gear: true }), pending = analyzeBattleReplay(input); input.builds[0].xp = 999999;
  const { report, doc } = await pending, row = report.fighters[0].attributes.find(row => row.stat === 'CON');
  assert.deepEqual(row, { stat: 'CON', beforeGear: 10, gear: 3, total: 13 });
  assert.equal(report.fighters[0].xp, 17950); assert.equal(doc.builds[0].xp, 17950);
  assert.equal(report.fighters[0].maxHp, buildPet({ lineageId: 'emerald_sprout', xp: 17950, gearStats: { CON: 3, INT: 2 } }).maxHp);
});

test('attack and counter damage are credited to the correct fighter; blocked damage is not dealt damage', async () => {
  const { report } = await analyzeBattleReplay(record({ choices: [['market_order', 'reversal']] }));
  const [attacker, defender] = report.fighters, [a, b] = report.exchanges[0].fighters;
  assert.equal(attacker.totals.counterDamage, 0); assert.ok(defender.totals.counterDamage > 0);
  assert.equal(defender.totals.attackDamage, 0); assert.ok(defender.totals.blocked > 0);
  assert.equal(attacker.totals.damageReceived, defender.totals.counterDamage);
  assert.equal(a.damageDealt, b.damageReceived); assert.equal(b.damageDealt, a.damageReceived);
  assert.equal(attacker.peakDamage.round, 1); assert.equal(defender.peakBlock.round, 1);
});

test('healing and energy recovery reflect resolved caps rather than theoretical move amounts', async () => {
  const { report, result } = await analyzeBattleReplay(record({ choices: [['market_order', 'market_order'], ['touch_grass', 'recharge']] }));
  const healed = result.frames[0].fighters[0].hp - result.frames[1].fighters[0].hp;
  assert.equal(report.fighters[0].totals.healed, healed);
  assert.equal(report.fighters[0].totals.energySpent, 3);
  assert.equal(report.fighters[1].totals.recharges, 1); assert.equal(report.fighters[1].totals.energyRecovered, 4);
  assert.equal(report.exchanges[1].fighters[1].energyRecovered, 2);
});

test('recoil and liquidation are separate from damage dealt, with accurate no-damage peaks', async () => {
  const recoil = await analyzeBattleReplay(record({ choices: [['pepe_breakout', 'recharge']] }));
  assert.equal(recoil.report.fighters[0].totals.recoil, 6); assert.equal(recoil.report.fighters[1].totals.damageDealt, 0);
  const { report } = await analyzeBattleReplay(record({ choices: Array.from({ length: 14 }, () => ['recharge', 'recharge']) }));
  assert.equal(report.exchangeCount, 14); assert.equal(report.outcome.reason, '14_EXCHANGE_LIMIT');
  assert.equal(report.fighters[0].totals.storm, 70); assert.equal(report.fighters[0].totals.damageDealt, 0);
  assert.equal(report.fighters[0].peakDamage, null); assert.equal(report.fighters[0].peakBlock, null);
  assert.equal(report.fighters[0].totals.energyRecovered, 4);
});

test('photo-finish damage is reported before HP clamping and the final 1 HP survives', async () => {
  const { report } = await analyzeBattleReplay(record({ xp: 0, lineages: ['amethyst_dream', 'solar_peach'], choices: Array.from({ length: 6 }, () => ['market_order', 'market_order']) }));
  assert.equal(report.outcome.reason, 'PHOTO_FINISH'); assert.equal(report.fighters[1].finalHp, 1);
  assert.ok(report.fighters[0].totals.damageDealt > report.fighters[1].maxHp);
});

test('zero-exchange administrative and clock finishes invent no combat effects', async () => {
  for (const finish of ['CONCEDED', 'CHECKIN_FORFEIT', '180_SECOND_LIMIT']) {
    const { report } = await analyzeBattleReplay(record({ finish })); assert.equal(report.exchangeCount, 0);
    assert.equal(report.administrativeFinish, finish !== '180_SECOND_LIMIT');
    assert.equal(report.fighters[0].totals.damageDealt, 0); assert.equal(report.fighters[0].peakDamage, null);
    assert.equal(report.fighters[0].finalHp, report.fighters[0].maxHp);
  }
});

test('tampered fingerprint, fabricated effects, injected preview fields and unfinished records are rejected', async () => {
  for (const mutate of [doc => { doc.fingerprint = '0'.repeat(64); }, doc => { doc.exchanges[0].effects[0].damage++; doc.fingerprint = fingerprint(doc); }, doc => { doc.previewOutfit = {}; doc.fingerprint = fingerprint(doc); }]) {
    const doc = record({ choices: [['market_order', 'market_order']] }); mutate(doc); await assert.rejects(analyzeBattleReplay(doc));
  }
  const doc = record(); doc.outcome = { status: 'playing', winner: null, reason: undefined, hp: doc.outcome.hp };
  // An otherwise consistent unfinished battle is never a completed report.
  await assert.rejects(analyzeBattleReplay(doc), /completed battle/);
});

test('report rendering escapes private UI labels, distinguishes frozen stats and exposes replay-only controls', async () => {
  const { report } = await analyzeBattleReplay(record({ gear: true, choices: [['market_order', 'reversal']] }));
  const html = battleReportMarkup(report, { seat: 0, names: ['<img src=x onerror=alert(1)>', 'Pet & friend'] });
  assert.match(html, /Victory/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /17,950 exact XP/); assert.match(html, /Before gear/); assert.match(html, /Preview outfits grant no combat/);
  assert.match(html, /data-round="1"/); assert.doesNotMatch(html, /data-action="(?:move|mint|equip|rematch)"/);
});

test('report recomputation never changes the input replay or an independent current build', async () => {
  const input = record({ gear: true }), current = buildPet({ lineageId: 'rose_bloom', xp: 30000, gearStats: { STR: 6 } }), before = structuredClone({ input, current });
  const first = await analyzeBattleReplay(input), second = await analyzeBattleReplay(input);
  assert.deepEqual(first.report, second.report); assert.deepEqual({ input, current }, before);
});
