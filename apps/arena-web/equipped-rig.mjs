import {MOVE_PROFILES} from './animation-cues.mjs';
// Presentation only. Rest coordinates match website-v5-adult-l10 at portrait Y +256.
export const EQUIPPED_RIG_ID = 'AXO_EQUIPPED_PUPPET_V1';
export const RIG_SPACE = Object.freeze({width:1024,height:1536,padding:160,ground:1207});
export const BONES = Object.freeze(['world','torso','head','upperR','foreR','grip','upperL','foreL','legL','legR']);
export const SOCKET = Object.freeze({palm:[861,772],wrist:[812,802],fingers:[[810,720],[910,720],[907,766],[863,800]]});
export const POSE_NAMES = Object.freeze(['rest','anticipation','attack','block','hit','victory','defeat']);
// Degrees, not NFT attributes. Each bone is relative to its parent in the rest pose.
const ZERO = Object.freeze({torso:0,head:0,upperR:0,foreR:0,grip:0,upperL:0,foreL:0,legL:0,legR:0,x:0,y:0});
export const POSE_FIELDS=Object.freeze(Object.keys(ZERO));
export const EQUIPPED_POSES = Object.freeze(Object.fromEntries(Object.entries({
  rest:{}, anticipation:{torso:-1.3,head:1.4,upperR:-1.8,foreR:-4.2,grip:-1.8,upperL:.66,foreL:-1.32,y:3},
  attack:{torso:1.95,head:-2.1,upperR:3,foreR:9,grip:6,upperL:1.1,foreL:1.98,legL:-1.4,legR:1.4},
  block:{torso:-1.95,head:-2.8,upperR:-5.4,foreR:-8.4,grip:5.4,upperL:-1.76,foreL:-5.28,legL:1.4,legR:-1.4,y:5},
  hit:{torso:-3.25,head:5.6,upperR:3,foreR:6,grip:3,upperL:1.1,foreL:2.2,legL:2.1,legR:-2.1,x:-5,y:6},
  victory:{torso:-1.3,head:-2.8,upperR:-7.2,foreR:-12.6,grip:4.8,upperL:-1.1,foreL:-3.52,legL:-1.4,legR:1.4,y:-3},
  defeat:{torso:-4.55,head:7.7,upperR:4.2,foreR:5.4,grip:4.8,upperL:1.32,foreL:2.64,legL:2.1,legR:-2.1,y:12},
}).map(([key,value])=>[key,Object.freeze({...ZERO,...value})])));
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const ramp=(v,a,b)=>smooth((v-a)/(b-a));
export function blendPose(a,b,mix,out={}) {mix=clamp(mix);for(const key of POSE_FIELDS)out[key]=a[key]+(b[key]-a[key])*mix;return out;}
const attackMoves=new Set(['market_order','rug_pull','pepe_breakout','exit_liquidity','lineage_a','epic']);
const defenseMoves=new Set(['diamond_hands','reversal','lineage_b']);
export const POSE_CUES=Object.freeze(Object.fromEntries(Object.entries(MOVE_PROFILES).map(([key,p])=>[key,Object.freeze([p.anticipation,p.impact,p.follow])])));
export function sampleEquippedPose({time=0,elapsed=-1,key='market_order',damage=0,hitAt=800,victory=0,defeat=0,reduced=false,study='motion',mix=1}={},out={}) {
  if(![time,elapsed,damage,hitAt,victory,defeat,mix].every(Number.isFinite)||damage<0||mix<0||mix>1||(!Object.hasOwn(EQUIPPED_POSES,study)&&study!=='motion'))throw Error('Invalid equipped pose sample.');
  blendPose(ZERO,ZERO,0,out);
  // Reduced motion keeps a still registered silhouette, including terminal outcomes.
  if(reduced&&study==='motion')return blendPose(ZERO,victory>0?EQUIPPED_POSES.victory:defeat>0?EQUIPPED_POSES.defeat:ZERO,1,out);
  if(study!=='motion')return blendPose(ZERO,EQUIPPED_POSES[study],mix,out);
  const cue=POSE_CUES[key];if(!cue)throw Error('Unknown equipped move.');
  if(elapsed>=0&&elapsed<1800){const [windup,impact,follow]=cue,target=EQUIPPED_POSES[attackMoves.has(key)?'attack':defenseMoves.has(key)?'block':'anticipation'];
    if(elapsed<windup)blendPose(ZERO,EQUIPPED_POSES.anticipation,smooth(elapsed/windup),out);
    else if(elapsed<impact)blendPose(EQUIPPED_POSES.anticipation,target,smooth((elapsed-windup)/(impact-windup)),out);
    else if(elapsed<follow)blendPose(target,target,1,out);
    else blendPose(target,ZERO,smooth((elapsed-follow)/(1800-follow)),out);
    const hit=damage>0?ramp(elapsed,hitAt-70,hitAt+50)*(1-ramp(elapsed,hitAt+120,hitAt+520)):0;
    if(hit)blendPose(out,EQUIPPED_POSES.hit,hit*.82,out);
  }
  out.head+=Math.sin(time/1000)*.45;out.foreR+=Math.sin(time/900)*.35;
  if(victory>0)blendPose(out,EQUIPPED_POSES.victory,clamp(victory),out);
  else if(defeat>0)blendPose(out,EQUIPPED_POSES.defeat,clamp(defeat),out);
  return out;
}
// Canvas affine arrays [a,b,c,d,tx,ty]. Same matrices feed CPU diagnostics and GPU.
export const IDENTITY=Object.freeze([1,0,0,1,0,0]);
export function multiply(a,b,out=new Float32Array(6)) {out[0]=a[0]*b[0]+a[2]*b[1];out[1]=a[1]*b[0]+a[3]*b[1];out[2]=a[0]*b[2]+a[2]*b[3];out[3]=a[1]*b[2]+a[3]*b[3];out[4]=a[0]*b[4]+a[2]*b[5]+a[4];out[5]=a[1]*b[4]+a[3]*b[5]+a[5];return out;}
export function point(matrix,x,y,out=[0,0]) {out[0]=matrix[0]*x+matrix[2]*y+matrix[4];out[1]=matrix[1]*x+matrix[3]*y+matrix[5];return out;}
function turn(degrees,x,y){if(degrees===0)return [...IDENTITY];const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[c,s,-s,c,x-c*x+s*y,y-s*x-c*y];}
export function poseMatrices(p,out=Array.from({length:10},()=>new Float32Array(6))) {
  if(!POSE_FIELDS.every(key=>Number.isFinite(p[key])&&Math.abs(p[key])<=40))throw Error('Pose outside authored envelope.');
  out[0].set(IDENTITY);const torso=turn(p.torso,520,953);torso[4]+=p.x;torso[5]+=p.y;out[1].set(torso);
  multiply(out[1],turn(p.head,540,738),out[2]);
  multiply(out[1],turn(p.upperR,634,742),out[3]);multiply(out[3],turn(p.foreR,756,823),out[4]);multiply(out[4],turn(p.grip,812,802),out[5]);
  multiply(out[1],turn(p.upperL,414,763),out[6]);multiply(out[6],turn(p.foreL,348,878),out[7]);
  out[8].set(turn(p.legL,337,1145));out[9].set(turn(p.legR,691,1148));return out;
}
export function skinWeights(x,y) {
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid rest coordinate.');
  const weights=new Float64Array(10),head=1-ramp(y,728,790),torso=1-ramp(y,1000,1130);
  weights[2]=head;weights[1]=(1-head)*torso;weights[0]=(1-head)*(1-torso);
  function override(amount,values){for(let i=0;i<10;i++)weights[i]*=1-amount;for(const[id,w]of values)weights[id]+=w*amount;}
  const right=ramp(x,620,780)*ramp(y,660,688)*(1-ramp(y,865,960));
  const grip=ramp(x,750,780),fore=ramp(x,680,750);override(right,[[3,(1-fore)*(1-grip)],[4,fore*(1-grip)],[5,grip]]);
  const left=ramp(x,285,330)*(1-ramp(x,410,460))*ramp(y,745,800)*(1-ramp(y,1000,1060)),elbow=ramp(y,830,915);override(left,[[6,1-elbow],[7,elbow]]);
  const leg=ramp(y,1030,1120),side=ramp(x,495,550);override(leg,[[8,1-side],[9,side]]);
  const chosen=Array.from(weights,(w,id)=>[id,w]).filter(([,w])=>w>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=chosen.reduce((n,[,w])=>n+w,0);
  return {bones:[...chosen.map(([id])=>id),0,0,0,0].slice(0,4),weights:[...chosen.map(([,w])=>w/sum),0,0,0,0].slice(0,4)};
}
export function skinPoint(x,y,matrices,binding=-1,out=[0,0]) {
  if(binding>=0)return point(matrices[binding],x,y,out);
  const {bones,weights}=skinWeights(x,y);out[0]=0;out[1]=0;
  for(let i=0;i<4;i++){const m=matrices[bones[i]],w=weights[i];out[0]+=(m[0]*x+m[2]*y+m[4])*w;out[1]+=(m[1]*x+m[3]*y+m[5])*w;}return out;
}
export function attachmentBinding(layer) {
  if(layer.kind==='scene'||layer.slot==='habitat')return 0;
  if(layer.slot==='tool'||layer.id==='fingers')return 5;
  if(['back','charm','companion'].includes(layer.slot))return 1;
  return -1;
}
export function createSkinMesh(step=32) {
  if(![16,32,64].includes(step))throw Error('Unknown mesh quality.');
  const xs=[...new Set([...Array.from({length:1024/step+1},(_,i)=>i*step),620,680,750,780])].sort((a,b)=>a-b),ys=[...new Set([...Array.from({length:1536/step+1},(_,i)=>i*step),660,688,728,790,865,960,1000,1030,1120,1130])].sort((a,b)=>a-b),vertices=[],indices=[];
  for(const y of ys)for(const x of xs){const s=skinWeights(x,y);vertices.push(x,y,x/1024,y/1536,...s.bones,...s.weights);}
  for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const a=y*xs.length+x,b=a+1,c=a+xs.length,d=c+1;indices.push(a,b,c,b,d,c);}
  return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices),stride:12,xs,ys};
}
