import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARENA_STYLE_DEFAULTS,ARENA_LOOK_KEY,arenaLook,saveArenaLook} from '../arena-look-store.mjs';
import {createFittedPreviewCache,fittedPetSupported,FITTED_PREVIEW_LIMITS} from '../fitted-preview.mjs';
import {CANONICAL_POSE_HASHES} from '../equipped-canonical.mjs';
import {atelierManifest,atelierMediaUrl} from '../style-lab-model.mjs';
import {fitPlan} from '../atelier/model.mjs';
import {EQUIPPED_POSES} from '../equipped-rig.mjs';
import {fixture} from './equipped-gpu-fixture.mjs';
const publicRoot=new URL('../../hatchery-web/public/',import.meta.url),catalogBytes=readFileSync(new URL('gear-bazaar/v1/catalog.json',publicRoot)),catalog=JSON.parse(catalogBytes),manifest=atelierManifest(catalog),runtime=new Map([...manifest].map(([path,entry])=>[atelierMediaUrl(path),{path,...entry}]));
const pet=lineageId=>({identitySource:'AUTHENTICATED_PET_READ_V1',lineageId,level:10,xp:17950,gearStats:{STR:2},gearLoadout:[{id:1001,slot:'head'}],layers:[{slot:'pet',url:'/hatchery-nft-v5/pet_'+lineageId+'_l10.webp',sha256:CANONICAL_POSE_HASHES[lineageId]}]});
const emptyStorage=()=>({getItem:()=>JSON.stringify({version:1,looks:{}})});
function setup({corruptCatalog=false,corruptImage=false,dimensions=false,unsupported=false,hold=false}={}){
 const graphics=fixture({unsupported}),requests=[];let release;const gate=new Promise(resolve=>release=resolve);
 const fetcher=async(url,options)=>{requests.push({url,options});if(hold)await gate;if(url==='/arena/atelier/catalog.json')return new Response(corruptCatalog?new Uint8Array([0]):catalogBytes);const entry=runtime.get(url);assert.ok(entry,'No legacy/unlisted media request: '+url);return new Response(corruptImage?new Uint8Array([0]):readFileSync(new URL(entry.path.slice(1),publicRoot)));};
 const cache=createFittedPreviewCache({fetcher,makeCanvas:graphics.makeCanvas,decode:async(_bytes,evidence)=>({naturalWidth:dimensions?1:evidence.width,naturalHeight:evidence.height}),storage:emptyStorage()});
 return{cache,graphics,requests,release};
}
test('all six defaults use covered fitted tops and the same final finger masks as Style Lab',()=>{
 for(const[lineage,selection]of Object.entries(ARENA_STYLE_DEFAULTS)){const top=catalog.items.find(item=>item.id===selection.body);assert.equal(top.occlusion,'SLEEVED_TOP_V1');assert.ok(selection.pants&&selection.footwear&&selection.head&&selection.tool);const plan=fitPlan(catalog,lineage,selection,{},null,true);assert.equal(plan.at(-1).id,'fingers');assert.ok(plan.every(layer=>manifest.has(layer.src)));assert.ok(plan.every(layer=>!layer.src.includes('hatchery-nft')));}
});
test('browser looks contain cosmetic references only, preserve explicit empty looks and exclude habitats',()=>{
 let raw=JSON.stringify({version:1,looks:{}});const writes=[],storage={getItem:()=>raw,setItem:(key,value)=>{writes.push({key,value});raw=value;}};
 const chosen=saveArenaLook(catalog,'sapphire_tide',{body:'runebloom-overshirt',tool:'banana-market-maker',habitat:'moon-landing-pad'},storage);assert.deepEqual(chosen,{body:'runebloom-overshirt',tool:'banana-market-maker'});assert.deepEqual(arenaLook(catalog,'sapphire_tide',storage),chosen);assert.equal(writes[0].key,ARENA_LOOK_KEY);assert.doesNotMatch(writes[0].value,/xp|wallet|genesis|stats|itemLevel|habitat|ownership/i);
 saveArenaLook(catalog,'sapphire_tide',{},storage);assert.deepEqual(arenaLook(catalog,'sapphire_tide',storage),{});
 for(const value of [{xp:1},{body:'missing'},{head:'banana-market-maker'},JSON.parse('{"__proto__":"bad"}')])assert.throws(()=>saveArenaLook(catalog,'sapphire_tide',value,storage));
});
test('bad or blocked cosmetic storage cannot authorize gear, stats or unknown lineages',()=>{
 for(const raw of ['{bad','x'.repeat(9000),JSON.stringify({version:1,looks:{sapphire_tide:{gearStats:{STR:999}}}}),JSON.stringify({version:1,looks:{fake:{}}})])assert.doesNotThrow(()=>arenaLook(catalog,'emerald_sprout',{getItem:()=>raw}));
 assert.doesNotThrow(()=>saveArenaLook(catalog,'rose_bloom',{body:'runebloom-overshirt'},{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}));assert.throws(()=>arenaLook(catalog,'fake',emptyStorage()));
});
test('supported references are explicit; unreviewed verified bases and younger Pets do not become adult previews',()=>{
 assert.equal(fittedPetSupported(pet('emerald_sprout')),true);assert.equal(fittedPetSupported({...pet('emerald_sprout'),level:9},{reference:true}),false);assert.equal(fittedPetSupported({...pet('emerald_sprout'),layers:[]},{reference:true}),false);
 assert.equal(fittedPetSupported({lineageId:'sapphire_tide',level:10},{reference:true}),true);assert.equal(fittedPetSupported({lineageId:'sapphire_tide',level:10}),false);assert.equal(fittedPetSupported({lineageId:'fake',level:10},{reference:true}),false);
});
test('new fitted cache checks actual catalog/media bytes, bounds actors and preserves all V1 evidence',async()=>{
 const h=setup();try{for(const lineage of Object.keys(ARENA_STYLE_DEFAULTS)){const input=pet(lineage),before=JSON.stringify(input),entry=h.cache.get(input);await entry.ready;assert.equal(entry.status,'ready');assert.deepEqual(entry.selection,ARENA_STYLE_DEFAULTS[lineage]);for(const pose of Object.values(EQUIPPED_POSES)){const frame=entry.frame(pose);assert.equal(frame.authority,'COSMETIC_PREVIEW_ONLY');assert.equal(frame.padded,true);}assert.equal(JSON.stringify(input),before);assert.ok(h.graphics.textures.size<=FITTED_PREVIEW_LIMITS.actors*16);}
 for(const request of h.requests){assert.equal(request.options.credentials,'omit');assert.equal(request.options.redirect,'error');assert.equal(request.options.body,undefined);assert.ok(request.url.startsWith('/arena/atelier/'));}h.cache.clear();assert.equal(h.graphics.textures.size,0);
 }finally{h.cache.destroy();}assert.equal(h.graphics.buffers.size,0);assert.equal(h.graphics.programs.size,0);
});
test('catalog corruption, image corruption and bad dimensions fail without legacy-costume fallback',async()=>{
 for(const options of [{corruptCatalog:true},{corruptImage:true},{dimensions:true}]){const h=setup(options);try{const entry=h.cache.get(pet('emerald_sprout'));await entry.ready;assert.equal(entry.status,'failed');assert.equal(entry.frame(EQUIPPED_POSES.rest),null);assert.equal(h.graphics.textures.size,0);assert.ok(h.requests.every(request=>!request.url.includes('hatchery-nft')));}finally{h.cache.destroy();}}
});
test('unavailable graphics keeps the same checked new fitted still',async()=>{
 const h=setup({unsupported:true});try{const entry=h.cache.get(pet('emerald_sprout'));await entry.ready;assert.equal(entry.status,'ready');const frame=entry.frame(EQUIPPED_POSES.attack);assert.equal(frame.padded,false);assert.equal(frame.image,entry.composite);assert.deepEqual(entry.selection,ARENA_STYLE_DEFAULTS.emerald_sprout);}finally{h.cache.destroy();}
});
test('stop aborts pending media and prevents late textures or a resurrected fitted actor',async()=>{
 const h=setup({hold:true}),entry=h.cache.get(pet('emerald_sprout'));h.cache.destroy();assert.ok(h.requests[0].options.signal.aborted);h.release();await entry.ready;assert.equal(h.graphics.textures.size,0);assert.equal(entry.frame(EQUIPPED_POSES.rest),null);
});
