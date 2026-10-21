import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHmac, createHash } from 'node:crypto';
import { createVerifiedArenaAuthenticator, arenaIdentityFromPetRead } from '../src/verified-pet.mjs';
import { mountVerifiedPetArena } from '../src/mount.mjs';
import { createPetReader } from '../../../apps/pet-api/src/pet-read.mjs';
import { ArenaService } from '../../../apps/arena-web/service.mjs';
import { buildPet, VERSION } from '../../../apps/arena-web/catalog.mjs';
import { newBattle, resolve } from '../../../apps/arena-web/combat.mjs';
import { exportReplay, verifyReplay, fingerprint } from '../../../apps/arena-web/replay-export.mjs';
import { REPLAY_SCHEMA, GEAR_REPLAY_SCHEMA } from '../../../apps/arena-web/replay.mjs';
import { createVerifiedImageCache } from '../../../apps/arena-web/verified-visuals.mjs';
import { verifiedPetPanel } from '../../../apps/arena-web/verified-panel.mjs';
const require = createRequire(new URL('../../../apps/arena-web/package.json', import.meta.url));
const express = require('express'), request = require('supertest');
const fixture = JSON.parse(readFileSync(new URL('../../shared-schemas/fixtures/synthetic-v1.json', import.meta.url)));
const visualCatalog = JSON.parse(readFileSync(new URL('../../gear-catalog/catalogs/website-visual-catalog-v5.json', import.meta.url)));
const time = Date.parse('2026-10-21T12:00:00Z'), secret = 'synthetic-arena-test-secret-32-characters', owner = fixture.owner;
const snapshot = () => ({ identity: { ...structuredClone(fixture.identities.level10Minted), xp: 17950 }, equipment: structuredClone(fixture.projections.full) });
const ports = (s = snapshot()) => ({ secret, authenticate: async () => ({ verified: true, address: s.identity.ownerAddress }), readVerifiedPetSnapshot: async () => s, visualCatalog, now: () => time });

test('Arena authenticates once and maps exact shared identity, numeric V1 gear and canonical layers', async () => {
  const s = snapshot(), p = ports(s); let auths = 0, reads = 0;
  const identity = await createVerifiedArenaAuthenticator({ ...p,
    authenticate: async () => { auths++; return { verified: true, address: s.identity.ownerAddress }; },
    readVerifiedPetSnapshot: async ({ session, signal }) => { reads++; assert.equal(session.address, s.identity.ownerAddress); assert.equal(signal.aborted, false); return s; },
  })({ body: { xp: 999999, previewStats: { STR: 999 } } });
  assert.equal(auths, 1); assert.equal(reads, 1); assert.equal(identity.pet.xp, 17950); assert.equal(identity.pet.level, 10);
  assert.equal(identity.key, createHmac('sha256', secret).update('arena:' + s.identity.ownerAddress.toLowerCase()).digest('hex'));
  assert.deepEqual(identity.pet.gearStats, s.equipment.stats); assert.deepEqual(identity.pet.layers, s.equipment.visual.layers);
  assert.deepEqual(identity.pet.gearLoadout.map(i => i.id), s.equipment.items.map(i => i.id));
  assert.equal(identity.verification.equipmentStatus, 'VERIFIED_ONCHAIN');
  const service = new ArenaService(), legacy = { key: identity.key, pet: { ...structuredClone(identity.pet), identitySource: 'AUTHENTICATED_HATCHERY' } };
  const prior = service.me(legacy), oldRoom = service.challenge(legacy, {}).id, frozen = structuredClone(service.db.rooms[oldRoom]);
  const me = service.me(identity); assert.deepEqual(me.build.gearStats, s.equipment.stats);
  assert.deepEqual(me.build.allocation, prior.build.allocation); assert.deepEqual(me.build.ranks, prior.build.ranks); assert.deepEqual(me.build.loadout, prior.build.loadout);
  assert.equal(Object.keys(service.db.profiles).length, 1); assert.deepEqual(service.db.rooms[oldRoom], frozen);
  assert.equal('verification' in me.pet, false); assert.equal('ownerAddress' in me.pet, false); assert.equal('key' in me, false);
  identity.pet.gearStats.STR = 999; assert.notEqual(s.equipment.stats.STR, 999);
});

