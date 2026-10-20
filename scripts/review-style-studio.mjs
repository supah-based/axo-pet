import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { buildRenderPlan } from '../packages/visual-engine/src/style-studio.mjs';

const root = path.resolve(import.meta.dirname, '..'), publicRoot = path.join(root, 'apps/hatchery-web/public');
const index = process.argv.indexOf('--out');
if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node scripts/review-style-studio.mjs --out <review directory>');
const out = path.resolve(process.argv[index + 1]); await fs.mkdir(out, { recursive: true });
const catalog = JSON.parse(await fs.readFile(path.join(publicRoot, 'gear-style-studio/v1/catalog.json')));
const compose = async (lineage, selection) => sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#263a30' } }).composite(buildRenderPlan(catalog, lineage, selection).map(layer => ({ input: path.join(publicRoot, '.' + layer.src) }))).png().toBuffer();
const label = (text, width) => Buffer.from(`<svg width="${width}" height="28"><rect width="100%" height="100%" fill="#121b17"/><text x="10" y="19" font-family="Arial" font-size="11" fill="#deedcc">${text}</text></svg>`);
const overview = [];
for (let row = 0; row < catalog.presets.length; row++) for (let col = 0; col < catalog.lineages.length; col++) {
  const preset = catalog.presets[row], base = catalog.lineages[col], bytes = await compose(base.id, preset.selection);
  await fs.writeFile(path.join(out, `${base.id}-${preset.id}.png`), bytes);
  overview.push({ input: await sharp(bytes).resize(288).toBuffer(), left: col * 288, top: row * 316 });
  overview.push({ input: label(`${base.name} / ${preset.name}`, 288), left: col * 288, top: row * 316 + 288 });
}
await sharp({ create: { width: 1728, height: 948, channels: 4, background: '#121b17' } }).composite(overview).png().toFile(path.join(out, 'outfits.png'));
for (const slot of catalog.slots) {
  const cells = [], items = catalog.items.filter(item => item.slot === slot);
  for (let row = 0; row < catalog.lineages.length; row++) for (let col = 0; col < items.length; col++) {
    const bytes = await compose(catalog.lineages[row].id, { [slot]: items[col].id });
    cells.push({ input: await sharp(bytes).resize(360).toBuffer(), left: col * 360, top: row * 388 });
    cells.push({ input: label(`${catalog.lineages[row].name} / ${items[col].name}`, 360), left: col * 360, top: row * 388 + 360 });
    if (row === 0) await fs.writeFile(path.join(out, `${items[col].id}-fitted.png`), bytes);
  }
  await sharp({ create: { width: 1080, height: 2328, channels: 4, background: '#121b17' } }).composite(cells).png().toFile(path.join(out, `${slot}-fit.png`));
}
await fs.writeFile(path.join(out, 'review.json'), JSON.stringify({ status: 'VISUAL_REVIEW_REQUIRED', revision: catalog.revision, items: catalog.items.length, singleItemLineageComposites: catalog.items.length * catalog.lineages.length, fullOutfits: 18, artistApproval: 'PENDING' }, null, 2));
console.log(JSON.stringify({ output: out, singleItemLineageComposites: catalog.items.length * catalog.lineages.length, fullOutfits: 18, status: 'VISUAL_REVIEW_REQUIRED' }));
