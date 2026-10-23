import {LINEAGES} from './catalog.mjs';
// Readonly explanations of the accepted V1 snapshot, never action permission.
export const lineagePassiveText=id=>id==='rose_bloom'?'First 3 exchanges with a successful heal or block grant +3 attack for the following exchange. The boost expires after that exchange unless renewed.':LINEAGES[id].passive;
const gates={
 emerald_sprout:f=>[f.blocks,2,'exchanges blocking damage'],
 sapphire_tide:f=>[f.used.length,3,'different equipped moves used'],
 amethyst_dream:f=>[f.hits,3,'exchanges dealing direct damage'],
 solar_peach:f=>[f.streak,2,'consecutive attacks'],
 rose_bloom:f=>[f.supports,2,'exchanges healing or blocking'],
 midnight_mint:f=>[f.counters,2,'attacks into an attacking rival'],
};
export function epicProgress(f){const [value,total,label]=gates[f.build.lineageId](f);return `${Math.min(value,total)}/${total} ${label}`;}
export function combatStatus(f,round){
 const [value,total,label]=gates[f.build.lineageId](f),effects=[];
 if(f.buff>0)effects.push({kind:'boost',label:`+${f.buff} attack this exchange`,detail:'Expires after this exchange unless renewed. Defending or refueling uses up the window; an opposing shield-break move can remove the boost before attacks.'});
 if(f.weak>0)effects.push({kind:'weak',label:`${Math.round(f.weak*100)}% weakened this exchange`,detail:'Reduces your attack this exchange, then expires unless reapplied. Touch Grass clears current weakness before attacks; a new application can remain afterward.'});
 return {epic:{learned:!!f.build.epic,spent:!!f.epicUsed,charge:f.charge,conditionMet:value>=total,progress:epicProgress(f),value:Math.min(value,total),total,label},effects,cooldowns:Object.entries(f.cooldowns).filter(([,n])=>n>0).map(([key,remaining])=>({key,name:f.build.skills[key].name,remaining})),liquidation:{active:round>=10,damage:round>=10?6+(round-10)*4:0,startsIn:Math.max(0,10-round),healing:round>=10?'Healing is halved, rounded down, then capped by missing HP.':'Normal healing until exchange 10.'}};
}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function combatStatusMarkup(f,round,{complete=false,open=false}={}){
 const s=combatStatus(f,round),e=s.epic;
 return `<section class="combat-status-card" aria-label="Your combat status"><div class="status-gates"><strong>EPIC CHECK</strong><span data-met="${e.learned&&!e.spent}">${e.spent?'SPENT':e.learned?'LEARNED':'NOT LEARNED'}</span><span data-met="${e.charge>=100}">${e.charge}/100 charge</span><span data-met="${e.conditionMet}">${esc(e.progress)}</span></div>${complete?'<p>Final accepted snapshot · battle complete.</p>':`<div class="status-effects">${s.effects.length?s.effects.map(x=>`<p class="status-${x.kind}"><strong>${esc(x.label)}</strong><small>${esc(x.detail)}</small></p>`).join(''):'<p>No active attack boost or weakness.</p>'}</div>`}<details data-status-rules ${open?'open':''}><summary>Rules & remaining cooldowns</summary><p>${e.spent?'Epic already used this battle.':!e.learned?'Learn your epic in Pet Build between entries, at V1 level 6 or above.':'Epic requires 100 charge and the lineage condition together; once per battle.'} Only the latest server snapshot enables live actions.</p><p>${s.cooldowns.length?s.cooldowns.map(c=>`${esc(c.name)}: ${c.remaining} intervening exchange${c.remaining===1?'':'s'}`).join(' · '):'No moves cooling down.'}</p><p>${s.liquidation.active?`Liquidation: ${s.liquidation.damage} unavoidable damage to EACH Pet this exchange. ${s.liquidation.healing}`:`Liquidation starts at exchange 10 (${s.liquidation.startsIn} away): 6 unavoidable damage to each Pet, then +4 each exchange; healing is halved.`}</p><p>Shield lasts only for the chosen exchange. Both committed attacks land. A block counter is distinct from Midnight’s epic condition.</p></details></section>`;
}
