import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LINEAGES,STATS,XP,buildPet,defaultBuild,catalog,statBudget,statCap} from './catalog.mjs';
import {newBattle,resolve,legalMoves,values} from './combat.mjs';
let seed=Number(process.env.SEED||260906);const initialSeed=seed;
const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
function build(id,level,mode){
 let b=defaultBuild(id,XP[level-1]),allocation=structuredClone(b.allocation);
 if(mode%3===1){allocation={};let left=statBudget(level);const base=LINEAGES[id].base;while(left){const keys=STATS.filter((k,i)=>base[i]+(allocation[k]||0)<statCap(level)&&(base[i]+(allocation[k]||0)+1>16?2:1)<=left);if(!keys.length)break;const k=keys[Math.floor(random()*keys.length)],value=base[STATS.indexOf(k)]+(allocation[k]||0);left-=value+1>16?2:1;allocation[k]=(allocation[k]||0)+1;}}
 const c=catalog(id),keys=Object.keys(c).filter(k=>!['epic','recharge'].includes(k)&&c[k].level<=level);let loadout;
 if(mode%5===0)loadout=keys.filter(k=>c[k].branch==='defense').concat(keys.filter(k=>c[k].branch==='attack')).slice(0,4);
 else if(mode%5===1)loadout=keys.filter(k=>c[k].branch==='attack').concat(keys.filter(k=>c[k].branch==='defense')).slice(0,4);
 else {const shuffled=[...keys];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}loadout=shuffled.slice(0,4);}
 const ranks=level>=6?{epic:1}:{};let left=level-1-(level>=6?1:0);
 while(left){const options=loadout.filter(k=>(ranks[k]||0)<2&&((ranks[k]||0)===1?2:1)<=left);if(!options.length)break;const k=options[Math.floor(random()*options.length)],cost=ranks[k]?2:1;ranks[k]=(ranks[k]||0)+1;left-=cost;}
 return buildPet({lineageId:id,xp:XP[level-1],allocation,ranks,loadout});
}
function pick(s,i,style){const f=s.fighters[i],enemy=s.fighters[1-i],enemyLegal=legalMoves(s,1-i),shieldRate=enemyLegal.filter(k=>enemy.build.skills[k].shield).length/enemyLegal.length;
 const scored=legalMoves(s,i).map(k=>{const v=values(f,k),heal=Math.min(v.heal,f.build.maxHp-f.hp)*(s.round>=10?.5:1);return {k,score:v.damage*(style===0?1.2:.9)+heal*(style===2?1.2:.9)+Math.min(v.shield,24)*(style===2?.9:.45)+(v.counter||0)*.5+(v.purge||0)*shieldRate*.7+(v.pierce||0)*15*shieldRate+(v.energy||0)*(f.energy<3?5:1)-(v.recoil||0)+(random()-.5)*14};});scored.sort((a,b)=>b.score-a.score);return scored[0].k;}
const ids=Object.keys(LINEAGES),results=[],total=Object.fromEntries(ids.map(id=>[id,{played:0,points:0}]));let games=0,rounds=0,draws=0,epics=0;
for(const level of [1,2,4,6,8,10])for(let a=0;a<6;a++)for(let b=a+1;b<6;b++){
 let points=0,localDraws=0;const n=Number(process.env.PAIR_GAMES||40);
 for(let k=0;k<n;k++){const builds=[build(ids[a],level,k),build(ids[b],level,k+7)];let s=newBattle(builds);while(s.status==='playing'){s=resolve(s,[pick(s,0,k%3),pick(s,1,(k+1)%3)]);for(const f of s.fighters){if(!Number.isInteger(f.hp)||f.hp<0||f.hp>f.build.maxHp||f.energy<0||f.energy>10||f.charge<0||f.charge>100)throw Error('Combat invariant failure');}}
 const value=s.winner===null?.5:s.winner===0?1:0;points+=value;games++;rounds+=s.log.length;draws+=s.winner===null?1:0;localDraws+=s.winner===null?1:0;epics+=s.fighters.filter(f=>f.epicUsed).length;total[ids[a]].played++;total[ids[b]].played++;total[ids[a]].points+=value;total[ids[b]].points+=1-value;
 }
 results.push({level,a:ids[a],b:ids[b],games:n,aScore:points/n,draws:localDraws});
}
const report={seed:initialSeed,games,meanExchanges:rounds/games,drawRate:draws/games,epicsUsed:epics,lineages:Object.entries(total).map(([id,t])=>({id,games:t.played,scoreRate:t.points/t.played})),matchups:results,sourceHashes:Object.fromEntries(['catalog.mjs','combat.mjs','balance.mjs'].map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')])),scope:'Heuristic bots, mixed legal builds and loadouts; not optimal play or proof of human balance. No wagers.',failedMatchupGates:results.filter(r=>r.aScore<.35||r.aScore>.65).length};
writeFileSync(`review/balance-${initialSeed}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,matchups:undefined},null,2));
