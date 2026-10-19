'use strict';
const {validatePetIdentity}=require('../../shared-schemas/src/index.cjs');
const {growthProgressV2}=require('../../shared-schemas/src/progression-v2.mjs');
// Read-only migration comparison. Call only with the host's canonical identity DTO.
// A valid shape does not prove the caller's session, XP ledger or on-chain level.
function previewProgressionV2(identity){const checked=validatePetIdentity(identity);if(!checked.valid)throw Error('Canonical V1 identity required');return{status:'SHADOW_ONLY',sourceSchema:identity.schemaVersion,sourceLevel:identity.level,candidate:growthProgressV2(identity.xp),xpDelta:0,writes:[],requiresHostAdoption:true,requiresChainMigration:identity.nft.status==='MINTED'};}
module.exports={previewProgressionV2};
