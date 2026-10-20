import {VERSION,LINEAGES,buildPet} from './catalog.mjs';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function newBattle(builds,builder=buildPet){return {version:VERSION,status:'playing',winner:null,round:1,log:[],fighters:builds.map(b=>{const build=builder(b);return {build,hp:build.maxHp,energy:6,charge:0,epicUsed:false,cooldowns:{},weak:0,buff:0,blocks:0,supports:0,hits:0,counters:0,streak:0,attacks:0,passiveUses:0,used:[],timeouts:0};})};}
export function epicCondition(f){switch(f.build.lineageId){case'emerald_sprout':return f.blocks>=2;case'sapphire_tide':return f.used.length>=3;case'amethyst_dream':return f.hits>=3;case'solar_peach':return f.streak>=2;case'rose_bloom':return f.supports>=2;case'midnight_mint':return f.counters>=2;default:return false;}}
export function legalMoves(s,i){if(s.status!=='playing')return [];const f=s.fighters[i];return [...f.build.loadout,'recharge',...(f.build.epic?['epic']:[])].filter(k=>f.energy>=f.build.skills[k].cost&&!(f.cooldowns[k]>0)&&(k!=='epic'||f.charge>=100&&!f.epicUsed&&epicCondition(f)));}
export function values(f,key){const m=f.build.skills[key],s=f.build.stats;const delta=(s[m.scale[0]]-10)*.65+(s[m.scale[1]]-10)*.35;
 return {...m,damage:m.power?Math.round(m.power+.35*(f.build.level-1)+.55*delta):0,shield:m.shield?Math.round(m.shield+.35*Math.max(0,s.CON-10)):0,heal:m.heal?Math.round(m.heal+.35*Math.max(0,s.WIS-10)):0};}
export function timeoutWinner(s){const [a,b]=s.fighters;const delta=a.hp*b.build.maxHp-b.hp*a.build.maxHp;return delta===0?null:delta>0?0:1;}
export function finishOnClock(s){const out=structuredClone(s);out.winner=timeoutWinner(out);out.status=out.winner===null?'draw':'won';out.reason='180_SECOND_LIMIT';return out;}
export function resolve(s,choices,{valueResolver=values}={}){
 if(!Array.isArray(choices)||choices.length!==2||choices.some((k,i)=>!legalMoves(s,i).includes(k)))throw Error('Illegal move');
 const out=structuredClone(s),f=out.fighters,m=f.map((v,i)=>valueResolver(v,choices[i]));
 const e=f.map(()=>({damage:0,blocked:0,healed:0,counter:0,recoil:0,storm:0}));
 const shields=m.map(v=>v.shield),nextBuff=[0,0],nextWeak=[0,0],remaining=[0,0];
 for(let i=0;i<2;i++){
  const a=f[i],v=m[i];a.energy-=v.cost;if(v.cleanse)a.weak=0;
  const healing=out.round>=10?Math.floor(v.heal/2):v.heal;e[i].healed=Math.min(a.build.maxHp-a.hp,healing);a.hp+=e[i].healed;
  if(v.purge){shields[1-i]=Math.max(0,shields[1-i]-v.purge);f[1-i].buff=0;}
 }
 for(let i=0;i<2;i++){
  const a=f[i],j=1-i,v=m[i],l=a.build.lineageId;let raw=v.damage;
  if(raw){
   raw+=a.buff;
   if(l==='solar_peach'&&a.streak)raw++;
   if(a.passiveUses<3&&((l==='amethyst_dream'&&!m[j].damage)||(l==='midnight_mint'&&m[j].shield))){raw+=2;a.passiveUses++;}
   raw=Math.max(1,Math.round(raw*(1-a.weak)*(1-clamp((f[j].build.stats.WIS-10)*.002,0,.02))));
   const bypass=Math.floor(raw*(v.pierce||0))+(l==='sapphire_tide'&&(a.attacks+1)%3===0?2:0);
   e[j].blocked=Math.min(shields[j],Math.max(0,raw-bypass));e[j].damage=raw-e[j].blocked;
   if(m[j].counter&&e[j].blocked)e[i].counter=Math.min(m[j].counter,e[j].blocked);
   if(v.weak)nextWeak[j]=clamp(v.weak+.002*(a.build.stats.CHA-10)-.002*(f[j].build.stats.WIS-10),0,.12);
   if(v.buff)nextBuff[i]=v.buff;
   a.attacks++;if(e[j].damage)a.hits++;if(m[j].damage)a.counters++;
  }
 }
 // Both committed attacks land; no DEX one-shot cancellation. DEX also contributes to move scaling.
 for(let i=0;i<2;i++){
  const a=f[i],v=m[i],l=a.build.lineageId;e[i].recoil=v.recoil||0;e[i].storm=out.round>=10?6+(out.round-10)*4:0;
  remaining[i]=a.hp-e[i].damage-e[i].counter-e[i].recoil-e[i].storm;
  a.hp=Math.max(0,remaining[i]);
  let refund=0;if(e[i].blocked){a.blocks++;if(l==='emerald_sprout'&&a.passiveUses<2){refund=1;a.passiveUses++;}}
  if(e[i].blocked||e[i].healed){a.supports++;if(l==='rose_bloom'&&a.passiveUses<3){nextBuff[i]=Math.max(nextBuff[i],3);a.passiveUses++;}}
  a.energy=clamp(a.energy+2+(v.energy||0)+refund,0,10);
  if(v.epic){a.charge=0;a.epicUsed=true;}else a.charge=clamp(a.charge+(v.damage?18:12)+(e[i].damage?8:0),0,100);
  a.weak=nextWeak[i];a.buff=nextBuff[i];a.streak=v.damage?a.streak+1:0;
  if(choices[i]!=='recharge'&&!v.epic&&!a.used.includes(choices[i]))a.used.push(choices[i]);
  for(const k of Object.keys(a.cooldowns))a.cooldowns[k]=Math.max(0,a.cooldowns[k]-1);a.cooldowns[choices[i]]=v.cooldown;
 }
 out.log.push({round:out.round,moves:choices,effects:e,first:f[0].build.stats.DEX===f[1].build.stats.DEX?(out.round-1)%2:f[0].build.stats.DEX>f[1].build.stats.DEX?0:1});
 if(f.some(a=>!a.hp)){
  out.winner=f[0].hp===f[1].hp?null:f[0].hp?0:1;out.reason='KNOCKOUT';
  // Published photo-finish rule: smaller proportional overkill survives at 1 HP.
  // Cross-multiply integers, never round or use random/hidden initiative to choose a winner.
  if(f.every(a=>!a.hp)){
   const margin=remaining[0]*f[1].build.maxHp-remaining[1]*f[0].build.maxHp;
   if(margin!==0){out.winner=margin>0?0:1;f[out.winner].hp=1;out.reason='PHOTO_FINISH';out.log.at(-1).photoFinish={remaining,winner:out.winner};}
  }
  out.status=out.winner===null?'draw':'won';
 }
 else if(out.round>=14){out.winner=timeoutWinner(out);out.status=out.winner===null?'draw':'won';out.reason='14_EXCHANGE_LIMIT';}
 else out.round++;
 return out;
}
