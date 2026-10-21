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
