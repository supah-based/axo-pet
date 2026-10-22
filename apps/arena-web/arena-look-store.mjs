import {labSelection} from './style-lab-model.mjs';
export const ARENA_LOOK_KEY='axo.arena.cosmetic-looks.v1';
export const ARENA_STYLE_DEFAULTS=Object.freeze({
 emerald_sprout:Object.freeze({head:'signal-runner-headband',body:'whitehat-field-jacket',pants:'night-node-joggers',footwear:'gas-boost-high-tops',tool:'validator-spark'}),
 sapphire_tide:Object.freeze({head:'liquidity-crown',body:'diamond-knit-sweater',pants:'node-tailored-joggers',footwear:'cyan-grip-boots',tool:'exit-liquidity-trident'}),
 amethyst_dream:Object.freeze({head:'aetherpunk-circlet',body:'copium-club-hoodie',pants:'night-node-joggers',footwear:'hexstep-boots',tool:'banana-market-maker'}),
 solar_peach:Object.freeze({head:'liquidation-crown',body:'night-node-bomber',pants:'node-tailored-joggers',footwear:'gas-boost-high-tops',tool:'gas-fee-guzzler'}),
 rose_bloom:Object.freeze({head:'liquidity-crown',body:'runebloom-overshirt',pants:'runesmith-trousers',footwear:'hexstep-boots',tool:'exit-liquidity-trident'}),
 midnight_mint:Object.freeze({head:'signal-runner-headband',body:'wen-moon-tee',pants:'node-tailored-joggers',footwear:'cyan-grip-boots',tool:'validator-spark'})
});
let sessionLooks;
function validate(catalog,value){
 if(!value||Array.isArray(value)||value.version!==1||Object.keys(value).some(k=>!['version','looks'].includes(k))||!value.looks||Array.isArray(value.looks)||typeof value.looks!=='object'||Object.keys(value.looks).some(k=>!Object.hasOwn(ARENA_STYLE_DEFAULTS,k)))throw Error('Invalid cosmetic look store');
 const looks={};for(const[key,selection]of Object.entries(value.looks)){const safe=labSelection(catalog,selection);if(Object.hasOwn(safe,'habitat'))throw Error('Habitats stay in Style Lab');looks[key]=safe;}return looks;
}
function stored(catalog,storage){try{storage??=globalThis.localStorage;const raw=storage?.getItem(ARENA_LOOK_KEY);if(raw!==null&&raw!==undefined){if(typeof raw!=='string'||raw.length>8192)throw Error('Invalid cosmetic look size');return validate(catalog,JSON.parse(raw));}}catch{/* Invalid/blocked browser storage never becomes game authority. */}return sessionLooks?validate(catalog,{version:1,looks:sessionLooks}):{};}
export function arenaLook(catalog,lineage,storage){if(!Object.hasOwn(ARENA_STYLE_DEFAULTS,lineage))throw Error('Unknown reference lineage');const looks=stored(catalog,storage);return labSelection(catalog,Object.hasOwn(looks,lineage)?looks[lineage]:ARENA_STYLE_DEFAULTS[lineage]);}
export function saveArenaLook(catalog,lineage,selection,storage){
 if(!Object.hasOwn(ARENA_STYLE_DEFAULTS,lineage))throw Error('Unknown reference lineage');const safe=labSelection(catalog,selection);delete safe.habitat;
 const looks={...stored(catalog,storage),[lineage]:safe};sessionLooks=validate(catalog,{version:1,looks});try{storage??=globalThis.localStorage;storage?.setItem(ARENA_LOOK_KEY,JSON.stringify({version:1,looks:sessionLooks}));}catch{/* Session-only cosmetic selection remains usable. */}return {...safe};
}
