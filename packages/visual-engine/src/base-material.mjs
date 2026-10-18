// Build-time UV registration only: preserve one fixed pose/alpha, bake generated skin into it.
export function materialCoordinates(target,source,x,y){
  const keys=Object.keys(target);if(keys.some(k=>!source[k]))throw Error('Incomplete base material registration.');
  const nearest=keys.map(k=>({d:(target[k][0]-x)**2+(target[k][1]-y)**2,k})).sort((a,b)=>a.d-b.d).slice(0,6);
  if(nearest[0].d<1e-8)return source[nearest[0].k];
  let dx=0,dy=0,sum=0;for(const{d,k}of nearest){const w=1/Math.max(1,d)**1.5;sum+=w;dx+=(source[k][0]-target[k][0])*w;dy+=(source[k][1]-target[k][1])*w;}return[x+dx/sum,y+dy/sum];
}
export function registerBaseMaterial(reference,texture,target,source,width=1024,height=1536,edgeTint=null){
  if(reference.length!==width*height*4||texture.length!==reference.length)throw Error('Base material dimensions differ.');
  // Bleed source edge color into transparency so UV resampling cannot introduce black fringes.
  const colors=new Uint8Array(texture),visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let read=0,write=0;
  for(let p=0;p<visited.length;p++)if(colors[p*4+3]>96){visited[p]=1;queue[write++]=p;}
  if(!write)throw Error('Empty base material.');
  while(read<write){const p=queue[read++],x=p%width,y=Math.floor(p/width);for(const q of[x? p-1:-1,x+1<width?p+1:-1,y?p-width:-1,y+1<height?p+width:-1])if(q>=0&&!visited[q]){visited[q]=1;for(let c=0;c<3;c++)colors[q*4+c]=colors[p*4+c];queue[write++]=q;}}
  const step=16,cols=Math.ceil(width/step)+1,rows=Math.ceil(height/step)+1,field=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)field.push(materialCoordinates(target,source,x*step,y*step));
  const out=new Uint8Array(reference.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;if(!reference[p+3])continue;const gx=Math.floor(x/step),gy=Math.floor(y/step),fx=x/step-gx,fy=y/step-gy,points=[field[gy*cols+gx],field[gy*cols+gx+1],field[(gy+1)*cols+gx],field[(gy+1)*cols+gx+1]],weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];let u=0,v=0;for(let i=0;i<4;i++){u+=points[i][0]*weights[i];v+=points[i][1]*weights[i];}u=Math.max(0,Math.min(width-1.001,u));v=Math.max(0,Math.min(height-1.001,v));const ix=Math.floor(u),iy=Math.floor(v),tx=u-ix,ty=v-iy;for(let c=0;c<3;c++)out[p+c]=Math.round(colors[(iy*width+ix)*4+c]*(1-tx)*(1-ty)+colors[(iy*width+ix+1)*4+c]*tx*(1-ty)+colors[((iy+1)*width+ix)*4+c]*(1-tx)*ty+colors[((iy+1)*width+ix+1)*4+c]*tx*ty);out[p+3]=reference[p+3];
  }
  if(edgeTint){
    // Keep original contour shading: generated source silhouettes are not fitting authority.
    const distance=new Uint16Array(width*height);for(let p=0;p<distance.length;p++)distance[p]=reference[p*4+3]>128?6553:0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*width+x;distance[p]=Math.min(distance[p],x?distance[p-1]+1:0,y?distance[p-width]+1:0);}
    for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){const p=y*width+x;distance[p]=Math.min(distance[p],x+1<width?distance[p+1]+1:0,y+1<height?distance[p+width]+1:0);}
    for(let p=0;p<distance.length;p++)if(reference[p*4+3]){const t=Math.max(0,Math.min(1,(distance[p]-2)/28)),w=t*t*(3-2*t);for(let c=0;c<3;c++)out[p*4+c]=Math.round(Math.min(255,(reference[p*4]*.2126+reference[p*4+1]*.7152+reference[p*4+2]*.0722)*edgeTint[c])*(1-w)+out[p*4+c]*w);}
  }return out;
}
