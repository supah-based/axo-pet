import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { styleLabMarkup, mountStyleLab } from '../style-lab.mjs';
import { atelierManifest, atelierMediaUrl } from '../style-lab-model.mjs';
import {fixture as gpuFixture} from './equipped-gpu-fixture.mjs';
const { parseHTML } = createRequire(import.meta.url)('linkedom');
const publicRoot = new URL('../../hatchery-web/public/', import.meta.url);
const catalogBytes = readFileSync(new URL('gear-bazaar/v1/catalog.json', publicRoot)), catalog = JSON.parse(catalogBytes);
const manifest = atelierManifest(catalog), runtime = new Map([...manifest].map(([path, entry]) => [atelierMediaUrl(path), {path, ...entry}]));

async function fixture(t, {params = '', corrupt = false, dimensions = false, hold = false, gpu = false} = {}) {
  const {window} = parseHTML('<html><body>'+styleLabMarkup()+'</body></html>'), document=window.document, frames=new Map(), requests=[], revoked=[], transforms=[];
  let serial=0, timestamp=0, nextDimensions, release;
  const gate = new Promise(resolve => { release=resolve; });
  const graphics=gpu?gpuFixture():null,text=[],exports=[];
  const context = new Proxy({createRadialGradient:()=>({addColorStop(){}}),translate:(...args)=>transforms.push(args),fillText:value=>text.push(value)}, {get:(o,k)=>o[k]??(()=>{})});
  window.HTMLCanvasElement.prototype.getContext=type=>type==='webgl'?(graphics?graphics.makeCanvas().getContext('webgl'):null):context;
  window.HTMLCanvasElement.prototype.toBlob=function(){exports.push(text.at(-1));};
  const blobs=new Map(), clipboard=[], old=new Map();
  Object.defineProperty(document,'hidden',{configurable:true,writable:true,value:false});
  const fetcher=async(url,options)=>{
    requests.push({url,options}); if(hold) await gate;
    const entry=runtime.get(url); nextDimensions=entry;
    const bytes=url.endsWith('catalog.json')?catalogBytes:readFileSync(new URL(entry.path.slice(1), publicRoot));
    return new Response(corrupt?new Uint8Array([0]):bytes);
  };
  const globals={document,window,location:{href:'https://offline.fixture/arena/?wallet=private&auth=secret#style-lab=1'},navigator:{deviceMemory:4,clipboard:{writeText:async value=>clipboard.push(value)}},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),Image:class {async decode(){const entry=blobs.get(this.src);this.naturalWidth=dimensions?1:entry.width;this.naturalHeight=entry.height;}}};
  for(const[key,value]of Object.entries(globals)){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  URL.createObjectURL=()=>{const url='blob:local-'+ ++serial;blobs.set(url,nextDimensions);return url;};URL.revokeObjectURL=url=>{revoked.push(url);blobs.delete(url);};
  const root=document.querySelector('.style-lab'), controller=mountStyleLab(root,{params:new URLSearchParams(params),fetcher});
  t.after(async()=>{controller.destroy();release();await controller.ready;URL.createObjectURL=create;URL.revokeObjectURL=revoke;for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  const ready=controller.ready;
  function frame(delta=40){timestamp+=delta;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(timestamp);}
  function change(selector,value,type='change'){const element=root.querySelector(selector);element.value=value;element.dispatchEvent(new window.Event(type,{bubbles:true}));}
  // Linkedom deliberately exposes a read-only select value; browser selection semantics.
  for(const select of root.querySelectorAll('select'))Object.defineProperty(select,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value;},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
  return {root,document,requests,clipboard,controller,ready,frame,change,transforms,frames,revoked,release,graphics,text,exports};
}

test('fitted lab verifies bytes, presents all families and shares only a cosmetic reference look',async t=>{
  const h=await fixture(t,{params:'lineage=sapphire_tide&tier=20&tool=banana-market-maker&scene=degen-den'});await h.ready;
  assert.equal(h.root.querySelectorAll('[data-lab-family]').length,43);assert.equal(h.root.querySelector('[data-lab-export]').disabled,false);
  assert.match(h.root.querySelector('[data-lab-stats]').textContent,/17,950 XP/);assert.equal(h.root.querySelector('[data-lab-lineage]').value,'sapphire_tide');
  assert.equal(h.root.querySelector('[data-lab-outfit]').value,'');assert.equal(h.root.querySelector('[data-lab-scene]').value,'degen-den');
  h.frame();h.frame();assert.ok(h.transforms.length>0);
  h.root.querySelector('[data-lab-share]').click();await Promise.resolve();
  const link=new URL(h.clipboard[0]);assert.equal(link.search,'');assert.match(link.hash,/tool=banana-market-maker/);assert.doesNotMatch(link.href,/wallet|genesis|petXp|gearStats/);
  for(const {options}of h.requests){assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);}
  assert.equal(h.revoked.length,h.requests.length-1);
});

test('pause freezes the exact fitted actor and visibility stops scheduling until resumed',async t=>{
  const h=await fixture(t);await h.ready;h.change('[data-lab-move]','pepe_breakout');h.frame();h.frame();
  h.root.querySelector('[data-lab-pause]').click();h.frame();const a=h.transforms.at(-1);h.frame(500);assert.deepEqual(h.transforms.at(-1),a);
  h.document.hidden=true;h.document.dispatchEvent(new h.document.defaultView.Event('visibilitychange'));assert.equal(h.frames.size,0);
  h.document.hidden=false;h.document.dispatchEvent(new h.document.defaultView.Event('visibilitychange'));assert.equal(h.frames.size,1);
  h.root.querySelector('[data-lab-pause]').click();h.frame();h.frame();assert.notDeepEqual(h.transforms.at(-1),a);
  h.controller.destroy();assert.equal(h.frames.size,0);
});

test('clear look survives link round-trip, filters work and candidate selection cannot write combat state',async t=>{
  const h=await fixture(t,{params:'empty=1&tier=11'});await h.ready;assert.match(h.root.querySelector('[data-lab-equipped]').textContent,/No candidate/);
  h.change('[data-lab-search]','banana','input');assert.equal(h.root.querySelectorAll('[data-lab-family]').length,1);
  h.root.querySelector('[data-lab-share]').click();await Promise.resolve();assert.match(h.clipboard[0],/empty=1/);
  assert.equal(h.requests.some(r=>r.url.startsWith('/api/')),false);
});

test('corrupted catalog and mismatched asset dimensions fail closed without export',async t=>{
  const h=await fixture(t,{dimensions:true});await h.ready;
  assert.equal(h.root.querySelector('[data-lab-export]').disabled,true);assert.match(h.root.querySelector('[data-lab-notice]').textContent,/could not be checked/);
});

test('untrusted catalog is rejected before any fitted media request',async t=>{
  const h=await fixture(t,{corrupt:true});await h.ready;assert.equal(h.requests.length,1);assert.match(h.root.querySelector('[data-lab-notice]').textContent,/pinned wardrobe/);
});

test('closing an in-flight lab aborts ownership of pending work and cannot repopulate its view',async t=>{
  const h=await fixture(t,{hold:true});h.controller.destroy();assert.equal(h.requests[0].options.signal.aborted,true);h.release();await h.ready;
  assert.equal(h.root.querySelectorAll('[data-lab-family]').length,0);assert.equal(h.frames.size,0);
});

test('pose studies, comparison board and immediate portrait export stay cosmetic and use the selected pose',async t=>{
  const h=await fixture(t,{gpu:true,params:'tool=banana-market-maker&body=runebloom-overshirt'});await h.ready;h.frame();
  assert.equal(h.root.querySelector('[data-lab-pose]').disabled,false);const before=h.root.querySelector('[data-lab-stats]').textContent,requests=h.requests.length;
  h.change('[data-lab-pose]','attack');h.root.querySelector('[data-lab-export]').click();assert.match(h.exports.at(-1),/ATTACK/,'Export must paint the new pose before reading canvas');
  h.root.querySelector('[data-lab-compare]').click();assert.equal(h.root.querySelector('[data-lab-board]').hidden,false);assert.equal(h.root.querySelectorAll('[data-lab-board] canvas').length,4);
  for(const name of ['ATTACK','BLOCK','HIT','VICTORY'])assert.ok(h.text.includes(name+' / PREVIEW'));
  assert.equal(h.root.querySelector('[data-lab-stats]').textContent,before);assert.equal(h.requests.length,requests);assert.equal(h.requests.some(r=>r.url.startsWith('/api/')),false);
  h.controller.destroy();assert.equal(h.graphics.textures.size,0);
});

test('unsupported graphics clearly preserves a fitted still and disables unavailable joint-pose controls',async t=>{
  const h=await fixture(t);await h.ready;h.frame();assert.match(h.root.querySelector('[data-lab-pose-status]').textContent,/Fitted still pose/);assert.equal(h.root.querySelector('[data-lab-pose]').disabled,true);assert.equal(h.root.querySelector('[data-lab-compare]').disabled,true);assert.equal(h.root.querySelector('[data-lab-export]').disabled,false);
});
