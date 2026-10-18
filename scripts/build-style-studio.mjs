import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { STUDIO_SLOTS, buildRenderPlan } from '../packages/visual-engine/src/style-studio.mjs';

const root = path.resolve(import.meta.dirname, '..');
const flags = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, args) => arg.startsWith('--') ? [...pairs, [arg.slice(2), args[index + 1]]] : pairs, []));
if (!flags.art || !flags.bases) throw new Error('Usage: node scripts/build-style-studio.mjs --art <generated PNG directory> --bases <canonical public root> [--review <review output directory>]');
const source = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/collections/style-studio-v1.source.json')));
const rig = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/collections/level10-fit-rig-v1.json')));
const canonical = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/catalogs/website-visual-catalog-v5.json')));
const out = path.join(root, 'apps/hatchery-web/public/gear-style-studio/v1');
await fs.mkdir(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const blank = () => sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } });
const fileRecord = async (name, bytes) => {
  await fs.writeFile(path.join(out, name), bytes);
  const meta = await sharp(bytes).metadata();
  return { asset: '/gear-style-studio/v1/' + name, sha256: sha(bytes), width: meta.width, height: meta.height };
};
const allMasks = {};
for (const [slot, paths] of Object.entries(rig.masks)) {
  allMasks[slot] = Buffer.from(`<svg width="1024" height="1024"><g fill="white">${paths.map(d => `<path d="${d}"/>`).join('')}</g></svg>`);
}

const catalog = { schema: 'AXO_GEAR_STYLE_STUDIO_V1', revision: '1.1.0-candidate', status: 'CANDIDATE', level: 10,
  slotCompatibility: { canonicalSlots: 8, candidateOnlySlots: ['pants', 'footwear'], onchainIntegration: 'REQUIRES_VERSIONED_CONTRACT_AND_SCHEMA_REVIEW' },
  fitStatus: 'REVIEW_REQUIRED', fitRigSha256: sha(Buffer.from(JSON.stringify(rig))), ownership: 'NONE',
  slots: STUDIO_SLOTS, lineages: [], presets: [], items: [] };
