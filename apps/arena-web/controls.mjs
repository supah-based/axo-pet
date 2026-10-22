export const CONTROL_KEY='axo.arena.controls.v1';
export const DEFAULT_BINDINGS=Object.freeze({slot1:'1',slot2:'2',slot3:'3',slot4:'4',epic:'e',recharge:'r'});
export const ARENA_SCENES=Object.freeze({rooftop:'Rooftop Dojo',runeforge:'Runeforge',classic:'Classic Underground'});
export const DEFAULT_CONTROLS=Object.freeze({calm:true,shake:false,plainText:false,scene:'rooftop',bindings:DEFAULT_BINDINGS});
export function controlPreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(DEFAULT_CONTROLS,k)))return {...DEFAULT_CONTROLS,bindings:{...DEFAULT_BINDINGS}};
 const input=value.bindings;let bindings={...DEFAULT_BINDINGS};if(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===6&&Object.keys(input).every(k=>Object.hasOwn(DEFAULT_BINDINGS,k))&&Object.values(input).every(v=>typeof v==='string'&&/^[a-z0-9]$/i.test(v))){const normalized=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,v.toLowerCase()]));if(new Set(Object.values(normalized)).size===6)bindings=normalized;}
 return {calm:typeof value.calm==='boolean'?value.calm:true,shake:typeof value.shake==='boolean'?value.shake:false,plainText:typeof value.plainText==='boolean'?value.plainText:false,scene:Object.hasOwn(ARENA_SCENES,value.scene)?value.scene:'rooftop',bindings};
}
let prefs;try{const raw=globalThis.localStorage?.getItem(CONTROL_KEY);prefs=controlPreferences(raw&&raw.length<500?JSON.parse(raw):null);}catch{prefs=controlPreferences(null);}
function freeze(value){Object.freeze(value.bindings);return Object.freeze(value);}prefs=freeze(prefs);
export const activeControls=()=>prefs;
export function updateControls(value,storage){prefs=freeze(controlPreferences(value));try{(storage||globalThis.localStorage)?.setItem(CONTROL_KEY,JSON.stringify(prefs));}catch{}return prefs;}
export function rebindControl(bindings,action,key){if(!Object.hasOwn(DEFAULT_BINDINGS,action)||typeof key!=='string'||!/^[a-z0-9]$/i.test(key))throw Error('Use one letter or number.');const next={...bindings},normalized=key.toLowerCase(),other=Object.keys(next).find(k=>k!==action&&next[k]===normalized);if(other)next[other]=next[action];next[action]=normalized;return next;}
export function controlAction(key,bindings=activeControls().bindings){if(typeof key!=='string')return null;return Object.keys(DEFAULT_BINDINGS).find(k=>bindings[k]===key.toLowerCase())||null;}
