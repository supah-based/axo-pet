import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {POSE_NAMES,EQUIPPED_POSES,POSE_CUES,SOCKET,IDENTITY,point,skinPoint,skinWeights,poseMatrices,createSkinMesh,sampleEquippedPose,blendPose,attachmentBinding} from '../equipped-rig.mjs';
import {CANONICAL_POSE_HASHES,canonicalPoseEligible,canonicalActorKey} from '../equipped-canonical.mjs';
import {fitPlan} from '../atelier/model.mjs';
const publicRoot=new URL('../../hatchery-web/public/',import.meta.url),catalog=JSON.parse(readFileSync(new URL('gear-bazaar/v1/catalog.json',publicRoot)));
const area=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

test('all authored poses articulate distinct head/arm joints and preserve the exact grip/finger plane',()=>{
  const palms=[];
  for(const name of POSE_NAMES){const pose=sampleEquippedPose({study:name}),matrices=poseMatrices(pose);palms.push(point(matrices[5],...SOCKET.palm));
    for(const x of [795,810,850,900,930])for(const y of [690,720,772,830,860]){
      const hand=skinPoint(x,y,matrices),tool=skinPoint(x,y,matrices,5);assert.ok(Math.hypot(hand[0]-tool[0],hand[1]-tool[1])<.00001,name+' split grip');
    }
    const m=matrices[5];assert.ok(Math.abs(m[0]*m[3]-m[1]*m[2]-1)<1e-5,'Rigid tool/fingers must not stretch or mirror');
  }
  assert.equal(new Set(palms.map(p=>p.map(n=>n.toFixed(2)).join(','))).size,POSE_NAMES.length);
  assert.ok(Math.abs(palms[POSE_NAMES.indexOf('attack')][1]-palms[POSE_NAMES.indexOf('victory')][1])>50);
});

test('rest is identity and every rest vertex has bounded normalized bone weights',()=>{
  const matrices=poseMatrices(EQUIPPED_POSES.rest),mesh=createSkinMesh();
  for(const matrix of matrices)assert.deepEqual(Array.from(matrix),IDENTITY);
  for(let i=0;i<mesh.vertices.length;i+=12){const x=mesh.vertices[i],y=mesh.vertices[i+1],s=skinWeights(x,y);assert.ok(s.weights.every(w=>w>=0&&w<=1));assert.ok(Math.abs(s.weights.reduce((a,b)=>a+b)-1)<1e-6);const p=skinPoint(x,y,matrices);assert.ok(Math.hypot(p[0]-x,p[1]-y)<1e-8);}
  assert.ok(mesh.vertices.length/12<65536);assert.ok(mesh.indices.every(i=>i<mesh.vertices.length/12));
});

test('all move/receipt/outcome blends remain finite and do not mutate combat inputs',()=>{
  const input=Object.freeze({key:'market_order',damage:17,victory:0,hitAt:620}),before=JSON.stringify(input);
  for(const key of Object.keys(POSE_CUES))for(const damage of [0,17])for(let elapsed=-1;elapsed<=2000;elapsed+=20){const pose=sampleEquippedPose({...input,key,damage,elapsed,time:2000+elapsed}),m=poseMatrices(pose);assert.ok(m.flatMap(matrix=>Array.from(matrix)).every(Number.isFinite));}
  assert.equal(JSON.stringify(input),before);
  for(const key of Object.keys(POSE_CUES))for(const at of [0,...POSE_CUES[key],1800]){const a=sampleEquippedPose({key,elapsed:at-.001,time:1000}),b=sampleEquippedPose({key,elapsed:at+.001,time:1000});for(const k of Object.keys(a))assert.ok(Math.abs(a[k]-b[k])<.001,key+' discontinuity at '+at);}
});

test('reduced clips are still; explicit static pose studies remain inspectable without animation',()=>{
  for(const key of Object.keys(POSE_CUES))for(const elapsed of [0,500,1000,1800])assert.deepEqual(sampleEquippedPose({key,elapsed,reduced:true}),EQUIPPED_POSES.rest);
  assert.deepEqual(sampleEquippedPose({study:'block',reduced:true}),EQUIPPED_POSES.block);
  assert.deepEqual(sampleEquippedPose({victory:1,reduced:true}),EQUIPPED_POSES.victory);
  assert.deepEqual(sampleEquippedPose({study:'victory',mix:0}),EQUIPPED_POSES.rest);
  for(const options of [{elapsed:Infinity},{study:'mint'},{mix:2},{damage:-1},{key:'invented'}])assert.throws(()=>sampleEquippedPose(options));
});

