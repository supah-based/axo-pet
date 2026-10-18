// Offline linkedom + file:null service + deferred function fetch, not browser/device QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,flush} from './repair-dom-harness.mjs';
const path=id=>'/challenges/'+id;
async function terminal(h){await h.navigate(h.A);h.service.room(h.A).battle.fighters[1].hp=1;h.service.choose(h.b,h.A,{round:1,move:'recharge'});await h.click('[data-action="move"][data-key="market_order"]');}

test('Unknown commitment survives stale GET and resolves on a newly requested matching snapshot only',async()=>{const h=await harness();try{
 await h.navigate(h.A);const old=h.hold(path(h.A)),poll=h.poll();await flush();const lost=h.hold(path(h.A)+'/move','POST');lost.failure=Error('lost synthetic response');await h.click('[data-action="move"][data-key="market_order"]');lost.release();await flush();old.release();await poll;
 assert.equal(h.document.querySelector('#connection').hidden,false);assert.equal(h.last().state.locked,false);
 await h.poll();assert.equal(h.document.querySelector('#connection').hidden,true);assert.equal(h.last().state.locked,true);assert.equal(h.last().fresh,false);assert([...h.document.querySelectorAll('[data-action="move"]')].every(b=>b.disabled));
}finally{await h.close();}});

test('Stale transport errors and stale 409 recovery cannot poison a new route or request old-room recovery',async()=>{for(const status of [0,409]){const h=await harness();try{
 await h.navigate(h.A);const gate=h.hold(path(h.A)+'/move','POST');if(status)gate.override={ok:false,status,json:async()=>({error:'synthetic conflict'})};else gate.failure=Error('synthetic late transport failure');await h.click('[data-action="move"][data-key="market_order"]');await h.navigate(h.B);const count=h.requests.length;gate.release();await flush();assert.equal(h.last().state.id,h.B);assert.equal(h.document.querySelector('#connection').hidden,true);assert.equal(h.requests.length,count);assert.equal(h.errors.length,0);
}finally{await h.close();}}});

test('Current 409 performs fresh matching recovery without a second move POST',async()=>{const h=await harness();try{
 await h.navigate(h.A);const gate=h.hold(path(h.A)+'/move','POST');gate.override={ok:false,status:409,json:async()=>({error:'synthetic acknowledged conflict'})};await h.click('[data-action="move"][data-key="market_order"]');gate.release();await flush();assert.equal(h.last().state.locked,true);assert.equal(h.requests.filter(r=>r.path.endsWith('/move')).length,1);assert.equal(h.errors.length,0);
}finally{await h.close();}});

test('Mismatched response identity fails closed and does not paint another room',async()=>{const h=await harness();try{
 const gate=h.hold(path(h.A));gate.override={ok:true,status:200,json:async()=>h.service.getRoom(h.a,h.B)};await h.navigate(h.A);gate.release();await flush();assert(!h.document.querySelector('#battle-canvas'));assert(!h.requests.some(r=>r.body?.requestGeneration));await h.navigate(h.B);assert.equal(h.last().state.id,h.B);
}finally{await h.close();}});

for(const action of ['join','ready','room-post'])test('Late '+action+' cannot replace a newly selected room; pending control is disabled',async()=>{const h=await harness();try{
 h.service.cancel(h.a,h.A);let id;if(action==='ready')id=h.service.makeRoom([h.service.packed(h.a),h.service.packed(h.b)],{checkin:true}).id;else id=h.service.challenge(action==='join'?h.b:h.a,{}).id;
 await h.navigate(id);const endpoint=action==='room-post'?'/challenge-room/'+id+'/post':path(id)+'/'+action,gate=h.hold(endpoint,'POST');await h.click('[data-action="'+action+'"]');assert(gate.used);assert(h.document.querySelector('[data-action="'+action+'"]').disabled);await h.navigate(h.B);gate.release();await flush();assert.equal(h.last().state.id,h.B);assert.equal(h.errors.length,0);
}finally{await h.close();}});

test('Late build save and refresh cannot replace workshop navigation or resurrect old room',async()=>{const h=await harness();try{
 h.service.cancel(h.a,h.A);await h.click('[data-tab="build"]');const save=h.hold('/build','POST');await h.click('[data-action="save-build"]');assert(save.used);await h.navigate(h.B);save.release();await flush();assert.equal(h.last().state.id,h.B);
 const refresh=h.hold('/me');h.document.querySelector('#connection').innerHTML='<button data-action="refresh">Retry</button>';await h.click('[data-action="refresh"]');await h.click('[data-tab="build"]');refresh.release();await flush();assert(h.document.querySelector('#pet-workshop'));assert.equal(h.errors.length,0);
}finally{await h.close();}});

