import { STATS } from './catalog.mjs';
import { replayFrames, canonical, unsigned } from './replay.mjs';

// Read-only analysis of a completed portable replay. No current Pet, outfit or
// mutable Arena profile participates in these calculations.
export async function analyzeBattleReplay(input, { digest = bytes => crypto.subtle.digest('SHA-256', bytes) } = {}) {
  const doc = structuredClone(input), result = replayFrames(doc);
  if (!['won', 'draw'].includes(doc.outcome.status)) throw Error('A completed battle is required.');
  const hash = Array.from(new Uint8Array(await digest(new TextEncoder().encode(canonical(unsigned(doc))))), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== doc.fingerprint) throw Error('Replay fingerprint mismatch');
  const initial = result.frames[0], totals = initial.fighters.map(() => ({
    damageDealt: 0, attackDamage: 0, counterDamage: 0, damageReceived: 0, blocked: 0, healed: 0,
    recoil: 0, storm: 0, energySpent: 0, energyRecovered: 0, recharges: 0,
  }));
  const exchanges = doc.exchanges.map((exchange, index) => {
    const before = result.frames[index], after = result.frames[index + 1];
    return { round: exchange.round, fighters: exchange.moves.map((key, side) => {
      const effect = exchange.effects[side], opponent = exchange.effects[1 - side], fighter = before.fighters[side];
      const energySpent = fighter.build.skills[key].cost;
      const row = {
        move: key, moveName: fighter.build.skills[key].name,
        attackDamage: opponent.damage, counterDamage: opponent.counter, damageDealt: opponent.damage + opponent.counter,
        damageReceived: effect.damage + effect.counter, blocked: effect.blocked, healed: effect.healed,
        recoil: effect.recoil, storm: effect.storm, hpBefore: fighter.hp, hpAfter: after.fighters[side].hp,
        energyBefore: fighter.energy, energyAfter: after.fighters[side].energy, energySpent,
        // Actual recovered energy, after the ten-energy cap; not a theoretical refund.
        energyRecovered: after.fighters[side].energy - fighter.energy + energySpent,
      };
      for (const metric of Object.keys(totals[side])) totals[side][metric] += metric === 'recharges' ? Number(key === 'recharge') : row[metric];
      return row;
    }) };
  });
  const report = {
    schemaVersion: 'AXO_ARENA_BATTLE_REPORT_V1', fingerprint: doc.fingerprint, kind: doc.kind,
    startedAt: doc.startedAt, finishedAt: doc.finishedAt, durationMs: doc.finishedAt - doc.startedAt,
    outcome: structuredClone(doc.outcome), administrativeFinish: result.administrativeFinish, exchangeCount: exchanges.length,
    fighters: initial.fighters.map((fighter, side) => {
      const build = fighter.build, peak = field => exchanges.reduce((best, exchange) => exchange.fighters[side][field] > (best?.value || 0) ? { round: exchange.round, value: exchange.fighters[side][field] } : best, null);
      return {
        side, lineageId: build.lineageId, xp: build.xp, level: build.level, maxHp: build.maxHp, finalHp: result.final.fighters[side].hp,
        attributes: STATS.map(stat => ({ stat, beforeGear: build.baseStats[stat], gear: build.gearStats[stat], total: build.stats[stat] })),
        loadout: build.loadout.map(key => ({ key, name: build.skills[key].name, rank: build.ranks[key] || 0 })),
        totals: totals[side], peakDamage: peak('damageDealt'), peakBlock: peak('blocked'),
      };
    }), exchanges,
  };
  return { doc, result, report };
}
