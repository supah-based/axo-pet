// Paired finite policies, not optimal strategy or human balance certification.
import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{LINEAGES,XP,defaultBuild,buildPet}from'../apps/arena-web/catalog.mjs';
import{newBattle,resolve,legalMoves}from'../apps/arena-web/combat.mjs';
import{newDefenseBattle,resolveDefense,DEFENSE_RULES}from'../apps/arena-web/defense-energy.mjs';
const roles={pressure:['market_order','rug_pull','exit_liquidity','pepe_breakout'],guard:['market_order','diamond_hands','reversal','wen'],support:['market_order','touch_grass','lineage_b','diamond_hands'],adaptive:['market_order','reversal','touch_grass','lineage_a']};
const pairs=[['pressure','pressure'],['guard','pressure'],['support','pressure'],['adaptive','pressure'],['guard','adaptive'],['support','adaptive']];
const modes={v1:{start:newBattle,step:resolve},candidate:{start:newDefenseBattle,step:resolveDefense}};
function build(lineage,xp,role,gear){const b=defaultBuild(lineage,xp,gear),loadout=[...new Set([...roles[role],...b.loadout])].filter(k=>b.skills[k].level<=b.level).slice(0,4);return buildPet({...b,loadout});}
function decide(s,side,role,step,seed){const moves=legalMoves(s,side),replies=legalMoves(s,1-side);let best=-Infinity,choice;
 for(const move of moves){let sum=0,min=Infinity;for(const reply of replies){const n=step(s,side?[reply,move]:[move,reply]),a=n.fighters[side],b=n.fighters[1-side],f=s.fighters[side],g=s.fighters[1-side],r=n.log.at(-1);let score=100*(g.hp-b.hp)/g.build.maxHp*(role==='pressure'?1.2:.95)+100*(a.hp-f.hp)/f.build.maxHp*(role==='guard'||role==='support'?1.1:.9)+(a.energy-f.energy)*.6+(a.build.epic?(a.charge-f.charge)*.025:0);if(n.status!=='playing')score=n.winner===side?1000:n.winner===null?0:-1000;assert(Number.isFinite(score));sum+=score;min=Math.min(min,score);assert(r.effects[1-side].counter<=r.effects[side].blocked);}
  const value=sum/replies.length+(role==='adaptive'?min*.15:0)+((moves.indexOf(move)+seed)%moves.length)*1e-7;if(value>best){best=value;choice=move;}}
 return choice;
}
const totals={},byMatchup={},byLineage={};let games=0,mirrors=0;
const scopes=[{level:1,gear:{}},{level:6,gear:{}},{level:10,gear:{}},{level:10,gear:{STR:6,DEX:6,CON:6,INT:6,WIS:6,CHA:2}}];
for(const [name,mode]of Object.entries(modes))for(const scope of scopes)for(const l of Object.keys(LINEAGES))for(const r of Object.keys(LINEAGES))for(const [a,b]of pairs){let prior;
 for(const seat of[0,1]){const builds=[build(l,XP[scope.level-1],a,scope.gear),build(r,XP[scope.level-1],b,scope.gear)],start=mode.start(seat?[...builds].reverse():builds);let s=start;const row=totals[name]??={games:0,exchanges:0,draws:0,liquidation:0,limit:0,moves:{},starvedTurns:0,turns:0,returned:0},key=name+':'+a+'/'+b,match=byMatchup[key]??={games:0,firstWins:0,draws:0,exchanges:0};
  while(s.status==='playing'){const moves=[0,1].map(i=>decide(s,i,i===seat?a:b,mode.step,17)),before=s;s=mode.step(s,moves);assert.equal(before.log.length+1,s.log.length);for(const i of[0,1]){const f=s.fighters[i],move=moves[i];row.moves[move]=(row.moves[move]||0)+1;row.turns++;row.starvedTurns+=f.energy<3;row.returned+=s.log.at(-1).effects[i].counter;assert(f.energy>=0&&f.energy<=10&&Number.isInteger(f.energy));assert.equal(f.build.xp,XP[scope.level-1]);}}
  games++;row.games++;row.exchanges+=s.log.length;row.draws+=s.winner===null;row.liquidation+=s.log.some(x=>x.round>=10);row.limit+=s.reason==='14_EXCHANGE_LIMIT';match.games++;match.firstWins+=s.winner===seat;match.draws+=s.winner===null;match.exchanges+=s.log.length;
  for(const [id,i]of[[l,seat],[r,1-seat]]){const lr=byLineage[name+':'+id]??={entries:0,wins:0,draws:0};lr.entries++;lr.wins+=s.winner===i;lr.draws+=s.winner===null;}
  const result={hp:[s.fighters[seat].hp,s.fighters[1-seat].hp],winner:s.winner===null?null:s.winner===seat?0:1,rounds:s.log.length};if(prior){assert.deepEqual(result,prior);mirrors++;}else prior=result;
 }
}
for(const row of Object.values(totals)){row.meanExchanges=+(row.exchanges/row.games).toFixed(2);row.liquidationPercent=+(100*row.liquidation/row.games).toFixed(1);row.limitPercent=+(100*row.limit/row.games).toFixed(1);row.starvedTurnPercent=+(100*row.starvedTurns/row.turns).toFixed(1);row.defensePercent=+(100*Object.entries(row.moves).filter(([k])=>['diamond_hands','reversal','wen','touch_grass','lineage_b','recharge'].includes(k)).reduce((n,[,v])=>n+v,0)/row.turns).toFixed(1);}
for(const row of Object.values(byMatchup)){row.firstWinPercent=+(100*row.firstWins/row.games).toFixed(1);row.meanExchanges=+(row.exchanges/row.games).toFixed(2);}
for(const row of Object.values(byLineage))row.winPercent=+(100*row.wins/row.entries).toFixed(1);
// Coarse regression gates, deliberately not promises of a 50% human win rate.
assert(totals.candidate.meanExchanges>=5&&totals.candidate.meanExchanges<=10);assert(totals.candidate.limitPercent<15);assert(totals.candidate.moves.reversal>totals.v1.moves.reversal);assert(totals.candidate.starvedTurnPercent>totals.v1.starvedTurnPercent);
const files=['apps/arena-web/catalog.mjs','apps/arena-web/combat.mjs','apps/arena-web/defense-energy.mjs'];const sourceHashes=Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const report={scope:'3456 games / 1728 mirrored pairs. All six lineage matchups, levels 1/6/10 plus level-10 equal capped V1 gear (32 total), six role pairings, deterministic tie seed 17. Same builds and finite one-exchange policies under each ruleset. Policies enumerate legal replies, never private commitments. Mirrors are correlated; ranks, asymmetric gear and human play require additional acceptance. Exact local XP remains V1; no level-20 combat authority or Preview stats.',games,mirrors,rules:DEFENSE_RULES,totals,byMatchup,byLineage,sourceHashes};
await writeFile(new URL('../docs/reviews/arena-defense-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({games,mirrors,totals,byMatchup,byLineage}));
