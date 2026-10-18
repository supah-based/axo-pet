import {LINEAGES} from './catalog.mjs';
const images=new Map();
const WARDROBE_SLOTS=new Set(['back','habitat','tool','pet','body','face','head','charm','companion']);
const wardrobeUrl=url=>/^\/hatchery-nft-v5(?:\.1\.1)?\/(?:pet|layer)_[a-z0-9_]+\.webp$/.test(String(url||''));
function asset(url){if(!ASSET_URLS.includes(url)&&!wardrobeUrl(url))return null;if(!images.has(url)){const img=new Image();img.src=url;images.set(url,img);}return images.get(url);}
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
// Eight original painted poses; continuous transforms add motion, not fabricated atlas frames.
export const ANIMATION_PROFILE=Object.freeze({sourcePoses:8,targetFps:60,poseBlendMs:90,revealMs:1800,maxParticlesPerFighter:14,maxPixelArea:1800000});
export function motionSample(t,elapsed,{attack=false,epic=false,damage=0,victory=false,reduced=false,side=0}={}){
 const sign=side?-1:1;if(reduced)return {pose:victory?7:0,x:0,y:0,sx:1,sy:1,rotation:0,phase:'still'};
 const idle={pose:Math.floor(Math.max(0,t)/900)%2,x:Math.sin(t/1300+side)*2,y:Math.sin(t/460+side)*3,sx:1+Math.sin(t/460)*.008,sy:1-Math.sin(t/460)*.012,rotation:Math.sin(t/1500+side)*.008,phase:'idle'};
 if(elapsed<0||elapsed>=1800)return victory?{...idle,pose:7,y:idle.y-4,phase:'victory'}:idle;
 if(elapsed<300){const a=ease(elapsed/300);return {pose:attack?2:4,x:-sign*14*a,y:5*a,sx:1+.05*a,sy:1-.05*a,rotation:-sign*.04*a,phase:'windup'};}
 if(elapsed<1000){const a=clamp((elapsed-300)/700),lunge=Math.sin(a*Math.PI);return {pose:epic?6:attack?3:4,x:attack?sign*48*lunge:0,y:-lunge*(epic?16:5),sx:1+lunge*.025,sy:1-lunge*.02,rotation:attack?sign*lunge*.035:0,phase:'release'};}
 const a=clamp((elapsed-1000)/800),kick=Math.sin(Math.min(1,a*3)*Math.PI)*(1-a);return {pose:damage>0&&a<.65?5:0,x:damage>0?-sign*kick*20:0,y:damage>0?kick*4:0,sx:1-kick*.04,sy:1+kick*.025,rotation:damage>0?-sign*kick*.04:0,phase:'recover'};
}
// Profiles are presentation only. Every move has a different time envelope / silhouette.
export const MOVE_PROFILES=Object.freeze(Object.fromEntries(Object.entries({
 market_order:[190,620,1050,26,0,'jab'],diamond_hands:[260,560,1320,0,0,'barrier'],
 rug_pull:[340,850,1240,-18,8,'ribbon'],reversal:[250,970,1360,-12,0,'counter'],
 wen:[420,780,1300,0,-8,'question'],pepe_breakout:[320,680,1100,42,-54,'candle'],
 touch_grass:[440,880,1400,0,12,'garden'],exit_liquidity:[170,720,1160,46,-5,'slash'],
 lineage_a:[300,790,1200,32,-14,'signature'],lineage_b:[380,900,1430,-6,7,'recovery'],
 epic:[480,1020,1400,22,-24,'epic'],recharge:[520,940,1470,0,4,'charge']
}).map(([k,v])=>[k,Object.freeze({anticipation:v[0],impact:v[1],follow:v[2],reach:v[3],lift:v[4],shape:v[5]})])));
const LINEAGE_INDEX=Object.freeze({emerald_sprout:0,sapphire_tide:1,amethyst_dream:2,solar_peach:3,rose_bloom:4,midnight_mint:5});
export const LINEAGE_FORMS=Object.freeze({emerald_sprout:'vault',sapphire_tide:'orbit',amethyst_dream:'fork',solar_peach:'comet',rose_bloom:'wave',midnight_mint:'reticle'});
// UI1.9: quintic in-betweens keep position/scale/rotation continuous at every phase.
// 109 sample positions describe a 1.8s /60Hz sequence, NOT109 newly painted poses.
export const ARCADE_PROFILE=Object.freeze({sampleHz:60,motionSamples:109,clipBlendMs:96,clipExitMs:144,maxSparksPerFighter:10,burstMs:360,stampMs:620});
const smooth=v=>{v=clamp(v);return clamp(v*v*v*(v*(v*6-15)+10));};
const mix=(a,b,v)=>a+(b-a)*smooth(v);
export function moveMotionSample(t,elapsed,{key='market_order',lineage='emerald_sprout',side=0,reduced=false,damage=0,victory=false}={},out={}){
 const p=MOVE_PROFILES[key]||MOVE_PROFILES.market_order,sign=side?-1:1;
 const ix=sign*Math.sin(t/1300)*2,iy=Math.sin(t/460)*3,isx=1+Math.sin(t/460)*.008,isy=1-Math.sin(t/460)*.012,ir=sign*Math.sin(t/1500)*.008;
 if(reduced||elapsed<0||elapsed>=1800){out.pose=victory?7:reduced?0:Math.floor(Math.max(0,t)/900)%2;out.x=reduced?0:ix;out.y=reduced?0:iy;out.sx=reduced?1:isx;out.sy=reduced?1:isy;out.rotation=reduced?0:ir;out.phase=reduced?'still':victory?'victory':'idle';return out;}
 const variant=LINEAGE_INDEX[lineage]||0,special=key==='lineage_a'||key==='lineage_b'||key==='epic',lift=p.lift-(special?variant*2:0),rotation=special?(variant-2)*.009:.02;
 let x,y,sx,sy,r,phase;
 if(elapsed<p.anticipation){const q=elapsed/p.anticipation;x=mix(0,-10,q);y=mix(0,4,q);sx=mix(0,.025,q);sy=-sx;r=mix(0,-.025,q);phase='anticipation';}
 else if(elapsed<p.impact){const q=(elapsed-p.anticipation)/(p.impact-p.anticipation);x=mix(-10,p.reach,q);y=mix(4,lift,q);sx=mix(.025,.035,q);sy=mix(-.025,-.02,q);r=mix(-.025,rotation,q);phase='travel';}
 else if(elapsed<p.follow){const q=(elapsed-p.impact)/(p.follow-p.impact);x=mix(p.reach,p.reach*.12,q);y=mix(lift,2,q);sx=mix(.035,-.008,q);sy=mix(-.02,.008,q);r=mix(rotation,.006,q);phase='impact';}
 else{const q=(elapsed-p.follow)/(1800-p.follow);x=mix(p.reach*.12,0,q);y=mix(2,0,q);sx=mix(-.008,0,q);sy=mix(.008,0,q);r=mix(.006,0,q);phase='recovery';}
 out.pose=phase==='anticipation'?(p.reach?2:4):phase==='recovery'?(damage>0&&elapsed<p.follow+(1800-p.follow)*.35?5:0):key==='epic'?6:p.reach?3:4;
 out.x=ix+sign*x;out.y=iy+y;out.sx=isx+sx;out.sy=isy+sy;out.rotation=ir+sign*r;out.phase=phase;return out;
}
// Offline tooling/diagnostics only. The RAF path samples continuously without allocating frame arrays.
export function animationFrames(options={}){return Array.from({length:ARCADE_PROFILE.motionSamples},(_,index)=>{const elapsed=index*1000/ARCADE_PROFILE.sampleHz;return {elapsed,...moveMotionSample(elapsed,elapsed,options)};});}
// A 36ms sprite hold and <=3 world-unit impulse; only canvas presentation consumes it.
export function impactSample(elapsed,key,damage,reduced=false,out={}){const impact=MOVE_PROFILES[key]?.impact??1000,dt=elapsed-impact,active=!reduced&&damage>0&&dt>=0&&dt<120;out.x=active?Math.sin(dt/120*Math.PI*2)*3*(1-dt/120):0;out.y=active?-Math.sin(dt/120*Math.PI)*2:0;out.spriteElapsed=!reduced&&damage>0&&dt>=0&&dt<36?impact:elapsed;return out;}
export function effectReadouts(effect={}){return [['damage','−',''],['blocked','BLOCK ',''],['healed','+',' HP'],['counter','COUNTER −',''],['recoil','RECOIL −',''],['storm','STORM −','']].filter(([k])=>Number.isFinite(effect[k])&&effect[k]>0).map(([k,a,b])=>({kind:k,text:a+effect[k]+b}));}
// No pending-choice data is consumed by this tracker. A reconnect seeds the watermark.
export class ReceiptTracker{
 constructor(){this.context=null;this.round=0;this.selection=null;}
 accept(state){const context=(state?.presentationContext||'live')+':'+(state?.id||'anonymous'),log=state?.battle?.log||[],last=log.at(-1),round=last?.round||0,replay=state?.presentationContext==='replay';
 if(context!==this.context){this.context=context;this.round=round;this.selection=state?.replaySelection;return replay&&!!last;}
 if(replay){const fresh=this.selection!==state.replaySelection;this.selection=state.replaySelection;return fresh&&!!last;}
 const fresh=round===this.round+1;this.round=Math.max(this.round,round);return fresh&&!!last;
 }
}
// Exact parent-prepared AXO_MOVE_CLIP_ATLAS_1 metadata (not recolored lineage art).
export const EMERALD_CLIPS=Object.freeze({url:'/arena/assets/emerald-moves-v18.webp',width:2048,height:2048,cell:512,anchorX:200,anchorY:470,displayScale:1.18,sha256:'1bb08bcc79c08a68dae2b7de78d23a8ab4e7eca47b8983419dbe12af65ba477c',moves:Object.freeze({market_order:0,rug_pull:4,pepe_breakout:8,reversal:12})});
// Additive supplied artwork: only signature + epic for these five exact lineages.
export const ADDITIVE_CLIPS=Object.freeze({"sapphire_tide":Object.freeze({...{"url": "/arena/assets/sapphire-signature-epic-v19.webp", "width": 2048, "height": 1024, "cell": 512, "anchorX": 220, "anchorY": 470, "displayScale": 1.069095, "sha256": "45e49da98807ecd735f0d1679a4faf39cd0ebd9bb2d921900ea157b88f9da60a"},moves:Object.freeze({lineage_a:0,epic:4})}),"amethyst_dream":Object.freeze({...{"url": "/arena/assets/amethyst-signature-epic-v19.webp", "width": 2048, "height": 1024, "cell": 512, "anchorX": 220, "anchorY": 470, "displayScale": 1.034899, "sha256": "3a705c8116b69cd26489eb113afd6f690b3cbad6daedb8f3da6762d8b37d27e8"},moves:Object.freeze({lineage_a:0,epic:4})}),"solar_peach":Object.freeze({...{"url": "/arena/assets/solar-signature-epic-v19.webp", "width": 2048, "height": 1024, "cell": 512, "anchorX": 220, "anchorY": 470, "displayScale": 1.263764, "sha256": "f57cd9426068173cbf604bc0e80bb05d09ba8c853c6624932d2c9eca69b224e7"},moves:Object.freeze({lineage_a:0,epic:4})}),"rose_bloom":Object.freeze({...{"url": "/arena/assets/rose-signature-epic-v19.webp", "width": 2048, "height": 1024, "cell": 512, "anchorX": 220, "anchorY": 470, "displayScale": 1.265657, "sha256": "ec3f8c28f611fb9436bc25a58d355818720c54add35797c8b9441cc0b773bd46"},moves:Object.freeze({lineage_a:0,epic:4})}),"midnight_mint":Object.freeze({...{"url": "/arena/assets/midnight-signature-epic-v19.webp", "width": 2048, "height": 1024, "cell": 512, "anchorX": 220, "anchorY": 470, "displayScale": 1.149034, "sha256": "dc2f8465469c03ca88e1637d855697564ced0190c391376f4d7a9d2aea847b4c"},moves:Object.freeze({lineage_a:0,epic:4})})});
export function authoredClipMetadata(lineage){return lineage==='emerald_sprout'?EMERALD_CLIPS:Object.hasOwn(ADDITIVE_CLIPS,lineage)?ADDITIVE_CLIPS[lineage]:null;}
// Fixed 13-image universe (7 original + Emerald + five additive); no arbitrary URLs.
export const ASSET_URLS=Object.freeze(['/arena/assets/arena.webp',...Object.keys(LINEAGE_FORMS).map(id=>`/arena/assets/${id}.webp`),EMERALD_CLIPS.url,...Object.values(ADDITIVE_CLIPS).map(m=>m.url)]);
export function clipFrame(lineage,key,elapsed,reduced=false){const meta=authoredClipMetadata(lineage);if(!meta||!Object.hasOwn(meta.moves,key)||reduced||!Number.isFinite(elapsed)||elapsed<0||elapsed>=1800)return null;const p=MOVE_PROFILES[key],phase=elapsed<p.anticipation?0:elapsed<p.impact?1:elapsed<p.follow?2:3;return meta.moves[key]+phase;}
// Negative frame sentinel means original-rig entry/exit, not an extra authored atlas cell.
export function clipBlendSample(lineage,key,elapsed,reduced=false,out={}){
 const frame=clipFrame(lineage,key,elapsed,reduced);out.frame=frame;out.previous=frame;out.mix=1;if(frame===null)return out;
 const base=authoredClipMetadata(lineage).moves[key],p=MOVE_PROFILES[key];
 if(elapsed<ARCADE_PROFILE.clipBlendMs){out.previous=-1;out.mix=smooth(elapsed/ARCADE_PROFILE.clipBlendMs);}
 else if(elapsed>=1800-ARCADE_PROFILE.clipExitMs){out.previous=frame;out.frame=-1;out.mix=smooth((elapsed-(1800-ARCADE_PROFILE.clipExitMs))/ARCADE_PROFILE.clipExitMs);}
 else{const phase=frame-base,boundary=phase===1?p.anticipation:phase===2?p.impact:phase===3?p.follow:0;if(phase>0&&elapsed-boundary<ARCADE_PROFILE.clipBlendMs){out.previous=frame-1;out.mix=smooth((elapsed-boundary)/ARCADE_PROFILE.clipBlendMs);}}
 return out;
}
// Only resolved receipt fields may gate an impact stamp. No selected/pending/critical/score invention.
export function arcadeReceiptStamp(last,side){const own=last?.effects?.[side],hit=last?.effects?.[1-side],key=last?.moves?.[side];if(!own||!hit)return '';
 if(hit.counter>0&&key==='reversal')return 'RETURN TO SENDER';
 if(own.blocked>0&&key==='diamond_hands')return 'DIAMOND HANDS';
 if(own.healed>0)return 'GREEN CANDLE';
 if(hit.damage>0)return key==='rug_pull'?'RUG CHECK':key==='pepe_breakout'?'BREAKOUT!':key==='epic'?'EPIC RECEIPT':'HIT CONFIRMED';
 if(hit.blocked>0)return 'GUARD CHECK';return '';
}
export function sparkSample(index,elapsed,key,damage,blocked,reduced=false,out={}){const p=MOVE_PROFILES[key],age=elapsed-(p?.impact??Infinity);out.active=!reduced&&!!p&&(damage>0||blocked>0)&&Number.isInteger(index)&&index>=0&&index<ARCADE_PROFILE.maxSparksPerFighter&&age>=0&&age<ARCADE_PROFILE.burstMs;out.x=0;out.y=0;out.alpha=0;out.length=0;if(!out.active)return out;
 const q=age/ARCADE_PROFILE.burstMs,angle=index*2.3999632297,radius=(12+index*3.5)*Math.sin(q*Math.PI*.5);out.x=Math.cos(angle)*radius;out.y=Math.sin(angle)*radius*.65;out.alpha=(1-q)*(1-q)*.7;out.length=2+(1-q)*6;return out;
}
// Impact revision 2: continuous secondary animation, not newly painted anatomy.
export const IMPACT_REVISION=Object.freeze({sampleHz:120,samples:217,settleAt:1380,settleMs:420,decalMs:520,maxDecals:2});
export function refinedMotionSample(t,elapsed,options={},out={}){
 moveMotionSample(t,elapsed,options,out);if(options.reduced||elapsed<0||elapsed>=1800)return out;
 const p=MOVE_PROFILES[options.key]||MOVE_PROFILES.market_order,sign=options.side?-1:1;
 // A zero-slope arc in each phase adds body follow-through without phase-boundary jumps.
 const start=elapsed<p.anticipation?0:elapsed<p.impact?p.anticipation:elapsed<p.follow?p.impact:p.follow;
 const end=elapsed<p.anticipation?p.anticipation:elapsed<p.impact?p.impact:elapsed<p.follow?p.follow:1800;
 const q=clamp((elapsed-start)/(end-start)),arc=Math.sin(q*Math.PI)**2;
 out.rotation+=sign*arc*(elapsed<p.impact?-.025:.035);out.sx+=arc*.018;out.sy-=arc*.012;
 out.y-=arc*(Math.abs(p.lift)>20?5:2);return out;
}
export function reactionSample(elapsed,incomingKey,damage,reduced=false,out={}){
 const age=elapsed-(MOVE_PROFILES[incomingKey]?.impact??Infinity),q=clamp(age/420),a=!reduced&&damage>0&&age>=0&&age<420?Math.sin(q*Math.PI)**2:0;
 out.x=a?-12*a:0;out.y=3*a;out.rotation=a?-.07*a:0;out.sx=1-.035*a;out.sy=1+.02*a;return out;
}
export function outcomeSample(status,winner,side,elapsed,reduced=false,out={}){
 const valid=status==='won'&&(winner===0||winner===1);out.active=valid&&(reduced||elapsed<0||elapsed>=IMPACT_REVISION.settleAt);out.kind=valid?(winner===side?'winner':'defeat'):'neutral';
 out.mix=!out.active?0:reduced||elapsed<0?1:smooth((elapsed-IMPACT_REVISION.settleAt)/IMPACT_REVISION.settleMs);
 out.pose=winner===side?7:5;out.x=winner===side?0:10;out.y=0;out.sx=winner===side?1.02:1;out.sy=winner===side?1.02:.82;out.rotation=winner===side?-.035:-.9;return out;
}
export function comicHit(last,side){
 const hit=last?.effects?.[1-side],own=last?.effects?.[side],key=last?.moves?.[side];if(!hit||!own||!MOVE_PROFILES[key])return '';
 if(key==='reversal'&&hit.counter>0)return 'BAK!';
 if(hit.damage>0)return ({market_order:'PoW!',rug_pull:'BAF!',pepe_breakout:'KAPOW!',exit_liquidity:'SLASH!',lineage_a:'PeW!',epic:'BOOM!'}[key]||'PoW!');
 if(hit.blocked>0)return 'CLANG!';return '';
}
const DAMAGE_STYLES=Object.freeze(Object.fromEntries(Object.entries({damage:['#ffcd72',24,-.08],slash:['#ffe4a1',24,-.08],energy:['#a5f5ff',24,-.08],blocked:['#95e8ff',14,0],healed:['#b7ff9a',14,0],counter:['#f6b1ff',16,0],recoil:['#ffb59c',14,0],storm:['#ceb5ff',16,0]}).map(([key,[color,size,angle]])=>[key,Object.freeze({color,size,angle})])));
export function damageStyle(kind,key){return DAMAGE_STYLES[kind==='damage'?(key==='exit_liquidity'?'slash':key==='lineage_a'?'energy':'damage'):kind]||DAMAGE_STYLES.damage;}
export function readoutLayout(index,count,height,scale,out={}){const compact=height<220&&count>3,unit=Math.min(1.6,scale),perColumn=compact?Math.ceil(count/2):count;out.x=compact?(index<perColumn?-72:72)*unit:0;out.y=height*.12+(index%perColumn)*24*unit;out.unit=unit;return out;}
function burstPath(c,r){c.beginPath();for(let j=0;j<20;j++){const angle=j*Math.PI/10,rad=j%2?r*.68:r,x=Math.cos(angle)*rad,y=Math.sin(angle)*rad*.62;if(j)c.lineTo(x,y);else c.moveTo(x,y);}c.closePath();}
// TRAVEL_CHOREOGRAPHY_1: presentation-only paths. All attacks share receipt contact cues.
export const TRAVEL_MODES=Object.freeze({market_order:'melee',diamond_hands:'guard',rug_pull:'ground',reversal:'counter',wen:'reserve',pepe_breakout:'candle',touch_grass:'heal',exit_liquidity:'slash',lineage_a:'signature',lineage_b:'recovery',epic:'epic',recharge:'charge'});
export const TRAVEL_LIMITS=Object.freeze({trailPoints:3,contactMs:280,returnFlightMs:220,revealMs:1800});
const meleeKey=key=>key==='market_order'||key==='exit_liquidity';
export function contactCue(last,side){const key=last?.moves?.[side],p=MOVE_PROFILES[key];if(!p)return Infinity;return key==='reversal'?Math.max(p.impact,(MOVE_PROFILES[last?.moves?.[1-side]]?.impact||p.impact)+TRAVEL_LIMITS.returnFlightMs):p.impact;}
export function readoutCue(last,side,kind){if(kind==='storm')return 1450;if(kind==='healed'||kind==='recoil')return contactCue(last,side);return contactCue(last,1-side);}
export function bodyTravel(elapsed,key,opponentKey,side,height=400,reduced=false){if(reduced||!meleeKey(key)||!Number.isFinite(elapsed)||elapsed<0||elapsed>=1800)return 0;const p=MOVE_PROFILES[key],reach=meleeKey(opponentKey)?(470-Math.max(90,Math.min(150,height*.35)))/2-40:470-Math.max(60,Math.min(140,height*.3)),extra=reach-p.reach;let q=0;
 if(elapsed>=p.anticipation&&elapsed<p.impact)q=smooth((elapsed-p.anticipation)/(p.impact-p.anticipation));else if(elapsed>=p.impact&&elapsed<p.follow)q=1-.75*smooth((elapsed-p.impact)/(p.follow-p.impact));else if(elapsed>=p.follow)q=.25*(1-smooth((elapsed-p.follow)/(1800-p.follow)));return (side?-1:1)*extra*q;}
