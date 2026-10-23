import {MEME_ART} from './meme-art-bank.mjs';
import {TACTICS_ART} from './tactics-art-bank.mjs';
import {MOVE_PROFILES} from './animation-cues.mjs';
import {contactCue} from './combat-beats.mjs';
export const MEME_FX_IDS=Object.freeze(['diamond-guard','candle-burst','copium-bloom','counter-return']);
export const MEME_FX_KINDS=Object.freeze(['hit','guard','heal','counter']);
// Optional fixed public media. No identity-bearing requests and no receipt replay after loading.
export function createMemeArtCache({fetcher=(...args)=>fetch(...args),digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join(''),decode=defaultDecode,supported=typeof globalThis.createImageBitmap==='function'||typeof globalThis.Image?.prototype?.decode==='function'}={}){
 const entries=new Map();
 function prepare(){if(!supported)return;for(const id of MEME_FX_IDS){if(entries.has(id))continue;const entry={image:null,status:'loading',ready:null};entries.set(id,entry);entry.ready=(async()=>{const art=MEME_ART[id]||TACTICS_ART[id],r=await fetcher(art.url,{credentials:'omit',redirect:'error',cache:'force-cache',signal:AbortSignal.timeout(6000)});if(!r.ok||r.redirected||Number(r.headers?.get('content-length'))>art.bytes)throw Error('Unavailable effect');const b=await readBounded(r,art.bytes);if(b.byteLength!==art.bytes||await digest(b)!==art.sha256)throw Error('Invalid effect bytes');const image=await decode(b);if((image.width??image.naturalWidth)!==art.width||(image.height??image.naturalHeight)!==art.height){image.close?.();throw Error('Invalid effect dimensions');}entry.image=image;entry.status='ready';})().catch(()=>{entry.status='failed';});}}
 return {prepare,image:id=>MEME_FX_IDS.includes(id)?entries.get(id)?.image||null:null,status:id=>entries.get(id)?.status||'unloaded',settled:()=>Promise.all([...entries.values()].map(e=>e.ready)),size:()=>entries.size,readyCount:()=>[...entries.values()].filter(e=>e.status==='ready').length};
}
async function defaultDecode(bytes){const blob=new Blob([bytes],{type:'image/webp'});if(typeof globalThis.createImageBitmap==='function')return createImageBitmap(blob);const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}}
async function readBounded(response,limit){if(!response.body?.getReader)return response.arrayBuffer();const reader=response.body.getReader(),out=new Uint8Array(limit);let offset=0;try{for(;;){const {done,value}=await reader.read();if(done)break;if(offset+value.byteLength>limit){await reader.cancel();throw Error('Effect size exceeded');}out.set(value,offset);offset+=value.byteLength;}if(offset!==limit)throw Error('Truncated effect');return out.buffer;}finally{reader.releaseLock();}}
export const memeArtCache=createMemeArtCache();
export function effectReviewElapsed(state,elapsed,requested){return state?.presentationContext==='training'&&Number.isFinite(requested)&&requested>=0&&requested<1800?requested:elapsed;}

// Max eight slots (four kinds per seat), reused by the renderer. Only resolved effects select art.
export function memeFxSample(last,side,elapsed,kind,{reduced=false,enabled=true,low=false}={},out={}){
 out.active=false;out.alpha=0;if(!enabled||reduced||!Number.isFinite(elapsed)||side!==0&&side!==1||!Array.isArray(last?.moves)||last.moves.length!==2||!last.moves.every(k=>Object.hasOwn(MOVE_PROFILES,k))||!Array.isArray(last.effects)||last.effects.length!==2||!last.effects[side]||!last.effects[1-side])return out;
 const own=last.effects[side],hit=last.effects[1-side],key=last.moves[side];let at,id,target,amount;
 if(kind==='hit'){if(!['pepe_breakout','lineage_a','epic'].includes(key))return out;id='candle-burst';at=contactCue(last,side);target=1-side;amount=hit.damage;}
 else if(kind==='guard'){if(key==='reversal'&&hit.counter>0)return out;id='diamond-guard';at=contactCue(last,1-side);target=side;amount=own.blocked;}
 else if(kind==='counter'){if(key!=='reversal'||!(own.blocked>0))return out;id='counter-return';at=contactCue(last,side);target=side;amount=hit.counter;}
 else if(kind==='heal'){id='copium-bloom';at=contactCue(last,side);target=side;amount=own.healed;}
 else return out;
 const age=elapsed-at,duration=low?300:420;if(!Number.isFinite(age)||age<0||age>=duration||!Number.isFinite(amount)||!(amount>0))return out;
 const q=age/duration;out.active=true;out.id=id;out.target=target;out.age=age;out.alpha=(kind==='guard'?.56:kind==='heal'?.68:.75)*(1-q);out.scale=(low?.8:1)*(.8+.2*Math.min(1,q*5));out.size=kind==='hit'?(key==='epic'?175:140):kind==='guard'?200:kind==='counter'?150:180;out.flip=kind==='counter'?side===0:side===1;return out;
}
