import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createWardrobeReader, createWardrobeHandler } from '../apps/pet-api/src/wardrobe-read.mjs';
const fixture = JSON.parse(await readFile(new URL('../packages/shared-schemas/fixtures/synthetic-v1.json', import.meta.url)));
const visualCatalog = JSON.parse(await readFile(new URL('../packages/gear-catalog/catalogs/website-visual-catalog-v5.json', import.meta.url)));
const owner = fixture.identities.level10Minted.ownerAddress;
const input = () => ({ identity: { ...structuredClone(fixture.identities.level10Minted), xp: 17950 }, equipment: structuredClone(fixture.projections.full) });
const ports = snapshot => ({ authenticate: async () => ({ verified: true, address: owner }), readVerifiedPetSnapshot: async () => snapshot, visualCatalog });

test('one authenticated preserved snapshot supplies exact XP, V1 definitions and matching visuals without mutation', async () => {
  const snapshot = input(), before = structuredClone(snapshot), read = await createWardrobeReader(ports(snapshot))({});
  assert.deepEqual(snapshot, before); assert.equal(read.identity.xp, 17950); assert.equal(read.identity.level, 10);
  assert.deepEqual(read.equipment, snapshot.equipment); assert.deepEqual(read.authoritativeVisual.layers, snapshot.equipment.visual.layers);
  assert.equal(read.authoritativeVisual.equipmentIncluded, true); assert.equal(Date.parse(read.expiresAt) - Date.parse(read.observedAt), 60000);
  read.equipment.items[0].id = 999; assert.deepEqual(snapshot, before);
});
test('unverified sessions, mismatched owners, missing identities and XP coercion fail before private data is returned', async () => {
  let calls = 0; const config = { ...ports(input()), readVerifiedPetSnapshot: async () => { calls++; return input(); } };
  for (const session of [null, { verified: false, address: owner }, { verified: true, address: '0x' + '0'.repeat(40) }]) await assert.rejects(createWardrobeReader({ ...config, authenticate: async () => session })({}), /VERIFIED_SESSION_REQUIRED/);
  assert.equal(calls, 0);
  for (const mutate of [s => { s.identity.ownerAddress = fixture.otherOwner; }, s => { s.identity.xp = '17950'; }, s => { s.identity.level = 20; }, s => { s.identity = null; }]) { const snapshot = input(); mutate(snapshot); await assert.rejects(createWardrobeReader(ports(snapshot))({}), /IDENTITY/); }
});
test('unknown ownership, definitions, revisions and aggregate stats never become authoritative empty equipment', async () => {
  for (const mutate of [s => { s.equipment.ownerAddress = fixture.otherOwner; }, s => { s.equipment.revision++; }, s => { s.equipment.items[0].definition.active = false; }, s => { s.equipment.items[0].balance = '0'; }, s => { s.equipment.stats.STR++; }, s => { s.equipment.visual.layers[0].sha256 = '0'.repeat(64); }]) {
    const snapshot = input(); mutate(snapshot); const read = await createWardrobeReader(ports(snapshot))({});
    assert.equal(read.equipment.status, 'INCONSISTENT'); assert.equal(read.equipment.data, null); assert.equal(read.authoritativeVisual.equipmentIncluded, false);
    assert.equal(read.authoritativeVisual.layers.length, 1); assert.equal(read.identity.xp, 17950); assert.ok(!('items' in read.equipment));
  }
});
test('unminted or lower-level Pets retain their authoritative stage and exact XP while equipment stays unavailable', async () => {
  for (const identity of [fixture.identities.level1, fixture.identities.level9, fixture.identities.level10Unminted]) {
    const read = await createWardrobeReader(ports({ identity, equipment: { schemaVersion: 'AXO_GEAR_READ_FAILURE_V1', status: 'UNAVAILABLE', reason: 'NOT_MINTED', data: null } }))({});
    const base = visualCatalog.bases.find(b => b.lineageKey === identity.lineageId && b.level === identity.level);
    assert.equal(read.authoritativeVisual.layers[0].url, base.url); assert.equal(read.identity.xp, identity.xp); assert.equal(read.equipment.status, 'UNAVAILABLE');
  }
});
test('read handler ignores client authority, is GET-only, private and unavailable without existing host authentication', async t => {
  const seen = [], handler = createWardrobeHandler({ ...ports(input()), authenticate: async req => { seen.push(req.headers.cookie); return req.headers.cookie === 'existing-session=verified' ? { verified: true, address: owner } : null; } });
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/hatchery/wardrobe`;
  const unauthorized = await fetch(url, { headers: { 'X-Wallet': owner } }); assert.equal(unauthorized.status, 401);
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(input()) })).status, 405);
  assert.equal((await fetch(url + '?owner=' + owner, { headers: { Cookie: 'existing-session=verified' } })).status, 400);
  const response = await fetch(url, { headers: { Cookie: 'existing-session=verified' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie'); assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await response.json()).identity.xp, 17950); assert.deepEqual(seen, [undefined, 'existing-session=verified']);
});
test('host read failures expose only a stable unavailable code, with no exception or player-state leak', async t => {
  const handler = createWardrobeHandler({ ...ports(input()), readVerifiedPetSnapshot: async () => { throw Error('private-record-token'); } });
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hatchery/wardrobe`);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'WARDROBE_READ_UNAVAILABLE' });
});