export function travelSample(last,side,elapsed,height=400,reduced=false,anchors=null,out={}){
 const key=last?.moves?.[side],mode=TRAVEL_MODES[key],p=MOVE_PROFILES[key],other=last?.moves?.[1-side],hit=last?.effects?.[1-side],own=last?.effects?.[side],sign=side?-1:1;
 out.active=false;out.projectile=false;out.mode=mode||'none';out.progress=0;out.alpha=0;out.x=0;out.y=0;out.sourceX=0;out.sourceY=0;out.targetX=0;out.targetY=0;out.contactAt=Infinity;out.contact=false;out.phase='idle';out.rotation=0;
 if(reduced||!p||!hit||!own||!Number.isFinite(elapsed)||elapsed<0||elapsed>=1800||!Number.isFinite(height)||height<=0)return out;
 const sourceX=anchors?.[side]?.x??((side?735:265)+bodyTravel(elapsed,key,other,side,height)),targetX=anchors?.[1-side]?.x??((side?265:735)+bodyTravel(elapsed,other,key,1-side,height)),ground=mode==='ground',sourceY=ground?height*.87:(anchors?.[side]?.chest??height*.51),targetY=ground?height*.87:(anchors?.[1-side]?.chest??height*.51),launch=mode==='counter'?(MOVE_PROFILES[other]?.impact??p.impact):p.anticipation,contactAt=contactCue(last,side),q=smooth((elapsed-launch)/Math.max(1,contactAt-launch)),post=clamp((elapsed-contactAt)/TRAVEL_LIMITS.contactMs);
 const attack=(mode==='melee'||mode==='ground'||mode==='candle'||mode==='slash'||mode==='signature'||mode==='epic'),counter=mode==='counter'&&own.blocked>0&&hit.counter>0;
 out.active=true;out.projectile=attack||counter;out.phase=elapsed<launch?'windup':elapsed<contactAt?'travel':elapsed<contactAt+TRAVEL_LIMITS.contactMs?'contact':'recovery';out.progress=q;out.contactAt=contactAt;
 out.sourceX=sourceX;out.sourceY=sourceY;out.targetX=targetX;out.targetY=targetY;out.x=sourceX+(targetX-sourceX)*q;out.y=sourceY+(targetY-sourceY)*q;
 // All arcs terminate exactly at the current victim anchor: no visual teleport at impact.
 const arc=Math.sin(q*Math.PI);if(mode==='candle')out.y-=Math.min(90,height*.18)*arc;if(mode==='signature')out.y-=Math.min(36,height*.08)*arc;if(mode==='epic')out.y-=Math.min(52,height*.1)*arc;
 out.rotation=sign*(mode==='slash'?-Math.PI/4:mode==='signature'?q*Math.PI*2:mode==='epic'?q*Math.PI:0);out.alpha=out.phase==='windup'?smooth(elapsed/Math.max(1,launch))*.65:out.phase==='travel'?.9:out.phase==='contact'?.9*(1-smooth(post)):0;
 out.contact=elapsed>=contactAt&&elapsed<contactAt+TRAVEL_LIMITS.contactMs&&(attack&&(hit.damage>0||hit.blocked>0)||counter);return out;
}
function travelGlyph(c,form,x,y,r,sign=1){
 switch(form){
 case 'vault':strokeDiamond(c,x,y,r);strokeLine(c,x-r*.6,y+r*.5,x+r*.6,y+r*.5);break;
 case 'orbit':strokeRing(c,x,y,r);strokeRing(c,x+sign*r*.3,y,r*.5);break;
 case 'fork':strokeLine(c,x-sign*r,y-r,x+sign*r,y);strokeLine(c,x-sign*r,y+r,x+sign*r,y);break;
 case 'comet':c.fillRect(x-r*.3,y-r*.65,r*.6,r*1.3);strokeLine(c,x,y-r,x,y+r);break;
 case 'wave':c.beginPath();c.arc(x,y,r,-Math.PI*.65,Math.PI*.65);c.stroke();strokeRing(c,x,y,r*.3);break;
 case 'reticle':c.strokeRect(x-r*.65,y-r*.65,r*1.3,r*1.3);strokeLine(c,x-r,y,x+r,y);strokeLine(c,x,y-r,x,y+r);break;
 }
}

