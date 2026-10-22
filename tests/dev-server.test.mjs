import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createDevServer } from '../scripts/dev-server.mjs';

async function fixture(t, options = {}) {
  const server = createDevServer({ liveAssets: false, ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('source pages load while private source, state and host APIs stay unavailable', async t => {
  const origin = await fixture(t);
  for (const path of ['/', '/my-axo', '/hatchery/game', '/nft', '/marketplace', '/gear-studio', '/gear-concepts', '/arena/']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /AXO LOCAL SOURCE/, path);
  }
  for (const path of ['/.git/config', '/package.json', '/AGENTS.md', '/arena/server.mjs', '/arena/review/private-state-v1.2.json']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(origin + '/api/axo-pet/overview')).status, 503);
  assert.equal((await fetch(origin + '/api/axo-pet/mint', { method: 'POST' })).status, 405);
  assert.match(await (await fetch(origin + '/hatchery')).text(), /awaits extraction/);
  const wardrobe = await fetch(origin + '/hatchery?view=wardrobe');
  assert.equal(wardrobe.status, 200); assert.match(await wardrobe.text(), /data-axo-wardrobe/);
  for (const path of ['/wardrobe/entry.mjs', '/wardrobe/view.mjs', '/wardrobe/model.mjs', '/wardrobe/markup.mjs', '/wardrobe/wardrobe.css']) assert.equal((await fetch(origin + path)).status, 200, path);
  for (const path of ['/wardrobe/source.json', '/hatchery/wardrobe-review', '/hatchery/wardrobe-mobile-review', '/__dev/wardrobe-fixture', '/__dev/wardrobe-review.mjs']) assert.equal((await fetch(origin + path)).status, 404, path);
  assert.equal((await fetch(origin + '/api/hatchery/wardrobe')).status, 503);
  assert.match(await (await fetch(origin + '/assets/wallet.js')).text(), /wallet connections are unavailable/i);
  const catalog = await fetch(origin + '/gear-style-studio/v1/catalog.json');
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).status, 'CANDIDATE');
  assert.equal((await fetch(origin + '/gear-style-studio/model.mjs')).status, 200);
  assert.equal((await fetch(origin + '/gear-style-studio/style-studio-v1.source.json')).status, 404);
  assert.equal((await fetch(origin + '/gear-anatomy/v3/catalog.json')).status, 200);
  assert.equal((await fetch(origin + '/gear-anatomy/model.mjs')).status, 200);
  assert.equal((await fetch(origin + '/gear-anatomy/anatomy-rig-v3.json')).status, 404);
  for (const path of ['/gear-progression.js','/gear-progression.css','/gear-bazaar/progression-v2.mjs','/gear-bazaar/gear-sets-v2.mjs','/gear-bazaar/wardrobe-filters.mjs','/gear-bazaar/v1/catalog.json','/gear-bazaar/v1/metadata/hexforge-vest-l20.json']) assert.equal((await fetch(origin + path)).status,200,path);
  for (const path of ['/gear-bazaar/v1/source.json','/gear-bazaar/v1/metadata/private.txt','/gear-bazaar/v1/metadata/../package.json']) assert.equal((await fetch(origin + path)).status,404,path);
});

