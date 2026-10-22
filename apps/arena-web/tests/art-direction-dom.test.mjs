import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './repair-dom-harness.mjs';
const exits=h=>h.requests.filter(r=>/\/concede$/.test(r.path)&&r.body!==undefined);

test('match exit is explicit, non-blocking and cancellable with no combat write',async t=>{
 const h=await harness();t.after(()=>h.close());await h.navigate(h.A);
 const opener=h.document.querySelector('[data-action="concede"]');opener.focus();const before=JSON.stringify(h.service.db),posts=exits(h).length;
 await h.click('[data-action="concede"]');const panel=h.document.querySelector('#game-panel');assert.equal(panel.dataset.panel,'match-exit');assert.match(panel.textContent,/opponent the win/);assert.match(panel.textContent,/clock continues/);assert.equal(exits(h).length,posts);
 await h.click('[data-action="close-panel"]');assert.equal(h.document.querySelector('#game-panel'),null);assert.equal(h.document.activeElement,opener);assert.equal(JSON.stringify(h.service.db),before);assert.deepEqual(h.errors,[]);
});

test('confirming exit submits exactly one request even while its response is pending',async t=>{
 const h=await harness();t.after(()=>h.close());await h.navigate(h.A);await h.click('[data-action="concede"]');const slow=h.hold('/challenges/'+h.A+'/concede','POST');
 await h.click('[data-action="confirm-concede"]');assert(slow.used);assert.equal(exits(h).length,1);assert.equal(h.document.querySelector('#game-panel'),null);slow.release();await h.flush();assert.equal(h.last().state.status,'won');assert.equal(exits(h).length,1);assert.equal(h.document.querySelector('.winner-decal').textContent,'DEFEAT');assert.deepEqual(h.errors,[]);
});

test('leaving a route invalidates an open exit panel without cancelling either match',async t=>{
 const h=await harness();t.after(()=>h.close());await h.navigate(h.A);await h.click('[data-action="concede"]');const stale=h.document.querySelector('[data-action="confirm-concede"]');
 await h.navigate(h.B);stale.click();await h.flush();assert.equal(exits(h).length,0);assert.equal(h.last().state.id,h.B);assert.equal(h.service.room(h.A).status,'playing');assert.equal(h.service.room(h.B).status,'playing');assert.deepEqual(h.errors,[]);
});

test('a terminal receipt while confirmation is open cannot turn into a new concession',async t=>{
 const h=await harness();t.after(()=>h.close());await h.navigate(h.A);await h.click('[data-action="concede"]');h.service.cancel(h.b,h.A,{});await h.poll();
 await h.click('[data-action="confirm-concede"]');assert.equal(exits(h).length,0);assert.equal(h.document.querySelector('#game-panel'),null);assert.equal(h.last().state.status,'won');assert.equal(h.document.querySelector('.winner-decal').textContent,'VICTORY');assert.deepEqual(h.errors,[]);
});

test('countdown cancellation preserves its original no-loss intent after FIGHT begins',async t=>{
 const h=await harness({matchmaking:true,strict:true});t.after(()=>h.close());h.service.cancel(h.a,h.A,{});await h.click('[data-tab="arena"]');await h.click('[data-action="guided-practice"]');const id=h.last().state.id;assert.equal(h.last().state.phase,'countdown');
 await h.click('[data-action="concede"]');assert.equal(h.document.querySelector('#game-panel').dataset.beforeFight,'true');h.advance(3500);await h.poll();assert.equal(h.last().state.phase,'choosing');
 await h.click('[data-action="confirm-concede"]');assert.deepEqual(exits(h).at(-1).body,{beforeFight:true});assert.equal(h.service.room(id).status,'playing');assert.deepEqual(h.errors,[]);
});
