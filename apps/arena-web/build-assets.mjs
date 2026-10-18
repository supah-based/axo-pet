import sharp from 'sharp';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LINEAGES} from './catalog.mjs';
const manifest={model:'openai/gpt-image-2',revision:1,frames:['idle','breathe','windup','attack','defense','hit','epic','victory'],atlases:{}};
for(const id of Object.keys(LINEAGES)){
 const white=existsSync(`assets/source/${id}-white.png`),file=`assets/source/${id}${white?'-white':''}.png`,{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),w=info.width,h=info.height,seen=new Uint8Array(w*h),q=new Int32Array(w*h);let start=0,end=0;
 // Key the actual blue background hue, not all dark pixels: black clothing stays opaque.
 const add=p=>{if(p<0||p>=w*h||seen[p])return;const r=data[p*4],g=data[p*4+1],b=data[p*4+2];const background=white?Math.min(r,g,b)>235:Math.max(r,g,b)<36&&b>g+3&&b>r+5;if(!background)return;seen[p]=1;q[end++]=p;};
 for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
 while(start<end){const p=q[start++];data[p*4+3]=0;if(p%w)add(p-1);if(p%w<w-1)add(p+1);add(p-w);add(p+w);}
 // Drop disconnected keying specks so they cannot move a frame's foot anchor.
 const foreground=new Uint8Array(w*h);for(let p=0;p<w*h;p++){if(!data[p*4+3]||foreground[p])continue;let a=0,b=1;q[0]=p;foreground[p]=1;while(a<b){const v=q[a++];for(const n of [v%w?v-1:-1,v%w<w-1?v+1:-1,v-w,v+w])if(n>=0&&n<w*h&&!foreground[n]&&data[n*4+3]){foreground[n]=1;q[b++]=n;}}if(b<48)for(let i=0;i<b;i++)data[q[i]*4+3]=0;}
 const composite=[],rects=[];
 for(let row=0;row<2;row++){
  const top=row*h/2,counts=Array.from({length:w},(_,x)=>{let n=0;for(let y=top;y<top+h/2;y++)if(data[(y*w+x)*4+3])n++;return n;});
  const boundaries=[0];for(let k=1;k<4;k++){const target=w*k/4,options=Array.from({length:221},(_,i)=>Math.round(target)-110+i);options.sort((a,b)=>counts[a]-counts[b]||Math.abs(a-target)-Math.abs(b-target));boundaries.push(options[0]);}boundaries.push(w);
  for(let col=0;col<4;col++){
   let minX=w,maxX=0,minY=h,maxY=0;for(let y=top;y<top+h/2;y++)for(let x=boundaries[col];x<boundaries[col+1];x++)if(data[(y*w+x)*4+3]){minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);maxY=Math.max(y,maxY);}
   const rect={left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1};rects.push(rect);const scale=Math.min(1,470/rect.width,440/rect.height),fw=Math.round(rect.width*scale),fh=Math.round(rect.height*scale);
   const input=await sharp(data,{raw:info}).extract(rect).resize(fw,fh).png().toBuffer();composite.push({input,left:col*512+Math.round((512-fw)/2),top:row*512+470-fh});
  }
 }
 const dest=`assets/runtime/${id}.webp`;await sharp({create:{width:2048,height:1024,channels:4,background:'#00000000'}}).composite(composite).webp({quality:90,alphaQuality:100}).toFile(dest);
 const bytes=readFileSync(dest);manifest.atlases[id]={url:`assets/${id}.webp`,width:2048,height:1024,columns:4,rows:2,frameWidth:512,frameHeight:512,sourceRects:rects,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,sourceSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),transparentPixels:end};
}
if(existsSync('assets/source/arena.png'))await sharp('assets/source/arena.png').resize(1536,1024).webp({quality:88}).toFile('assets/runtime/arena.webp');
writeFileSync('assets/runtime/manifest.json',JSON.stringify(manifest,null,2));console.log('Packed six 8-frame alpha atlases.');
