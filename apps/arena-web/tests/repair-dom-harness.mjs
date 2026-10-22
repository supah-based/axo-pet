// Independent non-browser harness. All fetches are local function calls to a file:null
// synthetic ArenaService. No socket, real identity, wallet, browser or candidate edit.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {setImmediate as immediate} from 'node:timers/promises';
import {ArenaService} from '../service.mjs';
const require=createRequire(import.meta.url);
const { parseHTML } = require('linkedom');
export const root=new URL('../',import.meta.url);
export const target=root;
let sequence=0;
export async function flush(){for(let i=0;i<12;i++)await immediate();}
function person(n,lineageId='emerald_sprout'){return {key:'INDEPENDENT-SYNTHETIC-'+n,pet:{genesisId:'AXO-'+String(n).padStart(10,'0'),name:'Review fighter '+n,lineageId,level:10,xp:1200,art:'/SYNTHETIC-'+n+'.webp',identitySource:'SYNTHETIC_OFFLINE_REVIEW'}};}
export async function harness({reduced=false,preview=false,matchmaking=false,strict=false}={}){
 const {window}=parseHTML(readFileSync(new URL('index.html',target),'utf8')),document=window.document;
 let now=1000000;const service=new ArenaService({file:null,clock:()=>now,matchmaking,privacyMode:strict?'strict':'legacy'}),a=person(1),b=person(2,'solar_peach'),c=person(3,'rose_bloom'),d=person(4,'midnight_mint');
 const A=service.challenge(a,{}).id;service.join(b,A);if(matchmaking){service.ready(a,A);now+=3000;service.tick();}const B=service.challenge(c,{}).id;service.join(d,B);if(matchmaking){service.ready(c,B);now+=3000;service.tick();}
 let hash='',href='https://offline.fixture/arena/';const location={pathname:'/arena/',search:'',get href(){return href;}};
 Object.defineProperty(location,'hash',{get:()=>hash,set:v=>{hash=v?(v.startsWith('#')?v:'#'+v):'';href='https://offline.fixture/arena/'+hash;queueMicrotask(()=>window.dispatchEvent(new window.Event('hashchange')));}});
 const timeouts=new Map();let timeoutId=0;const intervals=[],requests=[],gates=[],renderers=[],errors=[];
 Object.defineProperty(document,'activeElement',{configurable:true,writable:true,value:document.body});
 window.HTMLElement.prototype.focus=function(){document.activeElement=this;};
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');this.querySelector('button')?.focus();};
 window.HTMLElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
 const ctx=new Proxy({createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};}},{get:(o,k)=>o[k]??(()=>{})});
 window.HTMLCanvasElement.prototype.getContext=function(){return ctx;};
 function response(result,status=200){const snapshot=structuredClone(result);return {ok:status<400,status,json:async()=>structuredClone(snapshot)};}
 function handle(path,body,headers={}){if(path==='/config')return {mode:preview?'preview':'authenticated',release:matchmaking?'1.5.0':'1.4.0',beta:true,matchmaking};if(path==='/lobby-status')return service.lobbyStatus(a);if(path==='/presence')return service.setPresence(a,body);if(path==='/me')return service.me(a);if(path==='/challenge-room')return service.challengeRoom(a);if(path==='/build')return service.save(a,body);if(path==='/preview-session')return service.me(a);if(path==='/tournaments')return service.createTournament(a,body);if(path==='/challenges')return service.challenge(a,body);const parts=path.split('/'),collection=parts[1],id=parts[2],action=parts[3],capabilityId=parts[4];if(collection==='players'&&action==='challenge')return service.directChallenge(a,id);if(collection==='challenge-room'){if(action==='post')return service.postChallenge(a,id,body);if(action==='accept')return service.acceptChallenge(a,id);}if(collection==='tournaments'){if(action==='join')return service.joinTournament(a,id);if(action==='start')return service.startTournament(a,id);if(action==='leave')return service.leaveTournament(a,id);if(action==='spectator-consent')return service.tournamentConsent(a,id,body);if(action==='spectator-capabilities'&&parts[5]==='revoke')return service.revokeTournamentSpectator(a,id,capabilityId);if(action==='spectator-capabilities')return service.issueTournamentSpectator(a,id);return service.getTournament(a,id,{spectatorToken:headers['X-AXO-Spectator']||headers['x-axo-spectator']||null});}if(collection==='challenges'){if(action==='move')return service.choose(a,id,body);if(action==='concede')return service.cancel(a,id,body);if(action==='replay')return service.replay(a,id);if(action==='ready')return service.ready(a,id);if(action==='join')return service.join(a,id);if(action==='block')return service.blockPlayer(a,id,body);if(action==='report')return service.reportPlayer(a,id,body);if(action==='spectator-consent')return service.spectatorConsent(a,id,body);if(action==='spectator-capabilities'&&parts[5]==='revoke')return service.revokeSpectator(a,id,capabilityId);if(action==='spectator-capabilities')return service.issueSpectator(a,id);if(action==='practice-guide'&&capabilityId==='skip')return service.skipPracticeGuide(a,id);if(action==='practice-guide'&&capabilityId==='replay')return service.replayPractice(a,id);return service.getRoom(a,id,{spectatorToken:headers['X-AXO-Spectator']||headers['x-axo-spectator']||null});}throw Error('Unexpected offline request '+path);}
 async function fetch(url,options={}){const path=String(url).replace('/api/arena',''),body=options.body?JSON.parse(options.body):undefined,headers=options.headers||{},request={path,body,headers};requests.push(request);let result;try{result=response(handle(path,body,headers));}catch(e){result=response({error:e.message},e.status||400);}const gate=gates.find(g=>!g.used&&g.match(request));if(gate){gate.used=true;gate.snapshot=result;gate.request=request;await gate.promise;if(gate.failure)throw gate.failure;if(gate.override)result=gate.override;}return result;}
 const clipboard=[],navigator={...window.navigator,clipboard:{async writeText(value){clipboard.push(value);}}},old=new Map(),globals={window,document,location,navigator,history:{pushState(){hash='';href='https://offline.fixture/arena/';}},fetch,FormData:class{constructor(form){this.fields=[...form.querySelectorAll('[name]')].map(n=>[n.name,n.value]);}*[Symbol.iterator](){yield* this.fields;}},matchMedia:()=>({matches:reduced}),Image:class{complete=false;naturalWidth=0;naturalHeight=0;},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval:(fn,ms)=>{const entry={fn,ms};intervals.push(entry);return entry;},clearInterval(){},setTimeout:(fn,ms)=>{timeouts.set(++timeoutId,{fn,ms});return timeoutId;},clearTimeout:id=>timeouts.delete(id)};
 if(matchmaking){const NativeDate=globalThis.Date;globals.Date=class extends NativeDate{static now(){return now;}};globals.performance={now:()=>now};}
 for(const[k,v]of Object.entries(globals)){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 window.confirm=()=>true;
 const rendererModule=await import(new URL(process.env.REVIEW_BASELINE==='1'?'render.mjs?ui=1.6':'render.mjs?ui=1.9&rev=3&motion=1&command=1&equipped=1&fitted=1',target));
 const originalSet=rendererModule.ArenaRenderer.prototype.set;
 rendererModule.ArenaRenderer.prototype.set=function(s){const fresh=originalSet.call(this,s);renderers.push({instance:this,state:structuredClone(s),fresh});return fresh;};
 const reject=e=>errors.push(e);process.on('unhandledRejection',reject);
 function hold(path,method='GET'){let release;const promise=new Promise(r=>release=r),gate={used:false,match:r=>r.path===path&&(r.body===undefined?'GET':'POST')===method,promise,release};gates.push(gate);return gate;}
 async function click(selector){const element=document.querySelector(selector);assert(element,'Missing '+selector);assert(!element.disabled,'Disabled '+selector);element.click();await flush();return element;}
 async function key(key,element=document,extra={}){const e=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(e,{key,repeat:false,ctrlKey:false,metaKey:false,altKey:false,...extra});element.dispatchEvent(e);await flush();}
 async function navigate(id){location.hash='challenge='+id;await flush();}
 async function poll(){await intervals.find(i=>i.ms===850).fn();await flush();}
 await import(new URL('app.mjs?independent-review='+ ++sequence,target));await flush();
 return {timeouts,window,document,location,service,a,b,c,d,A,B,requests,clipboard,renderers,errors,hold,click,key,navigate,poll,flush,clock:()=>intervals.find(i=>i.ms===100).fn(),advance:ms=>now+=ms,last:()=>renderers.at(-1),async close(){for(const gate of gates)gate.release();await flush();rendererModule.ArenaRenderer.prototype.set=originalSet;process.off('unhandledRejection',reject);for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}};
}