test('opt-in loopback Wardrobe review is explicitly synthetic and does not enable private APIs or wallet access', async t => {
  const origin = await fixture(t, { wardrobeReview: true });
  const reviewResponse = await fetch(origin + '/hatchery/wardrobe-review'), page = await reviewResponse.text();
  assert.match(reviewResponse.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.match((await fetch(origin + '/hatchery?view=wardrobe')).headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(page, /SYNTHETIC WARDROBE REVIEW/); assert.match(page, /__dev\/wardrobe-review.mjs/);
  assert.match(await (await fetch(origin + '/hatchery/wardrobe-mobile-review')).text(), /width="390" height="844"/);
  const response = await fetch(origin + '/__dev/wardrobe-fixture'), body = await response.json();
  assert.equal(body.syntheticOnly, true); assert.equal(body.read.identity.name, 'Review AXO · synthetic'); assert.equal(body.read.identity.xp, 2675);
  assert.equal((await fetch(origin + '/api/hatchery/wardrobe')).status, 503);
  assert.match(await (await fetch(origin + '/assets/wallet.js')).text(), /wallet connections are unavailable/);
  assert.equal((await fetch(origin + '/api/hatchery/wardrobe', { method: 'POST' })).status, 405);
});

test('Passport source and optional synthetic review remain separate from private APIs and fixtures', async t => {
  const origin=await fixture(t);assert.match(await (await fetch(origin+'/passport')).text(),/data-axo-passport/);
  assert.match(await (await fetch(origin+'/nft')).text(),/data-axo-passport/);
  for(const path of ['/passport/entry.mjs','/passport/view.mjs','/passport/markup.mjs','/passport/model.mjs','/passport/history.mjs','/passport/passport.css','/passport/reference.json'])assert.equal((await fetch(origin+path)).status,200,path);
  for(const path of ['/passport/review','/passport/mobile-review','/__dev/passport-review.mjs','/__dev/passport-fixture','/passport/private.json'])assert.equal((await fetch(origin+path)).status,404,path);
  const review=await fixture(t,{passportReview:true});assert.match(await (await fetch(review+'/passport/review')).text(),/SYNTHETIC PASSPORT REVIEW/);
  const data=await (await fetch(review+'/__dev/passport-fixture')).json();assert.equal(data.syntheticOnly,true);assert.equal(data.read.pet.identity.xp,2675);assert.equal(data.read.history.status,'AVAILABLE');
  assert.equal((await fetch(review+'/api/pet/v1/passport')).status,503);assert.equal((await fetch(review+'/api/pet/v1/passport',{method:'POST'})).status,405);
  assert.match(await (await fetch(review+'/passport/mobile-review')).text(),/width="390" height="844"/);
});

test('Arena accepts only same-origin synthetic identities and retains no disk store', async t => {
  const origin = await fixture(t);
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ name: 'Review Pet', lineageId: 'emerald_sprout', level: 10 }) };
  assert.equal((await fetch(origin + '/api/arena/preview-session', { ...options, headers: { ...options.headers, Origin: 'https://example.org' } })).status, 403);
  const session = await fetch(origin + '/api/arena/preview-session', options);
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(origin + '/api/arena/me', { headers: { Cookie: cookie } })).json();
  assert.equal(me.pet.identitySource, 'SYNTHETIC_REVIEW_PET');
  assert.equal(me.stakesEnabled, false);
  const otherOrigin = await fixture(t);
  assert.equal((await fetch(otherOrigin + '/api/arena/me', { headers: { Cookie: cookie } })).status, 401);
});

