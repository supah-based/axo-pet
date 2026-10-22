import test from 'node:test';import assert from 'node:assert/strict';
import {harness} from './repair-dom-harness.mjs';import {combatAudio,DEFAULT_AUDIO} from '../combat-audio.mjs';

test('audio controls adjust local mix without writes or changing authoritative Pet, gear or combat state',async t=>{
 const h=await harness();t.after(async()=>{combatAudio.update(DEFAULT_AUDIO);combatAudio.disable();await h.close();});await h.navigate(h.A);const before=JSON.stringify(h.service.db),posts=h.requests.filter(r=>r.body!==undefined).length;
 await h.click('[data-action="presentation-settings"]');assert.match(h.document.querySelector('[data-audio-status]').textContent,/Enable Sound/);
 const slider=h.document.querySelector('[data-audio-setting="effects"]');slider.value='37';slider.dispatchEvent(new h.window.Event('input',{bubbles:true}));await h.flush();assert.equal(combatAudio.status().preferences.effects,.37);assert.equal(h.document.querySelector('[data-audio-output="effects"]').textContent,'37%');
 const mono=h.document.querySelector('[data-audio-setting="mono"]');mono.checked=true;mono.dispatchEvent(new h.window.Event('change',{bubbles:true}));await h.flush();assert.equal(combatAudio.status().preferences.mono,true);
 await h.click('[data-action="audio-test"]');assert.equal(combatAudio.status().enabled,false);assert.equal(h.requests.filter(r=>r.body!==undefined).length,posts);assert.equal(JSON.stringify(h.service.db),before);assert.deepEqual(h.errors,[]);
});

test('unsupported audio reports unavailable and leaves current battle controls usable',async t=>{
 const h=await harness();t.after(async()=>{combatAudio.disable();await h.close();});await h.navigate(h.A);const before=JSON.stringify(h.service.db);await h.click('#sound');assert.equal(h.document.querySelector('#sound').textContent,'Sound unavailable');assert.equal(h.document.querySelector('#sound').getAttribute('aria-pressed'),'false');assert.equal(JSON.stringify(h.service.db),before);assert.ok([...h.document.querySelectorAll('[data-action="move"]')].some(b=>!b.disabled));assert.deepEqual(h.errors,[]);
});
