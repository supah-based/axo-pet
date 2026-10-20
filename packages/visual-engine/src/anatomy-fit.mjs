// Art fitting only. This module has no wallet, NFT, inventory or stat authority.
export const PORTRAIT = Object.freeze([1024, 1536]);
export const Y_OFFSET = 256;
const area = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
// A grip is a plane, not just an axis. Four corners preserve its width and camera slant.
export function projectiveMap(source, target) {
  if(source.length!==4||target.length!==4||[...source,...target].some(p=>p.length!==2||!p.every(Number.isFinite)))throw Error('A grip needs four finite corner pairs.');
  const matrix=source.flatMap(([x,y],i)=>{const[u,v]=target[i];return[[x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]];});
  for(let j=0;j<8;j++){
    let pivot=j;for(let k=j+1;k<8;k++)if(Math.abs(matrix[k][j])>Math.abs(matrix[pivot][j]))pivot=k;
    [matrix[j],matrix[pivot]]=[matrix[pivot],matrix[j]];const d=matrix[j][j];if(Math.abs(d)<1e-10)throw Error('Degenerate grip plane.');
    for(let n=j;n<9;n++)matrix[j][n]/=d;
    for(let k=0;k<8;k++)if(k!==j){const f=matrix[k][j];for(let n=j;n<9;n++)matrix[k][n]-=f*matrix[j][n];}
  }
  const h=matrix.map(row=>row[8]);return([x,y])=>{const d=h[6]*x+h[7]*y+1;if(Math.abs(d)<1e-8)throw Error('Grip plane crosses the camera horizon.');return[(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];};
}
export function triangulate(points, target = points) {
  if (points.length < 3) throw new Error('A surface needs at least three vertices.');
  const sign = Math.sign(points.reduce((s,p,i) => s+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0));
  const indices = points.map((_,i)=>i), triangles=[];
  const inside=(p,a,b,c)=>[area(a,b,p),area(b,c,p),area(c,a,p)].every(v=>v*sign>=-1e-7);
  while(indices.length>3) {
    let found=false;
    for(let j=0;j<indices.length;j++) {
      const a=indices[(j+indices.length-1)%indices.length],b=indices[j],c=indices[(j+1)%indices.length];
      if(area(points[a],points[b],points[c])*sign<=1e-6 || area(target[a],target[b],target[c])*sign<=1e-6) continue;
      if(indices.some(i=>i!==a&&i!==b&&i!==c&&inside(points[i],points[a],points[b],points[c]))) continue;
      if(indices.some(i=>i!==a&&i!==b&&i!==c&&inside(target[i],target[a],target[b],target[c]))) continue;
      triangles.push([a,b,c]);indices.splice(j,1);found=true;break;
    }
    if(!found) throw new Error('Surface polygon is crossed or degenerate.');
  }
  triangles.push(indices);return triangles;
}
export function bindVertex(position, source, rig, group) {
  const nearest=group.map(id=>({id,d:Math.hypot(position[0]-rig.anchors[id][0],position[1]-rig.anchors[id][1])})).sort((a,b)=>a.d-b.d).slice(0,3);
  const sum=nearest.reduce((n,p)=>n+1/Math.max(4,p.d)**2,0);
  return {source,position,weights:nearest.map(p=>[p.id,(1/Math.max(4,p.d)**2)/sum])};
}
export function validateProfile(catalog, profile={}) {
  if(catalog.schema!=='AXO_ANATOMY_COLLECTION_V3'||catalog.status!=='CANDIDATE'||catalog.canvas?.join(',')!=='1024,1536') throw new Error('Unsupported portrait fitting collection.');
  if(Object.keys(profile).some(k=>!['schema','poseId','rigSha256','anchors','items'].includes(k))) throw new Error('Unknown fit profile field.');
  if(profile.schema && profile.schema!=='AXO_FIT_PROFILE_V3') throw new Error('Unknown fit profile version.');
  if(profile.poseId && profile.poseId!==catalog.rig.poseId) throw new Error('Fit profile pose mismatch.');
  if(profile.rigSha256 && profile.rigSha256!==catalog.rigSha256) throw new Error('Fit profile rig mismatch.');
  for(const [id,p] of Object.entries(profile.anchors||{})) {
    if(!catalog.rig.anchors[id]||!Array.isArray(p)||p.length!==2||!p.every(n=>Number.isFinite(n)&&n>=0&&n<=1024)) throw new Error('Invalid anatomical anchor.');
    if(Math.hypot(p[0]-catalog.rig.anchors[id][0],p[1]-catalog.rig.anchors[id][1])>64) throw new Error('Anchor exceeds the calibrated pose envelope.');
  }
  for(const [id,t] of Object.entries(profile.items||{})) {
    if(!catalog.items.some(i=>i.id===id)||Object.keys(t).some(k=>!['dx','dy','scale','rotation'].includes(k))||!Number.isFinite(t.dx)||!Number.isFinite(t.dy)||Math.abs(t.dx)>64||Math.abs(t.dy)>64||!Number.isFinite(t.scale)||t.scale<.8||t.scale>1.2||!Number.isFinite(t.rotation??0)||Math.abs(t.rotation??0)>30) throw new Error('Invalid item fit adjustment.');
  }
  return true;
}
export function resolveProfile(catalog,profile={}) {
  validateProfile(catalog,profile);validateProfile(catalog,catalog.defaultProfile||{});
  return {...profile,anchors:{...structuredClone(catalog.defaultProfile?.anchors||{}),...profile.anchors},items:{...structuredClone(catalog.defaultProfile?.items||{}),...profile.items}};
}
export function resolveVertices(part, rig, profile={}, itemId) {
  const t=profile.items?.[itemId]||{dx:0,dy:0,scale:1}, pivot=part.pivot||[512,512];
  const angle=(t.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return part.vertices.map(v=>{
    const p=[...v.position];
    for(const [id,w] of v.weights) {const a=profile.anchors?.[id]||rig.anchors[id],b=rig.anchors[id];p[0]+=(a[0]-b[0])*w;p[1]+=(a[1]-b[1])*w;}
    const x=(p[0]-pivot[0])*t.scale,y=(p[1]-pivot[1])*t.scale;
    return [pivot[0]+x*cos-y*sin+t.dx,pivot[1]+x*sin+y*cos+t.dy+Y_OFFSET];
  });
}
export function assertMesh(part, targets) {
  for(const indices of part.triangles) {
    const s=indices.map(i=>part.vertices[i].source),d=indices.map(i=>targets[i]);
    if(Math.abs(area(...d))<.2 || Math.sign(area(...s))!==Math.sign(area(...d))) throw new Error(`Fit folds ${part.id} triangle ${indices.join(',')}; reduce this adjustment.`);
    if(d.some(p=>!p.every(Number.isFinite))) throw new Error('Fit contains an invalid coordinate.');
  }
}
export function fitPlan(catalog,lineage,selection,profile={},sceneId=null,appearance=true) {
  profile=resolveProfile(catalog,profile);
  const base=catalog.lineages.find(b=>b.id===lineage);if(!base) throw new Error('Unknown canonical Pet reference.');
  const shown=appearance?(base.styled||base):base;
  const selected=Object.entries(selection).filter(([,id])=>id).map(([slot,id])=>{const item=catalog.items.find(i=>i.id===id);if(!item||item.slot!==slot) throw new Error('Unknown or mismatched fitted item.');return item;});
  const covered=selected.find(i=>i.slot==='body'&&i.occlusion==='SLEEVED_TOP_V1');
  if(selected.some(i=>i.occlusion&&i.occlusion!=='SLEEVED_TOP_V1'))throw new Error('Unknown garment foreground policy.');
  if(covered&&(!shown.head||!shown.hands))throw new Error('Covered top foreground unavailable.');
  const garment=(item,parts,src,depth='front')=>{if(!src)throw new Error('Required garment depth surface unavailable.');return{kind:'garment',slot:item.slot,id:item.id,src,depth,parts:parts.map(part=>{const targets=resolveVertices(part,catalog.rig,profile,item.id);assertMesh(part,targets);return{...part,targets};})};};
  const layers=[];
  if(sceneId){const scene=catalog.scenes?.find(s=>s.id===sceneId);if(!scene)throw new Error('Unknown portrait scene.');layers.push({kind:'scene',id:scene.id,src:scene.asset});}
  for(const slot of ['habitat','back','head'])for(const item of selected.filter(i=>i.slot===slot&&i.parts.some(p=>p.depth==='rear')))layers.push(garment(item,item.parts.filter(p=>p.depth==='rear'),item.wearable.rear?.asset,'rear'));
  layers.push({kind:'pet',src:selected.some(i=>i.slot==='footwear')?shown.closedFeet.asset:shown.asset,id:base.id});
  for(const slot of ['footwear','pants','body','face','head','tool','charm','companion','habitat','back']) {
    for(const item of selected.filter(i=>i.slot===slot))layers.push(garment(item,item.parts.filter(p=>p.depth!=='rear'),item.wearable.asset));
    if(slot==='body'&&covered)layers.push({kind:'foreground',id:'covered-head',src:shown.head.asset});
    if(slot==='head'&&selected.some(i=>['head','face'].includes(i.slot))){if(!shown.gills)throw new Error('Headwear gill foreground unavailable.');layers.push({kind:'foreground',id:'gills',src:shown.gills.asset});}
  }
  if(covered)layers.push({kind:'foreground',id:'hands',src:shown.hands.asset});
  else if(selected.some(i=>['body','pants'].includes(i.slot))) layers.push({kind:'foreground',id:'arm',src:shown.arm.asset});
  if(selected.some(i=>i.slot==='tool')) layers.push({kind:'foreground',id:'fingers',src:shown.fingers.asset});
  return layers;
}
export function exportProfile(catalog,profile) {
  profile=resolveProfile(catalog,profile);
  return {schema:'AXO_FIT_PROFILE_V3',poseId:catalog.rig.poseId,rigSha256:catalog.rigSha256,anchors:structuredClone(profile.anchors||{}),items:structuredClone(profile.items||{})};
}
export function headPattern(rig,profile,type) {
  if(!['cap','crown','hood'].includes(type))throw new Error('Unknown head fitting pattern.');
  const p=id=>profile.anchors?.[id]||rig.anchors[id],L=p('templeL'),R=p('templeR'),T=p('skullTop'),UL=p('skullUpperL'),UR=p('skullUpperR'),JL=p('jawL'),JR=p('jawR'),NL=p('hoodNeckL'),NR=p('hoodNeckR');
  let rear,front;
  if(type==='cap'){
    rear=`M${L[0]-3} ${L[1]-42}C${L[0]-9} ${L[1]-101} ${UL[0]+18} ${T[1]-15} ${T[0]-6} ${T[1]-15}C${UR[0]+40} ${T[1]-14} ${R[0]-7} ${R[1]-118} ${R[0]+8} ${R[1]-42}Q${T[0]+23} ${R[1]-5} ${L[0]-3} ${L[1]-42}Z`;
    front=`M${L[0]-2} ${L[1]-42}Q${T[0]+5} ${R[1]} ${R[0]+8} ${R[1]-42}L${R[0]+59} ${R[1]-21}Q${UR[0]+36} ${R[1]+6} ${T[0]+4} ${R[1]-7}L${L[0]+3} ${L[1]-28}Z`;
  }else if(type==='crown'){
    rear=`M${UL[0]-5} ${UL[1]+11}L${UL[0]+5} ${T[1]-36}L${T[0]-74} ${T[1]+17}L${T[0]-10} ${T[1]-66}L${T[0]+47} ${T[1]+14}L${UR[0]-12} ${T[1]-46}L${UR[0]+13} ${UR[1]+14}Q${T[0]+3} ${T[1]+9} ${UL[0]-5} ${UL[1]+11}Z`;
    front=`M${UL[0]-5} ${UL[1]+11}Q${T[0]-6} ${T[1]+79} ${UR[0]+13} ${UR[1]+14}L${UR[0]+14} ${UR[1]+46}Q${T[0]+2} ${T[1]+114} ${UL[0]-6} ${UL[1]+44}Z`;
  }else{
    rear=`M${L[0]-52} ${L[1]+30}C${L[0]-70} ${UL[1]+25} ${UL[0]-26} ${T[1]-42} ${T[0]-8} ${T[1]-43}C${UR[0]+30} ${T[1]-39} ${R[0]+58} ${UR[1]+26} ${R[0]+60} ${R[1]+34}L${R[0]+37} ${JR[1]+41}L${JR[0]-26} ${JR[1]+82}L${NR[0]+4} ${NR[1]+71}L${NL[0]-13} ${NL[1]+64}L${JL[0]-35} ${JL[1]+56}L${L[0]-55} ${JL[1]+18}Z`;
    front=`M${L[0]-26} ${L[1]+3}C${L[0]-38} ${JL[1]-45} ${JL[0]-40} ${JL[1]+32} ${NL[0]-4} ${NL[1]+6}L${NL[0]} ${NL[1]+32}Q${JL[0]-68} ${JL[1]+46} ${L[0]-45} ${JL[1]-16}ZM${R[0]+19} ${R[1]+6}C${R[0]+44} ${JR[1]-47} ${JR[0]+32} ${JR[1]+25} ${NR[0]+38} ${NR[1]+10}L${NR[0]+11} ${NR[1]+42}Q${JR[0]+45} ${JR[1]+57} ${R[0]+45} ${JR[1]-22}Z`;
  }
  return{rear,front,keepouts:['gillRootLT','gillRootLM','gillRootLB','gillRootRT','gillRootRM','gillRootRB'].map(id=>{const[x,y]=p(id);return{anchor:id,cx:x,cy:y,rx:18,ry:23};})};
}
export async function drawFitted(canvas,catalog,lineage,selection,load,profile={},sceneId=null,appearance=true) {
  profile=resolveProfile(catalog,profile);
  const plan=fitPlan(catalog,lineage,selection,profile,sceneId,appearance);
  const edited=l=>{if(l.kind!=='garment')return false;const t=profile.items[l.id]||{dx:0,dy:0,scale:1,rotation:0},base=catalog.defaultProfile?.items?.[l.id]||{dx:0,dy:0,scale:1,rotation:0};return ['dx','dy','scale','rotation'].some(k=>(t[k]??0)!==(base[k]??0))||l.parts.some(p=>p.vertices.some(v=>v.weights.some(([id])=>profile.anchors[id]&&profile.anchors[id].some((n,k)=>n!==catalog.rig.anchors[id][k]))));};
  const sources=[...new Set(plan.flatMap(l=>edited(l)?l.parts.map(p=>p.texture):[l.src]))];
  const images=new Map(await Promise.all(sources.map(async s=>[s,await load(s)])));
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,...PORTRAIT);
  for(const layer of plan) {
    if(!edited(layer)){ctx.drawImage(images.get(layer.src),0,0);continue;}
    for(const part of layer.parts) for(const indices of part.triangles) {
      const [s0,s1,s2]=indices.map(i=>part.vertices[i].source),[d0,d1,d2]=indices.map(i=>part.targets[i]);
      const det=area(s0,s1,s2), u=[s1[0]-s0[0],s1[1]-s0[1]],v=[s2[0]-s0[0],s2[1]-s0[1]];
      const a=((d1[0]-d0[0])*v[1]-(d2[0]-d0[0])*u[1])/det,b=((d1[1]-d0[1])*v[1]-(d2[1]-d0[1])*u[1])/det;
      const c=(u[0]*(d2[0]-d0[0])-v[0]*(d1[0]-d0[0]))/det,d=(u[0]*(d2[1]-d0[1])-v[0]*(d1[1]-d0[1]))/det;
      ctx.save();ctx.beginPath();ctx.moveTo(...d0);ctx.lineTo(...d1);ctx.lineTo(...d2);ctx.closePath();ctx.clip();ctx.setTransform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);ctx.drawImage(images.get(part.texture),0,0);ctx.restore();
    }
  }
  return plan;
}
export async function drawItemPortrait(canvas,catalog,itemId,load,sceneId=null){
  const item=catalog.items.find(i=>i.id===itemId);if(!item)throw new Error('Unknown item portrait.');
  const scene=sceneId?catalog.scenes?.find(s=>s.id===sceneId):null;if(sceneId&&!scene)throw new Error('Unknown portrait scene.');
  const sources=[...(scene?[scene.asset]:[]),item.itemArt.asset],images=await Promise.all(sources.map(load)),ctx=canvas.getContext('2d');ctx.clearRect(0,0,...PORTRAIT);images.forEach(i=>ctx.drawImage(i,0,0));
}
// Deterministic build-time UV rasterizer: one source sample per target pixel.
export function rasterize(parts,textures,rig,profile={},itemId) {
  const out=new Uint8Array(1024*1536*4);
  for(const part of parts) {
    const target=resolveVertices(part,rig,profile,itemId),tex=textures.get(part.texture);assertMesh(part,target);
    for(const ids of part.triangles) {
      const [a,b,c]=ids.map(i=>target[i]),source=ids.map(i=>part.vertices[i].source),den=area(a,b,c);
      for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<Math.min(1536,Math.ceil(Math.max(a[1],b[1],c[1])));y++) for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<Math.min(1024,Math.ceil(Math.max(a[0],b[0],c[0])));x++) {
        const p=[x+.5,y+.5],w0=area(b,c,p)/den,w1=area(c,a,p)/den,w2=1-w0-w1;if(Math.min(w0,w1,w2)<-1e-6)continue;
        const u=source[0][0]*w0+source[1][0]*w1+source[2][0]*w2,v=source[0][1]*w0+source[1][1]*w1+source[2][1]*w2;
        const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;if(ix<0||iy<0||ix+1>=tex.width||iy+1>=tex.height)continue;
        const values=[0,0,0,0];for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]) {const i=((iy+dy)*tex.width+ix+dx)*4;for(let ch=0;ch<4;ch++)values[ch]+=tex.data[i+ch]*w;}
        const offset=(y*1024+x)*4,alpha=values[3]/255,old=out[offset+3]/255,combined=alpha+old*(1-alpha);for(let ch=0;ch<3;ch++)out[offset+ch]=combined?Math.round((values[ch]*alpha+out[offset+ch]*old*(1-alpha))/combined):0;out[offset+3]=Math.round(combined*255);
      }
    }
  }
  return out;
}
