import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ATELIER_CATALOG_SHA256, LAB_MOVES, FITTED_MOTION, atelierManifest, atelierMediaUrl, labSelection, proposedLoadout, fittedActorMotion } from '../style-lab-model.mjs';
import { DEFAULT_PRESENTATION, PRESENTATION_KEY, presentationPreferences, loadPresentation, savePresentation, presentationBudget, readinessSummary } from '../presentation.mjs';
import { commandCenterMarkup } from '../command-center.mjs';
import { fitPlan } from '../atelier/model.mjs';
const bytes = readFileSync(new URL('../../hatchery-web/public/gear-bazaar/v1/catalog.json', import.meta.url)), collection = JSON.parse(bytes);

test('Style Lab pins the exact fitted wardrobe and lists only committed runtime media', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ATELIER_CATALOG_SHA256);
  const manifest = atelierManifest(collection); assert.ok(manifest.size > 100);
  for (const entry of manifest.values()) {
    assert.match(atelierMediaUrl(entry.url), /^\/arena\/atelier\/media\/(anatomy|bazaar)\/[a-z0-9_.-]+\.webp$/);
    assert.ok(Number.isInteger(entry.width) && Number.isInteger(entry.height));
    assert.doesNotMatch(entry.url, /cloth-master|\.source\.|private/);
  }
  for (const url of ['https://evil.example/a.webp', '/gear-anatomy/v3/../state.webp', '/gear-bazaar/v1/.hidden.webp', '/gear-bazaar/v1/metadata/a.json']) assert.throws(() => atelierMediaUrl(url));
});

test('all 43 fitted families preserve depth/mask plans across six lineages', () => {
  assert.equal(collection.items.length, 43);
  for (const lineage of collection.lineages) for (const item of collection.items) {
    const plan = fitPlan(collection, lineage.id, { [item.slot]: item.id });
    assert.equal(plan.filter(layer => layer.kind === 'pet').length, 1);
    assert.ok(plan.some(layer => layer.id === item.id));
    for (const layer of plan) assert.ok(atelierManifest(collection).has(layer.src));
    if (item.slot === 'tool') assert.equal(plan.at(-1).id, 'fingers');
    if (item.occlusion === 'SLEEVED_TOP_V1') assert.ok(plan.some(layer => layer.id === 'covered-head'));
  }
});

test('all 473 fixed item tiers and all six 5-piece sets remain explicitly proposed values', () => {
  let count = 0;
  for (const item of collection.items) for (let tier = 10; tier <= 20; tier++) {
    const p = proposedLoadout(collection, { [item.slot]: item.id }, tier); count++;
    assert.equal(p.authority, 'COSMETIC_PREVIEW_ONLY'); assert.equal(p.proposedMinimumLevel, tier); assert.ok(p.proposedXpThreshold >= 1200);
    assert.ok(Object.values(p.stats).every(Number.isSafeInteger)); assert.equal(p.sets.some(set => set.active), false);
  }
  assert.equal(count, 473);
  for (const set of collection.sets) for (let tier = 10; tier <= 20; tier++) {
    const p = proposedLoadout(collection, set.pieces, tier), matched = p.sets.find(s => s.id === set.id);
    assert.equal(matched.count, 5); assert.equal(matched.active, true); assert.deepEqual(matched.bonus, set.tiers[tier - 10].bonus);
  }
});

test('candidate selection rejects wrong slots, prototype keys and invalid tiers', () => {
  for (const selection of [{ body: 'liquidity-crown' }, { pants: 'missing' }, { previewStats: {} }, JSON.parse('{"__proto__":"bad"}')]) assert.throws(() => labSelection(collection, selection));
  for (const tier of [9, 21, 10.5, NaN, '20']) assert.throws(() => proposedLoadout(collection, {}, tier));
  const selection = { head: 'liquidity-crown' }, before = structuredClone(selection); proposedLoadout(collection, selection, 20); assert.deepEqual(selection, before);
});

test('all twelve move profiles are finite, distinct and preserve actor proportions through every preview tier', () => {
  assert.equal(Object.keys(FITTED_MOTION).length, 12);
  for (let tier = 10; tier <= 20; tier++) for (const move of LAB_MOVES) for (let elapsed = -1; elapsed <= 1900; elapsed += 17) {
    const motion = fittedActorMotion(1500 + Math.max(0, elapsed), elapsed, { move, tier });
    for (const key of ['x', 'y', 'rotation', 'scale', 'impact', 'trail', 'glow']) assert.ok(Number.isFinite(motion[key]));
    assert.equal(motion.scale, 1); assert.ok(Math.abs(motion.x) <= 34); assert.ok(Math.abs(motion.y) <= 35);
  }
  assert.equal(new Set(Object.keys(FITTED_MOTION).map(move => JSON.stringify(fittedActorMotion(1000, 800, { move })))).size, 12);
  assert.equal(fittedActorMotion(0, -1).phase, 'idle');
});

