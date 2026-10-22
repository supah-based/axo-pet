// Offline candidate design audit only. Not imported by any public route or V1 service.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GEAR_SETS_V2} from '../packages/shared-schemas/src/gear-sets-v2.mjs';
import {XP_THRESHOLDS_V2,itemStatsV2} from '../packages/shared-schemas/src/progression-v2.mjs';
import {newBattleV2,valuesV2} from '../packages/arena-engine/src/progression-v2.mjs';
import {LINEAGES,defaultBuild,buildPet} from '../apps/arena-web/catalog.mjs';
const pairs=[['STR','DEX'],['CON','INT'],['WIS','CHA'],['STR','CON'],['DEX','INT']],rows=[];
let cases=0,rejections=0;
for(const set of GEAR_SETS_V2)for(let level=10;level<=20;level++)for(const lineageId of Object.keys(LINEAGES)){
 const gearItems=Object.entries(set.pieces).map(([slot,family],i)=>({slot,family,itemLevel:level,minimumPetLevel:level,arenaStats:itemStatsV2(level,...pairs[i])}));
 const input={lineageId,xp:XP_THRESHOLDS_V2[level-1],gearItems};
 const fighter=newBattleV2([input]).fighters[0];
 // A same-stat synthetic mixed family isolates set completion from item stats.
 const mixed=newBattleV2([{...input,gearItems:gearItems.map((i,n)=>n?i:{...i,family:'OFFLINE-MIXED-REFERENCE'})}]).fighters[0];
 assert.equal(fighter.build.setBonuses.activeSets.length,1);assert.equal(mixed.build.setBonuses.activeSets.length,0);
 assert.deepEqual(fighter.build.setBonuses.gearStats,mixed.build.setBonuses.gearStats);
 assert.equal(fighter.build.setBonuses.activeSets[0].tier,level);
 assert.equal(buildPet(defaultBuild(lineageId,input.xp)).level,10);
 assert.throws(()=>newBattleV2([{...input,xp:XP_THRESHOLDS_V2[level-1]-1}]));rejections++;
 const moves=Object.fromEntries(['market_order','diamond_hands','touch_grass','rug_pull'].map(key=>{
  const a=valuesV2(fighter,key),b=valuesV2(mixed,key);
  return [key,Object.fromEntries(['damage','shield','heal','purge'].map(k=>[k,{complete:a[k]||0,mixed:b[k]||0,delta:(a[k]||0)-(b[k]||0)}]))];
 }));
 if([10,15,20].includes(level)&&lineageId==='solar_peach')rows.push({set:set.id,role:set.role,level,combatBonus:fighter.build.setBonuses.combat,moves});
 cases++;
}
const sourcePaths=['packages/shared-schemas/src/gear-sets-v2.mjs','packages/shared-schemas/src/progression-v2.mjs','packages/arena-engine/src/progression-v2.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,createHash('sha256').update(await readFile(new URL('../'+p,import.meta.url))).digest('hex')])));
const report={scope:'OFFLINE CANDIDATE ONLY. Synthetic five-piece items, identical per-slot stat pairs for role comparison; mixed reference keeps item stats but disables completion. Not issued NFTs, approved balance, ownership evidence or live V2 activation.',cases,minimumLevelRejections:rejections,levels:[10,20],lineages:6,sets:6,sourceHashes,representativeLineage:'solar_peach',rows};
const folder=new URL('../docs/reviews/',import.meta.url);await mkdir(folder,{recursive:true});await writeFile(new URL('arena-candidate-roles.json',folder),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases,rejections,representativeRows:rows.length,liveRulesChanged:false}));