test('unknown, stale, wrong-owner and inconsistent equipment cannot become an empty Arena loadout', async () => {
  for (const mutate of [s => { delete s.equipment; }, s => { s.equipment.revision++; }, s => { s.equipment.ownerAddress = fixture.otherOwner; },
    s => { s.equipment.stats.STR++; }, s => { s.equipment.visual.layers[0].sha256 = '0'.repeat(64); },
    s => { s.equipment = { schemaVersion: 'AXO_GEAR_READ_FAILURE_V1', status: 'UNAVAILABLE', reason: 'NOT_MINTED', data: null }; }]) {
    const s = snapshot(); mutate(s); await assert.rejects(createVerifiedArenaAuthenticator(ports(s))({}), /ARENA_EQUIPMENT_UNAVAILABLE/);
  }
  const empty = snapshot(); empty.equipment = structuredClone(fixture.projections.empty);
  const identity = await createVerifiedArenaAuthenticator(ports(empty))({});
  assert.equal(identity.pet.gearLoadout.length, 0); assert.equal(identity.verification.equipmentStatus, 'VERIFIED_ONCHAIN');
});

test('unminted Pets require explicit NOT_MINTED evidence, without assigning equipment or NFT identity', async () => {
  const s = { identity: structuredClone(fixture.identities.level1), equipment: { schemaVersion: 'AXO_GEAR_READ_FAILURE_V1', status: 'UNAVAILABLE', reason: 'NOT_MINTED', data: null } };
  const identity = await createVerifiedArenaAuthenticator(ports(s))({});
  assert.equal(identity.verification.equipmentStatus, 'NOT_MINTED'); assert.equal(identity.pet.gearLoadout.length, 0);
  delete s.equipment; await assert.rejects(createVerifiedArenaAuthenticator(ports(s))({}), /ARENA_EQUIPMENT_UNAVAILABLE/);
});

test('shared validation rejects expired reads, altered XP, owner, V2 stats and preview layers', async () => {
  const s = snapshot(), p = ports(s), read = await createPetReader(p)({});
  const context = { expectedOwnerAddress: s.identity.ownerAddress, secret, visualCatalog, now: time };
  for (const mutate of [r => { r.expiresAt = r.observedAt; }, r => { r.identity.level = 20; }, r => { r.identity.xp = '17950'; },
    r => { r.identity.ownerAddress = fixture.otherOwner; }, r => { r.equipment.stats.STR = 999; }, r => { r.authoritativeVisual.layers[0].url = '/gear-bazaar/v1/preview.webp'; },
    r => { r.previewOutfit = {}; }]) {
    const bad = structuredClone(read); mutate(bad); assert.throws(() => arenaIdentityFromPetRead(bad, context), /ARENA_PET_INCONSISTENT/);
  }
  assert.throws(() => arenaIdentityFromPetRead(read, { ...context, now: time + 60000 }), /ARENA_PET_INCONSISTENT/);
  assert.throws(() => createVerifiedArenaAuthenticator({ ...p, secret: '' }), /secret required/);
});

test('authentication fails closed before snapshot access and supports cancellation', async () => {
  let calls = 0; const p = ports();
  await assert.rejects(createVerifiedArenaAuthenticator({ ...p, authenticate: async () => ({ verified: false, address: owner }), readVerifiedPetSnapshot: async () => { calls++; } })({}), /VERIFIED_SESSION_REQUIRED/);
  assert.equal(calls, 0); const controller = new AbortController(); controller.abort();
  await assert.rejects(createVerifiedArenaAuthenticator(p)({}, { signal: controller.signal }), /PET_READ_ABORTED/);
});

