export function arenaIcon(kind){const paths={practice:'M12 3v3m0 12v3M3 12h3m12 0h3M7 7l3 3m4 4 3 3M7 17l3-3m4-4 3-3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',wardrobe:'M8 3l4 3 4-3 6 5-4 4-2-2v11H8V10l-2 2-4-4z',people:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3a6 6 0 0 1 12 0v3m3-17a4 4 0 0 1 0 8m1 3a5 5 0 0 1 4 5v1',sword:'M5 3l14 14M3 5l4-2 14 14-4 4L3 7zm11 13 4-4M3 21l4-4',shield:'M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6',surge:'M13 2L4 14h7l-1 8 10-13h-7z',heal:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',epic:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM3 3l2 2m14 14 2 2',target:'M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3',crown:'M3 6l4 4 5-7 5 7 4-4-2 13H5zM6 22h12',book:'M4 3h14l2 2v16H4zM8 7h7M8 11h7M8 15h5',arrow:'M4 18L19 3M9 3h10v10',down:'M4 4l15 15M9 19h10V9',reset:'M4 8a9 9 0 1 1-1 7M4 2v6h6',gear:'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l3 3m6 6 3 3M6 18l3-3m6-6 3-3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8'};return `<svg class="game-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[kind]||paths.sword}"/></svg>`;}
// Generated raster artwork only. Small functional control symbols stay separate above.
const PAINTED_DECALS=Object.freeze({
 'gas-chaos':{url:'/arena/assets/meme-v1/gas-chaos.webp',width:640,height:427},
 tag:{file:'axo-tag.webp',width:1024,height:512},
 axo:{file:'axo-mascot.webp',width:256,height:256},
 'no-rug':{file:'no-rug.webp',width:384,height:256},
 'stay-weird':{file:'stay-weird.webp',width:384,height:256},
 diamond:{file:'diamond.webp',width:256,height:256},
 star:{file:'diamond.webp',width:256,height:256}
});
export function arenaDecal(kind){
 const key=Object.hasOwn(PAINTED_DECALS,kind)?kind:'diamond',art=PAINTED_DECALS[key];
 return '<img class="arena-decal decal-'+key+'" src="'+(art.url||'/arena/assets/degen-v2/'+art.file)+'" width="'+art.width+'" height="'+art.height+'" alt="" aria-hidden="true" decoding="async" draggable="false">';
}
