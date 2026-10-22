// Actual renderer; mocked Canvas/Image/RAF/visibility only. No browser/compositor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultBuild} from '../catalog.mjs';
import {DEFAULT_PRESENTATION, updatePresentation} from '../presentation.mjs';
import {audioFixture} from './audio-fixture.mjs';
let sequence=0;
async function mock(){const old=new Map(),ops=[],images=[],callbacks=new Map(),listeners=new Map(),preference={matches:false};let id=0;
 const document={hidden:false,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const context=new Proxy({drawImage(img,...a){assert(a.every(Number.isFinite));assert(a[0]>=0&&a[1]>=0&&a[0]+a[2]<=img.naturalWidth&&a[1]+a[3]<=img.naturalHeight);ops.push(['drawImage',img.src,...a]);},createLinearGradient(){return {addColorStop(){}};}},{get:(o,k)=>o[k]??((...a)=>{assert(a.every(v=>typeof v!=='number'||Number.isFinite(v)));ops.push([k,...a]);})});
 class Image{constructor(){this.complete=true;this.naturalWidth=2048;this.naturalHeight=1024;images.push(this);}set src(value){this.url=value;if(value.includes('moves-v18'))this.naturalHeight=2048;}get src(){return this.url;}}
 const globals={document,matchMedia:()=>preference,Image,requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:i=>callbacks.delete(i),devicePixelRatio:4};
 for(const[k,v]of Object.entries(globals)){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 const canvas={width:0,height:0,clientWidth:844,clientHeight:327,isConnected:true,getContext:()=>context,closest:()=>({querySelector:()=>({offsetHeight:142})})};
 const mod=await import('../render.mjs?independent-render='+ ++sequence);
 return {...mod,canvas,document,ops,images,callbacks,listeners,preference,restore(){for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}};
}
const freeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);for(const v of Object.values(o))freeze(v);}return o;};
function state(round,{id='offline-A',moves=['market_order','reversal'],effects=[{damage:3,blocked:7,healed:5,counter:2,recoil:6,storm:10},{damage:11,blocked:9,healed:8,counter:4,recoil:7,storm:14}],status='playing',serverNow=1000000}={}){const builds=['emerald_sprout','solar_peach'].map(k=>defaultBuild(k));return {id,status,serverNow,opensAt:serverNow-5000,players:builds.map(build=>({pet:{lineageId:build.lineageId},build})),battle:{status,winner:status==='won'?0:null,log:round?[{round,moves,effects}]:[],fighters:builds.map(build=>({build,hp:30}))}};}

test('R2: first visible snapshot is reconnect history even when exactly one round arrived while hidden',async()=>{const m=await mock();const r=new m.ArenaRenderer(m.canvas);try{
 assert.equal(r.set(state(5)),false);m.document.hidden=true;m.listeners.get('visibilitychange')();
 // Timers may be throttled/suspended in a background tab: no hidden set()/poll is delivered.
 m.document.hidden=false;m.listeners.get('visibilitychange')();
 assert.equal(r.set(state(6,{serverNow:1030000})),false,'Historical hidden-tab receipt was replayed and reported fresh after reconnect');
 assert.equal(r.revealAt,-Infinity);assert.equal(r.set(state(7,{serverNow:1031000})),true);
}finally{r.stop();m.restore();}});

test('P2: all six receipt amounts survive actual final-turn and reduced-motion Canvas drawing without combat mutation',async()=>{const m=await mock();const r=new m.ArenaRenderer(m.canvas);try{
 r.set(state(9));const terminal=freeze(state(10,{status:'won'})),before=JSON.stringify(terminal);assert.equal(r.set(terminal),true);
 for(const reduced of [false,true]){m.preference.matches=reduced;r.lastPaint=-Infinity;m.ops.length=0;r.draw(r.revealAt+1500);const text=m.ops.filter(o=>o[0]==='fillText').map(o=>o[1]);for(const value of ['−3','BLOCK 7','+5 HP','COUNTER −2','RECOIL −6','STORM −10','−11','BLOCK 9','+8 HP','COUNTER −4','RECOIL −7','STORM −14'])assert(text.includes(value),value+' missing');assert.equal(JSON.stringify(terminal),before);}
 assert(m.canvas.width*m.canvas.height<=1800000);assert(m.canvas.width<=1440);
}finally{r.stop();m.restore();}});