test('all 43 families and covered tops preserve depth order and exact handheld attachment policy',()=>{
  for(const base of catalog.lineages)for(const item of catalog.items){const plan=fitPlan(catalog,base.id,{[item.slot]:item.id}),layers=plan.map(layer=>({...layer,binding:attachmentBinding(layer)}));
    if(item.slot==='tool'){assert.equal(layers.at(-1).id,'fingers');assert.equal(layers.at(-1).binding,5);assert.ok(layers.filter(l=>l.slot==='tool').every(l=>l.binding===5));}
    if(item.occlusion==='SLEEVED_TOP_V1'){assert.ok(layers.some(l=>l.id==='covered-head'&&l.binding===-1));assert.ok(layers.some(l=>l.id==='hands'&&l.binding===-1));}
    if(item.slot==='habitat')assert.ok(layers.filter(l=>l.slot==='habitat').every(l=>l.binding===0));
  }
});

test('canonical rig is restricted to the exact six verified adult rest paintings',()=>{
  for(const base of catalog.lineages){assert.equal(CANONICAL_POSE_HASHES[base.id],base.originalSha256);const pet={identitySource:'AUTHENTICATED_PET_READ_V1',level:10,lineageId:base.id},layers=[{slot:'pet',url:'/canonical.webp',sha256:base.originalSha256}];
    assert.equal(canonicalPoseEligible(pet,layers),true);assert.equal(canonicalPoseEligible({...pet,level:9},layers),false);assert.equal(canonicalPoseEligible({...pet,identitySource:'CANDIDATE'},layers),false);assert.equal(canonicalActorKey(pet,[{...layers[0],sha256:'0'.repeat(64)}]),null);
  }
});

test('the alpha-bearing body, clothing and foreground mesh never folds through authored transitions',async()=>{
  // Union is conservative: every candidate body/leg/head surface and all six original
  // and material bases. Transparent gaps may cross; no visible surface may invert.
  const paths=new Set(catalog.lineages.flatMap(base=>[base.asset,base.styled.asset,...['arm','gills','head','hands'].flatMap(key=>[base[key].asset,base.styled[key].asset]) ]));
  for(const item of catalog.items)if(attachmentBinding({slot:item.slot})===-1)paths.add(item.wearable.asset);
  const mask=new Uint8Array(1024*1536);
  for(const path of paths){const {data,info}=await sharp(fileURLToPath(new URL(path.slice(1),publicRoot))).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1024);assert.equal(info.height,1536);for(let i=0;i<mask.length;i++)if(data[i*4+3]>16)mask[i]=1;}
  const mesh=createSkinMesh(),count=mesh.vertices.length/12,active=[];
  for(let i=0;i<mesh.indices.length;i+=3){const ids=Array.from(mesh.indices.slice(i,i+3)),s=ids.map(id=>[mesh.vertices[id*12],mesh.vertices[id*12+1]]);let visible=false;
    for(let y=Math.floor(Math.min(...s.map(p=>p[1])));!visible&&y<Math.max(...s.map(p=>p[1]));y++)for(let x=Math.floor(Math.min(...s.map(p=>p[0])));x<Math.max(...s.map(p=>p[0]));x++){const p=[x+.5,y+.5];if(mask[y*1024+x]&&area(s[0],s[1],p)>=0&&area(s[1],s[2],p)>=0&&area(s[2],s[0],p)>=0){visible=true;break;}}
    if(visible)active.push({ids,rest:area(...s),source:s});
  }
  assert.ok(active.length>500);const samples=[];
  for(const a of Object.values(EQUIPPED_POSES))for(const b of Object.values(EQUIPPED_POSES))for(const mix of [0,.25,.5,.75,1])samples.push(blendPose(a,b,mix));
  for(const key of Object.keys(POSE_CUES))for(const elapsed of [0,150,400,650,800,1000,1200,1500,1799])samples.push(sampleEquippedPose({key,elapsed,time:elapsed+700,damage:17,hitAt:POSE_CUES[key][1]}));
  for(const pose of samples){const matrices=poseMatrices(pose),p=Array.from({length:count},()=>[0,0]);
    for(let i=0;i<count;i++){const o=i*12,x=mesh.vertices[o],y=mesh.vertices[o+1];for(let j=0;j<4;j++){const m=matrices[mesh.vertices[o+4+j]],w=mesh.vertices[o+8+j];p[i][0]+=(m[0]*x+m[2]*y+m[4])*w;p[i][1]+=(m[1]*x+m[3]*y+m[5])*w;}}
    for(const triangle of active)assert.ok(area(...triangle.ids.map(id=>p[id]))/triangle.rest>.05,'Visible cloth folds near '+JSON.stringify(triangle.source));
  }
});