const lineageIds = ['emerald_sprout', 'sapphire_tide', 'amethyst_dream', 'solar_peach', 'rose_bloom', 'midnight_mint'];
const names = ['Emerald', 'Sapphire', 'Amethyst', 'Solar', 'Rose', 'Midnight'];
for (let i = 0; i < lineageIds.length; i++) {
  const id = lineageIds[i], name = `pet_${id}_l10.webp`;
  const bytes = await fs.readFile(path.join(flags.bases, name));
  const expected = canonical.bases.find(base => base.lineageKey === id && base.level === 10);
  if (!expected || sha(bytes) !== expected.runtimeSha256) throw new Error(`Canonical reference hash mismatch: ${id}`);
  const footMask = Buffer.from(`<svg width="1024" height="1024"><g fill="white">${rig.masks.baseFeet.map(d => `<path d="${d}"/>`).join('')}</g></svg>`);
  const footwearBase = await sharp(bytes).composite([{ input: footMask, blend: 'dest-out' }]).webp({ quality: 95, alphaQuality: 100 }).toBuffer();
  catalog.lineages.push({ id, name: names[i], ...await fileRecord(name, bytes), footwearBase: await fileRecord(`pet_${id}_l10.footwear.webp`, footwearBase) });
}
for (const item of source.items) {
  if (!STUDIO_SLOTS.includes(item.slot) || !/^[a-z0-9-]+$/.test(item.id)) throw new Error('Unsafe design identifier.');
  const png = await fs.readFile(path.join(flags.art, `${item.id}.png`));
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) throw new Error(`${item.id} requires actual transparency.`);
  // Transparent trim uses alpha, never background color. The complete original object is retained.
  const trimmed = await sharp(png).trim({ background: '#00000000', threshold: 8 }).png().toBuffer();
  const itemArt = await sharp(trimmed).resize(924, 924, { fit: 'inside' }).toBuffer();
  const itemMeta = await sharp(itemArt).metadata();
  const fullArt = await blank().composite([{ input: itemArt, left: Math.floor((1024 - itemMeta.width) / 2), top: Math.floor((1024 - itemMeta.height) / 2) }]).webp({ quality: 95, alphaQuality: 100 }).toBuffer();
  const [left, top, width, height] = item.rect;
  if (left < 0 || top < 0 || left + width > 1024 || top + height > 1024) throw new Error(`Fit outside canvas: ${item.id}`);
  let resized = await sharp(trimmed).resize(width, height, { fit: 'fill' }).png().toBuffer();
  if (item.fit?.artMask) {
    const mask = Buffer.from(`<svg width="${width}" height="${height}" viewBox="${item.fit.artMask.viewBox.join(' ')}"><g fill="white">${item.fit.artMask.erase.map(d => `<path d="${d}"/>`).join('')}</g></svg>`);
    resized = await sharp(resized).composite([{ input: mask, blend: 'dest-out' }]).png().toBuffer();
  }
  let projection = item.fit?.artMask ? sharp(resized) : sharp(trimmed).resize(width, height, { fit: 'fill' });
  if (item.fit?.mirrorX) projection = projection.flop();
  if (item.fit?.rotation) projection = projection.rotate(item.fit.rotation, { background: '#00000000' });
  const { data: projected, info: projectedInfo } = await projection.png().toBuffer({ resolveWithObject: true });
  const placedLeft = Math.round(left + (width - projectedInfo.width) / 2), placedTop = Math.round(top + (height - projectedInfo.height) / 2);
  let parts = [{ input: projected, left: placedLeft, top: placedTop }];
  if (item.fit?.pieces) {
    parts = [];
    const dimensions = await sharp(trimmed).metadata();
    for (const piece of item.fit.pieces) {
      const [x, y, w, h] = piece.crop, [px, py, pw, ph] = piece.rect;
      const cropLeft = Math.floor(x * dimensions.width), cropTop = Math.floor(y * dimensions.height);
      const cropWidth = Math.min(dimensions.width - cropLeft, Math.ceil(w * dimensions.width)), cropHeight = Math.min(dimensions.height - cropTop, Math.ceil(h * dimensions.height));
      const cropped = await sharp(trimmed).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }).png().toBuffer();
      const pieceBytes = await sharp(cropped).trim({ background: '#00000000', threshold: 8 }).resize(pw, ph, { fit: 'fill' }).png().toBuffer();
      parts.push({ input: pieceBytes, left: px, top: py });
    }
  }
  let wearable = await blank().composite(parts).png().toBuffer();
  if (item.fit?.rowScale) {
    const { data: pixels, info } = await sharp(wearable).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const warped = Buffer.alloc(pixels.length), center = left + width / 2;
    const stops = item.fit.rowScale;
    for (let y = top; y < top + height; y++) {
      const progress = (y - top) / (height - 1);
      const end = stops.findIndex(stop => stop.at >= progress);
      const a = stops[Math.max(0, end - 1)], b = stops[end < 0 ? stops.length - 1 : end];
      const mix = b.at === a.at ? 0 : (progress - a.at) / (b.at - a.at), scale = a.scale + (b.scale - a.scale) * mix;
      for (let x = Math.max(0, Math.floor(center - width * scale / 2)); x < Math.min(1024, Math.ceil(center + width * scale / 2)); x++) {
        const sourceX = center + (x - center) / scale, low = Math.floor(sourceX), fraction = sourceX - low;
        if (low < left || low + 1 >= left + width) continue;
        const first = (y * 1024 + low) * info.channels, second = first + info.channels, target = (y * 1024 + x) * info.channels;
        const alpha = pixels[first + 3] * (1 - fraction) + pixels[second + 3] * fraction;
        warped[target + 3] = Math.round(alpha);
        for (let channel = 0; channel < 3; channel++) warped[target + channel] = alpha ? Math.round((pixels[first + channel] * pixels[first + 3] * (1 - fraction) + pixels[second + channel] * pixels[second + 3] * fraction) / alpha) : 0;
      }
    }
    wearable = await sharp(warped, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  }
  if (allMasks[item.slot]) wearable = await sharp(wearable).composite([{ input: allMasks[item.slot], blend: 'dest-out' }]).png().toBuffer();
  if (item.fit?.erase?.length) {
    const mask = Buffer.from(`<svg width="1024" height="1024"><g fill="white">${item.fit.erase.map(d => `<path d="${d}"/>`).join('')}</g></svg>`);
    wearable = await sharp(wearable).composite([{ input: mask, blend: 'dest-out' }]).png().toBuffer();
  }
  if (item.fit?.keep) {
    const mask = Buffer.from(`<svg width="1024" height="1024">${item.fit.keep}</svg>`);
    wearable = await sharp(wearable).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  wearable = await sharp(wearable).webp({ quality: 95, alphaQuality: 100 }).toBuffer();
  const widest = Math.max(1, ...(item.fit?.rowScale || []).map(stop => stop.scale));
  const bounds = widest > 1 ? [Math.floor(left + width * (1 - widest) / 2), top, Math.ceil(width * widest) + 1, height] : [placedLeft, placedTop, projectedInfo.width, projectedInfo.height];
  const record = { id: item.id, name: item.name, slot: item.slot, theme: item.theme, color: item.color, description: item.description,
    status: 'CANDIDATE', fitStatus: 'REVIEW_REQUIRED', sourceSha256: sha(png),
    itemArt: await fileRecord(`${item.id}.item.webp`, fullArt),
    thumbnail: await fileRecord(`${item.id}.thumb.webp`, await sharp(fullArt).resize(320).webp({ quality: 85 }).toBuffer()),
    wearable: { ...await fileRecord(`${item.id}.wearable.webp`, wearable), rect: bounds, targetRect: item.rect, mirrorX: Boolean(item.fit?.mirrorX), rotation: item.fit?.rotation || 0, pieces: item.fit?.pieces || null, rowScale: item.fit?.rowScale || null, occlusion: allMasks[item.slot] ? item.slot : 'BEHIND_PET_OR_OPEN_ACCESSORY' } };
  catalog.items.push(record);
}
const presetNames = ['Maximum cope', 'Node after dark', 'Aether shift'];
for (let index = 0; index < 3; index++) catalog.presets.push({ id: `look-${index + 1}`, name: presetNames[index], selection: Object.fromEntries(STUDIO_SLOTS.map(slot => [slot, catalog.items.filter(item => item.slot === slot)[index].id])) });
catalog.showcases = [];
for (let index = 0; index < catalog.lineages.length; index++) {
  const base = catalog.lineages[index], preset = catalog.presets[index % 3];
  const layers = buildRenderPlan(catalog, base.id, preset.selection).map(layer => ({ input: path.join(out, path.basename(layer.src)) }));
  const bytes = await blank().composite(layers).webp({ quality: 95, alphaQuality: 100 }).toBuffer();
  catalog.showcases.push({ lineageId: base.id, presetId: preset.id, name: preset.name, status: 'CANDIDATE', lookUrl: `/gear-studio?look=${preset.id}&lineage=${base.id}`, ...await fileRecord(`showcase-${base.id}.webp`, bytes) });
}
await fs.writeFile(path.join(out, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
await fs.copyFile(path.join(root, 'packages/visual-engine/src/style-studio.mjs'), path.join(root, 'apps/hatchery-web/public/gear-style-studio/model.mjs'));
if (flags.review) {
  await fs.mkdir(flags.review, { recursive: true });
  const layers = [];
  for (let index = 0; index < catalog.items.length; index++) {
    const item = catalog.items[index], left = index % 6 * 280, top = Math.floor(index / 6) * 316;
    layers.push({ input: await sharp(path.join(out, path.basename(item.itemArt.asset))).resize(268).toBuffer(), left: left + 6, top });
    layers.push({ input: Buffer.from(`<svg width="280" height="48"><text x="12" y="18" font-family="Arial" font-size="14" fill="#eef4e9">${item.name}</text><text x="12" y="37" font-family="Arial" font-size="11" fill="#a3b7ad">${item.slot.toUpperCase()} / ${item.theme.toUpperCase()}</text></svg>`), left, top: top + 268 });
  }
  await sharp({ create: { width: 1680, height: Math.ceil(catalog.items.length / 6) * 316, channels: 4, background: '#121b1b' } }).composite(layers).png().toFile(path.join(flags.review, 'collection.png'));
}
console.log(JSON.stringify({ status: 'CANDIDATE', items: catalog.items.length, lineages: catalog.lineages.length, artAndWearables: catalog.items.length * 2, out }));
