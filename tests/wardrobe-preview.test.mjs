import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWardrobeReader } from '../apps/pet-api/src/wardrobe-read.mjs';
import { assertWardrobeRead, assertPreview, emptyPreview, withPreviewItem, withPreviewOutfit, previewSelection, previewStorageKey, PreviewOutfits, createWardrobeSession, WARDROBE_LOCKS } from '../packages/pet-domain/src/wardrobe-preview.mjs';
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const fixture = await json('../packages/shared-schemas/fixtures/synthetic-v1.json');
const visualCatalog = await json('../packages/gear-catalog/catalogs/website-visual-catalog-v5.json');
const catalog = await json('../apps/hatchery-web/public/gear-bazaar/v1/catalog.json');
const owner = fixture.identities.level10Minted.ownerAddress, clock = Date.parse('2026-10-21T12:00:00Z');
const makeRead = (xp = 2675) => createWardrobeReader({ authenticate: async () => ({ verified: true, address: owner }), readVerifiedPetSnapshot: async () => ({ identity: { ...fixture.identities.level10Minted, xp }, equipment: fixture.projections.full }), visualCatalog, now: () => clock })({});
const memory = () => { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

test('cosmetic tiers and complete looks never rewrite identity, XP, V1 equipment or stat authority', async () => {
  const read = await makeRead(), original = structuredClone(read), start = emptyPreview(catalog);
  const look = withPreviewOutfit(start, catalog, 'copium-after-dark', 20);
  assertPreview(look, catalog); assert.ok(Object.keys(look.items).length >= 5);
  assert.equal(look.items.body.itemLevel, 20); assert.equal(read.identity.level, 10); assert.equal(read.identity.xp, 2675);
  assert.deepEqual(read, original); assert.deepEqual(WARDROBE_LOCKS, { equipV2: false, mint: false, marketplace: false, previewStats: false });
  assert.equal(previewSelection(look, catalog).body, 'copium-club-hoodie'); assert.deepEqual(start.items, {});
  for (const key of ['ownerAddress', 'xp', 'stats', 'owned', 'minted', 'equipped', 'contractId', 'capabilities']) assert.throws(() => assertPreview({ ...look, [key]: true }, catalog));
});
test('saved previews reject unknown pieces, tier coercion, slots, rigs, scenes and claimed numeric mappings', () => {
  const look = withPreviewItem(emptyPreview(catalog), catalog, 'night-node-bomber', 20);
  for (const mutate of [l => { l.items.body.family = 'unreleased'; }, l => { l.items.body.itemLevel = '20'; }, l => { l.items.body.numericId = 123; }, l => { l.items.fake = l.items.body; }, l => { l.rigSha256 = '0'.repeat(64); }, l => { l.sceneId = 'https://example.org/private'; }, l => { l.appearance = 'false'; }]) { const bad = structuredClone(look); mutate(bad); assert.throws(() => assertPreview(bad, catalog)); }
  assert.throws(() => withPreviewItem(look, catalog, 'night-node-bomber', 21));
});
test('browser outfit storage is scoped by wallet and Pet and contains cosmetics only', async () => {
  const storage = memory(), key = await previewStorageKey(owner, fixture.identities.level10Minted.genesisId);
  assert.equal(await previewStorageKey(owner.toUpperCase().replace('0X', '0x'), fixture.identities.level10Minted.genesisId), key);
  const otherKey = await previewStorageKey(fixture.otherOwner, fixture.identities.level10Minted.genesisId);
  const otherPet = await previewStorageKey(owner, 'AXO-FFFFFFFFFF'); assert.notEqual(key, otherKey); assert.notEqual(key, otherPet);
  const store = new PreviewOutfits(storage, key, catalog), look = withPreviewOutfit(emptyPreview(catalog), catalog, 'sweater-weather', 20);
  store.save('<img src=x> off-chain', look); const entries = store.list(); assert.equal(entries.length, 1);
  const raw = storage.data.get(key); for (const privateField of [owner, 'ownerAddress', 'genesisId', 'xp', 'equipment', 'stats', 'nft', 'VERIFIED_ONCHAIN']) assert.ok(!raw.includes(privateField), privateField);
  assert.deepEqual(new PreviewOutfits(storage, otherKey, catalog).list(), []);
  assert.deepEqual(new PreviewOutfits(storage, otherPet, catalog).list(), []);
  store.remove(entries[0].id); assert.deepEqual(store.list(), []);
});
test('saved outfits are bounded and corrupt storage is never silently accepted or overwritten', async () => {
  const storage = memory(), key = await previewStorageKey(owner, fixture.identities.level10Minted.genesisId), store = new PreviewOutfits(storage, key, catalog), look = emptyPreview(catalog);
  for (let n = 0; n < 12; n++) store.save('Look ' + n, look);
  assert.throws(() => store.save('Overflow', look), /12 saved/);
  assert.throws(() => store.save('x'.repeat(41), look));
  storage.setItem(key, '{broken'); assert.throws(() => store.list()); assert.throws(() => store.save('No overwrite', look)); assert.equal(storage.getItem(key), '{broken');
  storage.setItem(key, JSON.stringify({ schemaVersion: 'AXO_WARDROBE_PREVIEW_V1', entries: [{ id: crypto.randomUUID(), name: 'Bad', createdAt: new Date().toISOString(), look: { ...look, owned: true } }] })); assert.throws(() => store.list());
});
test('private wardrobe transport rejects owner mismatch, expired reads, inferred equipment and injected capabilities', async () => {
  const read = await makeRead(); assert.equal(assertWardrobeRead(read, owner, clock), read);
  assert.throws(() => assertWardrobeRead(read, fixture.otherOwner, clock));
  assert.throws(() => assertWardrobeRead(read, owner, clock + 60000));
  for (const mutate of [r => { r.identity.xp = '2675'; }, r => { r.identity.level = 20; }, r => { r.equipment.petGenesisId = 'AXO-FFFFFFFFFF'; }, r => { r.equipment.items[0].id = 9; }, r => { r.capabilities = { transactions: true }; }, r => { r.authoritativeVisual.layers[0].url = 'https://example.org/private'; }, r => { r.expiresAt = new Date(clock + 60001).toISOString(); }]) { const bad = structuredClone(read); mutate(bad); assert.throws(() => assertWardrobeRead(bad, owner, clock)); }
});
test('wallet transitions clear immediately and late reads cannot repopulate the previous wallet', async () => {
  const pending = [], states = [];
  const controller = createWardrobeSession({ read: () => new Promise(resolve => pending.push(resolve)), onState: state => states.push(state), now: () => clock, timer: () => 1, cancelTimer() {} });
  const first = controller.change({ connected: true, address: owner }); assert.equal(states.at(-1).status, 'LOADING');
  const second = controller.change({ connected: true, address: fixture.otherOwner }); assert.equal(controller.current(), null);
  pending[0](await makeRead()); await first; assert.equal(controller.current(), null);
  pending[1](await makeRead()); await second; assert.equal(states.at(-1).status, 'UNAVAILABLE'); assert.equal(controller.current(), null);
  await controller.change({ connected: false }); assert.equal(states.at(-1).status, 'DISCONNECTED'); controller.dispose();
});
test('expiry removes verification and disconnect aborts an in-flight read', async () => {
  const states = []; let expire, aborted = false, ticks = clock;
  const controller = createWardrobeSession({ read: async ({ signal }) => { signal.addEventListener('abort', () => { aborted = true; }); return makeRead(); }, onState: s => states.push(s), now: () => ticks, timer: fn => { expire = fn; return 1; }, cancelTimer() {} });
  await controller.change({ connected: true, address: owner }); assert.equal(controller.current().identity.xp, 2675);
  ticks += 60000; assert.equal(controller.current(), null); expire(); assert.equal(states.at(-1).status, 'EXPIRED');
  await controller.change({ connected: false }); assert.equal(aborted, true); assert.equal(controller.current(), null);
});
test('browser and source use the same preview model bytes', async () => {
  assert.deepEqual(await readFile(new URL('../packages/pet-domain/src/wardrobe-preview.mjs', import.meta.url)), await readFile(new URL('../apps/hatchery-web/public/wardrobe/model.mjs', import.meta.url)));
});
test('background refresh retains a fresh same-wallet read, but still expires and clears on a wallet switch', async () => {
  const states = []; let resolveRead, ticks = clock, expiry;
  const controller = createWardrobeSession({ read: () => new Promise(resolve => { resolveRead = resolve; }), onState: s => states.push(s), now: () => ticks, timer: fn => { expiry = fn; return 1; }, cancelTimer() {} });
  const initial = controller.change({ connected: true, address: owner }); resolveRead(await makeRead()); await initial;
  const refreshed = controller.refresh(); assert.equal(states.at(-1).status, 'REFRESHING'); assert.equal(controller.current().identity.xp, 2675);
  const renewed = await makeRead(); renewed.observedAt = new Date(clock + 1000).toISOString(); renewed.expiresAt = new Date(clock + 61000).toISOString(); ticks += 1000; resolveRead(renewed); await refreshed;
  assert.equal(states.at(-1).status, 'READY'); assert.equal(controller.current().expiresAt, renewed.expiresAt);
  const stale = controller.refresh(); ticks = clock + 61000; expiry(); assert.equal(controller.current(), null); assert.equal(states.at(-1).status, 'EXPIRED'); resolveRead(renewed); await stale;
  assert.equal(controller.current(), null); const switched = controller.refresh({ connected: true, address: fixture.otherOwner }); assert.equal(states.at(-1).status, 'LOADING'); assert.equal(controller.current(), null); resolveRead(renewed); await switched; controller.dispose();
});