function host(s = snapshot(), extra = {}) {
  const app = express(), service = new ArenaService({ privacyMode: 'strict', matchmaking: true });
  const mounted = mountVerifiedPetArena(app, { ...ports(s), sessionSecret: secret, isPetHost: req => req.hostname === 'axo.pet', service, ...extra });
  return { app, service, mounted };
}
const get = (app, path = '/api/arena/me') => request(app).get(path).set('Host', 'axo.pet');
const post = (app, path, body) => request(app).post(path).set('Host', 'axo.pet').set('Origin', 'https://axo.pet').send(body);

test('host routes expose private evidence, no session secrets, and preserve no-store/host/origin gates', async () => {
  const { app, service } = host();
  const result = await get(app).expect(200); assert.equal(result.body.pet.xp, 17950); assert.equal(result.body.verification.previewPolicy, 'COSMETIC_ONLY');
  assert.equal(result.headers['cache-control'], 'private, no-store');
  assert.equal(JSON.stringify(result.body).includes(snapshot().identity.ownerAddress), false); assert.equal(JSON.stringify(result.body).includes(secret), false);
  const before = structuredClone(service.db); await get(app).expect(200); assert.deepEqual(service.db, before);
  await request(app).get('/api/arena/config').set('Host', 'wrong.example').expect(404);
  await request(app).post('/api/arena/challenges').set('Host', 'axo.pet').set('Origin', 'https://evil.example').send({ practice: true }).expect(403);
  for (const path of ['/arena/service.mjs', '/arena/identity.mjs', '/arena/state.json', '/arena/verified-pet.mjs']) await get(app, path).expect(404);
});

test('no new profiles/entries are written when verified equipment or session is unavailable', async () => {
  const s = snapshot(); delete s.equipment; const { app, service } = host(s);
  const before = structuredClone(service.db); const response = await post(app, '/api/arena/challenges', { practice: true }).expect(503);
  assert.equal(response.body.code, 'ARENA_VERIFICATION_UNAVAILABLE'); assert.deepEqual(service.db, before);
  const denied = host(snapshot(), { authenticate: async () => null }); await get(denied.app).expect(401); assert.deepEqual(denied.service.db.profiles, {});
});

test('browser XP, gear bonuses, previews and extra build/move authority are rejected', async () => {
  const { app, service } = host();
  for (const extra of [{ xp: 999999 }, { pet: {} }, { gearStats: { STR: 999 } }, { previewOutfit: {} }, { itemLevel: 20 }, { setBonus: {} }, { unexpected: true }]) {
    await post(app, '/api/arena/build', { allocation: {}, ranks: {}, loadout: [], ...extra }).expect(400);
  }
  assert.deepEqual(service.db.profiles, {});
  await post(app, '/api/arena/challenges', { practice: true, preview: {} }).expect(400);
  await post(app, '/api/arena/challenges/missing/move', { round: 1, move: 'recharge', stats: {} }).expect(400);
});

test('battle freezes entry XP, revision and gear while refreshed /me uses the next verified snapshot', async () => {
  const s = snapshot(), { app, service } = host(s);
  const entry = await post(app, '/api/arena/challenges', { practice: true }).expect(200), frozen = structuredClone(service.db.rooms[entry.body.id].players[0]);
  s.identity.xp = 20000; s.identity.gearRevision++; s.equipment = structuredClone(fixture.projections.empty); s.equipment.revision = s.identity.gearRevision;
  const current = await get(app).expect(200); assert.equal(current.body.pet.xp, 20000); assert.equal(current.body.pet.gearLoadout.length, 0);
  assert.deepEqual(service.db.rooms[entry.body.id].players[0], frozen);
  service.clock = () => Date.now() + 10000; service.tick();
  await post(app, `/api/arena/challenges/${entry.body.id}/concede`, {}).expect(200);
  const replay = await get(app, `/api/arena/challenges/${entry.body.id}/replay`).expect(200);
  assert.equal(replay.body.schema, GEAR_REPLAY_SCHEMA); assert.deepEqual(replay.body.builds[0].gearStats, frozen.build.gearStats); verifyReplay(replay.body);
  const next = await post(app, '/api/arena/challenges', { practice: true }).expect(200);
  assert.equal(service.db.rooms[next.body.id].players[0].pet.xp, 20000); assert.equal(service.db.rooms[next.body.id].players[0].pet.gearLoadout.length, 0);
});

