import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as api from '../src/index.mjs';
import { XP, STATS, levelForXp as arenaLevel } from '../../../apps/arena-web/catalog.mjs';

const require = createRequire(import.meta.url);
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/synthetic-v1.json', import.meta.url)));
const visualCatalog = JSON.parse(readFileSync(new URL('../../gear-catalog/catalogs/website-visual-catalog-v5.json', import.meta.url)));
const traits = JSON.parse(readFileSync(new URL('../../gear-catalog/catalogs/trait-catalog-v4.3.json', import.meta.url)));
const { gearProfile, aggregateGearArenaStats } = require('../../pet-domain/src/pet-nft.js');
const { v5LoadoutFromGearItems, v5WebsiteVisualState } = require('../../visual-engine/src/pet-visual-v5.js');
const copy = value => structuredClone(value);
const context = () => ({ identity: fixtures.identities.level10Minted, visualCatalog });
const valid = result => assert.equal(result.valid, true, JSON.stringify(result.errors));
const rejects = (result, code) => {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === code), JSON.stringify(result.errors));
};

test('ESM and CommonJS expose the same immutable protocol and validators', () => {
  const cjs = require('../src/index.cjs');
  assert.strictEqual(cjs.validatePetIdentity, api.validatePetIdentity);
  assert.ok(Object.isFrozen(api.GEAR_SLOTS));
  assert.ok(Object.isFrozen(api.schemas.petIdentity));
  assert.deepEqual(api.XP_THRESHOLDS, XP);
  assert.deepEqual(api.ARENA_STATS, STATS);
  assert.deepEqual(api.GEAR_SLOTS, traits.gearSlots.map(slot => slot.key));
  assert.deepEqual(api.LINEAGES, visualCatalog.lineages.map(lineage => lineage.key));
});

test('workspace consumers can use both package export conditions', async () => {
  assert.strictEqual(require('@axo/pet-schemas').validatePetIdentity, api.validatePetIdentity);
  assert.strictEqual((await import('@axo/pet-schemas')).validateGearDefinition, api.validateGearDefinition);
  assert.deepEqual(require('@axo/pet-schemas/schemas'), api.schemas);
});

test('every XP threshold and adjacent boundary agrees with existing Arena rules', () => {
  for (const threshold of XP) for (const xp of [Math.max(0, threshold - 1), threshold, threshold + 1]) {
    assert.equal(api.levelForXp(xp), arenaLevel(xp));
  }
  for (const xp of [-1, 1.5, '1200', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => api.levelForXp(xp), /Invalid Hatchery XP/);
  }
});

for (const [name, identity] of Object.entries(fixtures.identities)) {
  test(`synthetic Pet fixture: ${name}`, () => valid(api.validatePetIdentity(identity)));
}

test('identity validation rejects unknown versions, unknown fields and mismatched authoritative context without mutation', () => {
  const identity = copy(fixtures.identities.level10Minted);
  const before = copy(identity);
  const caseIdentity = { ...identity, ownerAddress: '0x' + 'aB'.repeat(20) };
  valid(api.validatePetIdentity(caseIdentity, { expectedOwnerAddress: caseIdentity.ownerAddress.toUpperCase().replace('0X', '0x') }));
  assert.deepEqual(identity, before);
  rejects(api.validatePetIdentity({ ...identity, schemaVersion: 'AXO_PET_IDENTITY_V2' }), 'SCHEMA_INVALID');
  rejects(api.validatePetIdentity({ ...identity, trust: 100 }), 'SCHEMA_INVALID');
  rejects(api.validatePetIdentity({ ...identity, level: 9 }), 'XP_LEVEL_MISMATCH');
  rejects(api.validatePetIdentity(identity, { expectedOwnerAddress: fixtures.otherOwner }), 'OWNER_MISMATCH');
  rejects(api.validatePetIdentity({ ...identity, xp: '1200' }), 'SCHEMA_INVALID');
  rejects(api.validatePetIdentity({ ...identity, name: '  ' }), 'SCHEMA_INVALID');
  rejects(api.validatePetIdentity({ ...identity, nft: { ...identity.nft, tokenId: String(2n ** 256n) } }), 'UINT256_RANGE');
  rejects(api.validatePetIdentity({ ...identity, nft: { status: 'UNMINTED', tokenId: '1' } }), 'SCHEMA_INVALID');
  rejects(api.validatePetIdentity({ ...identity, nft: { status: 'OFFCHAIN_WALLET_BOUND' } }), 'SCHEMA_INVALID');
});

test('all 56 canonical Gear definitions retain their slot and existing item-stat policy', () => {
  for (const item of traits.launchGear) {
    const definition = { ...fixtures.projections.full.items.find(entry => entry.slot === item.slot).definition,
      id: item.id, rarity: item.rarity, arenaStats: gearProfile(item).arenaStats };
    valid(api.validateGearDefinition(definition));
  }
});

test('item bounds reject zero bonuses, invalid stat keys, oversized totals and unsafe supplies', () => {
  const base = fixtures.projections.full.items[0].definition;
  const zero = Object.fromEntries(api.ARENA_STATS.map(stat => [stat, 0]));
  rejects(api.validateGearDefinition({ ...base, arenaStats: zero }), 'ITEM_STAT_TOTAL');
  rejects(api.validateGearDefinition({ ...base, arenaStats: { ...zero, INT: 2, WIS: 2, CHA: 1 } }), 'ITEM_STAT_TOTAL');
  rejects(api.validateGearDefinition({ ...base, arenaStats: { ...base.arenaStats, INT: 3 } }), 'SCHEMA_INVALID');
  rejects(api.validateGearDefinition({ ...base, arenaStats: { ...base.arenaStats, LUCK: 1 } }), 'SCHEMA_INVALID');
  rejects(api.validateGearDefinition({ ...base, maxSupply: String(2n ** 256n) }), 'UINT256_RANGE');
});

