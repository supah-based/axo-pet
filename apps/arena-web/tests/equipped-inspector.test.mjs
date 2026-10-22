import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {equippedInspectorMarkup,mountEquippedInspector} from '../equipped-inspector.mjs';import {CANONICAL_POSE_HASHES} from '../equipped-canonical.mjs';import {createEquippedPuppet} from '../equipped-puppet.mjs';import {fixture as gpuFixture} from './equipped-gpu-fixture.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom'),bytes=readFileSync(new URL('../../hatchery-web/public/gear-style-studio/v1/pet_emerald_sprout_l10.webp',import.meta.url));
function fixture(t,{hold=false,corrupt=false,unsupported=false,level=10}={}){
 const {window}=parseHTML('<html><body>'+equippedInspectorMarkup()+'</body></html>'),document=window.document,old=new Map(),requests=[],gpu=gpuFixture({unsupported}),ctx=new Proxy({},{get:()=>()=>{}});let release;const gate=new Promise(resolve=>{release=resolve;});
 window.HTMLCanvasElement.prototype.getContext=()=>ctx;
 for(const[key,value]of Object.entries({document,Image:class{complete=true;naturalWidth=1024;naturalHeight=1024;async decode(){}}})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const pet={identitySource:'AUTHENTICATED_PET_READ_V1',level,lineageId:'emerald_sprout',xp:17950,gearLoadout:[],gearStats:{STR:0},layers:[{slot:'pet',url:'/hatchery-nft-v5/pet_emerald_sprout_l10.webp',sha256:CANONICAL_POSE_HASHES.emerald_sprout}]},before=JSON.stringify(pet),root=document.querySelector('.equipped-inspector');
 const controller=mountEquippedInspector(root,pet,{fetchImage:async(url,options)=>{requests.push({url,options});if(hold)await gate;return new Response(corrupt?new Uint8Array([0]):bytes);},makePuppet:(layers,options)=>createEquippedPuppet(layers,{...options,makeCanvas:gpu.makeCanvas})});
 t.after(async()=>{controller.destroy();release();await controller.ready;for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 return{root,pet,before,controller,gpu,requests,release};
}
test('verified pose dialog builds four stamped stills from checked canonical layers and releases its extra GPU',async t=>{
 const h=fixture(t);await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,4);assert.match(h.root.querySelector('[data-equipped-status]').textContent,/Verified V1 surfaces/);assert.equal(h.gpu.textures.size,0);assert.ok(h.gpu.calls.some(c=>c[0]==='drawElements'));assert.equal(JSON.stringify(h.pet),h.before);
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.credentials,'omit');assert.equal(h.requests[0].options.body,undefined);
});
test('closing a pending private pose dialog aborts its work and cannot repopulate the cleared view',async t=>{
 const h=fixture(t,{hold:true});h.controller.destroy();assert.equal(h.requests[0].options.signal.aborted,true);h.release();await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,0);assert.equal(h.gpu.calls.some(c=>c[0]==='createShader'),false);
});
test('unreviewed young poses fail closed without fabricating an adult or fetching equipment',async t=>{
 const h=fixture(t,{level:9});await h.controller.ready;assert.equal(h.requests.length,0);assert.equal(h.root.querySelectorAll('canvas').length,0);assert.match(h.root.querySelector('[data-equipped-status]').textContent,/reviewed adult LVL 10/);assert.equal(JSON.stringify(h.pet),h.before);
});
test('corrupt verified art is rejected before any pose geometry is drawn',async t=>{
 const h=fixture(t,{corrupt:true});await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,0);assert.match(h.root.querySelector('[data-equipped-status]').textContent,/could not be checked/);assert.equal(h.gpu.calls.some(c=>c[0]==='drawElements'),false);
});
test('unavailable graphics explains the limitation rather than labelling four duplicate stills as poses',async t=>{
 const h=fixture(t,{unsupported:true});await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,0);assert.match(h.root.querySelector('[data-equipped-status]').textContent,/unavailable on this device/);
});
