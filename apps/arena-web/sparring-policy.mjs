import {buildPet,defaultBuild} from './catalog.mjs';
import {legalMoves,resolve,values} from './combat.mjs';
import {SPARRING_PROFILES} from './sparring-meta.mjs';
const LOADOUTS={pressure:['market_order','rug_pull','exit_liquidity','pepe_breakout'],guardian:['diamond_hands','reversal','wen','market_order'],adaptive:['market_order','reversal','touch_grass','lineage_a']};
const SETTINGS={pressure:{damage:1.12,health:.9,history:.2},guardian:{damage:.9,health:1.1,history:.3},adaptive:{damage:1,health:1,history:.45}};
function profileFor(id){if(!Object.hasOwn(SPARRING_PROFILES,id))throw Error('Unknown sparring rival');return SETTINGS[id];}
export function createSparringBuild(lineage,xp,profile){profileFor(profile);const b=defaultBuild(lineage,xp),loadout=[...new Set([...LOADOUTS[profile],...b.loadout,...Object.keys(b.skills)])].filter(k=>!['epic','recharge'].includes(k)&&b.skills[k].level<=b.level).slice(0,4);return buildPet({...b,loadout});}
// Kept byte-for-behavior compatible for existing rooms and five-lesson guided practice.
export function legacyPracticeMove(battle,seat){const f=battle.fighters[seat];return legalMoves(battle,seat).map(k=>{const v=values(f,k);return{k,score:v.damage+Math.min(v.heal,f.build.maxHp-f.hp)*.85+Math.min(v.shield,23)*.5+(v.counter||0)*.4+(v.energy||0)*(f.energy<3?5:1)-(v.recoil||0)};}).sort((a,b)=>b.score-a.score)[0]?.k||null;}
const kind=m=>m.damage?'pressure':m.heal?'recovery':m.shield?'guard':'refuel';
function progress(f){if(!f.build.epic||f.epicUsed)return 0;const [n,total]={emerald_sprout:[f.blocks,2],sapphire_tide:[f.used.length,3],amethyst_dream:[f.hits,3],solar_peach:[f.streak,2],rose_bloom:[f.supports,2],midnight_mint:[f.counters,2]}[f.build.lineageId];return Math.min(1,n/total);}
// Only accepted fighters and resolved history enter this policy. No room, pending choice,
// identity, clock, browser outfit or external service is accepted or consulted.
export function evaluateSparring(battle,seat,profile='adaptive'){
 const settings=profileFor(profile);if(seat!==0&&seat!==1||battle.status!=='playing')throw Error('Sparring requires an active fighter');
 const own=battle.fighters[seat],rival=battle.fighters[1-seat],moves=legalMoves(battle,seat),keys=legalMoves(battle,1-seat);if(!moves.length||!keys.length||moves.length>6||keys.length>6)throw Error('Invalid sparring move budget');
 const categories=new Map(keys.map(key=>[key,kind(values(rival,key))])),counts={},recent=battle.log.slice(-4).map(row=>row.moves[1-seat]);
 for(const key of recent){const k=kind(values(rival,key));counts[k]=(counts[k]||0)+1;}
 const types=[...new Set(categories.values())],normal=keys.length,replies=keys.map(key=>{const type=categories.get(key),group=keys.filter(k=>categories.get(k)===type).length;return {key,weight:(1-settings.history)/normal+settings.history*((counts[type]||0)+1)/(recent.length+types.length)/group};}),sum=replies.reduce((n,r)=>n+r.weight,0);for(const r of replies)r.weight/=sum;
 const rows=moves.map(key=>{let score=0,wins=0,losses=0;for(const reply of replies){const choices=seat===0?[key,reply.key]:[reply.key,key],after=resolve(battle,choices),a=after.fighters[seat],b=after.fighters[1-seat];
   const health=100*(a.hp-own.hp)/own.build.maxHp,damage=100*(rival.hp-b.hp)/rival.build.maxHp;
   let value=settings.damage*damage+settings.health*health+.4*(a.energy-own.energy)+(own.build.epic ? .035 : 0)*(a.charge-own.charge)+.6*(progress(a)-progress(own));
   if(after.status!=='playing'){if(after.winner===seat){value=1000+a.hp/a.build.maxHp;wins++;}else if(after.winner===1-seat){value=-1000;losses++;}else value=0;}
   score+=reply.weight*value;
  }return {key,score,wins,losses};});
 return {rows,replies,pairs:moves.length*keys.length};
}
function unit(seed){if(typeof seed!=='string'||seed.length>128)throw Error('Invalid sparring seed');let h=2166136261;for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return(h>>>0)/4294967296;}
export function decideSparring(battle,seat,profile='adaptive',seed='local'){
 const {rows,replies}=evaluateSparring(battle,seat,profile),guaranteed=rows.filter(r=>r.wins===replies.length),pool=guaranteed.length?guaranteed:rows,best=Math.max(...pool.map(r=>r.score)),candidates=pool.filter(r=>r.score>=best-4),weights=candidates.map(r=>Math.exp((r.score-best)/1.4)),total=weights.reduce((a,b)=>a+b,0);let roll=unit(seed+':'+battle.round+':'+profile)*total;
 for(let i=0;i<candidates.length;i++){roll-=weights[i];if(roll<=0)return candidates[i].key;}return candidates.at(-1).key;
}