test('full and empty Gear fixtures match canonical compositing and existing domain stats', () => {
  for (const projection of Object.values(fixtures.projections)) {
    valid(api.validateVerifiedGearProjection(projection, context()));
    assert.deepEqual(projection.stats, aggregateGearArenaStats(projection.items.map(entry => entry.definition)));
    const visual = v5WebsiteVisualState(fixtures.identities.level10Minted, { catalog: visualCatalog,
      loadout: v5LoadoutFromGearItems(projection.items) });
    assert.deepEqual(projection.visual.layers.map(layer => layer.url), visual.activeLayers.map(layer => layer.runtimeUrl));
  }
});

for (const scenario of fixtures.invalidProjections) {
  test(`projection rejection fixture: ${scenario.name}`, () => {
    const projection = copy(fixtures.projections.full);
    for (const mutation of scenario.mutations) {
      const keys = mutation.path.split('/').slice(1);
      let target = projection;
      for (const key of keys.slice(0, -1)) target = target[key];
      if (mutation.remove) delete target[keys.at(-1)]; else target[keys.at(-1)] = copy(mutation.value);
    }
    rejects(api.validateVerifiedGearProjection(projection, context()), scenario.code);
  });
}

test('verified projections require trusted identity/catalog context and never mutate input or return partial data', () => {
  const projection = copy(fixtures.projections.full), before = copy(projection);
  rejects(api.validateVerifiedGearProjection(projection), 'IDENTITY_REQUIRED');
  rejects(api.validateVerifiedGearProjection(projection, { identity: context().identity }), 'VISUAL_CATALOG_REQUIRED');
  rejects(api.validateVerifiedGearProjection(projection, { ...context(), identity: fixtures.identities.level10Unminted }), 'PET_NOT_MINTED');
  rejects(api.validateVerifiedGearProjection(projection, { ...context(), identity: fixtures.identities.level9 }), 'PET_NOT_MINTED');
  const underLevel = { ...copy(context().identity), xp: 940, level: 9 };
  rejects(api.validateVerifiedGearProjection(projection, { ...context(), identity: underLevel }), 'MINIMUM_LEVEL');
  valid(api.validateVerifiedGearProjection(projection, context()));
  assert.deepEqual(projection, before);
  assert.strictEqual(api.assertVerifiedGearProjection(projection, context()), projection);
  assert.throws(() => api.assertPetIdentity({ ...before, ownerAddress: fixtures.otherOwner }), error => error.name === 'SchemaValidationError' && !error.message.includes(fixtures.otherOwner));
});

test('all six lineages use their own exact canonical base and HUD', () => {
  for (const lineageId of api.LINEAGES) {
    const identity = { ...copy(context().identity), lineageId };
    const projection = copy(fixtures.projections.full);
    const visual = v5WebsiteVisualState(identity, { catalog: visualCatalog, loadout: v5LoadoutFromGearItems(projection.items) });
    projection.visual.layers = visual.activeLayers.map(layer => ({ slot: layer.slot, z: layer.z, optionId: layer.optionId ?? null, url: layer.runtimeUrl, sha256: layer.runtimeSha256 }));
    valid(api.validateVerifiedGearProjection(projection, { identity, visualCatalog }));
  }
});

test('minted juvenile Pets may have an empty verified loadout and only their canonical base', () => {
  for (const level of [1, 9]) {
    const identity = { ...copy(context().identity), level, xp: XP[level - 1] };
    const projection = copy(fixtures.projections.empty);
    const visual = v5WebsiteVisualState(identity, { catalog: visualCatalog });
    projection.visual.layers = visual.activeLayers.map(layer => ({ slot: layer.slot, z: layer.z, optionId: layer.optionId ?? null, url: layer.runtimeUrl, sha256: layer.runtimeSha256 }));
    valid(api.validateVerifiedGearProjection(projection, { identity, visualCatalog }));
  }
});

test('projection validation rejects impossible balances, duplicate visual slots and foreign catalogs', () => {
  const projection = copy(fixtures.projections.full);
  projection.items[0].balance = '101';
  rejects(api.validateVerifiedGearProjection(projection, context()), 'BALANCE_EXCEEDS_SUPPLY');
  projection.items[0].balance = '1';
  projection.visual.layers[1] = copy(projection.visual.layers[0]);
  rejects(api.validateVerifiedGearProjection(projection, context()), 'VISUAL_LAYER_DUPLICATE');
  rejects(api.validateVerifiedGearProjection(fixtures.projections.full, { ...context(), visualCatalog: {} }), 'VISUAL_CATALOG_INVALID');
});

for (const failure of fixtures.unavailable) {
  test(`unavailable evidence remains unusable: ${failure.reason}`, () => {
    const result = api.validateGearReadResult(failure, context());
    valid(result); assert.equal(result.usable, false);
    rejects(api.validateGearReadResult({ ...failure, items: [], stats: fixtures.projections.empty.stats }), 'SCHEMA_INVALID');
  });
}

test('a read result is usable only after complete verified-projection validation', () => {
  const good = api.validateGearReadResult(fixtures.projections.full, context());
  valid(good); assert.equal(good.usable, true);
  const bad = api.validateGearReadResult({ ...fixtures.projections.full, revision: 99 }, context());
  assert.equal(bad.usable, false); rejects(bad, 'STALE_GEAR_REVISION');
});
