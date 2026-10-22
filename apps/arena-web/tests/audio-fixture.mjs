import {readFileSync} from 'node:fs';
import {createCombatAudio} from '../combat-audio.mjs';
export function audioFixture({corrupt=false,hold=false,unsupported=false,refuseResume=false}={}){
 const sources=[],gains=[],panners=[],requests=[];let created=0,hidden=false,release;const gate=new Promise(r=>release=r);let saved=null;
 const gain=()=>{const node={gain:{value:0,events:[],setValueAtTime(v,at){this.value=v;this.events.push({type:'set',value:v,at});},linearRampToValueAtTime(value,at){this.events.push({type:'ramp',value,at});},cancelScheduledValues(at){this.events=this.events.filter(e=>e.at<at);}},connect(){return this;},disconnect(){node.disconnected=true;}};gains.push(node);return node;};
 const ctx={currentTime:10,state:'running',destination:{},resume:async()=>{if(refuseResume)throw Error('Suspended');},close:async()=>{ctx.closed=true;},createGain:gain,createStereoPanner(){const p={pan:{value:0,setValueAtTime(v){this.value=v;}},connect(){return this;},disconnect(){p.disconnected=true;}};panners.push(p);return p;},createBufferSource(){const s={connect(){return this;},disconnect(){s.disconnected=true;},start(at){s.at=at;},stop(){s.stopped=true;}};sources.push(s);return s;},decodeAudioData:async bytes=>({length:bytes.byteLength})};
 const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value};
 const director=createCombatAudio({contextFactory:()=>{created++;return unsupported?null:ctx;},hidden:()=>hidden,storage:()=>storage,fetcher:async(url,options)=>{requests.push({url,options});if(hold)await gate;return new Response(corrupt?new Uint8Array([0]):readFileSync(new URL('../assets/runtime/'+url.split('/assets/')[1],import.meta.url)));}});
 return {director,ctx,sources,gains,panners,requests,release,storage,get created(){return created;},get saved(){return saved;},hide(value=true){hidden=value;}};
}
