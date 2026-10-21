// Opt-in loopback UI review. Never loaded by a production entrypoint.
import { mountPassport } from '/passport/view.mjs';
import { PreviewOutfits, previewStorageKey, emptyPreview, withPreviewOutfit } from '/wardrobe/model.mjs';
const session={connected:true,address:'0x1111111111111111111111111111111111111111'};
const catalog=await (await fetch('/gear-bazaar/v1/catalog.json')).json();
const key='synthetic-review:'+await previewStorageKey(session.address,'AXO-ABCDEF1234');
try{const store=new PreviewOutfits(localStorage,key,catalog);if(!store.list().length)store.save('After-hours builder · Preview',withPreviewOutfit(emptyPreview(catalog),catalog,catalog.presets[0].id,20));}catch{}
await mountPassport(document.querySelector('[data-axo-passport]'),{syntheticReview:true,
  sessionBridge:{getSession:()=>session,ready:()=>Promise.resolve(),connect:()=>Promise.resolve(),subscribe:()=>()=>{}},
  read:async({signal})=>{const response=await fetch('/__dev/passport-fixture',{signal,credentials:'omit'});const data=await response.json();if(data.syntheticOnly!==true)throw Error('Synthetic fixture required');return data.read;}});