test('P3: RAF chain is single and cancellation removes pending work; fixed image universe and valid atlas crop sizes',async()=>{const m=await mock();const r=new m.ArenaRenderer(m.canvas);try{
 r.set(state(0));r.set(state(1));
 for(let frame=0;frame<80;frame++){assert.equal(m.callbacks.size,1);const [id,fn]=m.callbacks.entries().next().value;m.callbacks.delete(id);fn(r.revealAt+frame*20);}
 assert(m.images.length<=4);assert.equal(m.images.filter(i=>i.src.includes('moves-v18')).length,1);assert.equal(m.callbacks.size,1);
 const textBefore=m.ops.length;r.stop();assert.equal(m.callbacks.size,0);assert.equal(m.listeners.size,0);r.draw(900000);assert.equal(m.ops.length,textBefore);
}finally{r.stop();m.restore();}});

test('P5: renderer stop terminates the new bounded PCM sound voices and ambience',async()=>{const m=await mock(),audio=audioFixture(),r=new m.ArenaRenderer(m.canvas,{audio:audio.director});try{
 assert.equal(audio.director.play('epic'),false);assert.equal(audio.created,0);await audio.director.enable();audio.director.setScene(true);for(let i=0;i<100;i++)audio.director.play(i%2?'epic':'attack');assert.equal(audio.director.status().voices,8);
 r.stop();assert.equal(audio.director.status().voices,0);assert.ok(audio.sources.every(source=>source.stopped&&source.disconnected));
 }finally{r.stop();await audio.director.destroy();m.restore();}
});

test('resolved renderer receipts schedule audio once; reconnect history, hidden updates and replay seeks stay silent',async()=>{const m=await mock(),audio=audioFixture(),r=new m.ArenaRenderer(m.canvas,{audio:audio.director});try{
 await audio.director.enable();r.set(state(4));assert.equal(audio.director.status().voices,0);const fresh=freeze(state(5)),before=JSON.stringify(fresh);assert.equal(r.set(fresh),true);assert.ok(audio.director.status().voices>0);const effectsCount=()=>audio.sources.filter(source=>!source.loop).length,count=effectsCount();r.set(fresh);assert.equal(effectsCount(),count);assert.equal(JSON.stringify(fresh),before);
 r.resync();assert.equal(audio.director.status().voices,0);r.set(state(6));assert.equal(effectsCount(),count);r.set(state(7));assert.ok(effectsCount()>count);
 m.document.hidden=true;m.listeners.get('visibilitychange')();assert.equal(audio.director.status().voices,0);const hiddenCount=audio.sources.length;r.set(state(8));assert.equal(audio.sources.length,hiddenCount);m.document.hidden=false;m.listeners.get('visibilitychange')();r.set(state(9));assert.equal(audio.director.status().voices,0);
 r.set({...state(2),presentationContext:'replay',replaySelection:2});assert.equal(audio.director.status().voices,0);
 }finally{r.stop();await audio.director.destroy();m.restore();}
});

test('P6: extreme resize/DPR scenarios keep canvas area and internal width bounded',async()=>{const m=await mock(),r=new m.ArenaRenderer(m.canvas);try{
 r.set(state(0));let t=0;for(const[w,h]of [[390,780],[844,327],[4000,4000],[7680,2160],[200,4000]]){m.canvas.clientWidth=w;m.canvas.clientHeight=h;r.lastPaint=-Infinity;r.draw(t+=50);assert(m.canvas.width*m.canvas.height<=1800000);assert(m.canvas.width<=1440);assert(m.canvas.width<=w*2);assert(m.canvas.width>=1&&m.canvas.height>=1);}
 }finally{r.stop();m.restore();}
});

test('presentation settings bound actual renderer cadence/pixels and suppress every motion/effect path',async()=>{const m=await mock(),r=new m.ArenaRenderer(m.canvas);try{
 updatePresentation({quality:'low',motion:'reduced',readouts:false,contrast:false});r.set(state(0));r.set(state(1));
 const frame=time=>{const[id,fn]=m.callbacks.entries().next().value;m.callbacks.delete(id);fn(time);};
 r.lastPaint=-Infinity;frame(r.revealAt+800);const count=m.ops.length;frame(r.revealAt+810);assert.equal(m.ops.length,count,'Low quality must throttle an early frame');
 assert.equal(r.displayBudget.fps,30);assert(m.canvas.width*m.canvas.height<=900000);assert.equal(r.displayBudget.reduced,true);
 assert(r.motion.every(motion=>motion.x===0&&motion.y===0));
 m.ops.length=0;r.arcadeHit(0,r.state.players[0],r.state.battle.log.at(-1),800,320);r.effects(0,r.state.players[0],r.state.battle.log.at(-1),800,320);assert.equal(m.ops.length,0,'Manual reduced motion must suppress travel and impact effects');
 m.document.hidden=true;m.listeners.get('visibilitychange')();assert.equal(m.callbacks.size,0);m.document.hidden=false;m.listeners.get('visibilitychange')();assert.equal(m.callbacks.size,1);
}finally{updatePresentation(DEFAULT_PRESENTATION);r.stop();m.restore();}});