test('Late tournament leave and earlier tournament GET cannot replace room navigation',async()=>{const h=await harness();try{
 h.service.cancel(h.a,h.A);const t=h.service.createTournament(h.a,{name:'Offline',size:4});h.location.hash='tournament='+t.id;await flush();const gate=h.hold('/tournaments/'+t.id+'/leave','POST');await h.click('[data-action="leave-tournament"]');assert(gate.used);await h.navigate(h.B);gate.release();await flush();assert.equal(h.last().state.id,h.B);
 const old=h.hold('/tournaments/'+t.id);h.location.hash='tournament='+t.id;await flush();await h.navigate(h.B);old.release();await flush();assert.equal(h.last().state.id,h.B);assert.equal(h.errors.length,0);
}finally{await h.close();}});

test('ChallengeRoom refresh/post responses cannot revive abandoned noticeboard',async()=>{const h=await harness();try{
 h.service.cancel(h.a,h.A);h.service.challenge(h.a,{});h.location.hash='challenge-room=open';await flush();const old=h.hold('/challenge-room');await h.click('[data-action="board-refresh"]');await h.navigate(h.B);old.release();await flush();assert.equal(h.last().state.id,h.B);
 h.location.hash='challenge-room=open';await flush();const id=h.document.querySelector('[data-action="board-post"]').dataset.id,post=h.hold('/challenge-room/'+id+'/post','POST');await h.click('[data-action="board-post"]');await h.navigate(h.B);post.release();await flush();assert.equal(h.last().state.id,h.B);assert.equal(h.errors.length,0);
}finally{await h.close();}});

test('Terminal result is authoritative immediately; a single bounded timer expands actions without service mutation',async()=>{const h=await harness();try{
 await terminal(h);assert.equal(h.last().state.status,'won');assert.equal(h.document.querySelector('.combat-screen').dataset.commandState,'complete');assert(h.document.querySelector('.terminal-result').hidden);assert([...h.document.querySelectorAll('[data-action="move"]')].every(b=>b.disabled));const before=JSON.stringify(h.service.db),timers=[...h.timeouts.values()].filter(t=>t.ms<=1800);assert.equal(timers.length,1);assert(timers[0].ms>0);timers[0].fn();assert(h.document.querySelector('.result-overlay'));assert.equal(JSON.stringify(h.service.db),before);assert(h.document.querySelector('[data-action="replay"]'));
}finally{await h.close();}});

test('Terminal visual timer cannot survive navigation or hide, even if a cancelled callback is delivered',async()=>{for(const mode of ['route','hide']){const h=await harness();try{
 await terminal(h);const callback=[...h.timeouts.values()].find(t=>t.ms<=1800).fn;if(mode==='route'){await h.navigate(h.B);assert.equal(h.timeouts.size,0);callback();assert.equal(h.last().state.id,h.B);assert(!h.document.querySelector('.result-overlay'));}else{h.document.hidden=true;h.document.dispatchEvent(new h.window.Event('visibilitychange'));assert(h.document.querySelector('.result-overlay'));assert.equal(h.timeouts.size,0);h.document.hidden=false;h.document.dispatchEvent(new h.window.Event('visibilitychange'));callback();assert(h.document.querySelector('.result-overlay'));}assert.equal(h.errors.length,0);
}finally{await h.close();}}});

test('Initial completed snapshot and reduced motion show full results immediately without flourish timer',async()=>{for(const reduced of [false,true]){const h=await harness({reduced});try{
 if(reduced)await terminal(h);else{h.service.cancel(h.a,h.A);await h.navigate(h.A);}assert(h.document.querySelector('.result-overlay'));assert.equal(h.timeouts.size,0);assert.equal(h.last().state.status,'won');
}finally{await h.close();}}});

test('Connection recovery seeds terminal receipt silently and presents full result immediately',async()=>{const h=await harness();try{
 await h.navigate(h.A);const gate=h.hold(path(h.A));gate.failure=Error('synthetic outage');const p=h.poll();await flush();gate.release();await p;h.service.room(h.A).battle.fighters[1].hp=1;h.service.choose(h.b,h.A,{round:1,move:'recharge'});h.service.choose(h.a,h.A,{round:1,move:'market_order'});await h.poll();assert.equal(h.last().fresh,false);assert(h.document.querySelector('.result-overlay'));assert.equal([...h.timeouts.values()].filter(t=>t.ms<=1800).length,0,'No terminal flourish timer (an outage toast may remain)');
}finally{await h.close();}});