test('fixed-pose motion stays continuous at windup, release and recovery boundaries', () => {
  for (const [move, [windup, impact]] of Object.entries(FITTED_MOTION)) for (const at of [0, windup * 1800, impact * 1800, 1800]) {
    const a = fittedActorMotion(1000, at - .001, { move }), b = fittedActorMotion(1000, at + .001, { move });
    for (const key of ['x', 'y', 'rotation']) assert.ok(Math.abs(a[key] - b[key]) < .01);
  }
});

test('reduced motion disables cosmetic movement, trails and hit flashes for every gear tier', () => {
  for (const move of LAB_MOVES) for (const tier of [10, 15, 20]) {
    const m = fittedActorMotion(1000, 800, { move, tier, reduced: true });
    assert.equal(m.x, 0); assert.equal(m.y, 0); assert.equal(m.rotation, 0); assert.equal(m.trail, 0); assert.equal(m.impact, 0);
  }
});

test('presentation preferences cannot carry identity, XP, equipment or arbitrary fields', () => {
  for (const value of [null, [], { xp: 999 }, { gearStats: { STR: 99 } }, { quality: 'ultra', motion: 'all' }]) {
    const p = presentationPreferences(value); assert.deepEqual(Object.keys(p), Object.keys(DEFAULT_PRESENTATION)); assert.deepEqual(p, DEFAULT_PRESENTATION);
  }
  assert.deepEqual(presentationPreferences({ quality: 'low', motion: 'reduced', contrast: true, readouts: false }), { quality: 'low', motion: 'reduced', readouts: false, contrast: true });
});

test('blocked/corrupt presentation storage falls back safely and writes only its own key', () => {
  assert.deepEqual(loadPresentation({ getItem() { throw Error('blocked'); } }), DEFAULT_PRESENTATION);
  assert.deepEqual(loadPresentation({ getItem: () => '{bad' }), DEFAULT_PRESENTATION);
  assert.deepEqual(loadPresentation({ getItem: () => 'x'.repeat(500) }), DEFAULT_PRESENTATION);
  const writes = []; savePresentation({ ...DEFAULT_PRESENTATION, quality: 'low' }, { setItem: (...args) => writes.push(args) });
  assert.equal(writes.length, 1); assert.equal(writes[0][0], PRESENTATION_KEY); assert.equal(JSON.parse(writes[0][1]).quality, 'low');
});

test('auto quality budgets low-memory/save-data devices and always respects OS reduced motion', () => {
  const low = presentationBudget(DEFAULT_PRESENTATION, { memory: 4 }), high = presentationBudget({ ...DEFAULT_PRESENTATION, quality: 'high' });
  assert.equal(low.fps, 30); assert.equal(low.maxPixels, 900000); assert.equal(high.fps, 60); assert.equal(high.maxPixels, 1800000);
  assert.equal(presentationBudget(DEFAULT_PRESENTATION, { saveData: true }).fps, 30);
  assert.equal(presentationBudget({ ...DEFAULT_PRESENTATION, motion: 'system' }, { reducedMotion: true }).reduced, true);
});

test('Command Center uses exact V1 evidence, exposes entry locks and escapes labels', () => {
  const pet = { name: '<bad>', lineageId: 'emerald_sprout', level: 10, xp: 17950, gearLoadout: [{ id: 1001 }], gearStats: { INT: 1 }, identitySource: 'AUTHENTICATED_PET_READ_V1' };
  const build = { loadout: ['market_order'], skills: { market_order: { name: 'Market Order', cost: 0, cooldown: 0 } } }, me = { pet, build, busy: true, rooms: [{ id: 'fixture', status: 'playing' }] };
  assert.equal(readinessSummary(me).gearCount, 1); const html = commandCenterMarkup(me);
  assert.match(html, /17,950 exact XP/); assert.match(html, /V1 LVL 10/); assert.match(html, /&lt;bad&gt;/); assert.match(html, /Resume entry/);
  assert.match(html, /data-action="guided-practice" disabled/); assert.match(html, /tiers 10–20 stay cosmetic/); assert.doesNotMatch(html, /LVL 20<\/span>/);
});
