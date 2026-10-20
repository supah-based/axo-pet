'use strict';
const Ajv=require('ajv'),schemasV2=require('./schemas-v2.cjs'),rules=require('./progression-v2.mjs');
const ajv=new Ajv({strict:true,allErrors:true,ownProperties:true,coerceTypes:false,useDefaults:false,removeAdditional:false}),compiled=Object.fromEntries(Object.entries(schemasV2).map(([k,s])=>[k,ajv.compile(s)]));
const shape=(k,v)=>compiled[k](v)?[]:compiled[k].errors.map(e=>({code:'SCHEMA_INVALID',path:e.instancePath||'/'}));
const result=errors=>({valid:errors.length===0,errors});
function validatePetIdentityV2(value,{expectedOwnerAddress}={}){const e=shape('petIdentityV2',value);if(e.length)return result(e);if(value.level!==rules.levelForXpV2(value.xp))e.push({code:'XP_LEVEL_MISMATCH',path:'/level'});if(value.visualLevel!==Math.min(10,value.level))e.push({code:'VISUAL_LEVEL_MISMATCH',path:'/visualLevel'});if(expectedOwnerAddress!==undefined&&String(expectedOwnerAddress).toLowerCase()!==value.ownerAddress.toLowerCase())e.push({code:'OWNER_MISMATCH',path:'/ownerAddress'});if(value.nft.status==='MINTED'&&BigInt(value.nft.tokenId)>2n**256n-1n)e.push({code:'UINT256_RANGE',path:'/nft/tokenId'});return result(e);}
function validateGearDefinitionV2(value){const e=shape('gearDefinitionV2',value);if(e.length)return result(e);if(BigInt(value.maxSupply)>2n**256n-1n)e.push({code:'UINT256_RANGE',path:'/maxSupply'});try{rules.checkItemStatsV2(value);}catch{e.push({code:'ITEM_LEVEL_OR_STAT_BUDGET',path:'/arenaStats'});}return result(e);}
module.exports={...rules,schemasV2,validatePetIdentityV2,validateGearDefinitionV2};