test('Older successful GET cannot clear a newer transport outage; hidden poll sends no request',async()=>{const h=await harness();try{
 await h.navigate(h.A);const old=h.hold(path(h.A)),poll=h.poll();await flush();const lost=h.hold('/me');h.document.querySelector('#connection').innerHTML='<button data-action="refresh">Retry</button>';await h.click('[data-action="refresh"]');lost.failure=Error('synthetic outage');lost.release();await flush();old.release();await poll;assert.equal(h.document.querySelector('#connection').hidden,false);assert(!h.document.querySelector('#battle-canvas'));await h.navigate(h.A);const count=h.requests.length;h.document.hidden=true;h.document.dispatchEvent(new h.window.Event('visibilitychange'));await h.poll();assert.equal(h.requests.length,count);h.document.hidden=false;h.document.dispatchEvent(new h.window.Event('visibilitychange'));await h.poll();assert.equal(h.last().fresh,false);
}finally{await h.close();}});

test('Terminal hold is not extended by repeat snapshots and log remains available to spectator',async()=>{const h=await harness();try{
 await terminal(h);const timers=[...h.timeouts.values()].filter(t=>t.ms<=1800),deadline=timers[0];await h.poll();assert.equal([...h.timeouts.values()].filter(t=>t.ms<=1800).length,1);assert.equal([...h.timeouts.values()].find(t=>t.ms<=1800),deadline);h.service.cancel(h.service.room(h.B).players[0].owner===h.a.key?h.a:{key:h.service.room(h.B).players[0].owner},h.B);await h.navigate(h.B);assert.equal(h.last().state.seat,-1);assert(h.document.querySelector('.result-overlay'));assert(h.document.querySelector('#combat-log summary'));assert(!h.document.querySelector('[data-action="replay"]'));assert.equal(h.timeouts.size,0);
}finally{await h.close();}});


test('A same-revision visible recovery seeds once; next genuinely live receipt animates exactly once',async()=>{const h=await harness();try{
 await h.navigate(h.A);h.document.hidden=true;h.document.dispatchEvent(new h.window.Event('visibilitychange'));h.document.hidden=false;h.document.dispatchEvent(new h.window.Event('visibilitychange'));await h.poll();assert.equal(h.last().fresh,false);h.service.choose(h.a,h.A,{round:1,move:'market_order'});h.service.choose(h.b,h.A,{round:1,move:'recharge'});await h.poll();assert.equal(h.last().fresh,true);const count=h.renderers.filter(r=>r.fresh).length;await h.poll();assert.equal(h.renderers.filter(r=>r.fresh).length,count);
}finally{await h.close();}});

for(const action of ['replay','export'])test('Late '+action+' response cannot change route or generate an export',async()=>{const h=await harness();const original=URL.createObjectURL;let exports=0;URL.createObjectURL=()=>{exports++;return 'blob:offline';};try{
 h.service.cancel(h.a,h.A);await h.navigate(h.A);const gate=h.hold(path(h.A)+'/replay');await h.click('[data-action="'+action+'"]');assert(gate.used);await h.navigate(h.B);gate.release();await flush();assert.equal(h.last().state.id,h.B);assert(!h.document.querySelector('#replay-canvas'));assert.equal(exports,0);assert.equal(h.errors.length,0);
}finally{URL.createObjectURL=original;await h.close();}});

for(const action of ['join','start'])test('Late tournament '+action+' is bounded to its original view',async()=>{const h=await harness();try{
 h.service.cancel(h.a,h.A);const t=h.service.createTournament(action==='join'?h.b:h.a,{name:'Offline roster',size:4});if(action==='start'){h.service.joinTournament(h.b,t.id);for(let n=8;n<10;n++)h.service.joinTournament({key:'OFFLINE-'+n,pet:{...h.a.pet,genesisId:'AXO-'+String(n).padStart(10,'0')}},t.id);}h.location.hash='tournament='+t.id;await flush();const gate=h.hold('/tournaments/'+t.id+'/'+action,'POST');await h.click('[data-action="'+action+'-tournament"]');assert(gate.used);await h.navigate(h.B);gate.release();await flush();assert.equal(h.last().state.id,h.B);assert.equal(h.errors.length,0);
}finally{await h.close();}});

for(const preview of [false,true])test('Late '+(preview?'preview-session':'create-tournament')+' form response does not redirect a newer route',async()=>{const h=await harness({preview});try{
 h.service.cancel(h.a,h.A);if(preview)await h.click('[data-action="switch"]');else await h.click('[data-tab="tournaments"]');const form=h.document.querySelector(preview?'#preview-form':'#tournament-form');assert(form);if(!preview)form.querySelector('[name="size"] option').setAttribute('selected','');const gate=h.hold(preview?'/preview-session':'/tournaments','POST');form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await flush();assert(gate.used);await h.navigate(h.B);gate.release();await flush();assert.equal(h.last().state.id,h.B);assert.equal(h.location.hash,'#challenge='+h.B);assert.equal(h.errors.length,0);
}finally{await h.close();}});
