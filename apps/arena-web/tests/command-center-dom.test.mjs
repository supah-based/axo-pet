import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { harness } from './repair-dom-harness.mjs';
import { DEFAULT_PRESENTATION, activePresentation, updatePresentation } from '../presentation.mjs';

test('Command Center opens cosmetic lab, suppresses private polling there and returns to verified lobby',async t=>{
  const h=await harness();t.after(()=>h.close());
  assert.ok(h.document.querySelector('.command-center'));await h.click('[data-tab="style-lab"]');
  assert.ok(h.document.querySelector('#style-lab-title'));const before=h.requests.filter(r=>r.path==='/me').length;
  await h.poll();assert.equal(h.requests.filter(r=>r.path==='/me').length,before);
  await h.click('[data-tab="arena"]');assert.ok(h.document.querySelector('.command-center'));assert.equal(h.document.querySelector('[data-lab-canvas]'),null);assert.deepEqual(h.errors,[]);
});

test('presentation settings alter browser presentation only and preserve focus and authoritative build',async t=>{
  const h=await harness();t.after(()=>h.close());t.after(()=>updatePresentation(DEFAULT_PRESENTATION));
  const before=JSON.stringify(h.service.db),posts=h.requests.filter(r=>r.body!==undefined).length,button=h.document.querySelector('[data-action="presentation-settings"]');button.focus();
  await h.click('[data-action="presentation-settings"]');const box=h.document.querySelector('[data-arena-setting="contrast"]');box.checked=true;box.dispatchEvent(new h.window.Event('change',{bubbles:true}));
  assert.equal(activePresentation().contrast,true);assert.equal(h.document.body.classList.contains('arena-contrast'),true);
  await h.click('[data-action="close-panel"]');assert.equal(h.document.activeElement,button);assert.equal(JSON.stringify(h.service.db),before);assert.equal(h.requests.filter(r=>r.body!==undefined).length,posts);
});

test('guided lesson and spectator controls stay in a collapsed match menu with disclosure/focus preserved across receipts',async t=>{
  const h=await harness({strict:true});t.after(()=>h.close());h.service.cancel(h.a,h.A,{});await h.click('[data-tab="arena"]');await h.click('[data-action="guided-practice"]');
  const tools=h.document.querySelector('.battle-tools');assert.ok(tools);assert.equal(tools.hasAttribute('open'),false);assert.match(tools.querySelector('summary').textContent,/Lesson 1\/5/);
  assert.ok(tools.querySelector('[data-action="spectator-consent"]'));assert.equal(h.document.querySelector('.combat-screen > .spectator-access'),null);assert.equal(h.document.querySelector('.combat-screen > .practice-guide'),null);
  tools.setAttribute('open','');tools.querySelector('summary').focus();const room=h.last().state;h.service.choose(h.a,room.id,{round:1,move:'market_order'});await h.poll();
  assert.equal(h.document.querySelector('.battle-tools').hasAttribute('open'),true);assert.equal(h.document.activeElement.tagName,'SUMMARY');assert.deepEqual(h.errors,[]);
  h.service.cancel(h.a,room.id,{});await h.poll();assert.equal(h.document.querySelector('.battle-tools').hasAttribute('open'),false,'Result transition closes the auxiliary menu');
});

test('replay exchange seeking and speed controls preserve frozen entry values without combat writes',async t=>{
  const h=await harness();t.after(()=>h.close());h.service.choose(h.a,h.A,{round:1,move:'market_order'});h.service.choose(h.b,h.A,{round:1,move:'diamond_hands'});h.service.cancel(h.a,h.A,{});await h.navigate(h.A);
  const before=JSON.stringify(h.service.db),posts=h.requests.filter(r=>r.body!==undefined).length;await h.click('[data-action="replay"]');
  const deadline=Date.now()+3000;while(!h.document.querySelector('#replay-frame')&&Date.now()<deadline){await wait(2);await h.flush();}
  const slider=h.document.querySelector('#replay-frame');assert.ok(slider);slider.value='1';slider.dispatchEvent(new h.window.Event('change',{bubbles:true}));await h.flush();
  assert.match(h.document.querySelector('#replay-position').textContent,/Exchange 1/);assert.equal(h.document.activeElement.id,'replay-frame');assert.equal(h.document.querySelectorAll('#replay-speed option').length,4);
  h.document.querySelector('#main').scrollTop=250;await h.click('[data-action="replay-play"]');
  assert.match(h.document.querySelector('#replay-position').textContent,/Initial frozen/);assert.equal(h.document.querySelector('#main').scrollTop,250);
  const speed=h.document.querySelector('#replay-speed');Object.defineProperty(speed,'value',{configurable:true,value:'2'});speed.dispatchEvent(new h.window.Event('change',{bubbles:true}));
  assert.equal(h.document.querySelector('[data-action="replay-play"]').textContent,'Pause');assert.equal(h.document.querySelector('#main').scrollTop,250);
  assert.equal(JSON.stringify(h.service.db),before);assert.equal(h.requests.filter(r=>r.body!==undefined).length,posts);assert.deepEqual(h.errors,[]);
});
