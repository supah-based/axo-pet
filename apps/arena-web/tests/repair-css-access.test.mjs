// Targeted CSS declaration cascade only: NOT a browser, box-layout engine, hit-test,
// touch simulation, computed style or rendered-fit proof. No installs/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {harness,target} from './repair-dom-harness.mjs';
const require = createRequire(import.meta.url);
const {parse}=require('cssom');
const sheet=parse(readFileSync(new URL('styles.css',target),'utf8'));
function media(condition,w,h){if(condition.includes('prefers-reduced-motion'))return condition.includes('no-preference');for(const m of condition.matchAll(/(min|max)-(width|height)\s*:\s*(\d+)px/g)){const value=m[2]==='width'?w:h;if(m[1]==='min'?value<+m[3]:value>+m[3])return false;}return true;}
// Used selectors contain no :is/:where/layers. Pseudo-elements and transient states
// are excluded. This is enough to establish explicit z-index and size declarations.
function specificity(selector){return (selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;}
function cascade(element,w,h){const result={};let order=0;function visit(rules){for(const rule of rules){if(rule.cssRules){if(rule.type===4&&!media(rule.conditionText,w,h))continue;if(rule.type===12&&!rule.conditionText.includes('padding:max'))continue;if([4,12].includes(rule.type))visit(rule.cssRules);continue;}if(!rule.selectorText)continue;for(const selector of rule.selectorText.split(',')){order++;if(/::|:(hover|active|focus|focus-visible|focus-within)/.test(selector))continue;let match=false;try{match=element.matches(selector.trim());}catch{}if(!match)continue;const rank=specificity(selector);for(let i=0;i<rule.style.length;i++){const property=rule.style[i],value=rule.style.getPropertyValue(property),important=rule.style.getPropertyPriority(property)==='important'?1:0,old=result[property];if(!old||important>old.important||important===old.important&&(rank>old.rank||rank===old.rank&&order>old.order))result[property]={value,selector:selector.trim(),rank,order,important};}}}}visit(sheet.cssRules);return result;}
const get=(o,k)=>o[k]?.value;

test('R3: completed-battle log summary is not covered by the result overlay in the same stacking context',async()=>{const h=await harness();try{
 await h.navigate(h.A);h.service.cancel(h.a,h.A);await h.poll();const log=h.document.querySelector('.combat-log'),overlay=h.document.querySelector('.result-overlay');assert(log&&overlay);assert.equal(log.parentElement,overlay.parentElement);
 const samples=[];for(const[w,height]of [[390,844],[844,390],[1440,900]]){const logStyle=cascade(log,w,height),resultStyle=cascade(overlay,w,height),screenStyle=cascade(h.document.querySelector('.combat-screen'),w,height);samples.push({viewport:[w,height],dockHeight:get(screenStyle,'--dock-height'),logZ:get(logStyle,'z-index'),overlayZ:get(resultStyle,'z-index'),logBottom:get(logStyle,'bottom'),overlayBottom:get(resultStyle,'bottom'),overlayBackground:get(resultStyle,'background'),overlayPointerEvents:get(resultStyle,'pointer-events')||'auto'});}
 if(process.env.REVIEW_BASELINE!=='1')for(const sample of samples){assert(sample.logBottom.includes('var(--dock-height)'));assert.equal(sample.overlayBottom,'var(--dock-height)');}
 for(const sample of samples)assert(Number(sample.logZ)>Number(sample.overlayZ)||sample.overlayPointerEvents==='none','Result overlay intercepts the log summary: '+JSON.stringify(sample));
}finally{await h.close();}});

test('P4: selected combat controls retain declared pointer targets in portrait and short landscape (not fit proof)',async()=>{const h=await harness();try{
 await h.navigate(h.A);for(const[w,height]of [[390,844],[844,390]]){for(const selector of ['[data-action="move"][data-key="market_order"]','[data-action="move"][data-key="recharge"]','[data-action="inspect-moves"]','[data-action="concede"]']){const el=h.document.querySelector(selector);if(!el)continue;const style=cascade(el,w,height),min=parseFloat(get(style,'min-height'))||0,explicit=parseFloat(get(style,'height'))||0;assert(Math.max(min,explicit)>=44,selector+' at '+w+'×'+height);}}
}finally{await h.close();}});
