import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { STUDIO_SLOTS, buildRenderPlan, selectionFromURL, selectionToURL, drawStudioLook } from '../src/style-studio.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const publicRoot = path.join(root, 'apps/hatchery-web/public');
const catalog = JSON.parse(await fs.readFile(path.join(publicRoot, 'gear-style-studio/v1/catalog.json')));
const source = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/collections/style-studio-v1.source.json')));
const canonical = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/catalogs/website-visual-catalog-v5.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assetBytes = record => fs.readFile(path.join(publicRoot, '.' + record.asset));

test('candidate collection has 24 original designs, three per exact slot, without inventory or chain claims', () => {
  assert.equal(catalog.items.length, 24); assert.equal(new Set(catalog.items.map(item => item.id)).size, 24);
  assert.equal(catalog.status, 'CANDIDATE'); assert.equal(catalog.ownership, 'NONE'); assert.equal(catalog.level, 10);
  assert.equal(catalog.fitStatus, 'REVIEW_REQUIRED'); assert.deepEqual(catalog.slots, STUDIO_SLOTS);
  for (const slot of STUDIO_SLOTS) assert.equal(catalog.items.filter(item => item.slot === slot).length, 3);
  assert.deepEqual(new Set(catalog.items.map(item => item.theme)), new Set(['degen', 'crypto', 'tech', 'aetherpunk', 'meme']));
  for (const item of catalog.items) {
    assert.equal(item.status, 'CANDIDATE'); assert.equal(item.fitStatus, 'REVIEW_REQUIRED');
    assert.notEqual(item.itemArt.asset, item.wearable.asset);
    for (const key of ['gearId', 'tokenId', 'contractAddress', 'stats', 'balance', 'ownerAddress']) assert.equal(key in item, false, `${item.id}:${key}`);
    assert.equal(item.description, source.items.find(input => input.id === item.id).description);
  }
});

test('every public artifact matches its recorded hash, dimensions, alpha and safe URL', async () => {
  for (const record of [...catalog.lineages, ...catalog.showcases, ...catalog.items.flatMap(item => [item.itemArt, item.thumbnail, item.wearable])]) {
    assert.match(record.asset, /^\/gear-style-studio\/v1\/[a-z0-9_.-]+\.webp$/);
    const bytes = await assetBytes(record), meta = await sharp(bytes).metadata();
    assert.equal(sha(bytes), record.sha256, record.asset);
    assert.equal(meta.width, record.width); assert.equal(meta.height, record.height); assert.equal(meta.hasAlpha, true);
    const stats = await sharp(bytes).stats(); assert.equal(stats.channels[3].min, 0); assert.ok(stats.channels[3].max > 220);
  }
});

test('six level-10 references retain the exact reviewed canonical bytes', async () => {
  assert.equal(catalog.lineages.length, 6);
  for (const base of catalog.lineages) {
    const expected = canonical.bases.find(record => record.lineageKey === base.id && record.level === 10);
    assert.ok(expected); assert.equal(base.sha256, expected.runtimeSha256); assert.equal(sha(await assetBytes(base)), expected.runtimeSha256);
  }
});

test('wearables stay on their registered pose while standalone item art fills its own canvas', async () => {
  for (const item of catalog.items) {
    assert.deepEqual([item.itemArt.width, item.itemArt.height, item.wearable.width, item.wearable.height], [1024, 1024, 1024, 1024]);
    const { data, info } = await sharp(await assetBytes(item.wearable)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const [left, top, width, height] = item.wearable.rect;
    let opaque = 0;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
      const alpha = data[(y * 1024 + x) * info.channels + 3];
      if (x < left || y < top || x >= left + width || y >= top + height) assert.equal(alpha, 0, `${item.id}: outside registered viewport`);
      if (alpha > 128) opaque++;
    }
    assert.ok(opaque > 100, item.id);
    const { info: art } = await sharp(await assetBytes(item.itemArt)).trim({ background: '#00000000', threshold: 8 }).png().toBuffer({ resolveWithObject: true });
    assert.ok(Math.max(art.width, art.height) >= 880 && Math.max(art.width, art.height) <= 940, item.id);
  }
});

