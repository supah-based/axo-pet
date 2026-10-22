import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fittedInspectorMarkup,mountFittedInspector} from '../fitted-inspector.mjs';
const{parseHTML}=createRequire(import.meta.url)('linkedom');
function fixture({status='ready',gpu=true,hold=false,broken=false}={}){
 const{document}=parseHTML('<html><body>'+fittedInspectorMarkup()+'</body></html>'),root=document.querySelector('section'),text=[],samples=[];let destroyed=0,release;const gate=new Promise(resolve=>release=resolve);
 const makeCanvas=()=>{const canvas=document.createElement('canvas');canvas.getContext=()=>({fillRect(){},drawImage(){},fillText:value=>text.push(value)});return canvas;};
 const cache={get:()=>({status,actor:{available:gpu},frame:pose=>{samples.push(pose);return broken?null:{image:{},padded:gpu,authority:'COSMETIC_PREVIEW_ONLY'};}}),settled:()=>hold?gate:Promise.resolve(),destroy(){destroyed++;}};
 const controller=mountFittedInspector(root,{identitySource:'AUTHENTICATED_PET_READ_V1',level:10},{makeCache:()=>cache,makeCanvas});return{root,controller,release,text,samples,get destroyed(){return destroyed;}};
}
test('new pose gallery stamps four fitted previews and releases resources after capture',async()=>{const h=fixture();await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,4);for(const name of ['ATTACK','BLOCK','HIT','VICTORY'])assert.ok(h.text.includes(name+' / PREVIEW'));assert.match(h.root.textContent,/cosmetic/i);assert.equal(h.destroyed,1);h.controller.destroy();assert.equal(h.root.querySelectorAll('canvas').length,0);});
test('graphics fallback is honestly one new fitted still, not four fake animated poses',async()=>{const h=fixture({gpu:false});await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,1);assert.deepEqual(h.text,['STATIC / PREVIEW']);assert.match(h.root.textContent,/joint animation unavailable/);});
test('closing pending fitted inspection prevents stale content from repopulating the dialog',async()=>{const h=fixture({hold:true});h.controller.destroy();h.release();await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,0);assert.equal(h.samples.length,0);});
test('unsupported or failed fitted art never substitutes the retired legacy gear',async()=>{for(const options of [{status:'unsupported'},{status:'failed'},{broken:true}]){const h=fixture(options);await h.controller.ready;assert.equal(h.root.querySelectorAll('canvas').length,0);assert.equal(h.destroyed,1);assert.match(h.root.textContent,/LVL 10|not substituted/);}});
