import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './repair-dom-harness.mjs';

test('wallet session changes immediately clear the fighter and discard a late old-wallet read', async t => {
  const h = await harness(); t.after(() => h.close());
  assert.match(h.document.querySelector('#main').textContent, /Review fighter 1/);
  const old = h.hold('/me'); h.document.querySelector('[data-tab="arena"]').click(); await h.flush();
  assert.equal(old.used, true);
  const next = h.hold('/me'); h.window.dispatchEvent(new h.window.Event('axo:session')); await h.flush();
  assert.equal(next.used, true); assert.doesNotMatch(h.document.querySelector('#main').textContent, /Review fighter 1/);
  old.release(); await h.flush(); assert.doesNotMatch(h.document.querySelector('#main').textContent, /Review fighter 1/);
  next.override = { ok: false, status: 401, json: async () => ({ error: 'Signed out' }) }; next.release(); await h.flush();
  assert.match(h.document.querySelector('#main').textContent, /Bring your Hatchery Pet/);
});

test('equipment verification failure presents a blocking reconnect screen with a retry control', async t => {
  const h = await harness(); t.after(() => h.close());
  const gate = h.hold('/me'); gate.override = { ok: false, status: 503, json: async () => ({ error: 'Verification unavailable' }) };
  h.document.querySelector('[data-tab="arena"]').click(); await h.flush(); gate.release(); await h.flush();
  assert.match(h.document.querySelector('#main').textContent, /PET VERIFICATION PAUSED/);
  assert.ok(h.document.querySelector('[data-action="refresh"]')); assert.equal(h.document.querySelector('[data-action="practice"]'), null);
  await h.click('[data-action="refresh"]'); assert.match(h.document.querySelector('#main').textContent, /Review fighter 1/);
});

test('shared Pet loadout panel is reachable in lobby and workshop and carries no transaction action', async t => {
  const h = await harness(); t.after(() => h.close());
  h.a.pet.identitySource = 'AUTHENTICATED_PET_READ_V1'; h.a.pet.xp = 17950;
  await h.click('[data-tab="arena"]'); await h.click('[data-action="verified-pet"]');
  assert.match(h.document.querySelector('#game-panel').textContent, /17,950 exact XP/);
  assert.match(h.document.querySelector('#game-panel').textContent, /COSMETIC ONLY/);
  assert.equal(h.document.querySelector('#game-panel [data-action="mint"]'), null);
  await h.click('[data-action="close-panel"]'); await h.click('[data-tab="build"]');
  await h.click('[data-action="verified-pet"]'); assert.match(h.document.querySelector('#game-panel').textContent, /Frozen when you enter/);
});

test('ordinary synthetic preview ignores host wallet session events', async t => {
  const h = await harness({ preview: true }); t.after(() => h.close());
  const before = h.requests.length; h.window.dispatchEvent(new h.window.Event('axo:session')); await h.flush();
  assert.equal(h.requests.length, before); assert.match(h.document.querySelector('#main').textContent, /Review fighter 1/);
});
