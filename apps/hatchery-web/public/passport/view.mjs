import { passportMarkup } from './markup.mjs';
import { createPassportSession, growthProgress } from './model.mjs';
import { sameWallet, PreviewOutfits, previewStorageKey, assertPreview, previewSelection } from '/wardrobe/model.mjs';
import { drawFitted, validateProfile } from '/gear-anatomy/model.mjs';

const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
const count = value => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
const human = value => value.replaceAll('_',' ').replaceAll('-',' ');
const date = value => new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const bridge = {
  getSession:()=>window.AxoWallet?.getSession?.() || {connected:false}, ready:()=>window.AxoWallet?.ready || Promise.resolve(), connect:()=>window.AxoWallet?.connect?.(),
  subscribe:callback=>{window.addEventListener('axo:session',callback);return()=>window.removeEventListener('axo:session',callback);},
};
async function readPassport({signal}) {
  const cancel=new AbortController(), abort=()=>cancel.abort(); signal.addEventListener('abort',abort,{once:true}); if(signal.aborted)abort();
  const timer=setTimeout(abort,15000);
  try { const res=await fetch('/api/pet/v1/passport',{signal:cancel.signal,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}); if(!res.ok)throw Error('Passport unavailable');return await res.json(); }
  finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

export async function mountPassport(root,{sessionBridge=bridge,read=readPassport,storage,syntheticReview=false}={}) {
  root.classList.add('axo-passport');root.innerHTML=passportMarkup;
  const $=selector=>root.querySelector(selector), $$=selector=>[...root.querySelectorAll(selector)];
  let reference, catalog, state={status:'DISCONNECTED',read:null}, generation=0, previewGeneration=0, formGeneration=0, savedGeneration=0, disposed=false;
  const imageCache=new Map(), previewAssets=new Map();
  const notice=text=>{$('[data-notice]').textContent=text;};
  const current=()=>{const value=controller.current(),session=sessionBridge.getSession();return value && session.connected===true && sameWallet(value.pet.identity.ownerAddress,session.address)?value:null;};
  const requirePet=()=>{const value=current();if(!value)throw Error('Refresh your Pet before opening private Passport details.');return value;};
  const fetchJson=async url=>{const res=await fetch(url,{credentials:'omit',cache:'no-cache'});if(!res.ok)throw Error('Reference unavailable');return res.json();};
  async function image(url,hash) {
    if(!/^\/(?:hatchery-nft-v5(?:\.1\.1)?|gear-(?:anatomy|bazaar)\/v[13])\/[a-z0-9_.-]+\.webp$/.test(url)||!/^[a-f0-9]{64}$/.test(hash||''))throw Error('Unreviewed asset');
    const key=url+':'+hash;
    if(!imageCache.has(key))imageCache.set(key,(async()=>{
      const response=await fetch(url,{credentials:'omit',cache:'force-cache'});if(!response.ok)throw Error('Asset unavailable');
      const bytes=await response.arrayBuffer();if(bytes.byteLength>12*1024*1024)throw Error('Asset too large');
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==hash)throw Error('Asset hash mismatch');
      const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'})),img=new Image();
      try{img.src=objectUrl;await img.decode();return img;}finally{URL.revokeObjectURL(objectUrl);}
    })().catch(error=>{imageCache.delete(key);throw error;}));
    return imageCache.get(key);
  }
  const previewImage=url=>image(url,previewAssets.get(url));
  function closePreview(){++previewGeneration;$('[data-preview-detail]').hidden=true;$('[data-preview-name]').textContent='';$('[data-preview]').getContext('2d').clearRect(0,0,1024,1536);}
  function clearPrivate(){
    ++generation;++formGeneration;++savedGeneration;closePreview();$('[data-form-dialog]').close();$('[data-form-title]').textContent='Catalog reference';$('[data-form-state]').textContent='';$('[data-form-canvas]').getContext('2d').clearRect(0,0,1024,1024);
    for(const key of ['genesis','level','xp','mint','token','revision','hatched','origin-genesis','seed','temperament'])$('[data-'+key+']').textContent='—';
    for(const key of ['motifs','timeline','achievements','milestones','equipment','saved','chapters'])$('[data-'+key+']').replaceChildren();
    $('[data-name]').textContent='Meet your AXO.';$('[data-lineage]').textContent='YOUR SOULBOUND COMPANION';$('[data-role]').textContent='One preserved identity. Every earned level stays part of your story.';
    $('[data-origin-title]').textContent='A lineage of your own.';$('[data-origin-label]').textContent='SIX ORIGINS. ONE IS YOURS.';$('[data-lore]').textContent='Read your Pet to explore its lineage and authored growth forms.';
    $('[data-canonical]').hidden=true;$('[data-canonical]').getContext('2d').clearRect(0,0,1024,1024);$('[data-art-empty]').hidden=false;$('[data-art-state]').textContent='Awaiting verified assets';
    $('[data-canonical]').setAttribute('aria-label','Waiting for verified Pet appearance');
    $('[data-growth-label]').textContent='Waiting for your growth read';$('[data-progress-copy]').textContent='—';$('[data-progress]').value=0;$('[data-growth-note]').textContent='Your exact XP comes from the preserved Hatchery record.';
    $('[data-equipment-note]').textContent='No fresh equipment read yet.';$('[data-saved-note]').textContent='Read your Pet to open its saved cosmetic looks.';
    $('[data-history-state]').textContent='HISTORY NOT READ';$('[data-history-note]').textContent='Your dated records appear when they are available.';$('[data-coverage]').textContent='';$('[data-achievement-note]').textContent='Earned awards are shown only when their records are available.';
    $('[data-copy]').disabled=true;$('[data-card-status]').textContent='WALLET PRIVATE';
  }
  async function paintAuthority(value,ticket){
    try{
      const layers=value.pet.authoritativeVisual.layers,images=await Promise.all(layers.map(layer=>image(layer.url,layer.sha256)));
      if(ticket!==generation||!current()||disposed)return;
      const staging=document.createElement('canvas');staging.width=1024;staging.height=1024;
      for(const img of images){if(img.naturalWidth!==1024||img.naturalHeight!==1024)throw Error('Wrong canonical dimensions');staging.getContext('2d').drawImage(img,0,0);}
      $('[data-canonical]').getContext('2d').drawImage(staging,0,0);$('[data-canonical]').hidden=false;$('[data-art-empty]').hidden=true;
      $('[data-canonical]').setAttribute('aria-label',`${value.pet.identity.name}, ${syntheticReview?'synthetic review':'canonical V1'} ${value.pet.authoritativeVisual.equipmentIncluded?'equipped':'base'} appearance`);
      $('[data-art-state]').textContent=value.pet.authoritativeVisual.equipmentIncluded?'V1 equipped · matching asset hashes':'Identity base · equipment unavailable';
    }catch{if(ticket===generation&&!disposed){$('[data-art-state]').textContent='Portrait unavailable · identity retained';notice('Your Pet read is available, but its matching portrait assets could not be verified.');}}
  }
  async function openForm(base,stage){
    try{requirePet();const ticket=generation,formTicket=++formGeneration;$('[data-form-title]').textContent=`LVL ${stage.level} / ${stage.label}`;$('[data-form-state]').textContent='Loading the matching catalog image…';$('[data-form-canvas]').getContext('2d').clearRect(0,0,1024,1024);$('[data-form-dialog]').showModal();
      const img=await image(base.url,base.sha256);if(ticket!==generation||formTicket!==formGeneration||!current()||disposed||!$('[data-form-dialog]').open)return;
      $('[data-form-canvas]').getContext('2d').drawImage(img,0,0,1024,1024);$('[data-form-state]').textContent='Catalog reference · hash checked · your Pet is unchanged.';
    }catch{if($('[data-form-dialog]').open)$('[data-form-state]').textContent='The matching reference image is unavailable.';}
  }
  function renderOrigin(pet){
    const lineage=reference.lineages.find(l=>l.key===pet.lineageId);if(!lineage)return;
    $('[data-lineage]').textContent=lineage.label.toUpperCase();$('[data-role]').textContent=lineage.role+'.';
    $('[data-origin-label]').textContent=lineage.label.toUpperCase();$('[data-origin-title]').textContent='The origin you carry.';$('[data-lore]').textContent=lineage.lore;
    $('[data-origin-genesis]').textContent=pet.genesisId;$('[data-seed]').textContent=pet.appearanceSeed;$('[data-temperament]').textContent=lineage.temperament;
    $('[data-motifs]').append(...lineage.motifs.split(',').map(t=>el('span',t.trim())));
    for(const stage of reference.stages){
      const base=reference.bases.find(b=>b.lineageKey===pet.lineageId&&b.level===stage.level);if(!base)continue;
      const card=el('button'),img=el('img'),copy=el('div');card.type='button';card.dataset.reached=String(pet.xp>=stage.minimumXp);
      card.setAttribute('aria-label',`Inspect level ${stage.level} ${stage.label} reference form`);img.src=base.url;img.alt='';img.loading='lazy';img.width=240;img.height=240;
      copy.append(el('small',`LVL ${String(stage.level).padStart(2,'0')} / ${count(stage.minimumXp)} XP`),el('strong',stage.label),el('p',stage.level===pet.level?'Current chapter':pet.xp>=stage.minimumXp?'Reached · from current XP':'Future reference'));
      card.append(img,copy);card.onclick=()=>openForm(base,stage);$('[data-chapters]').append(card);
    }
  }
  function renderHistory(value){
    const {history,pet:{identity:pet}}=value;
    const facts=['Genesis preserved',`Level ${pet.level} reached · ${count(pet.xp)} exact XP`];
    if(pet.nft.status==='MINTED')facts.push('Pet NFT recorded in identity');
    if(value.pet.equipment.status==='VERIFIED_ONCHAIN')facts.push(`${value.pet.equipment.items.length} V1 equipment items verified`);
    $('[data-milestones]').append(...facts.map(fact=>el('li','✓ '+fact)));
    if(history.status!=='AVAILABLE'){
      $('[data-history-state]').textContent=history.status==='INCONSISTENT'?'HISTORY INCONSISTENT':'HISTORY UNAVAILABLE';
      $('[data-history-note]').textContent='Your current XP is available. Historical XP records are unavailable; no dates or events have been reconstructed.';
      $('[data-achievement-note]').textContent='Achievement records are unavailable. This does not mean your Pet has earned none.';return;
    }
    $('[data-history-state]').textContent=syntheticReview?'SYNTHETIC RECORDS':'RECORDS AVAILABLE';$('[data-hatched]').textContent=history.hatchedAt?date(history.hatchedAt):'Date unavailable';
    $('[data-coverage]').textContent=history.coverage==='COMPLETE'?'Complete XP record':'Recent receipt window';
    $('[data-history-note]').textContent=history.xpEvents.length?`Recorded through ${count(history.throughXp)} XP. Times use your device’s timezone.`:'No XP event records were returned. Your exact current XP is shown above.';
    for(const event of [...history.xpEvents].reverse()){
      const row=el('li'),header=el('header'),delta=event.xpAfter-event.xpBefore,time=el('time',date(event.occurredAt));time.dateTime=event.occurredAt;
      header.append(el('strong',event.label),el('b',(delta>=0?'+':'')+count(delta)+' XP'));row.append(header,time,el('small',`${count(event.xpBefore)} → ${count(event.xpAfter)} total XP`));$('[data-timeline]').append(row);
    }
    $('[data-achievement-note]').textContent=history.achievements.length?'Dated awards from your Pet’s returned records.':'No achievement records were returned in this read.';
    for(const item of [...history.achievements].sort((a,b)=>b.earnedAt.localeCompare(a.earnedAt))){const card=el('article'),time=el('time',date(item.earnedAt));time.dateTime=item.earnedAt;card.append(time,el('h4',item.label),el('p',item.description));$('[data-achievements]').append(card);}
  }
  function renderEquipment(value){
    const gear=value.pet.equipment;
    if(gear.status!=='VERIFIED_ONCHAIN'){$('[data-equipment-note]').textContent='Equipment unavailable. An empty loadout has not been assumed.';return;}
    $('[data-equipment-note]').textContent=`${gear.items.length} equipped items · revision ${gear.revision} · block ${count(gear.chain.blockNumber)}`;
    for(const slot of ['head','face','body','back','tool','charm','companion','habitat']){const item=gear.items.find(i=>i.slot===slot),row=el('li');row.append(el('small',slot.toUpperCase()),el('strong',item?`Gear #${item.id}`:'Empty'));$('[data-equipment]').append(row);}
  }
  async function openPreview(entry){
    try{
      const value=requirePet();assertPreview(entry.look,catalog);const ticket=++previewGeneration,readGeneration=generation;
      $('[data-preview-name]').textContent=entry.name;$('[data-preview-detail]').hidden=false;$('[data-preview]').getContext('2d').clearRect(0,0,1024,1536);
      const next=document.createElement('canvas');next.width=1024;next.height=1536;
      await drawFitted(next,catalog,value.pet.identity.lineageId,previewSelection(entry.look,catalog),previewImage,{},entry.look.sceneId,entry.look.appearance);
      if(ticket!==previewGeneration||readGeneration!==generation||!current()||disposed)return;
      const ctx=next.getContext('2d');ctx.fillStyle='#101711';ctx.fillRect(20,22,syntheticReview?500:300,64);ctx.fillRect(0,1436,1024,100);ctx.fillStyle='#d0ec9e';ctx.font='bold 27px sans-serif';ctx.fillText(syntheticReview?'AXO / SYNTHETIC PREVIEW':'AXO / PREVIEW',40,65);ctx.font='22px sans-serif';ctx.fillText('COSMETIC PREVIEW · NOT OWNED OR EQUIPPED',30,1476);ctx.font='19px sans-serif';ctx.fillText('No identity, equipment or stat changes.',30,1510);
      $('[data-preview]').getContext('2d').drawImage(next,0,0);$('[data-preview-detail]').scrollIntoView({block:'start',behavior:'auto'});
    }catch{notice('This saved Preview cannot be opened. Refresh your Pet or check the matching wardrobe assets.');}
  }
  async function renderSaved(ticket){
    const savedTicket=++savedGeneration;
    $('[data-saved]').replaceChildren();
    try{
      const value=requirePet();if(!catalog)throw Error('Catalog unavailable');const key=await previewStorageKey(value.pet.identity.ownerAddress,value.pet.identity.genesisId);
      if(ticket!==generation||savedTicket!==savedGeneration||!current()||disposed)return;
      const store=new PreviewOutfits(storage||window.localStorage,(syntheticReview?'synthetic-review:':'')+key,catalog),entries=store.list();
      $('[data-saved-note]').textContent=entries.length?`${entries.length} cosmetic ${entries.length===1?'look':'looks'} saved here. Separate from your V1 equipment.`:'No saved previews in this browser. Create your first look in Wardrobe.';
      for(const entry of entries){const row=el('article'),copy=el('div'),open=el('button','View Preview ↗');open.type='button';open.setAttribute('aria-label','View Preview '+entry.name);copy.append(el('h4',entry.name),el('p',Object.keys(entry.look.items).length+' cosmetic pieces'));open.onclick=()=>openPreview(entry);row.append(copy,open);$('[data-saved]').append(row);}
    }catch{if(ticket===generation)$('[data-saved-note]').textContent='Saved previews are unavailable or incompatible. They have not been changed.';}
  }
  function onState(next){
    if(disposed)return;
    if(next.status==='REFRESHING'){state=next;return;}
    if(next.status==='READY'&&state.read&&['READY','REFRESHING'].includes(state.status)
      &&['identity','equipment','authoritativeVisual'].every(k=>JSON.stringify(state.read.pet[k])===JSON.stringify(next.read.pet[k]))&&JSON.stringify(state.read.history)===JSON.stringify(next.read.history)){state=next;return;}
    state=next;clearPrivate();const ticket=generation;
    $('[data-state]').textContent=syntheticReview?'SYNTHETIC REVIEW / NO LIVE WALLET':({READY:'FRESH PRIVATE PET READ',LOADING:'READING YOUR PET',DISCONNECTED:'CONNECT YOUR PET',EXPIRED:'READ EXPIRED',UNAVAILABLE:'PASSPORT UNAVAILABLE'})[next.status];
    $('[data-connect]').hidden=next.status==='READY';$('[data-refresh]').disabled=!sessionBridge.getSession().connected||next.status==='LOADING';
    if(next.status!=='READY'){notice(next.status==='DISCONNECTED'?'Connect the wallet that hatched your AXO to open its private Passport.':next.status==='LOADING'?'Reading your preserved Pet identity and records…':'Your Pet read is unavailable or expired. Refresh to reopen its private Passport.');return;}
    const value=next.read,pet=value.pet.identity,progress=growthProgress(pet);
    $('[data-name]').textContent=pet.name;$('[data-genesis]').textContent=pet.genesisId;$('[data-level]').textContent=String(pet.level).padStart(2,'0');$('[data-xp]').textContent=count(pet.xp);
    $('[data-mint]').textContent=pet.nft.status==='MINTED'?'MINTED':'UNMINTED';$('[data-token]').textContent=pet.nft.status==='MINTED'?'#'+pet.nft.tokenId:'No token recorded';$('[data-revision]').textContent=pet.gearRevision;$('[data-hatched]').textContent='Date unavailable';
    $('[data-copy]').disabled=false;$('[data-card-status]').textContent=syntheticReview?'SYNTHETIC REVIEW':'PRESERVED IDENTITY';
    $('[data-growth-label]').textContent=progress.next===null?'Current V1 growth milestone reached':`On the way to level ${pet.level+1}`;
    $('[data-progress-copy]').textContent=progress.next===null?'LVL 10 / V1':`${count(progress.remaining)} XP to go`;$('[data-progress]').value=progress.percent;
    $('[data-growth-note]').textContent=progress.next===null?`${count(progress.excess)} XP above the 1,200 XP milestone is preserved. Future level-20 rules are not active in this read.`:`${count(pet.xp-progress.floor)} / ${count(progress.next-progress.floor)} XP in this chapter. Your total XP stays exact.`;
    renderOrigin(pet);renderHistory(value);renderEquipment(value);paintAuthority(value,ticket);renderSaved(ticket);
    notice(syntheticReview?'Synthetic review only: invented Pet, XP records and V1 equipment. No live wallet, ledger or chain access.':'Your preserved identity and exact XP are separate from catalog lore and cosmetic previews.');
  }
  const controller=createPassportSession({read,onState});
  $('[data-connect]').onclick=async()=>{try{await sessionBridge.connect();await controller.change(sessionBridge.getSession());}catch{notice('Wallet connection is unavailable here. Use the existing connection on axo.pet.');}};
  $('[data-refresh]').onclick=()=>controller.change(sessionBridge.getSession());
  $$('[data-tab]').forEach(button=>{button.onclick=()=>{$$('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$$('[data-panel]').forEach(p=>{p.hidden=p.dataset.panel!==button.dataset.tab;});};});
  $('[data-copy]').onclick=async()=>{try{const id=requirePet().pet.identity.genesisId;await navigator.clipboard.writeText(id);notice('Pet ID copied.');}catch{notice('Read your Pet again before copying its identity.');}};
  $('[data-close-preview]').onclick=closePreview;$('[data-close-form]').onclick=()=>{++formGeneration;$('[data-form-dialog]').close();};
  $('[data-form-dialog]').addEventListener('cancel',()=>{++formGeneration;});
  let unsubscribe=()=>{};
  const refresh=()=>{if(!disposed&&!document.hidden&&!['LOADING','REFRESHING'].includes(state.status)&&!$('[data-form-dialog]').open&&sessionBridge.getSession().connected)controller.refresh(sessionBridge.getSession());};
  const refreshTimer=setInterval(refresh,40000),storageChanged=()=>{if(current()){closePreview();renderSaved(generation);}};
  document.addEventListener('visibilitychange',refresh);window.addEventListener('storage',storageChanged);
  try{
    reference=await fetchJson('/passport/reference.json');if(reference.schemaVersion!=='AXO_PASSPORT_REFERENCE_V1'||reference.lineages?.length!==6||reference.stages?.length!==10||reference.bases?.length!==60)throw Error('Reference catalog mismatch');
    try{catalog=await fetchJson('/gear-bazaar/v1/catalog.json');validateProfile(catalog);
      const register=record=>{if(record?.asset&&record.sha256)previewAssets.set(record.asset,record.sha256);};
      for(const base of catalog.lineages){for(const record of [base,base.closedFeet,base.arm,base.fingers,base.gills,base.head,base.hands,base.styled,base.styled.closedFeet,base.styled.arm,base.styled.fingers,base.styled.gills,base.styled.head,base.styled.hands])register(record);}
      for(const item of catalog.items){register(item.wearable);register(item.wearable.rear);for(const part of item.parts)if(item.source.asset===part.texture)register(item.source);}for(const scene of catalog.scenes)register(scene);
    }catch{catalog=null;}
    await sessionBridge.ready().catch(()=>{});unsubscribe=sessionBridge.subscribe(()=>controller.change(sessionBridge.getSession()));$('[data-connect]').disabled=false;await controller.change(sessionBridge.getSession());
  }catch{notice('The Passport reference catalog is unavailable. Your Pet record has not been changed.');$('[data-connect]').disabled=true;}
  return {refresh:()=>controller.change(sessionBridge.getSession()),dispose(){disposed=true;clearPrivate();controller.dispose();unsubscribe();clearInterval(refreshTimer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('storage',storageChanged);}};
}
