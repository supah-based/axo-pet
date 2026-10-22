import {createVerifiedImageCache} from './verified-visuals.mjs';
import {canonicalPoseEligible} from './equipped-canonical.mjs';
import {createEquippedPuppet} from './equipped-puppet.mjs';
import {EQUIPPED_POSES,RIG_SPACE} from './equipped-rig.mjs';
const slots=new Set(['back','habitat','tool','pet','body','face','head','charm','companion']);
export function equippedInspectorMarkup(){return '<section class="equipped-inspector" aria-label="Verified V1 equipment pose study"><p>This read-only snapshot uses your verified V1 art and equipped layers. Pose previews change no equipment, XP, stats or set bonuses. Candidate Wardrobe styles are excluded.</p><p data-equipped-status role="status">Checking equipped art…</p><div data-equipped-grid class="equipped-pose-grid"></div></section>';}
export function mountEquippedInspector(root,pet,{fetchImage=(...args)=>fetch(...args),makePuppet=createEquippedPuppet,makeCanvas=()=>document.createElement('canvas')}={}){
  let disposed=false,actor;const controller=new AbortController(),layers=(pet?.layers||[]).filter(layer=>slots.has(layer?.slot)).map(layer=>({slot:layer.slot,url:layer.url,sha256:layer.sha256}));
  const cache=createVerifiedImageCache({limit:16,fetchImage:(url,options)=>fetchImage(url,{...options,signal:AbortSignal.any([options.signal,controller.signal])})});
  const setStatus=message=>{if(!disposed&&root.isConnected)root.querySelector('[data-equipped-status]').textContent=message;};
  const ready=(async()=>{
    const expected=new Set(['pet',...(pet?.gearLoadout||[]).map(item=>item.slot)]);
    if(!canonicalPoseEligible(pet,layers)){setStatus('Equipped joint poses require a reviewed adult LVL 10 base. Your Pet and equipment are unchanged.');return;}
    if(layers.length!==expected.size||layers.length>9||layers.some(layer=>!expected.has(layer.slot)))throw Error('Unsupported equipped rig');
    layers.forEach(layer=>cache.image(layer));await cache.settled();if(disposed||!root.isConnected)return;
    const images=layers.map(layer=>cache.image(layer));if(images.some(image=>!image))throw Error('Equipped image check failed');
    actor=makePuppet(layers.map((layer,i)=>({...layer,image:images[i]})),{format:'canonical'});
    const grid=root.querySelector('[data-equipped-grid]');
    if(!actor.available){setStatus('Joint animation is unavailable on this device. Your verified equipped art remains unchanged.');actor.destroy();actor=null;return;}
    const pending=[];
    for(const name of ['attack','block','hit','victory']){const image=actor.render(EQUIPPED_POSES[name]);if(!image)throw Error('Pose render failed');
      const canvas=makeCanvas();canvas.width=320;canvas.height=480;canvas.setAttribute?.('aria-label',name+' · verified V1 equipment visual preview');const c=canvas.getContext('2d');
      c.fillStyle='#102331';c.fillRect(0,0,320,480);const unit=320/1024*.88;c.drawImage(image,160+(-512-RIG_SPACE.padding)*unit,377+(-1207-RIG_SPACE.padding)*unit,(1024+RIG_SPACE.padding*2)*unit,(1536+RIG_SPACE.padding*2)*unit);
      c.fillStyle='#08121ce8';c.fillRect(0,438,320,42);c.fillStyle='#e4edda';c.font='bold 12px system-ui';c.textAlign='center';c.fillText(name.toUpperCase()+' / PREVIEW',160,464);pending.push(canvas);
    }
    if(disposed||!root.isConnected)return;grid.replaceChildren(...pending);setStatus('Verified V1 surfaces · four visual pose previews · no gameplay changes.');
    // Stills are now captured in 2D canvases; release this extra GPU context promptly.
    actor.destroy();actor=null;
  })().catch(()=>{if(actor){actor.destroy();actor=null;}setStatus('Equipped poses could not be checked for this snapshot. Reopen Arena to refresh; your equipment is unchanged.');});
  return{ready,destroy(){disposed=true;controller.abort();actor?.destroy();actor=null;root.querySelector('[data-equipped-grid]')?.replaceChildren();}};
}
