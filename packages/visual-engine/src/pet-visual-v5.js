'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const DEFAULT_V5_WEBSITE_CATALOG_FILE = path.join(
  __dirname,
  '..',
  '..',
  'assets',
  'hatchery',
  'nft-v5',
  'website-visual-catalog-v5.json',
);
const DEFAULT_V5_PUBLIC_ROOT = path.join(__dirname, '..', '..', 'public');
const V5_WEBSITE_VISUAL_REVISION = '5.1.1';
const V5_Z_ORDER = Object.freeze([
  'background', 'aura', 'back', 'habitat', 'tool', 'pet', 'body',
  'face', 'head', 'charm', 'companion', 'foreground_fx', 'hud_front', 'frame',
]);
const V5_ALL_LEVEL_SLOTS = Object.freeze(['pet']);
const V5_LEVEL_10_DEFAULT_SLOTS = Object.freeze(['background', 'pet', 'hud_front']);
const V5_LEVEL_10_ONLY_SLOTS = Object.freeze([
  'aura', 'back', 'habitat', 'tool', 'body', 'face', 'head',
  'charm', 'companion', 'foreground_fx', 'frame',
]);
const V5_GEAR_SLOTS = Object.freeze([
  'head', 'face', 'body', 'back', 'tool', 'charm', 'companion', 'habitat',
]);

function loadV5WebsiteCatalog(file = DEFAULT_V5_WEBSITE_CATALOG_FILE) {
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (catalog?.schema !== 'AXO_PET_WEBSITE_VISUAL_CATALOG_V5'
    || catalog?.catalogId !== 'AXO_PET_WEBSITE_VISUALS_V5'
    || catalog?.visualRevision !== V5_WEBSITE_VISUAL_REVISION
    || catalog?.status !== 'ACTIVE_WEBSITE_VISUAL_RUNTIME'
    || catalog?.canonicalWebsiteVisual !== true
    || catalog?.onchainMetadataVisualRevision !== '4.3.0') {
    throw new Error('pet_v5_website_catalog_invalid');
  }
  if (catalog?.counts?.bases !== 60
    || catalog?.counts?.layerFamilies !== 12
    || catalog?.counts?.layerOptions !== 120
    || catalog?.counts?.lineageHuds !== 6
    || catalog?.bases?.length !== 60
    || catalog?.layers?.length !== 12
    || catalog?.hudByLineage?.length !== 6
    || catalog.layers.some((layer) => layer.options?.length !== 10)
    || V5_Z_ORDER.join(',') !== catalog.zOrder?.join(',')) {
    throw new Error('pet_v5_website_catalog_incomplete');
  }
  return catalog;
}

function cleanLineage(value, catalog) {
  const key = String(value || '').trim().toLowerCase();
  if (!catalog.lineages.some((lineage) => lineage.key === key)) throw new Error('pet_v5_lineage_invalid');
  return key;
}

function cleanLevel(value) {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('pet_v5_level_invalid');
  return level;
}

function immutableVisualSeed(pet) {
  const genesisId = String(pet?.genesisId || '').trim().toUpperCase();
  const appearanceSeed = String(pet?.appearanceSeed || '').trim().toLowerCase();
  if (!/^AXO-[0-9A-F]{10}$/.test(genesisId) || !/^[0-9a-f]{16}$/.test(appearanceSeed)) {
    throw new Error('pet_v5_identity_seed_invalid');
  }
  return `${appearanceSeed}:${genesisId}`;
}

function deterministicOptionId(pet, level, slot) {
  const digest = crypto.createHash('sha256')
    .update(`AXO:PET:WEBSITE:V5:${immutableVisualSeed(pet)}:${cleanLevel(level)}:${slot}`)
    .digest();
  return (digest.readUInt32BE(0) % 10) + 1;
}

function baseFor(catalog, lineageKey, level) {
  const base = catalog.bases.find((item) => item.lineageKey === lineageKey && Number(item.level) === level);
  if (!base) throw new Error('pet_v5_base_missing');
  return base;
}

function layerFor(catalog, slot, optionId) {
  const layer = catalog.layers.find((item) => item.slot === slot);
  const option = layer?.options?.find((item) => Number(item.id) === Number(optionId));
  if (!layer || !option) throw new Error(`pet_v5_layer_missing:${slot}:${optionId}`);
  return { layer, option };
}

