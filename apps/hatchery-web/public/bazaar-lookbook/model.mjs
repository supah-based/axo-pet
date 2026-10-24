// Cosmetic promotional choices only. No numeric NFT mapping or combat/ownership input.
export function validateLookbook(value,catalog){
 if(value?.schema!=='AXO_BAZAAR_LOOKBOOK_V2'||value.authority!=='COSMETIC_PREVIEW_ONLY'||!Array.isArray(value.entries)||value.entries.length!==6)throw Error('Unknown fitted lookbook');
 const ids=new Set();for(const e of value.entries){
  if(!catalog.lineages.some(l=>l.id===e.lineage)||ids.has(e.lineage)||typeof e.name!=='string'||!e.name||!catalog.scenes.some(s=>s.id===e.sceneId)||e.asset!==`/bazaar-lookbook/v2/${e.lineage}.webp`||!/^[a-f0-9]{64}$/.test(e.sha256)||e.width!==1024||e.height!==1536)throw Error('Invalid lookbook portrait');ids.add(e.lineage);
  if(!e.selection||Array.isArray(e.selection)||Object.keys(e.selection).length!==5)throw Error('Invalid fitted look');
  for(const slot of['head','body','pants','footwear','tool'])if(!catalog.items.some(i=>i.id===e.selection[slot]&&i.slot===slot))throw Error('Invalid fitted look slot');
  if(catalog.items.find(i=>i.id===e.selection.body).occlusion!=='SLEEVED_TOP_V1')throw Error('Lookbook requires current covered top');
 }
 if(!value.itemPortraits||Object.keys(value.itemPortraits).length!==catalog.items.length)throw Error('Missing individual item portraits');
 for(const item of catalog.items){const p=value.itemPortraits[item.id];if(!p||p.asset!==`/bazaar-lookbook/v2/items/${item.id}.webp`||p.source!==item.itemArt.asset||p.sourceSha256!==item.itemArt.sha256||!/^[a-f0-9]{64}$/.test(p.sha256)||p.width!==300||p.height!==450)throw Error('Invalid individual item portrait');}
 return value;
}
export function lookHref(entry,{xp=1200,tier=10}={}){
 const p=new URLSearchParams({lineage:entry.lineage,set:'custom',...entry.selection,scene:entry.sceneId,skin:'lineage',petXp:xp,itemLevel:tier});for(const slot of Object.keys(entry.selection))p.set(slot+'Level',tier);return '/gear-studio?'+p;
}
