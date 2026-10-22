import test from 'node:test';import assert from 'node:assert/strict';
import {createEquippedPuppet,preparePuppetBatches,PUPPET_LIMITS} from '../equipped-puppet.mjs';
import {EQUIPPED_POSES} from '../equipped-rig.mjs';
import {fixture} from './equipped-gpu-fixture.mjs';

const layers=[{slot:'back',image:{}},{kind:'pet',slot:'pet',image:{}},{slot:'body',image:{}},{slot:'head',image:{}},{slot:'tool',image:{}},{kind:'foreground',id:'fingers',image:{}}];

test('contiguous surface batching preserves depth and merges tool/finger under the same rigid grip',()=>{
  const f=fixture(),batches=preparePuppetBatches(layers,{makeCanvas:f.makeCanvas});assert.deepEqual(batches.map(b=>b.binding),[1,-1,5]);assert.deepEqual(batches[1].ids,['pet','body','head']);assert.deepEqual(batches[2].ids,['tool','fingers']);assert.equal(batches[2].canvas.draws.length,2);
  const square=preparePuppetBatches([{slot:'pet',image:{}}],{format:'canonical',makeCanvas:f.makeCanvas});assert.deepEqual(square[0].canvas.draws[0].slice(1),[0,128,512,512]);
});

test('actual GPU submission uses bounded shared geometry, premultiplied alpha and rigid bone uniforms',()=>{
  const f=fixture(),actor=createEquippedPuppet(layers,{makeCanvas:f.makeCanvas});assert.equal(actor.available,true);assert.ok(actor.canvas.width*actor.canvas.height<=PUPPET_LIMITS.maxPixels);assert.equal(f.textures.size,3);
  assert.equal(actor.render(EQUIPPED_POSES.attack),actor.canvas);assert.equal(actor.render(EQUIPPED_POSES.victory),actor.canvas);
  assert.equal(f.calls.filter(c=>c[0]==='drawElements').length,6);assert.ok(f.calls.some(c=>c[0]==='pixelStorei'&&c[2]===true));assert.notDeepEqual(f.matrices[0],f.matrices[1]);assert.equal(f.matrices[0].length,90);
  actor.render(EQUIPPED_POSES.victory);assert.equal(f.calls.filter(c=>c[0]==='drawElements').length,6,'Paused/unchanged poses must not resubmit GPU geometry');
  actor.destroy();actor.destroy();for(const set of [f.textures,f.buffers,f.programs,f.shaders])assert.equal(set.size,0);assert.equal(actor.render(EQUIPPED_POSES.rest),null);assert.equal(actor.canvas.listeners.size,0);
});

test('context loss returns no partial actor, restoration rebuilds resources and disposal releases the context',()=>{
  const f=fixture(),actor=createEquippedPuppet(layers,{makeCanvas:f.makeCanvas});let prevented=false;
  actor.canvas.listeners.get('webglcontextlost')({preventDefault:()=>{prevented=true;}});assert.equal(prevented,true);assert.equal(actor.available,false);assert.equal(actor.render(EQUIPPED_POSES.hit),null);
  actor.canvas.listeners.get('webglcontextrestored')();assert.equal(actor.available,true);assert.equal(f.textures.size,3);actor.destroy();assert.ok(f.calls.some(c=>c[0]==='loseContext'));
});

test('unsupported GPU or shader failure preserves a safe static-fallback signal without leaked resources',()=>{
  for(const options of [{unsupported:true},{failCompile:true}]){const f=fixture(options),actor=createEquippedPuppet(layers,{makeCanvas:f.makeCanvas});assert.equal(actor.available,false);assert.equal(actor.render(EQUIPPED_POSES.block),null);actor.destroy();for(const set of [f.textures,f.buffers,f.programs,f.shaders])assert.equal(set.size,0);}
});

test('bad surfaces, source formats and resource overflows cannot create an actor',()=>{
  const f=fixture();for(const list of [[],[{slot:'pet'}],Array.from({length:33},()=>({image:{}}))])assert.throws(()=>createEquippedPuppet(list,{makeCanvas:f.makeCanvas}));
  assert.throws(()=>preparePuppetBatches(layers,{format:'previewStats',makeCanvas:f.makeCanvas}));assert.throws(()=>preparePuppetBatches(Array.from({length:20},(_,i)=>({slot:i%2?'tool':'body',image:{}})),{makeCanvas:f.makeCanvas}));
});
