import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';
import{validateLookbook,lookHref}from'../apps/hatchery-web/public/bazaar-lookbook/model.mjs';
const pub=path.resolve(import.meta.dirname,'../apps/hatchery-web/public'),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
export async function syncBazaarExamples(c,lookbook){
 validateLookbook(lookbook,c);const file=path.join(pub,'pet-marketplace.html');let html=await fs.readFile(file,'utf8');
 const href=e=>esc(lookHref(e)),portrait=(e,extra='')=>`<img ${extra}src="${e.asset}" width="1024" height="1536" alt="${esc(e.name)} on the ${esc(c.lineages.find(l=>l.id===e.lineage).name)} AXO · cosmetic Preview" loading="lazy">`;
 const looks=lookbook.entries.slice(0,3).map((e,j)=>`<a class="style-look" href="${href(e)}">${portrait(e)}<span>0${j+1} / FITTED LOOK / PREVIEW</span><h3>${esc(e.name)}</h3><p>Current fitted clothing. Cosmetic Preview only.</p><strong>TRY THIS EXACT LOOK ↗</strong></a>`).join('\n');
 html=html.replace(/(<div class="style-look-grid"[^>]*>)[\s\S]*?(<\/div>)/,'$1\n'+looks+'\n$2');
 const collection=lookbook.entries.map((e,j)=>`<article><a class="collection-portrait" href="${href(e)}" aria-label="Try ${esc(e.name)}">${portrait(e)}<b class="lookbook-preview">PREVIEW</b></a><span>LINEAGE 0${j+1}</span><h3>${esc(c.lineages.find(l=>l.id===e.lineage).name)}</h3><a class="collection-try" href="${href(e)}">TRY THIS LOOK ↗</a></article>`).join('\n');
 html=html.replace(/(<div class="collection-carousel"[^>]*>)[\s\S]*?(<\/div>)/,'$1\n'+collection+'\n$2');
 const hero=lookbook.entries[0];html=html.replace(/<a href="[^"]+" class="market-style-link"[^>]*>[\s\S]*?<\/a>/,`<a href="${href(hero)}" class="market-style-link" aria-label="Try ${esc(hero.name)} · cosmetic Preview">${portrait(hero,'class="market-key-art" ')}<b class="lookbook-preview">PREVIEW</b></a>`);
 for(const s of c.showcases){const next=lookbook.entries.find(e=>e.lineage===s.lineage);html=html.replaceAll(s.asset,next.asset);}
 html=html.replace(/<img src="\/hatchery-nft-v5\.1\.1\/pet_rose_bloom_l09\.webp"[^>]*>/,portrait(lookbook.entries.find(e=>e.lineage==='rose_bloom')));
 html=html.replace('See six lineage bases wearing coordinated five-piece sets below. These example outfits are collection previews; your Pet\'s genesis, DNA and owned Gear stay yours.','Six lineages, six current fitted looks. These outfits are cosmetic previews; Pet identity, XP and verified equipment stay separate.');
 html=html.replace(/<p>43 fitted styles, fitted to 57 anatomical landmarks\.[\s\S]*?shown separately below\.<\/p>/,'<p>Jackets, hoodies, knitwear, shirts and tees fitted to the shared AXO base. Try the exact pictured look, then make it yours. Cosmetic previews stay separate from verified equipment and live listings.</p>');
 html=html.replace(/class="gear-tag tag-head">[^<]+/,'class="gear-tag tag-head">HEADBAND').replace(/class="gear-tag tag-face">[^<]+/,'class="gear-tag tag-face">JACKET').replace(/class="gear-tag tag-tool">[^<]+/,'class="gear-tag tag-tool">SPARK').replace(/class="gear-tag tag-charm">[^<]+/,'class="gear-tag tag-charm">BOOTS');
 html=html.replace(/Explore \d+ fitted designs and six five-piece sets/,'Explore '+c.items.length+' gear designs, six candidate sets and a new fitted wardrobe');
 html=html.replaceAll('href="/gear-studio"',`href="${href(hero)}"`);
 await fs.writeFile(file,html);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await syncBazaarExamples(JSON.parse(await fs.readFile(path.join(pub,'gear-bazaar/v1/catalog.json'))),JSON.parse(await fs.readFile(path.join(pub,'bazaar-lookbook/v2/manifest.json'))));
