import test from 'node:test';import assert from 'node:assert/strict';
import {defaultBuild,LINEAGES,XP} from '../catalog.mjs';import {createDrill,stepDrill,drillLegal,exchangeInsight,moveReference,replayBookmarks,resolvedRecap,battleMoments} from '../tactics-model.mjs';
const build=()=>({...defaultBuild('emerald_sprout',17950,{STR:2}),loadout:['market_order','diamond_hands','rug_pull','reversal']});
test('drills copy validated V1 builds with exact XP and an unowned same-level reference dummy',()=>{
 const own=build(),before=structuredClone(own);for(const lineage of Object.keys(LINEAGES))for(const scenario of ['opening','recovery','clutch','epic']){const state=createDrill(own,lineage,scenario);assert.equal(state.fighters[0].build.xp,17950);assert.equal(state.fighters[0].build.level,10);assert.equal(state.fighters[1].build.level,10);assert.equal(Object.values(state.fighters[1].build.gearStats).reduce((a,b)=>a+b),0);state.fighters[0].build.gearStats.STR=0;assert.deepEqual(own,before);}
 assert.throws(()=>createDrill({...own,gearStats:{STR:999}}));assert.throws(()=>createDrill(own,'missing'));assert.throws(()=>createDrill(own,'emerald_sprout','missing'));
});
test('shield, counter and energy teaching derive actual engine amounts without changing the input state',()=>{
 const state=createDrill(build()),before=structuredClone(state);state.fighters[1].build.loadout=['market_order','diamond_hands','rug_pull','reversal'];const frozen=structuredClone(state),after=stepDrill(state,['market_order','reversal']),row=exchangeInsight(state,after);assert.deepEqual(state,frozen);assert.ok(row.fighters[1].blocked>0);assert.ok(row.fighters[1].damageDealt>0);assert.equal(row.fighters[0].damageReceived,after.log[0].effects[0].damage+after.log[0].effects[0].counter);for(const f of row.fighters)assert.equal(f.energyBefore-f.spent+f.recovered,f.energyAfter);assert.equal(before.log.length,0);assert.equal(after.log.length,1);
});
test('unlearned epics stay unavailable even in an explicit readiness demonstration',()=>{
 for(const xp of XP){const b=defaultBuild('solar_peach',xp),s=createDrill(b,'rose_bloom','epic');assert.equal(drillLegal(s,0).includes('epic'),b.epic);assert.equal(moveReference(b).length,12);assert.equal(moveReference(b).find(m=>m.key==='epic').unlocked,b.level>=6);}
});
test('drills stop at the same combat terminal conditions and never inject preview stats',()=>{
 let s=createDrill(build(),'midnight_mint','clutch');s.previewOutfit={stats:{STR:999},itemLevel:20};const max=s.fighters[0].build.maxHp;for(let i=0;i<14&&s.status==='playing';i++)s=stepDrill(s,['market_order','market_order']);assert.notEqual(s.status,'playing');assert.equal(s.fighters[0].build.maxHp,max);assert.equal(s.fighters[0].build.gearStats.STR,2);assert.equal(s.fighters[0].build.level,10);assert.equal(s.fighters[0].build.xp,17950);
});
test('replay learning bookmarks use resolved metrics, choose the earliest tie and handle no-exchange outcomes',()=>{
 const report={exchanges:[{round:1,fighters:[{damageDealt:3,blocked:9,healed:0},{damageDealt:2,blocked:0,healed:0}]},{round:2,fighters:[{damageDealt:6,blocked:0,healed:4},{damageDealt:2,blocked:0,healed:0}]}]},before=structuredClone(report);const marks=replayBookmarks(report);assert.equal(marks.find(m=>m.label==='Biggest exchange').round,2);assert.equal(marks.find(m=>m.label==='Best block').round,1);assert.equal(marks.find(m=>m.label==='Best recovery').value,4);assert.deepEqual(report,before);assert.deepEqual(replayBookmarks({exchanges:[]}),[]);
 const start=createDrill(build()),after=stepDrill(start,['market_order','diamond_hands']),r={battle:after},recap=resolvedRecap(r);assert.equal(recap.rows[0].dealt,after.log[0].effects[1].damage+after.log[0].effects[1].counter);assert.equal(recap.rows[1].blocked,after.log[0].effects[1].blocked);assert.equal(resolvedRecap({battle:{log:[]}}),null);
});
test('recorded battle moments derive only from the selected participant’s available receipts and promise no awards',()=>{
 const report={outcome:{status:'won',winner:0},fighters:[{finalHp:1},{finalHp:0}],exchanges:[{round:1,fighters:[{move:'epic',blocked:5,healed:3},{move:'market_order',blocked:0,healed:0}]}]};const before=structuredClone(report),moments=battleMoments(report,0);assert.equal(moments.length,4);assert.ok(moments.every(m=>m.round===1));assert.deepEqual(battleMoments(report,1),[]);assert.deepEqual(battleMoments(report,-1),[]);assert.deepEqual(report,before);
});
