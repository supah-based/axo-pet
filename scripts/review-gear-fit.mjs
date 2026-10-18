// Render the reviewed public asset set without editing any source artwork or live state.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), sharp = require('sharp');
const root = path.resolve(import.meta.dirname, '..');
const catalog = require('../packages/gear-catalog/catalogs/website-visual-catalog-v5.json');
const traits = require('../packages/gear-catalog/catalogs/trait-catalog-v4.3.json');
const { v5WebsiteVisualState, renderV5GearComposite } = require('../packages/visual-engine/src/pet-visual-v5.js');
const argument = key => { const index = process.argv.indexOf(key); return index >= 0 ? process.argv[index + 1] : null; };
if (!argument('--assets') || !argument('--out')) throw new Error('Usage: node scripts/review-gear-fit.mjs --assets <public-root> --out <output-directory>');
const publicRoot = path.resolve(argument('--assets')), output = path.resolve(argument('--out'));
if (output === publicRoot || output === root) throw new Error('Use a separate output directory.');
await fs.mkdir(output, { recursive: true });
const checked = new Map();
async function assetBytes(layer) {
  const url = layer.runtimeUrl || layer.url, expected = layer.runtimeSha256;
  if (!/^\/hatchery-nft-v5\/[a-z0-9_]+\.webp$/.test(url)) throw new Error('Unexpected canonical asset path.');
  if (!checked.has(url)) {
    const bytes = await fs.readFile(path.join(publicRoot, url.slice(1)));
    const digest = createHash('sha256').update(bytes).digest('hex'), metadata = await sharp(bytes).metadata();
    if (digest !== expected || metadata.width !== 1024 || metadata.height !== 1024 || metadata.space !== 'srgb'
      || (!url.includes('layer_background_') && !metadata.hasAlpha)) throw new Error(`Asset verification failed: ${url}`);
    checked.set(url, { bytes, sha256: digest });
  }
  if (checked.get(url).sha256 !== expected) throw new Error('Conflicting asset hash.');
  return checked.get(url).bytes;
}
function pet(lineageId) { return { genesisId: 'AXO-ABCDEF1234', appearanceSeed: '0123456789abcdef', lineageId, level: 10 }; }
async function composite(lineage, loadout) {
  const visual = v5WebsiteVisualState(pet(lineage), { catalog, loadout: { background: 1, ...loadout } });
  const layers = await Promise.all(visual.activeLayers.map(assetBytes));
  return sharp(layers[0]).composite(layers.slice(1).map(input => ({ input, blend: 'over' }))).png({ compressionLevel: 1 }).toBuffer();
}
const xml = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function label(text, width, height = 34) { return Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0c1717"/><text x="8" y="22" font-family="Arial" font-size="13" fill="#ddf1dc">${xml(text)}</text></svg>`); }
async function sheet(file, columns, rows, tile, heading, cells) {
  const width = columns * tile, height = 42 + rows * (tile + 34), layers = [{ input: label(heading, width, 42), top: 0, left: 0 }];
  for (const [index, cell] of cells.entries()) {
    const left = index % columns * tile, top = 42 + Math.floor(index / columns) * (tile + 34);
    layers.push({ input: await sharp(cell.buffer).resize(tile, tile).png().toBuffer(), left, top });
    layers.push({ input: label(cell.label, tile), left, top: top + tile });
  }
  await sharp({ create: { width, height, channels: 4, background: '#0c1717' } }).composite(layers).png().toFile(path.join(output, file));
}
const lineages = catalog.lineages.map(lineage => lineage.key), slots = traits.gearSlots.map(slot => slot.key), overview = [];
for (const option of [0, 1, 2]) for (const lineage of lineages) {
  const loadout = option ? Object.fromEntries(slots.map(slot => [slot, traits.launchGear.filter(item => item.slot === slot)[option - 1].id])) : {};
  const buffer = await composite(lineage, loadout);
  overview.push({ buffer, label: `${lineage.split('_')[0]} · ${option ? `8-slot set ${option}` : 'base + default HUD'}` });
  if (option === 1) {
    // Independently compare the full-size pixels against the existing production compositor.
    const reference = await renderV5GearComposite(pet(lineage), { catalog, publicRoot, loadout: { background: 1, ...loadout } });
    const actual = await sharp(buffer).raw().toBuffer(), expected = await sharp(reference.buffer).raw().toBuffer();
    if (!actual.equals(expected)) throw new Error(`Compositor parity failed: ${lineage}`);
    await fs.writeFile(path.join(output, `${lineage}-equipped.png`), reference.buffer);
  }
}
await sheet('overview.png', 6, 3, 300, 'Live V5.1.1 assets · Level-10 bases / first eight-slot set / second eight-slot set', overview);
for (const slot of slots) {
  const gear = traits.launchGear.filter(item => item.slot === slot), cells = [];
  for (const lineage of lineages) for (const item of gear) cells.push({ buffer: await composite(lineage, { [slot]: item.id }), label: `${lineage.split('_')[0]} · #${item.id}` });
  await sheet(`${slot}.png`, gear.length, 6, 208, `${slot.toUpperCase()} · all ${gear.length} launch items × six Level-10 lineages · canonical z-order`, cells);
  console.log(`Rendered ${slot}: ${cells.length} combinations.`);
}
const report = { visualRevision: catalog.visualRevision, checkedAssets: checked.size, launchItems: traits.launchGear.length,
  lineages: lineages.length, singleItemCombinations: traits.launchGear.length * lineages.length,
  fullLoadouts: 12, independentFullCompositorComparisons: 6, status: 'VISUAL_REVIEW_REQUIRED',
  limitation: 'Static Level-10 wardrobe baselines; this is not per-pose animated Gear approval or a live ownership test.' };
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
