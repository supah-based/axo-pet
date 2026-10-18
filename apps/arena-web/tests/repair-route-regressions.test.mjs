// Desired-behavior assertions. These tests intentionally FAIL while release defects remain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,flush} from './repair-dom-harness.mjs';

test('R1a: an older route GET cannot overwrite a later selected match',async()=>{const h=await harness();try{
 const slow=h.hold('/challenges/'+h.A);await h.navigate(h.A);assert(slow.used);
 await h.navigate(h.B);assert.equal(h.last().state.id,h.B);slow.release();await flush();
 assert.equal(h.location.hash,'#challenge='+h.B);
 assert.equal(h.last().state.id,h.B,'Old A response rendered A under the B route');
}finally{await h.close();}});

test('R1b: a route GET that completes after selecting Pet build cannot revive combat',async()=>{const h=await harness();try{
 const slow=h.hold('/challenges/'+h.A);await h.navigate(h.A);await h.click('[data-tab="build"]');assert(h.document.querySelector('#pet-workshop'));
 slow.release();await flush();assert(h.document.querySelector('#pet-workshop'),'Old route replaced workshop with prior battle');
 assert(!h.document.querySelector('#battle-canvas'));
}finally{await h.close();}});

test('R1c: an older GET cannot erase a newer acknowledged move in the same match',async()=>{const h=await harness();try{
 await h.navigate(h.A);const slow=h.hold('/challenges/'+h.A),poll=h.poll();await flush();assert(slow.used);
 await h.click('[data-action="move"][data-key="market_order"]');assert.equal(h.service.room(h.A).pending[0],'market_order');assert.equal(h.last().state.locked,true);
 const acknowledgedRevision=h.last().state.revision;slow.release();await poll;
 assert.equal(h.last().state.locked,true,'Older poll erased acknowledged commitment and reopened move buttons');
 assert(h.last().state.revision>=acknowledgedRevision);
}finally{await h.close();}});

test('R1d: slow concede response cannot revive the abandoned match',async()=>{const h=await harness();try{
 await h.navigate(h.A);const slow=h.hold('/challenges/'+h.A+'/concede','POST');await h.click('[data-action="concede"]');assert(slow.used);
 await h.navigate(h.B);assert.equal(h.last().state.id,h.B);slow.release();await flush();
 assert.equal(h.last().state.id,h.B,'Concede response restored the old result over the newly selected match');
}finally{await h.close();}});

test('R1e: a delayed move acknowledgment cannot repaint old A while route B is loading',async()=>{const h=await harness();try{
 await h.navigate(h.A);const move=h.hold('/challenges/'+h.A+'/move','POST');await h.click('[data-action="move"][data-key="market_order"]');assert(move.used);
 const B=h.hold('/challenges/'+h.B);await h.navigate(h.B);assert(B.used);const paints=h.renderers.length;
 move.release();await flush();assert.equal(h.renderers.length,paints,'Route B did not invalidate room A; old A painted again on B route');
 B.release();await flush();assert.equal(h.last().state.id,h.B);
}finally{await h.close();}});

test('R1f: stale successful poll must not clear unknown commitment after a failed POST response',async()=>{const h=await harness();try{
 await h.navigate(h.A);const slow=h.hold('/challenges/'+h.A),poll=h.poll();await flush();
 const move=h.hold('/challenges/'+h.A+'/move','POST');move.failure=Error('Synthetic lost response after server commitment');
 await h.click('[data-action="move"][data-key="market_order"]');move.release();await flush();
 assert.equal(h.service.room(h.A).pending[0],'market_order');assert.equal(h.document.querySelector('#connection').hidden,false);
 slow.release();await poll;
 assert.equal(h.document.querySelector('#connection').hidden,false,'Old GET cleared unknown state without observing the saved move');
 assert([...h.document.querySelectorAll('[data-action="move"]')].every(b=>b.disabled));
}finally{await h.close();}});

test('P1: immutable local clocks, modal shortcuts, spectator moves and inspect access (non-layout)',async()=>{const h=await harness();try{
 await h.navigate(h.A);const before=JSON.stringify(h.service.db);for(let i=0;i<100;i++)h.clock();assert.equal(JSON.stringify(h.service.db),before);
 const inspect=h.document.querySelector('[data-action="inspect-moves"]');if(inspect){inspect.focus();await h.click('[data-action="inspect-moves"]');assert.equal(h.document.querySelectorAll('.move-inspection article').length,6);}
 else await h.click('[data-action="field-guide"]');
 const count=h.requests.filter(r=>r.path.endsWith('/move')).length;
 for(const key of ['1','2','3','4','e','r'])await h.key(key);
 assert.equal(h.requests.filter(r=>r.path.endsWith('/move')).length,count);
 await h.click('[data-action="close-panel"]');if(inspect)assert.equal(h.document.activeElement,inspect);
 await h.navigate(h.B);assert.equal(h.last().state.seat,-1);for(const key of ['1','2','3','4','e','r'])await h.key(key);
 assert.equal(h.requests.filter(r=>r.path.endsWith('/move')).length,count);assert.equal(h.errors.length,0);
}finally{await h.close();}});

test('R4: terminal exchange is not immediately masked by the modal result panel',async()=>{const h=await harness();try{
 await h.navigate(h.A);const raw=h.service.room(h.A);raw.battle.fighters[1].hp=1;
 h.service.choose(h.b,h.A,{round:1,move:'recharge'});
 await h.click('[data-action="move"][data-key="market_order"]');assert.equal(h.last().state.status,'won');assert.equal(h.last().state.battle.log.length,1);
 assert(!h.document.querySelector('.result-overlay'),'Result panel is inserted in the same render that starts the 1,800 ms final-exchange presentation');
}finally{await h.close();}});
