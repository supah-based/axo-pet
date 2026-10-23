import test from 'node:test';import assert from 'node:assert/strict';
import{defaultBuild,LINEAGES,XP,VERSION}from'../catalog.mjs';
import{newBattle,resolve,legalMoves}from'../combat.mjs';
import{DEFENSE_VERSION,defenseBuild,newDefenseBattle,resolveDefense}from'../defense-energy.mjs';
import{createDrill,stepDrill,counterplayRows}from'../tactics-model.mjs';
import{replayFrames}from'../replay.mjs';
const kit=(lineage='solar_peach',xp=1200,extra={})=>({...defaultBuild(lineage,xp),loadout:['market_order','diamond_hands','reversal','rug_pull'],...extra});
test('candidate rebuilds validated V1 inputs, preserves exact XP/gear bounds and never changes the V1 catalog',()=>{
 const b=kit('emerald_sprout',17950,{gearStats:{CON:3},previewOutfit:{STR:999}}),prior=structuredClone(b),v1=newBattle([b,b]),c=newDefenseBattle([b,b]);
 assert.equal(c.version,DEFENSE_VERSION);assert.equal(v1.version,VERSION);assert.equal(c.fighters[0].build.xp,17950);assert.equal(c.fighters[0].build.level,10);assert.equal(c.fighters[0].build.stats.STR,v1.fighters[0].build.stats.STR);assert.equal(c.fighters[0].build.gearStats.CON,3);assert.deepEqual(b,prior);assert.equal(v1.fighters[0].build.skills.reversal.cost,3);assert.equal(c.fighters[0].build.skills.reversal.cost,2);
 assert.throws(()=>defenseBuild(kit('solar_peach',1200,{gearStats:{STR:999}})));assert.throws(()=>resolveDefense(v1,['market_order','market_order']),/ruleset/);
});
test('successful counter has a bounded payoff, whiffs return nothing and shield break/pierce still answer it',()=>{
 const b=kit(),s=newDefenseBattle([b,b]),v1=newBattle([b,b]),before=structuredClone(s);
 const hit=resolveDefense(s,['reversal','market_order']),old=resolve(v1,['reversal','market_order']);assert.deepEqual(s,before);assert(hit.log[0].effects[1].counter>old.log[0].effects[1].counter);assert.equal(hit.log[0].effects[1].counter,16);assert(hit.fighters[0].hp>old.fighters[0].hp);assert.equal(hit.fighters[0].energy,6);
 const whiff=resolveDefense(s,['reversal','diamond_hands']);assert.equal(whiff.log[0].effects[1].counter,0);assert.equal(whiff.fighters[0].energy,5);assert.equal(whiff.log[0].energy[0].guard,0);
 const broken=resolveDefense(s,['reversal','rug_pull']);assert(broken.log[0].effects[0].blocked<hit.log[0].effects[0].blocked);assert(broken.log[0].effects[1].counter<16);
 const p=kit('solar_peach',1200,{loadout:['market_order','reversal','exit_liquidity','wen']}),pierced=resolveDefense(newDefenseBattle([p,p]),['reversal','exit_liquidity']);assert(pierced.log[0].effects[0].damage>0);assert(pierced.log[0].effects[1].counter<=pierced.log[0].effects[0].blocked);
});
test('energy separates pressure, real blocks, Wen and exposed refuelling, with no reward for empty shields',()=>{
 const b=kit('solar_peach',1200,{loadout:['market_order','diamond_hands','wen','reversal']}),s=newDefenseBattle([b,b]);
 for(const f of s.fighters)f.energy=2;
 assert.equal(resolveDefense(s,['market_order','market_order']).fighters[0].energy,3);
 assert.equal(resolveDefense(s,['diamond_hands','market_order']).fighters[0].energy,4);
 assert.equal(resolveDefense(s,['diamond_hands','diamond_hands']).fighters[0].energy,3);
 assert.equal(resolveDefense(s,['wen','market_order']).fighters[0].energy,6);
 assert.equal(resolveDefense(s,['recharge','market_order']).fighters[0].energy,6);
 const regen=resolveDefense(s,['recharge','market_order']);assert(regen.fighters[0].hp<s.fighters[0].hp);assert.equal(regen.log[0].effects[0].blocked,0);
});
test('candidate retains mastery increments, counter cooldown, zero-energy fallback and bounded caps',()=>{
 const b=kit('solar_peach',1200,{ranks:{reversal:2}}),s=newDefenseBattle([b,b]);assert.equal(s.fighters[0].build.skills.reversal.shield,21);
 let n=resolveDefense(s,['reversal','market_order']);assert(!legalMoves(n,0).includes('reversal'));n=resolveDefense(n,['market_order','market_order']);assert(!legalMoves(n,0).includes('reversal'));n=resolveDefense(n,['market_order','market_order']);assert(legalMoves(n,0).includes('reversal'));
 for(const f of s.fighters)f.energy=0;assert(!legalMoves(s,0).includes('reversal'));assert(legalMoves(s,0).includes('recharge'));for(const f of s.fighters)f.energy=10;assert.equal(resolveDefense(s,['diamond_hands','market_order']).fighters[0].energy,10);
});
test('all lineages, levels and legal pairs preserve purity, bounded energy/returns and exact receipt accounting',()=>{
 for(const lineage of Object.keys(LINEAGES))for(const xp of XP){const s=newDefenseBattle([kit(lineage,xp),kit(lineage,xp)]);for(const a of legalMoves(s,0))for(const b of legalMoves(s,1)){const before=JSON.stringify(s),n=resolveDefense(s,[a,b]);assert.equal(JSON.stringify(s),before);for(const i of[0,1]){const f=n.fighters[i],e=n.log[0].energy[i],fx=n.log[0].effects;assert(Number.isInteger(f.energy)&&f.energy>=0&&f.energy<=10);assert.equal(e.after,Math.min(10,e.before-e.spent+e.base+e.move+e.guard+e.lineage));assert.equal(f.energy,e.after);assert(fx[1-i].counter<=fx[i].blocked);}}}
});
test('pure guarding cannot freeze a battle: Liquidation and the fourteen-exchange limit remain',()=>{
 const b=kit();let s=newDefenseBattle([b,b]);while(s.status==='playing')s=resolveDefense(s,['diamond_hands','diamond_hands']);assert(s.log.length<=14);assert(s.log.at(-1).effects[0].storm>0);assert.notEqual(s.status,'playing');
});
test('guard energy threshold is based on actual blocked damage, not selecting a shield',()=>{
 for(const damage of[7,8]){const b=kit('solar_peach',0),s=newDefenseBattle([b,b]);s.fighters[1].build.stats=Object.fromEntries(Object.keys(s.fighters[1].build.stats).map(k=>[k,10]));s.fighters[1].build.skills.market_order.power=damage;const n=resolveDefense(s,['diamond_hands','market_order']);assert.equal(n.log[0].effects[0].blocked,damage);assert.equal(n.log[0].energy[0].guard,damage>=8?1:0);}
});
test('candidate counterplay dispatch is consistent, unknown rules fail closed and V1 replay rejects candidate rules',()=>{
 const s=createDrill(kit(),'solar_peach','opening','guard','defense','guard'),row=counterplayRows(s,'reversal').find(x=>x.reply==='market_order'),n=stepDrill(s,['reversal','market_order']);assert.equal(row.own.energyAfter,n.fighters[0].energy);assert.equal(row.own.damageDealt,n.log[0].effects[1].counter);assert.throws(()=>stepDrill({...s,version:'unknown'},['reversal','market_order']),/ruleset/);assert.throws(()=>createDrill(kit(),'solar_peach','opening','guard','unknown'));assert.throws(()=>createDrill(kit(),'solar_peach','opening','guard','defense','unknown'));
 assert.throws(()=>replayFrames({schema:'AXO_ARENA_PORTABLE_REPLAY_1',ruleset:DEFENSE_VERSION,kind:'practice',startedAt:0,finishedAt:1,builds:[],exchanges:[],outcome:{},fingerprint:'0'.repeat(64)}),/ruleset/);
});
