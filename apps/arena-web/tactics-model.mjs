import {buildPet,defaultBuild,LINEAGES} from './catalog.mjs';
import {newBattle,resolve,legalMoves,values} from './combat.mjs';
export const DRILLS=Object.freeze({opening:'Opening exchange',recovery:'Recover under pressure',clutch:'Simultaneous finish',epic:'Epic readiness demo',liquidation:'Liquidation · exchange 10',status:'One-exchange boost & weakness'});
export const PLAYBOOKS=Object.freeze({balanced:'Balanced · default',pressure:'Pressure · break & pierce',guard:'Diamond vault · guard & counter',support:'Copium crew · heal & recover'});
const PLAYBOOK_MOVES=Object.freeze({pressure:['market_order','rug_pull','exit_liquidity','pepe_breakout'],guard:['diamond_hands','reversal','wen','market_order'],support:['touch_grass','lineage_b','diamond_hands','lineage_a']});
export const MOVE_LESSONS=Object.freeze({
 market_order:['Attack','A free attack keeps pressure on without spending energy. A shield can absorb it.'],
 diamond_hands:['Block','A free shield protects against an attack. Unused shielding does not carry over.'],
 rug_pull:['Shield break','Removes part of the opposing shield before attacks resolve. Costs energy and has a cooldown.'],
 reversal:['Counter','Returns damage only when its shield actually blocks an attack, up to its counter limit.'],
 wen:['Reserve','Combines a small shield with extra energy recovery. The ten-energy cap still applies.'],
 pepe_breakout:['Burst','A stronger attack with recoil. Both committed attacks still land.'],
 touch_grass:['Support','Heals missing HP and clears weakness before attacks. Healing is halved from exchange ten.'],
 exit_liquidity:['Pierce','Part of the attack bypasses shielding; the final amount still depends on resolved modifiers.'],
 lineage_a:['Signature','Your lineage changes this move’s utility. Inspect the actual effects below.'],
 lineage_b:['Recovery','A small heal and shield trade immediate pressure for survivability.'],
 epic:['Epic','Requires a learned epic, full charge and your lineage condition. Once per battle.'],
 recharge:['Recharge','No attack or shield. Recovers energy, including the normal exchange recovery, up to ten.'],
});
export function createDrill(build,lineage=build.lineageId,preset='opening',playbook='balanced'){
 if(!Object.hasOwn(LINEAGES,lineage)||!Object.hasOwn(DRILLS,preset)||!Object.hasOwn(PLAYBOOKS,playbook))throw Error('Unknown drill');
 const own=buildPet(build);let dummy=defaultBuild(lineage,own.xp);
 if(playbook!=='balanced'){const keys=[...new Set([...PLAYBOOK_MOVES[playbook],...dummy.loadout,...Object.keys(dummy.skills)])].filter(k=>!['epic','recharge'].includes(k)&&dummy.skills[k].level<=dummy.level).slice(0,4);dummy=buildPet({...dummy,loadout:keys});}
 const battle=newBattle([own,dummy]);
 if(preset==='liquidation')battle.round=10;
 for(const f of battle.fighters){
  if(preset==='recovery'){f.hp=Math.ceil(f.build.maxHp*.45);f.energy=3;}
  if(preset==='clutch')f.hp=30;
  if(preset==='liquidation'){f.hp=Math.ceil(f.build.maxHp*.65);f.energy=6;}
  if(preset==='status'){f.buff=3;f.weak=.1;f.energy=10;}
  if(preset==='epic'){f.charge=100;f.energy=10;f.blocks=2;f.supports=2;f.hits=3;f.counters=2;f.streak=2;f.used=f.build.loadout.slice(0,3);}
 }
 return battle;
}
export function stepDrill(battle,moves){return resolve(battle,moves);}
export function moveReference(build){return Object.entries(build.skills).map(([key])=>({key,...values({build},key),role:MOVE_LESSONS[key][0],lesson:MOVE_LESSONS[key][1],equipped:build.loadout.includes(key),unlocked:build.skills[key].level<=build.level}));}
export function exchangeInsight(before,after){
 const last=after.log.at(-1);if(!last)return null;
 return {round:last.round,photoFinish:!!last.photoFinish,terminal:after.status!=='playing',reason:after.reason||null,fighters:last.moves.map((key,side)=>{
  const f=before.fighters[side],a=after.fighters[side],effect=last.effects[side],target=last.effects[1-side],spent=f.build.skills[key].cost;
  return {name:f.build.skills[key].name,key,damageDealt:target.damage+target.counter,damageReceived:effect.damage+effect.counter,blocked:effect.blocked,healed:effect.healed,recoil:effect.recoil,storm:effect.storm,hpBefore:f.hp,hpAfter:a.hp,energyBefore:f.energy,energyAfter:a.energy,spent,recovered:a.energy-f.energy+spent};
 })};
}
export function drillLegal(battle,side){return legalMoves(battle,side);}
export function counterplayRows(battle,move){
 if(!legalMoves(battle,0).includes(move))return [];
 return legalMoves(battle,1).map(reply=>{const after=resolve(battle,[move,reply]),row=exchangeInsight(battle,after);return{reply,name:battle.fighters[1].build.skills[reply].name,own:row.fighters[0],rival:row.fighters[1],status:after.status,winner:after.winner,reason:after.reason||null};});
}
export function replayBookmarks(report){
 const rows=report?.exchanges||[],bookmarks=[];
 for(const[field,label]of [['damageDealt','Biggest exchange'],['blocked','Best block'],['healed','Best recovery']]){
  const best=rows.reduce((winner,row)=>{const amount=row.fighters.reduce((sum,f)=>sum+(f[field]||0),0);return amount>(winner?.value||0)?{round:row.round,value:amount,label}:winner;},null);
  if(best)bookmarks.push(best);
 }
 if(rows.length)bookmarks.push({round:rows.at(-1).round,label:'Final exchange',value:null});return bookmarks;
}
export function resolvedRecap(room){
 const last=room?.battle?.log?.at(-1);if(!last)return null;
 return {round:last.round,photoFinish:!!last.photoFinish,rows:last.moves.map((key,i)=>({move:room.battle.fighters[i].build.skills[key].name,dealt:last.effects[1-i].damage+last.effects[1-i].counter,...last.effects[i]}))};
}
export function battleMoments(report,seat){
 if(seat!==0&&seat!==1)return [];const result=[],rows=report.exchanges||[];
 for(const[field,label]of [['blocked','Successful guard'],['healed','HP recovered']]){let best=null;for(const row of rows){const value=row.fighters[seat][field]||0;if(value>(best?.value||0))best={label,round:row.round,value};}if(best)result.push(best);}
 const epic=rows.find(row=>row.fighters[seat].move==='epic');if(epic)result.push({label:'Epic unleashed',round:epic.round,value:null});
 if(report.outcome.status==='won'&&report.outcome.winner===seat&&report.fighters[seat].finalHp===1&&rows.length)result.push({label:'Finished on 1 HP',round:rows.at(-1).round,value:null});return result;
}
