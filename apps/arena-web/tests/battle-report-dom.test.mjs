import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { harness } from './repair-dom-harness.mjs';
// WebCrypto completes off the JS event loop. A fixed number of immediate turns
// does not establish readiness on every platform or under CI contention.
async function until(h, predicate, label) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) { await wait(2); await h.flush(); }
  assert.ok(predicate(), label + ': ' + h.document.querySelector('#toast').textContent);
}
const reportReady = h => until(h, () => !!h.document.querySelector('#battle-report-title'), 'Completed report did not become ready');
async function completed(t) {
  const h = await harness(); t.after(() => h.close());
  h.service.choose(h.a, h.A, { round: 1, move: 'market_order' }); h.service.choose(h.b, h.A, { round: 1, move: 'diamond_hands' });
  h.service.cancel(h.a, h.A, {}); await h.navigate(h.A); return h;
}

test('completed battle opens a report and jumps to the exact exchange without a combat write', async t => {
  const h = await completed(t), before = JSON.stringify(h.service.db), posts = h.requests.filter(r => r.body !== undefined).length;
  await h.click('[data-action="battle-report"]'); await reportReady(h); assert.equal(h.document.activeElement.id, 'battle-report-title');
  await h.click('[data-action="report-exchange"][data-round="1"]'); assert.match(h.document.querySelector('#replay-position').textContent, /Exchange 1/);
  await h.click('[data-action="battle-report"]'); assert.match(h.document.querySelector('#battle-report-title').textContent, /Defeat/);
  assert.equal(h.requests.filter(r => r.body !== undefined).length, posts); assert.equal(JSON.stringify(h.service.db), before);
});

test('match history opens completed reports directly and result navigation clears the report route', async t => {
  const h = await completed(t); await h.click('[data-tab="arena"]'); await h.click('[data-action="history"]');
  assert.ok(h.document.querySelector('[data-action="open-battle-report"]'));
  await h.click('[data-action="open-battle-report"]'); await reportReady(h); assert.match(h.location.hash, /view=report/);
  await h.click('[data-action="replay-close"]'); assert.ok(h.document.querySelector('#battle-canvas')); assert.doesNotMatch(h.location.hash, /view=report/);
});

test('late old-match report response cannot replace a different selected room', async t => {
  const h = await completed(t), gate = h.hold('/challenges/' + h.A + '/replay');
  await h.click('[data-action="battle-report"]'); assert.equal(gate.used, true); await h.navigate(h.B);
  gate.release(); await h.flush(); assert.equal(h.document.querySelector('#battle-report-title'), null); assert.equal(h.last().state.id, h.B);
});

test('wallet change discards an in-flight private report and clears old fighter details', async t => {
  const h = await completed(t), gate = h.hold('/challenges/' + h.A + '/replay');
  await h.click('[data-action="battle-report"]'); const me = h.hold('/me');
  h.window.dispatchEvent(new h.window.Event('axo:session')); await h.flush(); gate.release(); await h.flush();
  assert.equal(h.document.querySelector('#battle-report-title'), null); assert.doesNotMatch(h.document.querySelector('#main').textContent, /Review fighter 1/);
  me.override = { ok: false, status: 401, json: async () => ({ error: 'Signed out' }) }; me.release(); await h.flush();
  assert.match(h.document.querySelector('#main').textContent, /Bring your Hatchery Pet/);
});

test('corrupted replay refuses the report and leaves a retryable completed result', async t => {
  const h = await completed(t), gate = h.hold('/challenges/' + h.A + '/replay');
  await h.click('[data-action="battle-report"]'); const doc = h.service.replay(h.a, h.A); doc.fingerprint = '0'.repeat(64);
  gate.override = { ok: true, status: 200, json: async () => doc }; gate.release(); await h.flush();
  await until(h, () => h.document.querySelector('#toast').textContent.includes('fingerprint mismatch'), 'Corruption was not rejected');
  assert.equal(h.document.querySelector('#battle-report-title'), null); assert.match(h.document.querySelector('#toast').textContent, /fingerprint mismatch/);
  await h.click('[data-action="battle-report"]'); await reportReady(h);
});

test('active battles and nonparticipant previews expose no report controls', async t => {
  const h = await harness({ strict: true }); t.after(() => h.close());
  await h.navigate(h.A); assert.equal(h.document.querySelector('[data-action="battle-report"]'), null);
  h.service.cancel(h.c, h.B, {}); await h.navigate(h.B);
  assert.equal(h.document.querySelector('[data-action="battle-report"]'), null);
  h.location.hash = 'challenge=' + h.B + '&view=report'; await h.flush();
  assert.equal(h.document.querySelector('#battle-report-title'), null); assert.equal(h.requests.some(r => r.path === '/challenges/' + h.B + '/replay'), false);
});
