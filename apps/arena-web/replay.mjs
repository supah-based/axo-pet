// Portable replay: no identities, room capabilities, art URLs or pending commitments.
import {VERSION,buildPet} from './catalog.mjs';
import {newBattle,resolve,finishOnClock} from './combat.mjs';
export const REPLAY_SCHEMA='AXO_ARENA_PORTABLE_REPLAY_1';
export const GEAR_REPLAY_SCHEMA='AXO_ARENA_PORTABLE_REPLAY_2';
export function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const equal=(a,b)=>canonical(a)===canonical(b);
function keys(v,list){if(!v||typeof v!=='object'||Array.isArray(v)||!equal(Object.keys(v).sort(),list.sort()))throw Error('Invalid replay schema fields');}
export function replayFrames(doc){
 keys(doc,['schema','ruleset','kind','startedAt','finishedAt','builds','exchanges','outcome','fingerprint']);
 if(![REPLAY_SCHEMA,GEAR_REPLAY_SCHEMA].includes(doc.schema)||doc.ruleset!==VERSION)throw Error('Unsupported replay schema or ruleset');
 if(!['casual','practice','tournament'].includes(doc.kind)||!Number.isSafeInteger(doc.startedAt)||!Number.isSafeInteger(doc.finishedAt)||doc.startedAt<0||doc.finishedAt<doc.startedAt)throw Error('Invalid replay metadata');
 if(!Array.isArray(doc.builds)||doc.builds.length!==2||!Array.isArray(doc.exchanges)||doc.exchanges.length>14||! /^[a-f0-9]{64}$/.test(doc.fingerprint))throw Error('Invalid replay bounds');
 const builds=doc.builds.map(b=>{const gear=doc.schema===GEAR_REPLAY_SCHEMA;keys(b,['lineageId','xp','allocation','ranks','loadout',...(gear?['gearStats']:[])]);const out=buildPet(b);if(!equal(b,{lineageId:out.lineageId,xp:out.xp,allocation:out.allocation,ranks:out.ranks,loadout:out.loadout,...(gear?{gearStats:out.gearStats}:{})}))throw Error('Noncanonical build');return out;});
 let state=newBattle(builds);const frames=[structuredClone(state)];
 for(const exchange of doc.exchanges){state=resolve(state,exchange.moves);if(!equal(state.log.at(-1),exchange))throw Error('Exchange does not match frozen rules');frames.push(structuredClone(state));}
 keys(doc.outcome,['status','winner','reason','hp']);const o=doc.outcome;
 const external=['CONCEDED','CHECKIN_FORFEIT','THREE_MISSED_TURNS'];
 if(o.reason==='180_SECOND_LIMIT'){if(state.status!=='playing')throw Error('Clock after combat finish');state=finishOnClock(state);}
 else if(external.includes(o.reason)){if(state.status!=='playing'||!['won','draw'].includes(o.status)||![null,0,1].includes(o.winner)||(o.status==='draw')!==(o.winner===null)||(o.reason==='CONCEDED'&&o.status!=='won')||(o.reason==='CHECKIN_FORFEIT'&&doc.exchanges.length))throw Error('Invalid administrative finish');state.status=o.status;state.winner=o.winner;state.reason=o.reason;}
 if(!equal({status:state.status,winner:state.winner,reason:state.reason,hp:state.fighters.map(f=>f.hp)},o))throw Error('Outcome mismatch');
 return {frames,final:state,administrativeFinish:external.includes(o.reason),notice:'Deterministic combat consistency only. Fingerprint is not a signature, independent verification or audit. Timing, consent and administrative finishes are server assertions.'};
}
export function unsigned(doc){const {fingerprint,...payload}=doc;return payload;}
