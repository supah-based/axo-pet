import{buildPetAtLevel}from'../../../apps/arena-web/catalog.mjs';
import{newBattle,values,resolve}from'../../../apps/arena-web/combat.mjs';
import{growthProgressV2,PROGRESSION_V2}from'../../shared-schemas/src/progression-v2.mjs';
import{loadoutBonusesV2}from'../../shared-schemas/src/gear-sets-v2.mjs';
// Host must resolve gearItems from one verified on-chain snapshot plus a pinned family registry.
// Never mount this candidate ruleset with browser-supplied XP, family IDs or item stats.
export function buildPetV2({lineageId,xp,allocation,ranks,loadout,gearItems=[],gearStats}={}){if(gearStats!==undefined)throw Error('V2 requires resolved individual Gear items');const progression=growthProgressV2(xp),bonuses=loadoutBonusesV2(xp,gearItems),build=buildPetAtLevel({lineageId,xp,allocation,ranks,loadout},progression.level,bonuses.stats);return{...build,ruleset:PROGRESSION_V2,visualLevel:progression.visualLevel,gearItems:structuredClone(gearItems),setBonuses:bonuses};}
export function newBattleV2(builds){const battle=newBattle(builds,buildPetV2);return{...battle,version:PROGRESSION_V2};}
export function valuesV2(f,key){if(f.build.ruleset!==PROGRESSION_V2)throw Error('V2 fighter required');const v=values(f,key),b=f.build.setBonuses.combat;return{...v,damage:v.damage?Math.round((v.damage+b.attackFlat)*(1+b.damagePercent/100)):0,shield:v.shield?v.shield+b.defenseFlat:0,heal:v.heal?Math.round(v.heal*(1+b.healingPercent/100)):0,purge:v.purge?Math.round(v.purge*(1+b.shieldBreakPercent/100)):v.purge};}
export function resolveV2(state,choices){if(state.version!==PROGRESSION_V2||state.fighters.some(f=>f.build.ruleset!==PROGRESSION_V2))throw Error('V2 battle required');return resolve(state,choices,{valueResolver:valuesV2});}