export function combatGeometry(width,height,dockHeight,out={}){const scale=1000/Math.max(1,width);out.top=(height<=430?78:172)*scale;out.height=Math.max(50,height*scale-out.top-Math.max(0,dockHeight)*scale);out.scale=scale;return out;}
function strokeLine(c,ax,ay,bx,by){c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.stroke();}
function strokeRing(c,ax,ay,r){c.beginPath();c.arc(ax,ay,Math.max(1,r),0,Math.PI*2);c.stroke();}
function strokeDiamond(c,ax,ay,r){c.beginPath();c.moveTo(ax,ay-r);c.lineTo(ax+r*.6,ay);c.lineTo(ax,ay+r);c.lineTo(ax-r*.6,ay);c.closePath();c.stroke();}
function paintPose(c,img,f,opacity,w,h,size,height){c.globalAlpha=opacity;c.drawImage(img,(f%4)*w,Math.floor(f/4)*h,w,h,-size/2,-height*470/512,size,height);}
export class ArenaRenderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.state=null;this.lastRound=0;this.revealAt=-Infinity;this.tracker=new ReceiptTracker();this.readouts=[[],[]];this.alive=true;this.hero=null;this.poses=new Map();this.motion=[{},{}];this.motionOptions=[{},{}];this.impulses=[{},{}];this.geometry={};this.gradient=null;this.gradientHeight=0;this.clipMix={};this.spark={};this.reactions=[{},{}];this.outcomes=[{},{}];this.readoutPoint={};this.anchors=[{},{}];this.basePoses=[0,0];this.travel=[{},{}];this.trail={};this.hiddenHandler=()=>{if(globalThis.document?.hidden){this.resync();}};globalThis.document?.addEventListener?.('visibilitychange',this.hiddenHandler);this.lastPaint=-Infinity;this.draw=this.draw.bind(this);this.raf=requestAnimationFrame(this.draw);}
 resync(){this.needsResync=true;this.revealAt=-Infinity;this.readouts=[[],[]];stopSounds();}
 set(state){this.dock=this.canvas.closest?.('.combat-screen')?.querySelector('.combat-dock');const before=this.tracker.context,accepted=this.tracker.accept(state),fresh=accepted&&(!this.needsResync||state?.presentationContext==='replay'),changedContext=before!==this.tracker.context;if(changedContext){this.lastPaint=-Infinity;this.poses.clear();this.revealAt=-Infinity;this.readouts=[[],[]];}if(fresh&&!globalThis.document?.hidden){this.revealAt=performance.now();this.readouts=(state.battle.log.at(-1).effects||[]).map(effectReadouts);}else if(this.state?.id!==state?.id||globalThis.document?.hidden){this.revealAt=-Infinity;this.readouts=[[],[]];}if(!globalThis.document?.hidden)this.needsResync=false;this.state=state;return fresh&&!globalThis.document?.hidden;}
 stop(){this.alive=false;globalThis.document?.removeEventListener?.('visibilitychange',this.hiddenHandler);stopSounds();globalThis.cancelAnimationFrame?.(this.raf);this.poses.clear();this.state=null;this.readouts=[[],[]];}
 sprite(id,frame,x,y,size,flip=false,motion={sx:1,sy:1,rotation:0},time=0,key=id,opacity=1){const img=asset(`/arena/assets/${id}.webp`);if(!img||!img.complete||!img.naturalWidth||!img.naturalHeight){const c=this.ctx;c.save();c.globalAlpha=opacity;c.fillStyle=LINEAGES[id]?.color||'#a5c4ce';c.font='bold 20px ui-monospace';c.textAlign='center';c.fillText('◆',x,y-size*.4);c.font=`${12*1000/Math.max(1,this.canvas.clientWidth)}px ui-monospace`;c.fillText('Rig unavailable',x,y-size*.25);c.restore();return;}
 const c=this.ctx,w=img.naturalWidth/4,h=img.naturalHeight/2,height=size*h/w;let pose=this.poses.get(key);if(!pose){pose={current:frame,previous:frame,at:time};this.poses.set(key,pose);}if(pose.current!==frame){pose.previous=pose.current;pose.current=frame;pose.at=time;}
 const mix=motionPreference.matches?1:clamp((time-pose.at)/ANIMATION_PROFILE.poseBlendMs);c.save();c.translate(x,y);c.rotate(motion.rotation||0);c.scale((flip?-1:1)*(motion.sx||1),motion.sy||1);
 if(mix<1&&pose.previous!==frame)paintPose(c,img,pose.previous,(1-mix)*opacity,w,h,size,height);paintPose(c,img,frame,(pose.previous===frame?1:mix)*opacity,w,h,size,height);c.restore();}
 rigLayer(id,frame,x,y,size,flip,motion,opacity){if(opacity<=0)return;const img=asset(`/arena/assets/${id}.webp`);if(!img||!img.complete||!img.naturalWidth||!img.naturalHeight)return;const c=this.ctx,w=img.naturalWidth/4,h=img.naturalHeight/2;c.save();c.translate(x,y);c.rotate(motion.rotation||0);c.scale((flip?-1:1)*motion.sx,motion.sy);paintPose(c,img,frame,opacity,w,h,size,size*h/w);c.restore();}
 wardrobe(pet,x,y,size,flip,motion,opacity=1){const gear=pet?.gearLoadout||[],layers=(pet?.layers||[]).filter(v=>WARDROBE_SLOTS.has(v?.slot));if(!gear.length||layers.filter(v=>v.slot==='pet').length!==1)return false;const expected=new Set(['pet',...gear.map(v=>v.slot)]);if(layers.length!==expected.size||layers.some(v=>!expected.has(v.slot)||!wardrobeUrl(v.url)))return false;const loaded=layers.map(v=>asset(v.url));if(loaded.some(img=>!img||!img.complete||img.naturalWidth!==1024||img.naturalHeight!==1024))return false;const c=this.ctx;c.save();c.globalAlpha=clamp(opacity);c.translate(x,y);c.rotate(motion.rotation||0);c.scale((flip?-1:1)*(motion.sx||1),motion.sy||1);const top=-size*1910/2048;for(const img of loaded)c.drawImage(img,-size/2,top,size,size);c.restore();return true;}
 paintClipLayer(img,frame,alpha,x,y,size,flip,motion,time,victory,elapsed,id='emerald_sprout'){const meta=authoredClipMetadata(id);if(!meta||!Number.isFinite(alpha)||alpha<=0||!Number.isInteger(frame)||frame< -1||frame>=meta.width/meta.cell*(meta.height/meta.cell))return;alpha=clamp(alpha);const c=this.ctx,unit=size*meta.displayScale/meta.cell;if(frame===-1){this.sprite(id,victory&&elapsed>1600?7:Math.floor(Math.max(0,time)/900)%2,x,y,size,flip,motion,time,String(Number(flip)),alpha);return;}c.save();c.globalAlpha=alpha;c.translate(x,y);c.rotate(motion.rotation||0);c.scale((flip?-1:1)*motion.sx,motion.sy);c.drawImage(img,(frame%4)*512,Math.floor(frame/4)*512,512,512,-meta.anchorX*unit,-meta.anchorY*unit,512*unit,512*unit);c.restore();}
 clip(id,key,elapsed,x,y,size,flip,motion,time=0,victory=false,opacity=1){const blend=clipBlendSample(id,key,elapsed,motionPreference.matches,this.clipMix);if(blend.frame===null)return false;const meta=authoredClipMetadata(id),img=asset(meta.url);if(!img||!img.complete||img.naturalWidth!==meta.width||img.naturalHeight!==meta.height)return false;
 if(blend.previous!==blend.frame)this.paintClipLayer(img,blend.previous,(1-blend.mix)*opacity,x,y,size,flip,motion,time,victory,elapsed,id);this.paintClipLayer(img,blend.frame,(blend.previous===blend.frame?1:blend.mix)*opacity,x,y,size,flip,motion,time,victory,elapsed,id);return true;}
 arcadeHit(i,p,last,elapsed,h,anchors=null){if(motionPreference.matches||elapsed<0||elapsed>=1800)return;const key=last.moves[i],profile=MOVE_PROFILES[key],hit=last.effects[1-i];if(!profile||!hit)return;const c=this.ctx,scale=Math.min(1,h/320),x=anchors?.[1-i]?.x??(i?265:735),y=key==='rug_pull'?h*.87:(anchors?.[1-i]?.chest??h*.51),color=hit.damage>0||hit.counter>0?'#ffe795':'#70ecff';c.save();c.strokeStyle=color;c.lineWidth=1.8;
 for(let j=0;j<ARCADE_PROFILE.maxSparksPerFighter;j++){const spark=sparkSample(j,elapsed-(contactCue(last,i)-profile.impact),key,(hit.damage||0)+(hit.counter||0),hit.blocked,false,this.spark);if(!spark.active)continue;c.globalAlpha=spark.alpha;const dx=spark.x*scale,dy=spark.y*scale;strokeLine(c,x+dx,y+dy,x+dx+spark.length*Math.sign(dx||1)*scale,y+dy+spark.length*Math.sign(dy||1)*.4*scale);}
 const age=elapsed-contactCue(last,i),stamp=comicHit(last,i);if(stamp&&age>=0&&age<IMPACT_REVISION.decalMs){const q=age/IMPACT_REVISION.decalMs,unit=Math.min(1.7,this.geometry.scale),pop=.85+.15*smooth(Math.min(1,q*5));
 c.globalAlpha=.95*(1-smooth(clamp((q-.55)/.45)));c.translate(x,y-42*unit);c.rotate(i?.1:-.1);c.scale(unit*pop,unit*pop);c.fillStyle=hit.damage>0?'#ffdf65':'#9ce6ff';c.strokeStyle='#101c2b';c.lineWidth=3;burstPath(c,stamp.length>5?52:43);c.fill();c.stroke();c.font='italic 1000 24px system-ui,sans-serif';c.textAlign='center';c.lineJoin='round';c.lineWidth=5;c.strokeText(stamp,0,7);c.fillStyle='#ffffff';c.fillText(stamp,0,7);}

 c.restore();}
 halo(x,y,color,size,t){const c=this.ctx;c.save();c.strokeStyle=color+'70';c.fillStyle=color+'10';c.lineWidth=2;c.beginPath();c.ellipse(x,y,size,size*.16,0,0,Math.PI*2);c.fill();c.stroke();if(!motionPreference.matches){c.strokeStyle=color+'28';c.beginPath();c.ellipse(x,y,size+8+Math.sin(t/750)*3,size*.19,0,0,Math.PI*2);c.stroke();}c.restore();}
 effects(i,p,last,elapsed,h,anchors=null){
 const path=travelSample(last,i,elapsed,h,motionPreference.matches,anchors,this.travel[i]);if(!path.active)return;
 const key=last.moves[i],mode=path.mode,profile=MOVE_PROFILES[key],own=last.effects[i],hit=last.effects[1-i],sign=i?-1:1,c=this.ctx,color=LINEAGES[p.pet.lineageId].color,form=LINEAGE_FORMS[p.pet.lineageId],unit=Math.max(.45,Math.min(1.4,h/320)),x=path.sourceX,y=path.sourceY,r=26*unit;
 c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2.5*unit;c.lineCap='round';c.lineJoin='round';c.globalAlpha=.65;
 if(!path.projectile||mode==='counter'){
  const build=smooth(elapsed/profile.anticipation),fade=1-smooth((elapsed-profile.follow)/(1800-profile.follow));c.globalAlpha=.75*fade;
  if(mode==='guard'||mode==='counter'){strokeDiamond(c,x+sign*r*.6,y,r*(.3+.9*build));if(mode==='counter')strokeLine(c,x-sign*r*.4,y+r,x+sign*r*.4,y-r);}
  else if(mode==='reserve'){strokeRing(c,x,y,r*(.3+build));c.font=`bold ${24*unit}px ui-monospace`;c.textAlign='center';c.fillText('?',x,y+8*unit);}
  else if(mode==='heal'){for(let j=0;j<3;j++){const ax=x+(j-1)*r*.6,base=h*.85;strokeLine(c,ax,base,ax-8*unit,base-r*build);strokeLine(c,ax,base,ax+8*unit,base-r*.7*build);}if(own.healed>0&&elapsed>=profile.impact){strokeLine(c,x-r*.3,y,x+r*.3,y);strokeLine(c,x,y-r*.3,x,y+r*.3);}}
  else if(mode==='recovery'){travelGlyph(c,form,x,y,r*build,sign);strokeRing(c,x,h*.85,r*(.5+.5*build));}
  else if(mode==='charge'){for(let j=0;j<4;j++)c.fillRect(x-r+j*r*.5,y+r*.5-build*r*(j+1)/4,r*.3,r*.5+build*r*(j+1)/4);}
 }
 if(path.projectile&&path.phase==='windup'){
  const q=smooth(elapsed/Math.max(1,profile.anticipation));c.globalAlpha=path.alpha;strokeRing(c,x+sign*r,y,r*(.2+.6*q));if(mode==='epic'||mode==='signature')travelGlyph(c,form,x+sign*r,y,r*.5*q,sign);
 }
 if(path.projectile&&path.phase!=='windup'&&path.alpha>0){
  // Three-node ribbon follows the actual path; no random emitter or unbounded particles.
  c.globalAlpha=path.alpha*.5;c.lineWidth=(mode==='ground'?7:mode==='epic'?5:3)*unit;c.beginPath();
  for(let j=2;j>=0;j--){const age=Math.max(0,elapsed-j*30);const tail=travelSample(last,i,age,h,false,anchors,this.trail);if(j===2)c.moveTo(tail.x,tail.y);else c.lineTo(tail.x,tail.y);}c.stroke();
  c.globalAlpha=path.alpha;c.lineWidth=2.5*unit;c.save();c.translate(path.x,path.y);c.rotate(path.rotation);
  if(mode==='melee'){c.fillStyle='#efffcf';c.fillRect(-10*unit,-7*unit,20*unit,14*unit);strokeLine(c,-sign*24*unit,0,0,0);}
  else if(mode==='ground'){c.beginPath();c.moveTo(-sign*r,r*.15);c.lineTo(sign*r,-r*.2);c.lineTo(sign*r*.7,-r*.55);c.stroke();}
  else if(mode==='candle'){c.fillRect(-r*.3,-r*.65,r*.6,r*1.3);strokeLine(c,0,-r,0,r);c.strokeStyle='#eaffca';strokeLine(c,-r*.12,-r*.5,-r*.12,r*.5);}
  else if(mode==='slash'){c.beginPath();c.arc(0,0,r,-Math.PI*.7,Math.PI*.15);c.stroke();strokeLine(c,-r*.35,r*.8,r*.6,-r*.65);}
  else if(mode==='counter'){strokeLine(c,-sign*r,0,sign*r,0);strokeLine(c,sign*r,0,sign*r*.45,-r*.4);}
  else{travelGlyph(c,form,0,0,mode==='epic'?r*1.6:r,sign);if(mode==='epic')strokeRing(c,0,0,r*.6);}
  c.restore();
 }
 if(path.projectile&&path.phase==='recovery'&&(mode==='signature'||mode==='epic')){const settle=1-smooth((elapsed-path.contactAt)/(1800-path.contactAt));c.globalAlpha=settle*.35;travelGlyph(c,form,x,y,r*settle,sign);}
 if(path.contact){const q=clamp((elapsed-path.contactAt)/TRAVEL_LIMITS.contactMs);c.globalAlpha=.8*(1-q);c.strokeStyle=hit.damage>0||hit.counter>0?'#ffe6a1':'#a3e9ff';c.lineWidth=3*unit;strokeRing(c,path.targetX,path.targetY,r*(.35+q));if(hit.blocked>0)strokeDiamond(c,path.targetX,path.targetY,r*.85);}
 c.restore();
 }
 prepareFighters(r,last,elapsed,t,h,reduced){for(let i=0;i<2;i++){
  const p=r.players[i];if(!p)continue;const key=last?.moves[i]||'market_order',incoming=last?.moves[1-i]||'market_order',options=this.motionOptions[i];options.key=key;options.lineage=p.pet.lineageId;options.damage=last?.effects[i]?.damage||0;options.victory=r.status==='won'&&r.battle.winner===i;options.reduced=reduced;options.side=i;
  const cue=last?contactCue(last,i):MOVE_PROFILES[key].impact,shift=cue-MOVE_PROFILES[key].impact,impact=impactSample(elapsed-shift,key,(last?.effects[1-i]?.damage||0)+(last?.effects[1-i]?.counter||0),reduced,this.impulses[i]);impact.spriteElapsed+=shift;
  const m=refinedMotionSample(t,impact.spriteElapsed,options,this.motion[i]),incomingShift=last?contactCue(last,1-i)-(MOVE_PROFILES[incoming]?.impact||0):0,reaction=reactionSample(elapsed-incomingShift,incoming,(last?.effects[i]?.damage||0)+(last?.effects[i]?.counter||0),reduced,this.reactions[i]),outcome=outcomeSample(r.status,r.battle?.winner,i,elapsed,reduced,this.outcomes[i]),sign=i?-1:1;this.basePoses[i]=m.pose;
  m.x+=bodyTravel(elapsed,key,incoming,i,h,reduced)+sign*reaction.x;m.y+=reaction.y;m.rotation+=sign*reaction.rotation;m.sx*=reaction.sx;m.sy*=reaction.sy;
  if(outcome.active){const q=outcome.mix;m.x=m.x*(1-q)+sign*outcome.x*q;m.y*=1-q;m.sx=m.sx*(1-q)+outcome.sx*q;m.sy=m.sy*(1-q)+outcome.sy*q;m.rotation=m.rotation*(1-q)+sign*outcome.rotation*q;if(q>0)m.pose=outcome.pose;}
  const anchor=this.anchors[i];anchor.x=(i?735:265)+m.x;anchor.chest=h*.51+m.y*Math.min(1,h/400);anchor.feet=h*.9;
 }}
 draw(t){if(!this.alive)return;if(!this.canvas.isConnected){this.stop();return;}this.raf=requestAnimationFrame(this.draw);if(globalThis.document?.hidden){this.revealAt=-Infinity;return;}if(t-this.lastPaint<1000/ANIMATION_PROFILE.targetFps||this.canvas.clientWidth<1||this.canvas.clientHeight<1)return;this.lastPaint=t;
 const c=this.ctx,w=1000,h=Math.round(w*this.canvas.clientHeight/this.canvas.clientWidth),maxWidth=Math.sqrt(ANIMATION_PROFILE.maxPixelArea*w/h),pixelWidth=Math.max(1,Math.floor(Math.min(1440,maxWidth,this.canvas.clientWidth*Math.min(globalThis.devicePixelRatio||1,2)))),scale=pixelWidth/w,pixelHeight=Math.max(1,Math.min(Math.floor(ANIMATION_PROFILE.maxPixelArea/pixelWidth),Math.floor(h*scale)));if(this.canvas.width!==pixelWidth||this.canvas.height!==pixelHeight){this.canvas.width=pixelWidth;this.canvas.height=pixelHeight;}c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,w,h);
 const reduced=motionPreference.matches;
 if(this.hero){const pet=typeof this.hero==='string'?{lineageId:this.hero}:this.hero,id=pet.lineageId,m=motionSample(t,-1,{reduced});this.halo(500,h*.87,LINEAGES[id].color,180,t);const size=Math.min(h*.92,860),feet=h*.98+m.y;if(!this.wardrobe(pet,500+m.x,feet,size,false,m))this.sprite(id,m.pose,500+m.x,feet,size,false,m,t,'hero');return;}
 const bg=asset('/arena/assets/arena.webp');if(bg.complete&&bg.naturalWidth){const cover=Math.max(w/bg.naturalWidth,h/bg.naturalHeight),sw=w/cover,sh=h/cover;c.drawImage(bg,(bg.naturalWidth-sw)/2,(bg.naturalHeight-sh)/2,sw,sh,0,0,w,h);}else{c.fillStyle='#0a151b';c.fillRect(0,0,w,h);}
 if(!this.gradient||this.gradientHeight!==h){const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#050a1488');g.addColorStop(.5,'#03081208');g.addColorStop(1,'#03081266');this.gradient=g;this.gradientHeight=h;}c.fillStyle=this.gradient;c.fillRect(0,0,w,h);
 const r=this.state;if(!r)return;const dock=this.dock,geometry=combatGeometry(this.canvas.clientWidth,this.canvas.clientHeight,dock?.offsetHeight||0,this.geometry),sceneH=geometry.height;c.save();c.translate(0,geometry.top);const last=r.battle?.log?.at(-1),elapsed=last&&Number.isFinite(this.revealAt)?t-this.revealAt:-1;
 this.prepareFighters(r,last,elapsed,t,sceneH,reduced);
 for(let i=0;i<2;i++){const p=r.players[i];if(!p)continue;const id=p.pet.lineageId,color=LINEAGES[id].color,x=i?735:265,options=this.motionOptions[i],m=this.motion[i],impact=this.impulses[i],outcome=this.outcomes[i],basePose=this.basePoses[i];c.save();c.translate(impact.x,impact.y);this.halo(x+m.x,sceneH*.85,color,100,t);
 const size=Math.min(400,sceneH*1.08)*(.80+(p.build.level||1)*.02),feet=sceneH*.9,vertical=m.y*Math.min(1,sceneH/400),dressed=this.wardrobe(p.pet,x+m.x,feet+vertical,size,i===1,m);if(!dressed){if(outcome.active&&outcome.mix>0){const q=outcome.mix;if(!this.clip(id,last?.moves[i],elapsed,x+m.x,feet+vertical,size,i===1,m,t,false,1-q))this.rigLayer(id,basePose,x+m.x,feet+vertical,size,i===1,m,1-q);this.rigLayer(id,outcome.pose,x+m.x,feet+vertical,size,i===1,m,q);}else if(!this.clip(id,last?.moves[i],elapsed,x+m.x,feet+vertical,size,i===1,m,t,options.victory))this.sprite(id,m.pose,x+m.x,feet+vertical,size,i===1,m,t,String(i));}if(last){this.effects(i,p,last,elapsed,sceneH,this.anchors);this.arcadeHit(i,p,last,elapsed,sceneH,this.anchors);}if(outcome.active&&outcome.mix>.5){c.save();c.translate(x,sceneH*.15);c.font=`italic 900 ${Math.min(26,16*geometry.scale)}px system-ui,sans-serif`;c.textAlign='center';c.lineWidth=5;c.strokeStyle='#08131c';c.fillStyle=outcome.kind==='winner'?'#efff9d':'#ced2df';const title=outcome.kind==='winner'?'★ WINNER ★':'DEFEATED';c.strokeText(title,0,0);c.fillText(title,0,0);c.restore();}c.restore();
 if(last&&elapsed>=0&&elapsed<1800){const rows=this.readouts[i]||[],q=clamp((elapsed-650)/1150);c.save();c.font=`bold ${12*geometry.scale}px ui-monospace,monospace`;c.textAlign='center';c.globalAlpha=reduced?1:Math.min(1,(1-q)*4);c.shadowColor='#000';c.shadowBlur=5;for(let n=0;n<rows.length;n++){const row=rows[n],cue=readoutCue(last,i,row.kind);if(elapsed<cue)continue;const style=damageStyle(row.kind,last.moves[1-i]),point=readoutLayout(n,rows.length,sceneH,geometry.scale,this.readoutPoint),unit=point.unit;c.save();c.translate(this.anchors[i].x+point.x,point.y-(reduced?0:ease(q)*12));c.rotate(reduced?0:style.angle);c.font=`italic 1000 ${style.size*unit}px system-ui,sans-serif`;c.lineJoin='round';c.strokeStyle='#0b1422';c.lineWidth=4*unit;c.strokeText(row.text,0,0);c.fillStyle=style.color;c.fillText(row.text,0,0);c.restore();}c.restore();}
 }
 c.restore();
 }
}
let audioContext=null,enabled=false;const voices=new Set();function stopSounds(){for(const o of voices){try{o.stop();o.disconnect();}catch{}}voices.clear();}
export function toggleSound(){enabled=!enabled;if(!enabled)stopSounds();if(enabled){audioContext||=new AudioContext();audioContext.resume();}return enabled;}
export function playSound(kind='attack'){const epic=kind===true||kind==='epic';if(!enabled||!audioContext||voices.size>=8)return;const count=Math.min(epic?4:2,8-voices.size);for(let i=0;i<count;i++){const o=audioContext.createOscillator(),g=audioContext.createGain(),at=audioContext.currentTime+i*.07;o.type='triangle';o.frequency.setValueAtTime((epic?260:kind==='guard'?180:kind==='charge'?440:380)+i*100,at);o.frequency.exponentialRampToValueAtTime(100,at+.16);g.gain.setValueAtTime(.045,at);g.gain.exponentialRampToValueAtTime(.001,at+.2);o.connect(g).connect(audioContext.destination);voices.add(o);o.start(at);o.stop(at+.21);o.onended=()=>{voices.delete(o);o.disconnect();g.disconnect();};}}
