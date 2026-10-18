import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { STUDIO_SLOTS, buildRenderPlan, selectionFromURL, selectionToURL, drawStudioLook } from '../src/style-studio.mjs';
import { assertPoseRig, resolveAnchoredRect } from '../src/fit-rig.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const publicRoot = path.join(root, 'apps/hatchery-web/public');
const catalog = JSON.parse(await fs.readFile(path.join(publicRoot, 'gear-style-studio/v1/catalog.json')));
const source = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/collections/style-studio-v1.source.json')));
const canonical = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/catalogs/website-visual-catalog-v5.json')));
const rig = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/collections/level10-fit-rig-v2.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assetBytes = record => fs.readFile(path.join(publicRoot, '.' + record.asset));

test('candidate collection has 30 original designs, three per preview slot, without inventory or chain claims', () => {
  assert.equal(catalog.items.length, 30); assert.equal(new Set(catalog.items.map(item => item.id)).size, 30);
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
  for (const record of [...catalog.lineages.flatMap(base => [base, base.footwearBase, ...Object.values(base.occluders)]), ...catalog.showcases, ...catalog.items.flatMap(item => [item.itemArt, item.thumbnail, item.wearable, ...(item.wearable.rear ? [item.wearable.rear] : [])])]) {
    assert.match(record.asset, /^\/gear-style-studio\/v1\/[a-z0-9_.-]+\.webp$/);
    const bytes = await assetBytes(record), meta = await sharp(bytes).metadata();
    assert.equal(sha(bytes), record.sha256, record.asset);
    assert.equal(meta.width, record.width); assert.equal(meta.height, record.height); assert.equal(meta.hasAlpha, true);
    const stats = await sharp(bytes).stats(); assert.equal(stats.channels[3].min, 0); assert.ok(stats.channels[3].max > 220);
  }
});

