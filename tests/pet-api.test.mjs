import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createPetReader, PetReadError } from '../apps/pet-api/src/pet-read.mjs';
import { createPetApiServer } from '../apps/pet-api/src/server.mjs';
import { startPetApi } from '../apps/pet-api/src/start.mjs';
import { validatePetRead, assertPetRead, LINEAGES, XP_THRESHOLDS } from '../packages/shared-schemas/src/index.mjs';
import { assertWardrobeRead } from '../packages/pet-domain/src/wardrobe-preview.mjs';

const fixture = JSON.parse(await readFile(new URL('../packages/shared-schemas/fixtures/synthetic-v1.json', import.meta.url)));
const visualCatalog = JSON.parse(await readFile(new URL('../packages/gear-catalog/catalogs/website-visual-catalog-v5.json', import.meta.url)));
const owner = fixture.identities.level10Minted.ownerAddress, time = Date.parse('2026-10-21T12:00:00.000Z');
const input = () => ({ identity: { ...structuredClone(fixture.identities.level10Minted), xp: 17950 }, equipment: structuredClone(fixture.projections.full) });
const ports = (snapshot = input()) => ({ authenticate: async () => ({ verified: true, address: owner }), readVerifiedPetSnapshot: async () => snapshot, visualCatalog, now: () => time });
const context = { expectedOwnerAddress: owner, visualCatalog, now: time };
async function serve(t, options) {
  const server = createPetApiServer(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const rejectCode = (read, code) => assert.ok(validatePetRead(read, context).errors.some(issue => issue.code === code));

test('shared Pet DTO preserves one snapshot, exact XP, numeric equipment and canonical visuals', async () => {
  const snapshot = input(), before = structuredClone(snapshot); let calls = 0;
  const read = await createPetReader({ ...ports(snapshot), readVerifiedPetSnapshot: async ({ session }) => {
    calls++; assert.deepEqual(session, { verified: true, address: owner }); assert.ok(Object.isFrozen(session)); return snapshot;
  } })({});
  assert.equal(calls, 1); assert.equal(read.schemaVersion, 'AXO_PET_READ_V1'); assert.equal(read.identity.xp, 17950); assert.equal(read.identity.level, 10);
  assert.deepEqual(read.equipment, before.equipment); assert.deepEqual(read.authoritativeVisual.layers, before.equipment.visual.layers);
  assert.strictEqual(assertPetRead(read, context), read); assert.deepEqual(snapshot, before);
  read.equipment.items[0].definition.arenaStats.STR = 999; assert.deepEqual(snapshot, before);
});

test('shared read validates every lineage and V1 stage without inventing mint or equipment state', async () => {
  for (const lineageId of LINEAGES) for (const [index, xp] of XP_THRESHOLDS.entries()) {
    const identity = { ...fixture.identities.level1, lineageId, xp, level: index + 1 };
    const read = await createPetReader(ports({ identity }))({});
    assertPetRead(read, context); assert.equal(read.identity.xp, xp); assert.equal(read.identity.level, index + 1);
    assert.equal(read.equipment.status, 'UNAVAILABLE'); assert.equal(read.equipment.data, null);
    assert.equal(read.authoritativeVisual.equipmentIncluded, false); assert.equal(read.authoritativeVisual.layers.length, 1);
  }
});

test('read schema rejects client preview authority, extra fields, wrong owner, XP and V2 level coercion', async () => {
  const valid = await createPetReader(ports())({});
  for (const mutate of [r => { r.previewStats = {}; }, r => { r.identity.xp = '17950'; }, r => { r.identity.level = 20; },
    r => { r.identity.ownerAddress = fixture.otherOwner; }, r => { r.equipment.items[0].definition.itemLevel = 20; },
    r => { r.schemaVersion = 'AXO_PET_READ_V2'; }]) {
    const read = structuredClone(valid); mutate(read); assert.equal(validatePetRead(read, context).valid, false);
  }
});

test('read schema binds time, matching equipment, canonical paths/hashes and foreground order', async () => {
  const valid = await createPetReader(ports())({});
  for (const mutate of [r => { r.expiresAt = r.observedAt; }, r => { r.observedAt = '2026-02-30T00:00:00.000Z'; },
    r => { r.observedAt = new Date(time + 6000).toISOString(); r.expiresAt = new Date(time + 66000).toISOString(); }]) {
    const read = structuredClone(valid); mutate(read); rejectCode(read, 'READ_EXPIRED_OR_INVALID');
  }
  assert.equal(validatePetRead(valid, { ...context, now: time + 60000 }).valid, false);
  for (const mutate of [r => { r.authoritativeVisual.equipmentIncluded = false; }, r => { r.authoritativeVisual.layers.reverse(); },
    r => { r.authoritativeVisual.layers[0].sha256 = '0'.repeat(64); }, r => { r.authoritativeVisual.layers[0].url = '/gear-bazaar/v1/preview.webp'; }]) {
    const read = structuredClone(valid); mutate(read); assert.equal(validatePetRead(read, context).valid, false);
  }
});

test('verified empty equipment remains distinct from missing or invalid equipment', async () => {
  const empty = input(); empty.equipment = fixture.projections.empty;
  const verified = await createPetReader(ports(empty))({});
  assert.equal(verified.equipment.status, 'VERIFIED_ONCHAIN'); assert.equal(verified.equipment.items.length, 0); assert.equal(verified.authoritativeVisual.equipmentIncluded, true);
  for (const mutate of [s => { delete s.equipment; }, s => { s.equipment.chain.blockHash = '0x' + '0'.repeat(64); },
    s => { s.equipment.revision++; }, s => { s.equipment.stats.STR++; }, s => { s.equipment.ownerAddress = fixture.otherOwner; }]) {
    const snapshot = input(); mutate(snapshot); const read = await createPetReader(ports(snapshot))({});
    assertPetRead(read, context); assert.equal(read.equipment.data, null); assert.ok(!('items' in read.equipment));
    assert.equal(read.authoritativeVisual.equipmentIncluded, false); assert.equal(read.authoritativeVisual.layers.length, 1);
  }
});

test('catalog input is isolated and malformed canonical base evidence fails closed', async () => {
  const catalog = structuredClone(visualCatalog), read = createPetReader({ ...ports(), visualCatalog: catalog });
  catalog.bases.length = 0; assertPetRead(await read({}), context);
  const invalid = structuredClone(visualCatalog); invalid.bases[0].runtimeSha256 = 'bad';
  await assert.rejects(createPetReader({ ...ports({ identity: fixture.identities.level1 }), visualCatalog: invalid })({}), /PET_PROJECTION_INCONSISTENT/);
  assert.equal(validatePetRead(await read({}), { ...context, visualCatalog: { ...visualCatalog, bases: {} } }).valid, false);
});

test('bounded reads time out uncooperative ports, propagate abort and never continue a cancelled authentication', async t => {
  // Keep this test alive while exercising the production unref'ed deadline timer.
  const keepAlive = setInterval(() => {}, 1000); t.after(() => clearInterval(keepAlive));
  let hostSignal;
  await assert.rejects(createPetReader({ ...ports(), timeoutMs: 20, readVerifiedPetSnapshot: async ({ signal }) => { hostSignal = signal; return new Promise(() => {}); } })({}), /PET_READ_TIMEOUT/);
  assert.equal(hostSignal.aborted, true);
  const controller = new AbortController(); let release, snapshotCalls = 0;
  const pending = createPetReader({ ...ports(), authenticate: () => new Promise(resolve => { release = resolve; }),
    readVerifiedPetSnapshot: async () => { snapshotCalls++; return input(); } })({}, { signal: controller.signal });
  await Promise.resolve(); controller.abort(); await assert.rejects(pending, /PET_READ_ABORTED/);
  release({ verified: true, address: owner }); await new Promise(resolve => setImmediate(resolve)); assert.equal(snapshotCalls, 0);
  await assert.rejects(createPetReader(ports())({}, { signal: controller.signal }), /PET_READ_ABORTED/);
});

test('observation TTL starts before host I/O, and a clock jump cannot produce a fresh stale read', async () => {
  let clock = time;
  const read = await createPetReader({ ...ports(), now: () => clock, readVerifiedPetSnapshot: async () => { clock += 7000; return input(); } })({});
  assert.equal(read.observedAt, new Date(time).toISOString()); assert.equal(read.expiresAt, new Date(time + 60000).toISOString());
  clock = time;
  await assert.rejects(createPetReader({ ...ports(), now: () => clock, readVerifiedPetSnapshot: async () => { clock += 60000; return input(); } })({}), /PET_PROJECTION_INCONSISTENT/);
});

test('standalone service with no adapter is alive but never ready or privately authoritative', async t => {
  const origin = await serve(t);
  assert.deepEqual(await (await fetch(origin + '/healthz')).json(), { service: 'axo-pet-api', status: 'RUNNING' });
  const ready = await fetch(origin + '/readyz'); assert.equal(ready.status, 503); assert.equal((await ready.json()).status, 'NOT_CONNECTED');
  for (const path of ['/api/pet/v1/me', '/api/hatchery/wardrobe']) {
    const response = await fetch(origin + path, { headers: { 'X-Wallet': owner, Cookie: 'verified=true' } });
    assert.equal(response.status, 503); assert.ok(!('identity' in await response.json()));
  }
});

test('Pet API and Wardrobe compatibility endpoint share one reader and identical projection rules', async t => {
  let calls = 0;
  const origin = await serve(t, { ...ports(), readVerifiedPetSnapshot: async () => { calls++; return input(); } });
  const pet = await (await fetch(origin + '/api/pet/v1/me')).json();
  const wardrobe = await (await fetch(origin + '/api/hatchery/wardrobe')).json();
  assert.equal(calls, 2); assert.deepEqual(wardrobe, { ...pet, schemaVersion: 'AXO_WARDROBE_READ_V1' });
  assertWardrobeRead(wardrobe, owner, time); assertPetRead(pet, context);
});

test('HTTP rejects query/body/header authority and write verbs before accessing private host ports', async t => {
  let authCalls = 0, reads = 0;
  const origin = await serve(t, { ...ports(), authenticate: async req => {
    authCalls++; return req.headers.cookie === 'host-session=valid' ? { verified: true, address: owner } : null;
  }, readVerifiedPetSnapshot: async () => { reads++; return input(); } });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const response = await fetch(origin + '/api/pet/v1/me', { method }); assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET');
  }
  for (const query of ['?owner=' + owner, '?xp=99999', '?preview=true', '?address=' + owner]) assert.equal((await fetch(origin + '/api/pet/v1/me' + query)).status, 400);
  const bodyStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(origin + '/api/pet/v1/me', { method: 'GET', headers: { 'Content-Length': '2' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(bodyStatus, 400); assert.equal(authCalls, 0); assert.equal(reads, 0);
  assert.equal((await fetch(origin + '/api/pet/v1/me', { headers: { 'X-Wallet': owner, Authorization: 'verified=true' } })).status, 401);
  const response = await fetch(origin + '/api/pet/v1/me', { headers: { Cookie: 'host-session=valid', Origin: 'https://untrusted.example' } });
  assert.equal(response.status, 200); assert.equal(reads, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie, Authorization');
  assert.equal(response.headers.get('access-control-allow-origin'), null); assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
});

test('concurrent sessions never reuse another wallet snapshot or a global private cache', async t => {
  const origin = await serve(t, { ...ports(), authenticate: async req => ({ verified: true, address: req.headers.cookie === 'second' ? fixture.otherOwner : owner }),
    readVerifiedPetSnapshot: async ({ session }) => {
      await new Promise(resolve => setTimeout(resolve, session.address === owner ? 15 : 1));
      return { identity: { ...fixture.identities.level1, ownerAddress: session.address } };
    } });
  const responses = await Promise.all(['first', 'second'].map(cookie => fetch(origin + '/api/pet/v1/me', { headers: { Cookie: cookie } }).then(r => r.json())));
  assert.equal(responses[0].identity.ownerAddress, owner); assert.equal(responses[1].identity.ownerAddress, fixture.otherOwner);
});

test('readiness probes return only sanitized dependency status, independent of liveness', async t => {
  let outcome = { ready: true, privatePath: 'do-not-expose' };
  const origin = await serve(t, { ...ports(), checkReadiness: async () => { if (outcome instanceof Error) throw outcome; return outcome; } });
  const ready = await fetch(origin + '/readyz'); assert.equal(ready.status, 200); assert.deepEqual(await ready.json(), { service: 'axo-pet-api', status: 'READY' });
  outcome = { ready: false }; assert.equal((await fetch(origin + '/readyz')).status, 503);
  outcome = Error('do-not-expose'); const unavailable = await fetch(origin + '/readyz'); assert.equal(unavailable.status, 503); assert.ok(!(await unavailable.text()).includes('do-not-expose'));
  assert.equal((await fetch(origin + '/healthz')).status, 200);
});

test('HTTP client disconnect aborts the host read instead of completing a stale private response', async t => {
  let started, cancelled;
  const entered = new Promise(resolve => { started = resolve; }), aborted = new Promise(resolve => { cancelled = resolve; });
  const origin = await serve(t, { ...ports(), readVerifiedPetSnapshot: async ({ signal }) => {
    signal.addEventListener('abort', cancelled, { once: true }); started(); return new Promise(() => {});
  } });
  const controller = new AbortController(), request = fetch(origin + '/api/pet/v1/me', { signal: controller.signal });
  await entered; controller.abort(); await assert.rejects(request, { name: 'AbortError' });
  let timer;
  try { await Promise.race([aborted, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Host read was not aborted')), 1000); })]); }
  finally { clearTimeout(timer); }
});

test('readiness deadline bounds an uncooperative dependency probe', async t => {
  let hostSignal;
  const origin = await serve(t, { ...ports(), checkReadiness: async ({ signal }) => { hostSignal = signal; return new Promise(() => {}); } });
  const response = await fetch(origin + '/readyz'); assert.equal(response.status, 503); assert.equal(hostSignal.aborted, true);
  assert.deepEqual(await response.json(), { service: 'axo-pet-api', status: 'UNAVAILABLE' });
});

test('unknown routes and adapter exceptions expose no state, mint, market, metadata writes or private errors', async t => {
  const origin = await serve(t, { ...ports(), readVerifiedPetSnapshot: async () => { throw new PetReadError('private-provider-error'); } });
  for (const path of ['/api/pet/v1/mint', '/api/pet/v1/equip', '/api/pet/v1/marketplace', '/api/pet/v1/owners/' + owner, '/.git/config', '/state/pets.json']) {
    assert.equal((await fetch(origin + path)).status, 404); assert.equal((await fetch(origin + path, { method: 'POST' })).status, 404);
  }
  const failed = await fetch(origin + '/api/pet/v1/me'); assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { code: 'PET_READ_UNAVAILABLE' });
});

test('operator adapter selection requires local absolute modules and validated ports', async () => {
  await assert.rejects(startPetApi({ port: 0 }), /port/); await assert.rejects(startPetApi({ port: 65536 }), /port/);
  await assert.rejects(startPetApi({ adapterPath: 'https://untrusted.example/adapter.mjs' }), /absolute local/);
  await assert.rejects(startPetApi({ adapterPath: './adapter.mjs' }), /absolute local/);
  await assert.rejects(startPetApi({ adapterPath: fileURLToPath(new URL('../apps/pet-api/src/pet-read.mjs', import.meta.url)) }), /createPetApiPorts/);
});
