import {MOVE_PROFILES} from './animation-cues.mjs';
// Every input below is a resolved receipt. No selected/pending choices, previews or stats.
export function contactCue(last,side){const key=last?.moves?.[side],p=MOVE_PROFILES[key];if(!p)return Infinity;return key==='reversal'?Math.max(p.impact,(MOVE_PROFILES[last?.moves?.[1-side]]?.impact||p.impact)+220):p.impact;}
export function receiptAudioPlan(state){
 const last=state?.battle?.log?.at(-1);if(!last||!Array.isArray(last.moves)||last.moves.length!==2||!Array.isArray(last.effects)||last.effects.length!==2||!last.moves.every(k=>Object.hasOwn(MOVE_PROFILES,k)))return [];
 const plan=[];for(let i=0;i<2;i++){
  const key=last.moves[i],own=last.effects[i],hit=last.effects[1-i],pan=i===0?-.45:.45,p=MOVE_PROFILES[key],at=contactCue(last,i);
  if(!own||!hit)continue;
  if(['market_order','rug_pull','pepe_breakout','exit_liquidity','lineage_a','epic'].includes(key))plan.push({id:'attack',at:p.anticipation,pan});
  if(hit.blocked>0)plan.push({id:'guard',at,pan:-pan});
  if(hit.damage>0||hit.counter>0)plan.push({id:key==='epic'?'epic':'hit',at,pan:-pan});
  if(own.healed>0)plan.push({id:'heal',at,pan});
  if(key==='recharge'||key==='wen')plan.push({id:'charge',at:p.impact,pan});
 }
 if(state.status==='won'&&(state.battle.winner===0||state.battle.winner===1))plan.push({id:state.seat===0||state.seat===1?(state.seat===state.battle.winner?'victory':'defeat'):'draw',at:1780,pan:0});
 else if(state.status==='draw')plan.push({id:'draw',at:1780,pan:0});
 const priority={victory:5,defeat:5,draw:5,epic:4,hit:3,guard:3,heal:2,charge:2,attack:1};
 return plan.sort((a,b)=>priority[b.id]-priority[a.id]).slice(0,8).sort((a,b)=>a.at-b.at);
}
export function contactAccent(last,side,elapsed,reduced=false,out={}){
 const hit=last?.effects?.[1-side],key=last?.moves?.[side],age=elapsed-contactCue(last,side),q=age/260;
 out.active=!reduced&&Number.isFinite(age)&&age>=0&&age<260&&!!hit&&(hit.damage>0||hit.blocked>0||hit.counter>0);out.blocked=!!hit&&hit.blocked>0;out.epic=key==='epic';out.radius=18+Math.max(0,q)*54;out.alpha=out.active?(1-q)**2*.6:0;return out;
}