test('closed footwear selects a masked base, suppressing toes while preserving the original reference', async () => {
  for (const base of catalog.lineages) {
    const original = await sharp(await assetBytes(base)).ensureAlpha().raw().toBuffer();
    const masked = await sharp(await assetBytes(base.footwearBase)).ensureAlpha().raw().toBuffer();
    for (const [x, y] of [[350, 925], [700, 925]]) {
      assert.ok(original[(y * 1024 + x) * 4 + 3] > 200); assert.equal(masked[(y * 1024 + x) * 4 + 3], 0);
    }
    assert.equal(masked[(500 * 1024 + 520) * 4 + 3], original[(500 * 1024 + 520) * 4 + 3]);
    assert.equal(buildRenderPlan(catalog, base.id, { footwear: 'hexstep-boots' }).find(layer => layer.kind === 'pet').src, base.footwearBase.asset);
    assert.equal(buildRenderPlan(catalog, base.id, {}).find(layer => layer.kind === 'pet').src, base.asset);
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

test('garment fronts protect the neck and bent arm, with internal rear surfaces behind the skin', async () => {
  for (const item of catalog.items.filter(item => ['body', 'pants'].includes(item.slot))) {
    const points = item.slot === 'body' ? [[520, 480], [375, 650], [700, 515], [640, 577]] : [[520, 664], [375, 650]];
    const { data, info } = await sharp(await assetBytes(item.wearable)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [x, y] of points) assert.equal(data[(y * 1024 + x) * info.channels + 3], 0, `${item.id}: protected ${x},${y}`);
  }
});

test('render plan puts garment interiors behind the Pet and original skin above clothing and tools', () => {
  for (const preset of catalog.presets) {
    assert.deepEqual(Object.keys(preset.selection), STUDIO_SLOTS);
    const plan = buildRenderPlan(catalog, catalog.lineages[0].id, preset.selection);
    assert.deepEqual(plan.map(layer => layer.plane), ['habitat', 'back', 'body-rear', 'pants-rear', 'pet', 'footwear', 'pants', 'body', 'pet-arms', 'face', 'head', 'tool', 'pet-grip', 'charm', 'companion']);
    assert.equal(new Set(plan.filter(layer => layer.kind === 'gear').map(layer => layer.slot)).size, 10);
  }
  const invalid = { ...catalog.presets[0].selection, head: catalog.items.find(item => item.slot === 'body').id };
  assert.throws(() => buildRenderPlan(catalog, catalog.lineages[0].id, invalid), /slot/);
  assert.throws(() => buildRenderPlan(catalog, 'unknown', {}), /reference/);
  assert.throws(() => buildRenderPlan(catalog, catalog.lineages[0].id, { weapon: 'unknown' }), /slot/);
});

test('mirrored tool anchors land on the grip without stretching their original proportions', async () => {
  assertPoseRig(rig);
  for (const item of catalog.items.filter(item => item.slot === 'tool')) {
    const [left, top, width, height] = item.wearable.targetRect, anchor = item.wearable.anchor;
    assert.equal(item.wearable.mirrorX, true); assert.equal(anchor.name, 'grip'); assert.equal(anchor.preserveAspect, true);
    assert.ok(Math.abs(left + (1 - anchor.origin[0]) * width - rig.anchors.grip[0]) <= .5);
    assert.ok(Math.abs(top + anchor.origin[1] * height - rig.anchors.grip[1]) <= .5);
    const { info } = await sharp(await assetBytes(item.itemArt)).trim({ background: '#00000000', threshold: 8 }).png().toBuffer({ resolveWithObject: true });
    assert.ok(Math.abs((width / height) / (info.width / info.height) - 1) < .025, item.id);
  }
  assert.throws(() => resolveAnchoredRect({ anchor: 'unknown', origin: [.5,.5], size: [100,100] }, rig), /anchor/);
  assert.throws(() => resolveAnchoredRect({ anchor: 'grip', origin: [2,.5], size: [100,100] }, rig), /geometry/);
  assert.throws(() => resolveAnchoredRect({ anchor: 'grip', origin: [0,0], size: [300,300] }, rig), /outside/);
  assert.throws(() => resolveAnchoredRect({ anchor: 'grip', origin: [.5,.5], size: [100,100], rotation: 10 }, rig), /rotation/);
});

test('foreground fingers preserve original lineage pixels and missing depth/pose assets fail closed', async () => {
  for (const base of catalog.lineages) {
    const original = await sharp(await assetBytes(base)).ensureAlpha().raw().toBuffer();
    const fingers = await sharp(await assetBytes(base.occluders.grip)).ensureAlpha().raw().toBuffer();
    for (const [x,y] of [[821,470], [903,469], [905,512], [871,541]]) {
      const offset = (y * 1024 + x) * 4;
      assert.deepEqual([...fingers.subarray(offset,offset+4)], [...original.subarray(offset,offset+4)]);
    }
    assert.equal(fingers[(500 * 1024 + 520) * 4 + 3], 0);
  }
  for (const mutation of [
    c => { delete c.lineages[0].occluders.grip; },
    c => { c.items.find(i => i.id === 'diamond-hands-harness').wearable.rear = null; },
    c => { c.items.find(i => i.id === 'gas-fee-guzzler').wearable.poseId = 'other-pose'; },
    c => { delete c.fitSystem; }
  ]) {
    const broken = structuredClone(catalog); mutation(broken);
    assert.throws(() => buildRenderPlan(broken, broken.lineages[0].id, { ...catalog.presets[0].selection, tool: 'gas-fee-guzzler' }), /occlusion|depth|pose|profile/);
  }
});

test('body fits are mirrored, shoes use independent feet and preview slots do not modify the canonical eight', async () => {
  const traits = JSON.parse(await fs.readFile(path.join(root, 'packages/gear-catalog/catalogs/trait-catalog-v4.3.json')));
  assert.deepEqual(traits.gearSlots.map(slot => slot.key), ['head', 'face', 'body', 'back', 'tool', 'charm', 'companion', 'habitat']);
  assert.deepEqual(catalog.slotCompatibility.candidateOnlySlots, ['pants', 'footwear']);
  for (const item of catalog.items.filter(item => item.slot === 'body')) {
    assert.equal(item.wearable.mirrorX, true); assert.deepEqual(item.wearable.targetRect, [377, 470, 291, 255]);
  }
  for (const item of catalog.items.filter(item => item.slot === 'footwear')) {
    assert.equal(item.wearable.pieces.length, 2);
    assert.ok(item.wearable.pieces[0].rect[0] + item.wearable.pieces[0].rect[2] < item.wearable.pieces[1].rect[0]);
    const { data, info } = await sharp(await assetBytes(item.wearable)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[(900 * 1024 + 512) * info.channels + 3], 0, item.id);
    for (const [x, y] of source.items.find(input => input.id === item.id).fit.ankleOpenings) assert.equal(data[(y * 1024 + x) * info.channels + 3], 0, `${item.id}: ankle opening`);
  }
  for (const item of catalog.items.filter(item => item.slot === 'pants')) assert.ok(item.wearable.rowScale.at(-1).scale > 1);
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
