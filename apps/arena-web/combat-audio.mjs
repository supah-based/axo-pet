import {AUDIO_BANK} from './combat-audio-bank.mjs';
import {receiptAudioPlan} from './combat-beats.mjs';
export const AUDIO_KEY='axo.arena.audio.v1';
export const DEFAULT_AUDIO=Object.freeze({master:.65,effects:.8,music:.18,mono:false});
export function audioPreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(DEFAULT_AUDIO,k)))return {...DEFAULT_AUDIO};
 return Object.fromEntries(Object.entries(DEFAULT_AUDIO).map(([k,v])=>[k,k==='mono'?typeof value[k]==='boolean'?value[k]:v:typeof value[k]==='number'&&Number.isFinite(value[k])?Math.max(0,Math.min(1,value[k])):v]));
}
export function createCombatAudio({contextFactory=()=>{const C=globalThis.AudioContext||globalThis.webkitAudioContext;return C?new C():null;},fetcher=(...args)=>globalThis.fetch(...args),storage=()=>globalThis.localStorage,hidden=()=>globalThis.document?.hidden===true,digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')}={}){
 let prefs;try{const raw=storage()?.getItem(AUDIO_KEY);prefs=audioPreferences(raw&&raw.length<400?JSON.parse(raw):null);}catch{prefs={...DEFAULT_AUDIO};}
 let ctx=null,master=null,effects=null,music=null,enabled=false,phase='off',generation=0,scene=false,loop=null,lastReceipt=null;
 const buffers=new Map(),voices=new Set(),requests=new Set(),listeners=new Set();
 const status=()=>({enabled,phase,loaded:buffers.size,voices:voices.size,preferences:{...prefs}}),notify=()=>{for(const f of listeners)f(status());};
 function disconnect(voice){if(!voices.delete(voice))return;try{voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();}catch{}}
 function stop({keepAmbience=false}={}){for(const voice of [...voices]){try{voice.source.stop();}catch{}disconnect(voice);}if(loop&&!keepAmbience){try{loop.stop();loop.disconnect();}catch{}loop=null;}}
 function apply(){if(!ctx)return;for(const node of [master,effects,music])node.gain.cancelScheduledValues?.(ctx.currentTime);master.gain.setValueAtTime(prefs.master,ctx.currentTime);effects.gain.setValueAtTime(prefs.effects,ctx.currentTime);music.gain.setValueAtTime(prefs.music,ctx.currentTime);for(const v of voices)if(v.pan)v.pan.pan.setValueAtTime(prefs.mono?0:v.position,ctx.currentTime);}
 function ambience(){if(!enabled||phase!=='ready'||!scene||hidden()||loop||!ctx||ctx.state!=='running'||!buffers.has('underground'))return;try{loop=ctx.createBufferSource();loop.buffer=buffers.get('underground');loop.loop=true;loop.connect(music);loop.start();}catch{loop=null;}}
 function update(value){prefs=audioPreferences(value);try{storage()?.setItem(AUDIO_KEY,JSON.stringify(prefs));}catch{}apply();notify();return {...prefs};}
 async function load(id,epoch){
  const entry=AUDIO_BANK[id],controller=new AbortController();requests.add(controller);const timer=setTimeout(()=>controller.abort(),6000);
  try{const response=await fetcher(entry.url,{credentials:'omit',redirect:'error',signal:controller.signal,cache:'force-cache'});if(!response.ok||response.redirected)throw Error('AUDIO_UNAVAILABLE');
   let bytes;if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>entry.bytes){await reader.cancel();throw Error('AUDIO_SIZE');}chunks.push(value);}const packed=new Uint8Array(size);let at=0;for(const chunk of chunks){packed.set(chunk,at);at+=chunk.length;}bytes=packed.buffer;}finally{reader.releaseLock();}}else bytes=await response.arrayBuffer();
   if(bytes.byteLength!==entry.bytes||bytes.byteLength>400000||await digest(bytes)!==entry.sha256)throw Error('AUDIO_INTEGRITY');if(epoch!==generation||!enabled)return;const buffer=await ctx.decodeAudioData(bytes);if(epoch===generation&&enabled)buffers.set(id,buffer);
  }finally{clearTimeout(timer);requests.delete(controller);}
 }
 async function enable(){
  if(enabled)return status();const epoch=++generation;enabled=true;phase='loading';notify();
  try{
   ctx??=contextFactory();if(!ctx)throw Error('AUDIO_UNSUPPORTED');
   if(!master){master=ctx.createGain();effects=ctx.createGain();music=ctx.createGain();effects.connect(master);music.connect(master);const limiter=ctx.createDynamicsCompressor?.();if(limiter){limiter.threshold.value=-10;limiter.knee.value=8;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.18;master.connect(limiter);limiter.connect(ctx.destination);}else master.connect(ctx.destination);apply();}
   await ctx.resume();if(epoch!==generation||!enabled)return status();
   // Fixed thirteen-clip universe. In-flight sounds are never replayed after decoding.
   const ids=Object.keys(AUDIO_BANK).filter(id=>!buffers.has(id));let cursor=0;
   await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(cursor<ids.length&&epoch===generation&&enabled){const id=ids[cursor++];await load(id,epoch);}}));
   if(epoch===generation&&enabled){phase='ready';ambience();notify();}
  }catch{if(epoch===generation){enabled=false;phase='unavailable';generation++;for(const r of requests)r.abort();stop();notify();}}
  return status();
 }
 function disable(){enabled=false;phase='off';generation++;for(const r of requests)r.abort();stop();notify();return status();}
 function play(id,{at=0,pan=0,gain=.65}={}){
  if(!enabled||phase!=='ready'||hidden()||ctx?.state!=='running'||voices.size>=8||!buffers.has(id)||id==='underground')return false;
  const source=ctx.createBufferSource(),g=ctx.createGain(),position=Math.max(-1,Math.min(1,Number.isFinite(pan)?pan:0)),p=ctx.createStereoPanner?.();
  const voice={source,gain:g,pan:p,position};source.buffer=buffers.get(id);g.gain.setValueAtTime(Math.max(0,Math.min(1,gain)),ctx.currentTime);source.connect(g);if(p){p.pan.setValueAtTime(prefs.mono?0:position,ctx.currentTime);g.connect(p);p.connect(effects);}else g.connect(effects);
  voices.add(voice);source.onended=()=>disconnect(voice);try{source.start(ctx.currentTime+Math.max(0,Math.min(2000,Number.isFinite(at)?at:0))/1000);return true;}catch{disconnect(voice);return false;}
 }
 function setScene(active){const was=scene;scene=active===true;if(!scene&&was)stop();else if(scene)ambience();}
 function receipt(state){
  const last=state?.battle?.log?.at(-1),identity=(state?.id||'')+':'+(last?.round||0);
  if(state?.presentationContext==='replay'||!last||identity===lastReceipt)return false;lastReceipt=identity;stop({keepAmbience:!hidden()});
  if(!enabled||phase!=='ready'||hidden())return false;
  ambience();music.gain.cancelScheduledValues?.(ctx.currentTime);music.gain.setValueAtTime(prefs.music*.35,ctx.currentTime);music.gain.linearRampToValueAtTime?.(prefs.music,ctx.currentTime+1.8);for(const cue of receiptAudioPlan(state))play(cue.id,{at:cue.at,pan:cue.pan});return true;
 }
 return {status,update,enable,disable,play,stop,setScene,receipt,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async destroy(){disable();listeners.clear();buffers.clear();if(ctx)await ctx.close?.();ctx=null;master=effects=music=null;}};
}
export const combatAudio=createCombatAudio();