test('portable replay v2 retains combat gear, v1 remains readable, and neither exports identity or outfit data', () => {
  for (const equipped of [false, true]) {
    const builds = ['sapphire_tide', 'rose_bloom'].map(lineageId => buildPet({ lineageId, xp: 17950, ...(equipped ? { gearStats: fixture.projections.full.stats } : {}) }));
    let battle = newBattle(builds); battle = resolve(battle, ['market_order', 'market_order']); battle.status = 'won'; battle.winner = 0; battle.reason = 'CONCEDED';
    const doc = exportReplay({ battle, status: 'won', players: builds.map(build => ({ build, pet: { name: 'PRIVATE' } })), createdAt: 1, startedAt: 2, finishedAt: 3 });
    assert.equal(doc.schema, equipped ? GEAR_REPLAY_SCHEMA : REPLAY_SCHEMA); assert.equal(doc.ruleset, VERSION); verifyReplay(doc);
    assert.doesNotMatch(JSON.stringify(doc), /PRIVATE|ownerAddress|gearLoadout|appearanceSeed|preview/i);
    if (equipped) { const bad = structuredClone(doc); bad.builds[0].gearStats.CON = 6; bad.fingerprint = fingerprint(bad); assert.throws(() => verifyReplay(bad)); }
  }
});

test('verified image loading checks bytes/hash/dimensions, does not send cookies, and caches failures', async () => {
  const bytes = new Uint8Array([1, 2, 3]), hash = createHash('sha256').update(bytes).digest('hex'); let calls = 0, decodes = 0;
  const image = { complete: true, naturalWidth: 1024, naturalHeight: 1024 };
  const cache = createVerifiedImageCache({ fetchImage: async (_url, options) => { calls++; assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); return new Response(bytes); }, digest: async b => createHash('sha256').update(new Uint8Array(b)).digest(), decode: async () => { decodes++; return image; } });
  const layer = { url: '/hatchery-nft-v5/pet_sapphire_tide_l10.webp', sha256: hash };
  assert.equal(cache.image(layer), null); await cache.settled(); assert.equal(cache.image(layer), image); assert.equal(calls, 1);
  const bad = { ...layer, sha256: '0'.repeat(64) }; cache.image(bad); await cache.settled(); assert.equal(cache.image(bad), null); assert.equal(cache.image(bad), null); assert.equal(calls, 2); assert.equal(decodes, 1);
  assert.equal(cache.image({ ...layer, url: 'https://evil.example/a.webp' }), null); assert.equal(calls, 2);
});

test('loadout panel distinguishes authoritative V1 equipment from cosmetic-only previews', async () => {
  const identity = await createVerifiedArenaAuthenticator(ports())({}), me = { ...new ArenaService().me(identity), verification: identity.verification };
  const html = verifiedPetPanel(me); assert.match(html, /17,950 exact XP/); assert.match(html, /8 equipped V1 items/); assert.match(html, /PREVIEW OUTFITS · COSMETIC ONLY/);
  assert.match(html, /Frozen when you enter/); assert.match(html, /Level 11–20 gear transactions remain locked/); assert.doesNotMatch(html, /0x1111/);
  assert.match(verifiedPetPanel({ pet: { identitySource: 'SYNTHETIC' } }), /No live identity/);
});