function hudFor(catalog, lineageKey) {
  const hud = catalog.hudByLineage.find((item) => item.lineageKey === lineageKey);
  if (!hud) throw new Error(`pet_v5_hud_missing:${lineageKey}`);
  return hud;
}

function loadoutOptionId(value) {
  const numeric = Number(value || 0);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  const optionId = numeric > 10 ? numeric % 1_000 : numeric;
  return optionId >= 1 && optionId <= 10 ? optionId : null;
}

function v5BaseUrl(lineage, level, catalog = loadV5WebsiteCatalog()) {
  const lineageKey = cleanLineage(lineage, catalog);
  return baseFor(catalog, lineageKey, cleanLevel(level)).url;
}

function v5WebsiteVisualState(pet, {
  catalog = loadV5WebsiteCatalog(),
  level = Number(pet?.level || pet?.growthLevel || 1),
  loadout = {},
} = {}) {
  const numericLevel = cleanLevel(level);
  const lineageKey = cleanLineage(pet?.lineageId || pet?.lineage?.id, catalog);
  const stage = catalog.stages.find((item) => Number(item.level) === numericLevel);
  const base = baseFor(catalog, lineageKey, numericLevel);
  const layers = [];
  for (const slot of V5_Z_ORDER) {
    if (slot === 'pet') {
      layers.push({
        slot,
        z: V5_Z_ORDER.indexOf(slot),
        assetId: base.assetId,
        name: `${catalog.lineages.find((item) => item.key === lineageKey)?.label || lineageKey} · ${stage.label}`,
        runtimeUrl: base.url,
        runtimeSha256: base.runtimeSha256,
        opacity: 1,
        source: base.kind,
        active: true,
      });
      continue;
    }
    if (slot === 'hud_front') {
      const hud = hudFor(catalog, lineageKey);
      layers.push({
        slot,
        z: V5_Z_ORDER.indexOf(slot),
        assetId: hud.assetId,
        name: hud.name,
        runtimeUrl: hud.url,
        runtimeSha256: hud.runtimeSha256,
        opacity: 1,
        source: 'LINEAGE_HUD',
        active: numericLevel === 10,
        level10Only: true,
      });
      continue;
    }
    const override = numericLevel === 10 ? loadoutOptionId(loadout?.[slot]) : null;
    const optionId = override || deterministicOptionId(pet, numericLevel, slot);
    const { layer, option } = layerFor(catalog, slot, optionId);
    const active = numericLevel === 10 && (slot === 'background' || override !== null);
    layers.push({
      slot,
      z: V5_Z_ORDER.indexOf(slot),
      assetId: option.assetId,
      optionId,
      key: option.key,
      name: option.name,
      tier: option.tier,
      runtimeUrl: option.url,
      runtimeSha256: option.runtimeSha256,
      opacity: 1,
      source: override ? 'WARDROBE_OVERRIDE' : slot === 'background' && numericLevel === 10
        ? 'DETERMINISTIC_DNA_LEVEL'
        : 'AVAILABLE_WARDROBE_OPTION',
      active,
      level10Only: V5_LEVEL_10_ONLY_SLOTS.includes(slot),
    });
  }
  return {
    schema: 'AXO_PET_WEBSITE_VISUAL_STATE_V5',
    catalogId: catalog.catalogId,
    visualRevision: catalog.visualRevision,
    lineageKey,
    level: numericLevel,
    stage: { key: stage.key, label: stage.label, minimumXp: Number(stage.minimumXp) },
    selectionMode: numericLevel === 10
      ? 'DETERMINISTIC_BACKGROUND_WITH_EXPLICIT_WARDROBE'
      : 'AUTHORED_LINEAGE_LEVEL_SCENE_PLATFORMLESS',
    compositing: {
      canvas: [...catalog.canvas.delivery],
      blend: 'source-over',
      zOrder: [...V5_Z_ORDER],
      level10GearGeometry: true,
      preAdultSceneStackBakedIntoBase: numericLevel < 10,
      platformLayerRendered: false,
      level10DefaultSlots: [...V5_LEVEL_10_DEFAULT_SLOTS],
      level10WardrobeActivation: 'EXPLICIT_LOADOUT_OVERRIDE_ONLY',
    },
    layers,
    activeLayers: layers.filter((layer) => layer.active),
    boundaries: {
      websiteVisualOnly: true,
      onchainMetadataVisualRevision: catalog.onchainMetadataVisualRevision,
      identityChanged: false,
      lineageChanged: false,
      levelOrXpChanged: false,
      cosmeticOnly: true,
    },
  };
}

