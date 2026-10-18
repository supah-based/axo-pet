// Source/DOM acceptance probe only; it is not a rendered-layout or device certification.
// Uses the isolated synthetic ArenaService + LinkeDOM harness; no wallet/network/state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {harness} from './repair-dom-harness.mjs';

const require = createRequire(import.meta.url);
const {parse}=require('cssom');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function flatten(ruleset,out=[]){for(const rule of ruleset){if(rule.cssRules)flatten(rule.cssRules,out);else if(rule.selectorText)out.push(rule);}return out;}
function declarations(selector){return flatten(parse(css).cssRules).filter(r=>r.selectorText.split(',').some(s=>s.trim()===selector)).map(r=>({condition:r.parentRule?.conditionText||'',style:r.style}));}
function has44(selector,axis){return declarations(selector).some(({condition,style})=>/(max-width\s*:\s*(?:520|760)px|max-height\s*:\s*560px)/.test(condition)&&parseFloat(style.getPropertyValue(`min-${axis}`))>=44);}

test('Arena acceptance probe: keyboard semantics, named controls, reduced-motion and small-screen target declarations',async()=>{
 const h=await harness();try{
  const d=h.document;
  for(const selector of ['.skip-link','[data-action="field-guide"]','#sound','#fullscreen'])assert(d.querySelector(selector),`missing ${selector}`);
  assert.match(d.querySelector('.skip-link').getAttribute('href'),/^#main$/);
  assert.equal(d.querySelector('#main').getAttribute('tabindex'),'-1');
  assert.equal(d.querySelector('[data-action="field-guide"]').getAttribute('aria-label'),'Open Arena field guide');
  assert.equal(d.querySelector('#sound').getAttribute('aria-pressed'),'false','sound must remain opt-in');
  assert.equal(d.querySelector('#fullscreen').getAttribute('aria-label'),'Enter fullscreen');
  for(const selector of ['.brand','.guide-toggle','#sound','#fullscreen'])assert(has44(`.game-ui ${selector}`,'height'),`no 44px small-screen min-height declaration for ${selector}`);
  assert(has44('.game-ui:not(.in-battle) nav button','height'),'portrait section tabs must expose 44px targets');
  assert.match(css, /\.game-ui:not\(\.in-battle\)\{--shell-header:98px\}/, 'portrait shell must reserve the tab row height');
  for(const selector of ['.guide-toggle','#fullscreen'])assert(has44(`.game-ui ${selector}`,'width'),`no 44px small-screen min-width declaration for ${selector}`);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(html,/FREE-PLAY BETA/);assert.match(html,/NO WAGERS/);assert.match(html,/NO BATTLE XP/);
  assert.equal(h.requests.filter(r=>r.body!==undefined).length,0,'probe boot must not create a wager/reward/action');
 }finally{await h.close();}
});
