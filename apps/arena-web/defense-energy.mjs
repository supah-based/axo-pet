// Explicit local balance candidate. Never imported by the match service or V1 replay verifier.
import{buildPet}from'./catalog.mjs';
import{newBattle,resolve}from'./combat.mjs';
export const DEFENSE_VERSION='axo-arena-defense-lab-1';
export const DEFENSE_RULES=Object.freeze({baseRecovery:1,guardRecovery:1,minimumBlock:8,reversalCost:2,reversalShield:17,reversalCounter:16,rechargeExtra:3});
export function defenseBuild(input){
 const b=buildPet(input),r=DEFENSE_RULES;
 // Apply deltas after canonical validation so learned shield ranks retain their value.
 b.skills.reversal.cost=r.reversalCost;b.skills.reversal.shield+=r.reversalShield-13;b.skills.reversal.counter=r.reversalCounter;
 b.skills.recharge.energy=r.rechargeExtra;return b;
}
export function newDefenseBattle(builds){const s=newBattle(builds,defenseBuild);s.version=DEFENSE_VERSION;return s;}
export function resolveDefense(state,moves){
 if(state.version!==DEFENSE_VERSION)throw Error('Unsupported defense ruleset');
 const out=resolve(state,moves),receipt=out.log.at(-1),r=DEFENSE_RULES;
 receipt.energy=out.fighters.map((f,i)=>{
  const before=state.fighters[i],move=f.build.skills[moves[i]],blocked=receipt.effects[i].blocked;
  const detail={before:before.energy,spent:move.cost,base:r.baseRecovery,move:move.energy||0,guard:blocked>=r.minimumBlock?r.guardRecovery:0,lineage:blocked&&before.build.lineageId==='emerald_sprout'&&before.passiveUses<2?1:0};
  detail.after=Math.min(10,detail.before-detail.spent+detail.base+detail.move+detail.guard+detail.lineage);f.energy=detail.after;return detail;
 });return out;
}
