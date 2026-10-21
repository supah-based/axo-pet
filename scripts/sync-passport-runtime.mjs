import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url), target = new URL('apps/hatchery-web/public/passport/', root);
await mkdir(target, { recursive:true });
const history = (await readFile(new URL('packages/shared-schemas/src/passport-history.cjs', root),'utf8'))
  .replace("'use strict';\n",'').replace('module.exports = { validatePetHistory };','export { validatePetHistory };');
await writeFile(new URL('history.mjs',target),history);
const model = (await readFile(new URL('packages/pet-domain/src/passport.mjs',root),'utf8'))
  .replace("'./wardrobe-preview.mjs'","'/wardrobe/model.mjs'").replace("'../../shared-schemas/src/index.mjs'","'./history.mjs'");
await writeFile(new URL('model.mjs',target),model);
const catalog=JSON.parse(await readFile(new URL('packages/gear-catalog/catalogs/website-visual-catalog-v5.json',root)));
const traits=JSON.parse(await readFile(new URL('packages/gear-catalog/catalogs/trait-catalog-v4.3.json',root)));
const references={schemaVersion:'AXO_PASSPORT_REFERENCE_V1',visualRevision:'5.1.1',
  lineages:catalog.lineages.map(lineage=>{const dna=traits.lineages.find(l=>l.key===lineage.key);return {...lineage,lore:dna.lore,accent:dna.accent,temperament:dna.temperament};}),stages:catalog.stages,
  bases:catalog.bases.map(b=>({lineageKey:b.lineageKey,level:b.level,url:b.url,sha256:b.runtimeSha256}))};
await writeFile(new URL('reference.json',target),JSON.stringify(references,null,2)+'\n');
