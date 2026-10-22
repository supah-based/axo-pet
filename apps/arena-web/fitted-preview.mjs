import {fitPlan} from './atelier/model.mjs';
import {ATELIER_CATALOG_SHA256,atelierManifest,atelierMediaUrl} from './style-lab-model.mjs';
import {arenaLook,ARENA_STYLE_DEFAULTS} from './arena-look-store.mjs';
import {canonicalPoseEligible} from './equipped-canonical.mjs';
import {createEquippedPuppet} from './equipped-puppet.mjs';
export const FITTED_PREVIEW_LIMITS=Object.freeze({actors:3,images:20,bytes:8*1024*1024});
export function fittedPetSupported(pet,{reference=false,level=pet?.level}={}){
 if(level!==10||!Object.hasOwn(ARENA_STYLE_DEFAULTS,pet?.lineageId))return false;
 return pet.identitySource==='AUTHENTICATED_PET_READ_V1'?canonicalPoseEligible(pet,pet.layers||[]):reference;
}
const fingerprint=bytes=>crypto.subtle.digest('SHA-256',bytes).then(hash=>Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''));
async function decodeImage(bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));try{const image=new Image();image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}}
// Visuals only: this module never reads catalog stats, item tiers or numeric gear IDs.
export function createFittedPreviewCache({fetcher=(...args)=>fetch(...args),digest=fingerprint,decode=decodeImage,makeCanvas=()=>document.createElement('canvas'),makePuppet=createEquippedPuppet,storage}={}){
 const controller=new AbortController(),entries=new Map(),images=new Map();let disposed=false,generation=0,catalogPromise;
 const signal=()=>AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]);
 async function bytes(url,max){const response=await fetcher(url,{credentials:'omit',redirect:'error',signal:signal()});if(!response.ok||Number(response.headers?.get?.('content-length'))>max)throw Error('Fitted media unavailable');const data=await response.arrayBuffer();if(!data.byteLength||data.byteLength>max)throw Error('Fitted media size');return data;}
 function catalog(){return catalogPromise??=(async()=>{const data=await bytes('/arena/atelier/catalog.json',4*1024*1024);if(await digest(data)!==ATELIER_CATALOG_SHA256)throw Error('Fitted catalog integrity');if(disposed)throw Error('Preview closed');const value=JSON.parse(new TextDecoder().decode(data));return{value,manifest:atelierManifest(value)};})();}
 function image(path,manifest){if(images.has(path))return images.get(path);const epoch=generation,promise=(async()=>{const evidence=manifest.get(path);if(!evidence)throw Error('Unlisted fitted surface');const data=await bytes(atelierMediaUrl(path),FITTED_PREVIEW_LIMITS.bytes);if(await digest(data)!==evidence.sha256)throw Error('Fitted surface integrity');const decoded=await decode(data,evidence);if(disposed||generation!==epoch)throw Error('Preview closed');if(decoded.naturalWidth!==evidence.width||decoded.naturalHeight!==evidence.height||evidence.width!==1024||evidence.height!==1536)throw Error('Fitted surface dimensions');const canvas=makeCanvas();canvas.width=512;canvas.height=768;canvas.getContext('2d').drawImage(decoded,0,0,512,768);return canvas;})();if(images.size>=FITTED_PREVIEW_LIMITS.images)images.delete(images.keys().next().value);images.set(path,promise);return promise;}
 function dispose(entry){entry.closed=true;entry.actor?.destroy();entry.actor=null;if(entry.composite){entry.composite.width=1;entry.composite.height=1;entry.composite=null;}}
 function get(pet,options={}){
  if(disposed||!fittedPetSupported(pet,options))return {status:'unsupported',frame:()=>null};
  const lineage=pet.lineageId;if(entries.has(lineage))return entries.get(lineage);
  if(entries.size>=FITTED_PREVIEW_LIMITS.actors){const first=entries.keys().next().value;dispose(entries.get(first));entries.delete(first);}
  const entry={status:'loading',closed:false,actor:null,composite:null,selection:null,frame(pose){if(this.status!=='ready'||this.closed)return null;const articulated=this.actor?.render(pose);return{image:articulated||this.composite,padded:!!articulated,authority:'COSMETIC_PREVIEW_ONLY'};}};entries.set(lineage,entry);
  entry.ready=(async()=>{const{value,manifest}=await catalog();if(entry.closed||disposed)return;const selection=arenaLook(value,lineage,storage),plan=fitPlan(value,lineage,selection,{},null,true),surfaces=[];
   for(const layer of plan){const decoded=await image(layer.src,manifest);if(entry.closed||disposed)return;surfaces.push({...layer,image:decoded});}
   const composite=makeCanvas();composite.width=512;composite.height=768;for(const layer of surfaces)composite.getContext('2d').drawImage(layer.image,0,0,512,768);
   if(entry.closed||disposed){composite.width=1;return;}entry.composite=composite;entry.selection=selection;try{entry.actor=makePuppet(surfaces,{makeCanvas});}catch{entry.actor=null;}if(entry.closed||disposed){dispose(entry);return;}entry.status='ready';
  })().catch(()=>{if(!entry.closed&&!disposed){entry.actor?.destroy();entry.actor=null;entry.status='failed';}});
  return entry;
 }
 function clear(){generation++;for(const entry of entries.values())dispose(entry);entries.clear();images.clear();}
 return{get,settled:()=>Promise.all([...entries.values()].map(entry=>entry.ready)),clear,destroy(){if(disposed)return;disposed=true;controller.abort();clear();}};
}