function v5GearVisual(slot, gearId, catalog = loadV5WebsiteCatalog()) {
  const optionId = loadoutOptionId(gearId);
  if (!optionId) return null;
  const { option } = layerFor(catalog, String(slot), optionId);
  return {
    optionId,
    name: option.name,
    tier: option.tier,
    imageUrl: option.url,
    assetId: option.assetId,
  };
}

function v5LoadoutFromGearItems(items = []) {
  if (!Array.isArray(items) || items.length > V5_GEAR_SLOTS.length) throw new Error('pet_v5_gear_loadout_invalid');
  const loadout = {};
  for (const item of items) {
    const slot = String(item?.slot || '');
    const gearId = Number(item?.id || 0);
    if (!V5_GEAR_SLOTS.includes(slot) || !Number.isSafeInteger(gearId) || gearId <= 0 || loadout[slot]) {
      throw new Error('pet_v5_gear_loadout_invalid');
    }
    if (!loadoutOptionId(gearId)) throw new Error('pet_v5_gear_visual_missing');
    loadout[slot] = gearId;
  }
  return loadout;
}

async function renderV5GearComposite(pet, {
  catalog = loadV5WebsiteCatalog(),
  loadout = {},
  publicRoot = DEFAULT_V5_PUBLIC_ROOT,
  outputFormat = 'png',
} = {}) {
  const visual = v5WebsiteVisualState(pet, { catalog, level: 10, loadout });
  const equipped = visual.activeLayers.filter((layer) => V5_GEAR_SLOTS.includes(layer.slot));
  if (!equipped.length) throw new Error('pet_v5_gear_composite_empty');
  const base = path.resolve(publicRoot);
  const checked = [];
  for (const layer of visual.activeLayers) {
    const relative = String(layer.runtimeUrl || '').replace(/^\//, '');
    const file = path.resolve(base, relative);
    if (!relative.startsWith('hatchery-nft-v5/') || !file.startsWith(`${base}${path.sep}`) || !fs.existsSync(file)) {
      throw new Error(`pet_v5_gear_asset_missing:${layer.slot}`);
    }
    const bytes = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== layer.runtimeSha256) {
      throw new Error(`pet_v5_gear_asset_hash_mismatch:${layer.slot}`);
    }
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
    if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.space !== 'srgb') {
      throw new Error(`pet_v5_gear_asset_invalid:${layer.slot}`);
    }
    if (layer.slot !== 'background' && !metadata.hasAlpha) throw new Error(`pet_v5_gear_asset_alpha_required:${layer.slot}`);
    checked.push({ layer, file });
  }
  const background = checked.find((item) => item.layer.slot === 'background');
  if (!background) throw new Error('pet_v5_gear_background_missing');
  let pipeline = sharp(background.file, { failOn: 'error' }).composite(
    checked.filter((item) => item !== background).map((item) => ({ input: item.file, blend: 'over' })),
  );
  pipeline = outputFormat === 'webp'
    ? pipeline.webp({ lossless: true, effort: 6 })
    : pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  return { buffer: await pipeline.toBuffer(), visual };
}

module.exports = {
  DEFAULT_V5_WEBSITE_CATALOG_FILE,
  DEFAULT_V5_PUBLIC_ROOT,
  V5_ALL_LEVEL_SLOTS,
  V5_LEVEL_10_DEFAULT_SLOTS,
  V5_LEVEL_10_ONLY_SLOTS,
  V5_GEAR_SLOTS,
  V5_WEBSITE_VISUAL_REVISION,
  V5_Z_ORDER,
  deterministicOptionId,
  loadV5WebsiteCatalog,
  renderV5GearComposite,
  v5BaseUrl,
  v5GearVisual,
  v5LoadoutFromGearItems,
  v5WebsiteVisualState,
};
