import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {setTimeout as wait} from 'node:timers/promises';
import {fixture} from './equipped-gpu-fixture.mjs';import {EQUIPPED_POSES} from '../equipped-rig.mjs';import {CANONICAL_POSE_HASHES} from '../equipped-canonical.mjs';
const bytes=readFileSync(new URL('../../hatchery-web/public/gear-style-studio/v1/pet_emerald_sprout_l10.webp',import.meta.url));let serial=0;
async function renderer(t,{corrupt=false,unsupported=false,fittedFactory}={}){
 const f=fixture({unsupported}),old=new Map(),calls=[],requests=[],ctx=new Proxy({drawImage:(...args)=>calls.push(['drawImage',...args]),scale:(...args)=>calls.push(['scale',...args]),fillText:(...args)=>calls.push(['fillText',...args])},{get:(o,k)=>o[k]??(()=>{})}),document={createElement:()=>f.makeCanvas(),addEventListener(){},removeEventListener(){},hidden:false};
 const globals={document,matchMedia:()=>({matches:false}),Image:class{complete=true;naturalWidth=1024;naturalHeight=1024;async decode(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},fetch:async(url,options)=>{requests.push({url,options});return new Response(corrupt?new Uint8Array([1]):bytes);}};
 for(const[key,value]of Object.entries(globals)){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 ctx.createLinearGradient=()=>({addColorStop(){}});
 const {ArenaRenderer}=await import('../render.mjs?equipped-test='+ ++serial),r=new ArenaRenderer({isConnected:true,clientWidth:500,clientHeight:600,width:0,height:0,getContext:()=>ctx},{fittedOnly:!!fittedFactory,fittedFactory});
 t.after(()=>{r.stop();for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 const pet={identitySource:'AUTHENTICATED_PET_READ_V1',lineageId:'emerald_sprout',level:10,xp:17950,gearLoadout:[{id:1001,slot:'head'}],gearStats:{INT:1},layers:[{slot:'pet',url:'/hatchery-nft-v5/pet_emerald_sprout_l10.webp',sha256:CANONICAL_POSE_HASHES.emerald_sprout},{slot:'head',url:'/hatchery-nft-v5/layer_head_01_fixture.webp',sha256:CANONICAL_POSE_HASHES.emerald_sprout}]};
 const draw=(pose=EQUIPPED_POSES.attack)=>r.wardrobe(pet,250,300,400,true,{sx:.9,sy:1.1,rotation:.02},1,pose);
 async function ready(){const deadline=Date.now()+3000;while(!draw()&&Date.now()<deadline)await wait(2);assert.equal(draw(),true);}
 return{r,f,calls,requests,pet,draw,ready};
}

test('real wardrobe waits for checked images, articulates only canonical V1 layers and preserves mirrored grip proportions',async t=>{
 const h=await renderer(t),before=JSON.stringify(h.pet);assert.equal(h.draw(),false);assert.equal(h.r.equippedActors.size,0);await h.ready();assert.equal(h.r.equippedActors.size,1);assert.equal(h.requests.length,2);
 h.draw(EQUIPPED_POSES.block);h.draw(EQUIPPED_POSES.hit);h.draw(EQUIPPED_POSES.victory);assert.ok(h.f.calls.some(c=>c[0]==='drawElements'));assert.deepEqual(h.calls.filter(c=>c[0]==='scale').at(-1),['scale',-1,1]);
 assert.equal(JSON.stringify(h.pet),before);for(const request of h.requests){assert.equal(request.options.credentials,'omit');assert.equal(request.options.body,undefined);}
 const count=h.f.calls.filter(c=>c[0]==='createTexture').length;h.pet.previewOutfit={tool:'banana-market-maker',itemLevel:20,gearStats:{STR:999}};h.draw();assert.equal(h.r.equippedActors.size,1);assert.equal(h.f.calls.filter(c=>c[0]==='createTexture').length,count);assert.equal(h.pet.xp,17950);assert.deepEqual(h.pet.gearStats,{INT:1});
 h.r.stop();assert.equal(h.f.textures.size,0);assert.equal(h.r.equippedActors.size,0);
});

test('a failed GPU preserves the same equipped static surfaces instead of silently substituting a naked actor',async t=>{
 const h=await renderer(t,{unsupported:true});await h.ready();assert.ok(h.calls.filter(c=>c[0]==='drawImage').length>=2);assert.equal(h.r.equippedActors.values().next().value.available,false);assert.deepEqual(h.calls.filter(c=>c[0]==='scale').at(-1),['scale',-.9,1.1]);
});

test('corrupt canonical bytes never reach pose textures or the equipped draw path',async t=>{
 const h=await renderer(t,{corrupt:true});assert.equal(h.draw(),false);await wait(30);assert.equal(h.draw(),false);assert.equal(h.r.equippedActors.size,0);assert.equal(h.f.textures.size,0);assert.equal(h.calls.filter(c=>c[0]==='drawImage').length,0);
});

test('a missing verified portrait displays an explicit art status instead of substituting unrelated costume sprites',async t=>{
 const h=await renderer(t,{corrupt:true});h.r.hero=h.pet;h.r.draw(0);assert.ok(h.calls.some(c=>c[0]==='fillText'&&String(c[1]).includes('Checking equipped art')));await wait(30);h.r.lastPaint=-Infinity;h.r.draw(100);assert.ok(h.calls.some(c=>c[0]==='fillText'&&String(c[1]).includes('Equipped art unavailable')));assert.equal(h.calls.filter(c=>c[0]==='drawImage').length,0);assert.equal(h.r.equippedActors.size,0);
});

test('terminal camera framing keeps both equipped fighters inside the stage without changing frozen identity or stats',async t=>{
 const h=await renderer(t),state={status:'won',battle:{winner:0},players:[{pet:h.pet,build:{level:10}},{pet:{...h.pet,lineageId:'solar_peach'},build:{level:10}}]},before=JSON.stringify(state);
 for(const winner of [0,1])for(const reduced of [false,true])for(const height of [180,600]){state.battle.winner=winner;const frozen=JSON.stringify(state);h.r.prepareFighters(state,null,3000,3000,height,reduced);for(let i=0;i<2;i++){const edge=Math.min(400,height*1.08)*(.55+Math.abs(Math.sin(h.r.motion[i].rotation))*.95),anchor=h.r.anchors[i];assert.ok(anchor.x>=edge&&anchor.x<=1000-edge);assert.ok(Math.abs(h.r.motion[i].rotation)<=.16);}assert.equal(JSON.stringify(state),frozen);}
 state.battle.winner=0;assert.equal(JSON.stringify(state),before);
});

test('active fitted lobby and combat draw only the new preview, never legacy wardrobe or costumed atlases',async t=>{
 const artwork={width:512,height:768,newFitted:true};let destroyed=0;const cache={get:()=>({status:'ready',frame:()=>({image:artwork,padded:false,authority:'COSMETIC_PREVIEW_ONLY'})}),clear(){},destroy(){destroyed++;}},h=await renderer(t,{fittedFactory:()=>cache});
 for(const name of ['wardrobe','sprite','clip','rigLayer'])h.r[name]=()=>assert.fail('Retired costume path: '+name);
 const before=JSON.stringify(h.pet);h.r.hero=h.pet;h.r.draw(0);assert.ok(h.calls.some(call=>call[0]==='drawImage'&&call[1]===artwork));assert.equal(h.requests.length,0);
 h.r.hero=null;h.r.set({id:'synthetic-fitted-display',status:'playing',players:[{pet:h.pet,build:{level:10}},{pet:{lineageId:'solar_peach',level:10},build:{level:10}}],battle:{log:[]}});h.r.lastPaint=-Infinity;h.r.draw(100);
 assert.ok(h.calls.filter(call=>call[0]==='drawImage'&&call[1]===artwork).length>=3);assert.ok(h.calls.some(call=>call[0]==='fillText'&&call[1]==='PREVIEW · COSMETIC ONLY'));assert.equal(JSON.stringify(h.pet),before);
 // Only the three new immutable public FX may load; no legacy Pet/gear art request.
 assert.deepEqual(h.requests.map(r=>r.url).sort(),['diamond-guard','candle-burst','copium-bloom'].map(id=>'/arena/assets/meme-v1/'+id+'.webp').sort());assert(h.requests.every(r=>r.options.credentials==='omit'&&r.options.body===undefined));h.r.stop();assert.ok(destroyed>0);
});

test('failed new previews stay explicit instead of falling back to old clothes',async t=>{
 const cache={get:()=>({status:'failed',frame:()=>null}),clear(){},destroy(){}},h=await renderer(t,{fittedFactory:()=>cache});for(const name of ['wardrobe','sprite','clip','rigLayer'])h.r[name]=()=>assert.fail(name);
 h.r.hero=h.pet;h.r.draw(0);assert.ok(h.calls.some(call=>call[0]==='fillText'&&call[1]==='Fitted Preview unavailable'));assert.equal(h.calls.filter(call=>call[0]==='drawImage').length,0);assert.equal(h.requests.length,0);
});