test('opt-in Arena pipeline review uses shared Pet validation without enabling live APIs or transactions', async t => {
  const ordinary = await fixture(t); assert.equal((await fetch(ordinary + '/api/arena/me')).status, 401);
  const origin = await fixture(t, { arenaReview: true });
  assert.match(await (await fetch(origin + '/arena/')).text(), /SYNTHETIC ARENA PIPELINE REVIEW/);
  const config = await (await fetch(origin + '/api/arena/config')).json(); assert.equal(config.syntheticOnly, true);
  const me = await (await fetch(origin + '/api/arena/me')).json();
  assert.equal(me.pet.identitySource, 'AUTHENTICATED_PET_READ_V1'); assert.equal(me.pet.xp, 17950);
  assert.equal(me.pet.gearLoadout.length, 8); assert.equal(me.verification.equipmentStatus, 'VERIFIED_ONCHAIN');
  assert.equal((await fetch(origin + '/api/pet/v1/me')).status, 503);
  assert.equal((await fetch(origin + '/api/arena/preview-session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  for (const path of ['/api/arena/build', '/api/arena/challenges']) assert.equal((await fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ previewOutfit: {}, gearStats: { STR: 999 } }) })).status, 400);
});

test('completed battle-report review is opt-in, synthetic, memory-only and replay-consistent', async t => {
  const origin = await fixture(t, { arenaReview: 'reports' });
  const me = await (await fetch(origin + '/api/arena/me')).json(); assert.equal(me.rooms.length, 1); assert.equal(me.rooms[0].status, 'won');
  const doc = await (await fetch(origin + '/api/arena/challenges/' + me.rooms[0].id + '/replay')).json();
  const { analyzeBattleReplay } = await import('../apps/arena-web/battle-report.mjs');
  const { report } = await analyzeBattleReplay(doc); assert.equal(report.exchangeCount, 6); assert.equal(report.fighters[0].xp, 17950);
  assert.ok(report.fighters[0].totals.blocked > 0); assert.ok(report.fighters[0].totals.healed > 0);
  for (const path of ['/arena/battle-report.mjs', '/arena/battle-report-view.mjs', '/arena/battle-report.css']) assert.equal((await fetch(origin + path)).status, 200, path);
  for (const path of ['/api/pet/v1/me', '/api/hatchery/wardrobe']) assert.equal((await fetch(origin + path)).status, 503);
  const unseeded = await fixture(t, { arenaReview: true }); assert.equal((await (await fetch(unseeded + '/api/arena/me')).json()).rooms.length, 0);
});

test('Arena atelier exposes only pinned fitted runtime assets and keeps internal source private', async t => {
  const origin=await fixture(t), {createHash}=await import('node:crypto');
  const {ATELIER_CATALOG_SHA256,atelierManifest,atelierMediaUrl}=await import('../apps/arena-web/style-lab-model.mjs');
  const response=await fetch(origin+'/arena/atelier/catalog.json'), bytes=new Uint8Array(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),ATELIER_CATALOG_SHA256);
  const catalog=JSON.parse(new TextDecoder().decode(bytes)), layer=atelierManifest(catalog).values().next().value;
  const image=await fetch(origin+atelierMediaUrl(layer.url));assert.equal(image.status,200);assert.equal(createHash('sha256').update(new Uint8Array(await image.arrayBuffer())).digest('hex'),layer.sha256);
  for(const path of ['/arena/atelier/model.mjs','/arena/command-center.mjs','/arena/presentation.mjs','/arena/style-lab.mjs','/arena/style-lab-model.mjs','/arena/command-center.css','/arena/equipped-rig.mjs','/arena/equipped-puppet.mjs','/arena/equipped-canonical.mjs','/arena/animation-cues.mjs','/arena/fitted-preview.mjs','/arena/arena-look-store.mjs','/arena/fitted-inspector.mjs','/arena/interface-kit.mjs','/arena/art-direction.css'])assert.equal((await fetch(origin+path)).status,200,path);
  for(const path of ['/arena/equipped-inspector.mjs','/arena/atelier/private.json','/arena/atelier/media/anatomy/anatomy-rig-v3.json','/arena/atelier/media/bazaar/catalog.json','/arena/atelier/media/anatomy/../../server.mjs','/arena/atelier/media/bazaar/not-listed.webp','/arena/atelier/media/anatomy/degen-shell-vest.cloth-master.webp'])assert.equal((await fetch(origin+path)).status,404,path);
  assert.equal((await fetch(origin+'/api/arena/me')).status,401);
});

test('asset fallback reads only fixed-origin public media and never forwards local credentials', async t => {
  const calls = [];
  const origin = await fixture(t, { liveAssets: true, fetchAsset: async (url, options) => {
    calls.push({ url, options }); return new Response('public-image');
  } });
  assert.equal((await fetch(origin + '/brand/axo-square-logo-v2.webp?secret=local', { headers: { Cookie: 'private=local', Authorization: 'Bearer local' } })).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://axo.pet/brand/axo-square-logo-v2.webp');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[0].options.redirect, 'error');
  await fetch(origin + '/api/secret'); await fetch(origin + '/brand/private.json');
  assert.equal(calls.length, 1);
});
