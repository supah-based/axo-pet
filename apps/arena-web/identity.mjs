import {createHmac} from 'node:crypto';
import {LINEAGES,STATS,levelForXp} from './catalog.mjs';
const GEAR_SLOTS=Object.freeze(['head','face','body','back','tool','charm','companion','habitat']);
const VISUAL_SLOTS=new Set(['background','pet','hud_front',...GEAR_SLOTS]);
const visualOption=id=>{const n=Number(id||0);return Number.isSafeInteger(n)&&n>0?(n>10?n%1000:n):null;};
// Read-only projection. Session verification happens in the host app, never in browser input.
export function hatcheryIdentity(snapshot,{address,secret,visual=null,gear=null,now=Date.now()}={}){
 if(!/^0x[0-9a-fA-F]{40}$/.test(address||'')||!secret||secret.length<32)throw Error('Verified wallet session required');
 const p=snapshot?.pet,owner=address.toLowerCase();
 if(!snapshot?.hatched||snapshot.player?.accountStatus?.status!=='ACTIVE'||snapshot.player?.ownerAddress?.toLowerCase()!==owner||p?.nft?.ownerAddress?.toLowerCase()!==owner)throw Error('Active wallet-bound Hatchery Pet required');
 if(!Object.hasOwn(LINEAGES,p.lineageId)||p.level!==levelForXp(p.xp)||!/^AXO-[A-F0-9]{10}$/.test(p.genesisId||'')||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw Error('Invalid canonical Pet');
 const art=`/${p.level===10?'hatchery-nft-v5':'hatchery-nft-v5.1.1'}/pet_${p.lineageId}_l${String(p.level).padStart(2,'0')}.webp`;
 if(p.visual?.asset!==art)throw Error('Canonical Pet art mismatch');
 const items=Array.isArray(gear?.items)?gear.items:[],stats=gear?.stats||Object.fromEntries(STATS.map(k=>[k,0]));
 if(items.length&&p.level!==10)throw Error('Level ten gear required');
 if(items.length>8||new Set(items.map(v=>v.slot)).size!==items.length)throw Error('Invalid gear loadout');
 if(Object.keys(stats).length!==STATS.length||Object.keys(stats).some(k=>!STATS.includes(k))||STATS.some(k=>!Number.isInteger(stats[k])||stats[k]<0||stats[k]>6)||STATS.reduce((n,k)=>n+stats[k],0)>32)throw Error('Invalid Arena gear stats');
 const loadout=items.map(v=>({id:Number(v.id),slot:v.slot,label:String(v.label||'').slice(0,80),rarity:String(v.rarity||'').slice(0,20),arenaStats:Object.fromEntries(STATS.map(k=>[k,Number(v.arenaStats?.[k]||0)]))}));
 if(loadout.some(v=>!GEAR_SLOTS.includes(v.slot)||!Number.isSafeInteger(v.id)||v.id<=0||!visualOption(v.id)))throw Error('Invalid gear loadout');
 const expected=new Map(loadout.map(v=>[v.slot,visualOption(v.id)]));
 const rawLayers=visual?.activeLayers||[];
 if(!Array.isArray(rawLayers)||rawLayers.some(v=>!VISUAL_SLOTS.has(v?.slot)||typeof v.runtimeUrl!=='string'||!/^\/hatchery-nft-v5(?:\.1\.1)?\/[a-z0-9_.-]+\.webp$/.test(v.runtimeUrl)))throw Error('Invalid gear visuals');
 const layers=rawLayers.map(v=>({slot:v.slot,url:v.runtimeUrl,z:Number(v.z),optionId:v.optionId==null?null:Number(v.optionId)}));
 if(layers.some(v=>!Number.isInteger(v.z))||new Set(layers.map(v=>v.slot)).size!==layers.length||layers.filter(v=>v.slot==='pet').length!==1)throw Error('Invalid gear visuals');
 for(const layer of layers.filter(v=>GEAR_SLOTS.includes(v.slot))){if(expected.get(layer.slot)!==layer.optionId)throw Error('Gear visual mismatch');}
 for(const [slot,optionId] of expected){const layer=layers.find(v=>v.slot===slot);if(!layer||layer.optionId!==optionId)throw Error('Gear visual missing');}
 if(loadout.length&&(!layers.some(v=>v.slot==='background')||!layers.some(v=>v.slot==='hud_front')))throw Error('Gear visual frame missing');
 return {key:createHmac('sha256',secret).update('arena:'+owner).digest('hex'),pet:{genesisId:p.genesisId,name:p.name,lineageId:p.lineageId,xp:p.xp,level:p.level,art,layers,gearRevision:Number(gear?.revision||0),gearLoadout:loadout,gearStats:Object.fromEntries(STATS.map(k=>[k,Number(stats[k]||0)])),observedAt:now,identitySource:'AUTHENTICATED_HATCHERY'}};
}