test('body and handheld masks keep the fixed neck, bent arm and finger regions clear', async () => {
  for (const item of catalog.items.filter(item => ['body', 'tool'].includes(item.slot))) {
    const points = item.slot === 'body' ? [[520, 480], [375, 650], [700, 515]] : [[821, 470], [903, 469], [905, 512], [871, 541]];
    const { data, info } = await sharp(await assetBytes(item.wearable)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [x, y] of points) assert.equal(data[(y * 1024 + x) * info.channels + 3], 0, `${item.id}: protected ${x},${y}`);
  }
});

test('render plan places back/ground behind the Pet and masked tools in front, with one piece per slot', () => {
  for (const preset of catalog.presets) {
    assert.deepEqual(Object.keys(preset.selection), STUDIO_SLOTS);
    const plan = buildRenderPlan(catalog, catalog.lineages[0].id, preset.selection);
    assert.deepEqual(plan.map(layer => layer.slot || layer.kind), ['habitat', 'back', 'pet', 'body', 'face', 'head', 'tool', 'charm', 'companion']);
    assert.equal(new Set(plan.map(layer => layer.id)).size, 9);
  }
  const invalid = { ...catalog.presets[0].selection, head: catalog.items.find(item => item.slot === 'body').id };
  assert.throws(() => buildRenderPlan(catalog, catalog.lineages[0].id, invalid), /slot/);
  assert.throws(() => buildRenderPlan(catalog, 'unknown', {}), /reference/);
  assert.throws(() => buildRenderPlan(catalog, catalog.lineages[0].id, { weapon: 'unknown' }), /slot/);
});

test('bookmark URLs round-trip complete and empty looks; unknown items are rejected', () => {
  for (const selection of [catalog.presets[0].selection, {}]) {
    const search = selectionToURL(catalog.lineages[2].id, selection);
    assert.deepEqual(selectionFromURL(catalog, search), { lineage: catalog.lineages[2].id, selection });
  }
  assert.throws(() => selectionFromURL(catalog, '?head=unreleased'), /slot/);
  assert.deepEqual(selectionFromURL(catalog, '?look=look-2').selection, catalog.presets[1].selection);
  assert.throws(() => selectionFromURL(catalog, '?look=unknown'), /look/);
});

test('Bazaar examples use the same candidate render plan and retain complete 1024 canvases', async () => {
  assert.equal(catalog.showcases.length, 6);
  const html = await fs.readFile(path.join(publicRoot, 'pet-marketplace.html'), 'utf8');
  assert.doesNotMatch(html, /\/hatchery-nft-v5\/showcase_/);
  for (const showcase of catalog.showcases) {
    assert.ok(html.includes(showcase.asset)); assert.equal(showcase.status, 'CANDIDATE');
    const selection = selectionFromURL(catalog, new URL(showcase.lookUrl, 'https://axo.pet').search);
    assert.equal(selection.lineage, showcase.lineageId);
    const layers = await Promise.all(buildRenderPlan(catalog, selection.lineage, selection.selection).map(async layer => ({ input: await fs.readFile(path.join(publicRoot, '.' + layer.src)) })));
    const expected = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } }).composite(layers).webp({ quality: 95, alphaQuality: 100 }).toBuffer();
    assert.equal(sha(expected), showcase.sha256);
  }
});

test('missing images fail before any plane is drawn; deployed browser model matches source', async () => {
  const calls = [], canvas = { width: 1024, height: 1024, getContext: () => ({ clearRect: () => calls.push('clear'), drawImage: () => calls.push('draw') }) };
  await assert.rejects(drawStudioLook(canvas, catalog, catalog.lineages[0].id, catalog.presets[0].selection, async src => { if (src.includes('.wearable.')) throw new Error('missing'); return {}; }), /missing/);
  assert.deepEqual(calls, []);
  assert.equal(sha(await fs.readFile(path.join(publicRoot, 'gear-style-studio/model.mjs'))), sha(await fs.readFile(path.join(root, 'packages/visual-engine/src/style-studio.mjs'))));
});

