import {RIG_SPACE,POSE_FIELDS,attachmentBinding,createSkinMesh,poseMatrices} from './equipped-rig.mjs';
const VERTEX=`attribute vec2 a_rest;attribute vec2 a_uv;attribute vec4 a_bones;attribute vec4 a_weights;
uniform mat3 u_bones[10];uniform int u_binding;uniform vec2 u_extent;uniform float u_padding;varying vec2 v_uv;
void main(){vec3 p=vec3(a_rest,1.0);vec3 q;
 if(u_binding>=0)q=u_bones[u_binding]*p;
 else q=(u_bones[int(a_bones.x)]*p)*a_weights.x+(u_bones[int(a_bones.y)]*p)*a_weights.y+(u_bones[int(a_bones.z)]*p)*a_weights.z+(u_bones[int(a_bones.w)]*p)*a_weights.w;
 vec2 screen=(q.xy+vec2(u_padding))/u_extent;gl_Position=vec4(screen.x*2.0-1.0,1.0-screen.y*2.0,0.0,1.0);v_uv=a_uv;}`;
const FRAGMENT=`precision mediump float;uniform sampler2D u_texture;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_texture,v_uv);}`;
export const PUPPET_LIMITS=Object.freeze({textureWidth:512,textureHeight:768,maxBatches:16,maxPixels:624000,maxActors:3});
// Adjacent layers with identical bindings merge without changing depth order.
export function preparePuppetBatches(layers,{format='portrait',makeCanvas=()=>document.createElement('canvas')}={}) {
  if(!['portrait','canonical'].includes(format)||!Array.isArray(layers)||!layers.length||layers.length>32||layers.some(l=>!l.image))throw Error('Incomplete equipped surfaces.');
  const batches=[];
  for(const layer of layers){const binding=attachmentBinding(layer);let batch=batches.at(-1);
    if(!batch||batch.binding!==binding){const canvas=makeCanvas();canvas.width=512;canvas.height=768;batch={binding,canvas,ids:[]};batches.push(batch);}
    const ctx=batch.canvas.getContext('2d');if(!ctx)throw Error('Equipped surface canvas unavailable.');
    // Canonical art is a square at Y=256; fitted art is already a 2:3 portrait.
    if(format==='canonical')ctx.drawImage(layer.image,0,128,512,512);else ctx.drawImage(layer.image,0,0,512,768);
    batch.ids.push(layer.id||layer.slot||layer.kind);
  }
  if(batches.length>PUPPET_LIMITS.maxBatches)throw Error('Equipped surface budget exceeded.');
  return batches;
}
export function createEquippedPuppet(layers,{format='portrait',makeCanvas=()=>document.createElement('canvas'),meshStep=32}={}) {
  const canvas=makeCanvas(),batches=preparePuppetBatches(layers,{format,makeCanvas}),mesh=createSkinMesh(meshStep),matrices=poseMatrices({torso:0,head:0,upperR:0,foreR:0,grip:0,upperL:0,foreL:0,legL:0,legR:0,x:0,y:0}),packed=new Float32Array(90);
  canvas.width=(1024+RIG_SPACE.padding*2)/2;canvas.height=(1536+RIG_SPACE.padding*2)/2;
  let gl,program,vertexBuffer,indexBuffer,shaders=[],textures=[],locations,disposed=false,available=false,reason='WebGL unavailable',hasRendered=false;const lastPose={};
  function release(){if(!gl)return;for(const texture of textures)gl.deleteTexture(texture);textures=[];if(vertexBuffer)gl.deleteBuffer(vertexBuffer);if(indexBuffer)gl.deleteBuffer(indexBuffer);if(program)gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);shaders=[];}
  function initialize(){if(disposed)return;hasRendered=false;try{
    gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true,depth:false,stencil:false,powerPreference:'low-power'});
    // A mock 2D context or unsupported driver must never become a partial actor.
    if(!gl||typeof gl.createShader!=='function')return;
    function shader(type,source){const s=gl.createShader(type);if(!s)throw Error('Shader unavailable');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Equipped shader compilation failed');return s;}
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Equipped shader link failed');gl.useProgram(program);
    vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
    for(const[name,size,offset]of [['a_rest',2,0],['a_uv',2,2],['a_bones',4,4],['a_weights',4,8]]){const index=gl.getAttribLocation(program,name);if(index<0)throw Error('Equipped attribute missing');gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,48,offset*4);}
    indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    locations=Object.fromEntries(['u_bones[0]','u_binding','u_extent','u_padding','u_texture'].map(name=>[name,gl.getUniformLocation(program,name)]));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    for(const batch of batches){const texture=gl.createTexture();textures.push(texture);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,batch.canvas);}
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);available=true;reason='';
  }catch{available=false;reason='Equipped GPU path unavailable';release();}}
  const lost=event=>{event.preventDefault();available=false;reason='Graphics context lost';},restored=()=>{available=false;release();initialize();};
  canvas.addEventListener?.('webglcontextlost',lost);canvas.addEventListener?.('webglcontextrestored',restored);initialize();
  return {canvas,batches,get available(){return available&&!disposed;},get reason(){return reason;},
    render(pose){if(!available||disposed)return null;try{
      if(hasRendered&&POSE_FIELDS.every(key=>lastPose[key]===pose[key]))return canvas;
      poseMatrices(pose,matrices);for(let i=0;i<10;i++){const m=matrices[i],o=i*9;packed[o]=m[0];packed[o+1]=m[1];packed[o+2]=0;packed[o+3]=m[2];packed[o+4]=m[3];packed[o+5]=0;packed[o+6]=m[4];packed[o+7]=m[5];packed[o+8]=1;}
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniformMatrix3fv(locations['u_bones[0]'],false,packed);gl.uniform2f(locations.u_extent,1024+RIG_SPACE.padding*2,1536+RIG_SPACE.padding*2);gl.uniform1f(locations.u_padding,RIG_SPACE.padding);gl.uniform1i(locations.u_texture,0);gl.activeTexture(gl.TEXTURE0);
      for(let i=0;i<batches.length;i++){gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.uniform1i(locations.u_binding,batches[i].binding);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);}for(const key of POSE_FIELDS)lastPose[key]=pose[key];hasRendered=true;return canvas;
    }catch{available=false;reason='Equipped animation unavailable';return null;}},
    destroy(){if(disposed)return;disposed=true;available=false;canvas.removeEventListener?.('webglcontextlost',lost);canvas.removeEventListener?.('webglcontextrestored',restored);release();gl?.getExtension?.('WEBGL_lose_context')?.loseContext();for(const batch of batches){batch.canvas.width=1;batch.canvas.height=1;}canvas.width=1;canvas.height=1;}
  };
}
