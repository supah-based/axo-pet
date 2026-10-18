'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { ethers } = require('ethers');

const DEFAULT_CATALOG_FILE = path.join(__dirname, '..', '..', 'assets', 'hatchery', 'nft-v4.3', 'trait-catalog-v4.3.json');
const DEFAULT_ART_ROOT = path.join(__dirname, '..', '..', 'design-handoffs', 'AXO-PET-NFT-Sys');
const CONTRACT_CHAIN_ID = 4663;
const ARENA_STATS = Object.freeze(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const GEAR_ARENA_STAT_CAP = 2;
const GEAR_ARENA_TOTAL_CAP = 4;
const GEAR_SLOT_STATS = Object.freeze({
  head: Object.freeze(['INT', 'WIS']),
  face: Object.freeze(['DEX', 'INT']),
  body: Object.freeze(['CON', 'STR']),
  back: Object.freeze(['DEX', 'CON']),
  tool: Object.freeze(['INT', 'STR']),
  charm: Object.freeze(['CHA', 'WIS']),
  companion: Object.freeze(['CHA', 'DEX']),
  habitat: Object.freeze(['CON', 'WIS']),
});
const GEAR_RARITY_BUDGET = Object.freeze({ COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 });
const V4_VISUAL_REVISION = '4.3.0';
const V4_Z_ORDER = Object.freeze([
  'environment_back',
  'landmark_mid',
  'platform_mid',
  'pet',
  'weather_grade',
  'machine_foreground',
  'small_tool',
  'hud_front',
]);
const V4_SCENE_SLOTS = Object.freeze(V4_Z_ORDER.filter((slot) => slot !== 'pet'));

function loadPetNftCatalog(file = DEFAULT_CATALOG_FILE) {
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (catalog?.schema !== 'AXO_PET_NFT_TRAIT_CATALOG_V4_3'
    || catalog?.catalogId !== 'AXO_PET_NFT_TRAITS_V4_3'
    || catalog?.visualRevision !== V4_VISUAL_REVISION
    || catalog?.visualSystem?.version !== V4_VISUAL_REVISION) {
    throw new Error('pet_nft_catalog_invalid');
  }
  return catalog;
}

function exactCatalogEntry(entries, key, label) {
  const numeric = Number(key);
  const entry = entries.find((item) => item.key === key || item.fitBand === key
    || (Number.isFinite(numeric) && [item.id, item.level].some((value) => value !== undefined && Number(value) === numeric)));
  if (!entry) throw new Error(`pet_nft_${label}_invalid`);
  return entry;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return `0x${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function gearArenaStats(item = {}) {
  const pair = GEAR_SLOT_STATS[String(item.slot || '').toLowerCase()];
  const budget = GEAR_RARITY_BUDGET[String(item.rarity || '').toUpperCase()];
  if (!pair || !budget) throw new Error('pet_nft_gear_profile_invalid');
  const stats = Object.fromEntries(ARENA_STATS.map((key) => [key, 0]));
  stats[pair[0]] = Math.min(GEAR_ARENA_STAT_CAP, budget);
  stats[pair[1]] = budget - stats[pair[0]];
  return stats;
}

function gearProfile(item = {}) {
  return { ...item, arenaStats: gearArenaStats(item), arenaOnly: true, minimumPetLevel: 10 };
}

function aggregateGearArenaStats(items = []) {
  const totals = Object.fromEntries(ARENA_STATS.map((key) => [key, 0]));
  const slots = new Set();
  for (const item of items) {
    if (!item?.slot || slots.has(item.slot)) throw new Error('pet_nft_gear_loadout_invalid');
    slots.add(item.slot);
    const stats = item.arenaStats || gearArenaStats(item);
    for (const key of ARENA_STATS) {
      const value = Number(stats[key] || 0);
      if (!Number.isInteger(value) || value < 0 || value > GEAR_ARENA_STAT_CAP) throw new Error('pet_nft_gear_stats_invalid');
      totals[key] += value;
    }
  }
  if (Object.values(totals).reduce((sum, value) => sum + value, 0) > 8 * GEAR_ARENA_TOTAL_CAP) {
    throw new Error('pet_nft_gear_loadout_stats_invalid');
  }
  return totals;
}

function visualAssets(catalog, predicate = () => true) {
  const assets = catalog?.visualSystem?.assets;
  if (!Array.isArray(assets) || assets.length !== 140) throw new Error('pet_nft_visual_catalog_invalid');
  return assets.filter(predicate);
}

function weightedAsset(items, roll) {
  if (!Number.isInteger(roll) || roll < 0 || roll > 9_999) throw new Error('pet_nft_visual_roll_invalid');
  const total = items.reduce((sum, item) => sum + Number(item?.rarity?.weightBps || 0), 0);
  if (total !== 10_000) throw new Error('pet_nft_visual_weights_invalid');
  let cursor = 0;
  for (const item of items) {
    cursor += Number(item.rarity.weightBps);
    if (roll < cursor) return item;
  }
  throw new Error('pet_nft_visual_selection_invalid');
}

function deterministicVisualRoll(dnaHash, level, slot, attempt = 0) {
  const seed = `${String(dnaHash).toLowerCase()}:${Number(level)}:${slot}:${Number(attempt)}`;
  const digest = crypto.createHash('sha256').update(`AXO:PET:VISUAL:V4:${seed}`).digest();
  return Math.floor((digest.readUInt32BE(0) / 0x1_0000_0000) * 10_000);
}

function sceneAssetAtLevel({ catalog, dnaHash, slot, level }) {
  const items = visualAssets(catalog, (asset) => asset.slot === slot)
    .sort((a, b) => Number(a.traitIndex) - Number(b.traitIndex));
  const expectedCount = slot === 'environment_back' ? 20 : 10;
  if (items.length !== expectedCount) throw new Error(`pet_nft_visual_slot_invalid:${slot}`);
  let previousAssetId = null;
  let selected = null;
  for (let currentLevel = 1; currentLevel <= Number(level); currentLevel += 1) {
    selected = null;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = weightedAsset(items, deterministicVisualRoll(dnaHash, currentLevel, slot, attempt));
      if (candidate.assetId !== previousAssetId) {
        selected = candidate;
        break;
      }
    }
    if (!selected) throw new Error(`pet_nft_visual_repeat_resolution_failed:${slot}`);
    previousAssetId = selected.assetId;
  }
  return selected;
}

function compactVisualLayer(asset) {
  return {
    slot: asset.slot,
    assetId: asset.assetId,
    name: asset.trait.name,
    rarityClass: asset.rarity.class,
    rarityWeightBps: Number(asset.rarity.weightBps),
    masterSha256: asset.master.sha256,
    runtimeSha256: asset.runtime.sha256,
    lore: asset.trait.lore,
    degenCulture: asset.trait.degenCulture,
    toolConnection: asset.trait.toolConnection,
  };
}

function petNftVisualState({ catalog, dnaHash, lineageKey, level }) {
  const numericLevel = Number(level);
  const pet = visualAssets(catalog, (asset) => asset.slot === 'pet'
    && asset.lineageKey === lineageKey
    && Number(asset.level) === numericLevel)[0];
  if (!pet) throw new Error('pet_nft_visual_pet_missing');
  const selected = Object.fromEntries(V4_SCENE_SLOTS.map((slot) => [
    slot,
    sceneAssetAtLevel({ catalog, dnaHash, slot, level: numericLevel }),
  ]));
  const ordered = V4_Z_ORDER.map((slot) => compactVisualLayer(slot === 'pet' ? pet : selected[slot]));
  return {
    schema: 'AXO_PET_VISUAL_STATE_V4_3',
    visualRevision: V4_VISUAL_REVISION,
    category: catalog.category,
    lineageKey,
    level: numericLevel,
    role: {
      name: pet.trait.name,
      lore: pet.trait.lore,
      toolConnection: pet.trait.toolConnection,
      rarityClass: pet.rarity.class,
      rarityWeightBps: Number(pet.rarity.weightBps),
    },
    layers: ordered,
  };
}

function petNftGenesisHash(genesisId) {
  const clean = String(genesisId || '').trim().toUpperCase();
  if (!/^AXO-[0-9A-F]{10}$/.test(clean)) throw new Error('pet_nft_genesis_id_invalid');
  return ethers.keccak256(ethers.toUtf8Bytes(clean));
}

function petNftTokenId(genesisId) {
  return BigInt(petNftGenesisHash(genesisId)).toString();
}

function petNftDna(pet, catalog = loadPetNftCatalog()) {
  const genesisId = String(pet?.genesisId || '').trim().toUpperCase();
  const appearanceSeed = String(pet?.appearanceSeed || '').trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(appearanceSeed)) throw new Error('pet_nft_appearance_seed_invalid');
  const lineage = exactCatalogEntry(catalog.lineages, pet?.lineageId, 'lineage');
  const digest = crypto.createHash('sha256').update(`AXO:PET:NFT:DNA:V1:${appearanceSeed}:${genesisId}`).digest();
  const select = (entries, offset) => entries[digest[offset] % entries.length];
  const dna = {
    catalogId: catalog.dnaCatalogId || catalog.catalogId,
    genesisId,
    appearanceSeed,
    lineage: { id: lineage.id, key: lineage.key, label: lineage.label },
    originEnvironment: select(catalog.immutableDna.environments, 0),
    aura: select(catalog.immutableDna.auras, 1),
    gillCrest: select(catalog.immutableDna.gillCrests, 2),
    eyeLens: select(catalog.immutableDna.eyeLenses, 3),
    bodyMarking: select(catalog.immutableDna.bodyMarkings, 4),
    birthSigil: select(catalog.immutableDna.birthSigils, 5),
    constellation: select(catalog.immutableDna.constellations, 6),
  };
  return { ...dna, dnaHash: sha256Hex(canonicalJson(dna)) };
}

function fitBandForLevel(level, catalog = loadPetNftCatalog()) {
  const numeric = Number(level);
  const band = catalog.fitBands.find((item) => item.levels.includes(numeric));
  if (!band) throw new Error('pet_nft_growth_level_invalid');
  return band;
}

function specializationForPet(pet, catalog = loadPetNftCatalog()) {
  const route = String(pet?.specialtyArchetype?.id || pet?.specialtyArchetype || '').trim().toLowerCase();
  return catalog.specializations.find((item) => item.key === route) || catalog.specializations[0];
}

function petNftState(pet, { catalog = loadPetNftCatalog(), activeEnvironment = null, metadataRevision = 1, gearRevision = 0, loadout = {} } = {}) {
  const dna = petNftDna(pet, catalog);
  const level = Number(pet?.level || pet?.growthLevel || 1);
  const stage = exactCatalogEntry(catalog.growthStages, level, 'growth_level');
  const specialization = specializationForPet(pet, catalog);
  const environment = activeEnvironment === null
    ? dna.originEnvironment
    : exactCatalogEntry(catalog.immutableDna.environments, activeEnvironment, 'active_environment');
  const visual = petNftVisualState({
    catalog,
    dnaHash: dna.dnaHash,
    lineageKey: dna.lineage.key,
    level,
  });
  const state = {
    catalogId: catalog.catalogId,
    chainId: CONTRACT_CHAIN_ID,
    genesisId: dna.genesisId,
    genesisHash: petNftGenesisHash(dna.genesisId),
    tokenId: petNftTokenId(dna.genesisId),
    dnaHash: dna.dnaHash,
    lineage: dna.lineage,
    growth: { level, key: stage.key, label: stage.label, minimumXp: stage.minimumXp, fitBand: stage.fitBand },
    originEnvironment: { id: dna.originEnvironment.id, key: dna.originEnvironment.key, label: dna.originEnvironment.label },
    activeEnvironment: { id: environment.id, key: environment.key, label: environment.label },
    aura: { id: dna.aura.id, key: dna.aura.key, label: dna.aura.label },
    gillCrest: { id: dna.gillCrest.id, key: dna.gillCrest.key, label: dna.gillCrest.label },
    eyeLens: { id: dna.eyeLens.id, key: dna.eyeLens.key, label: dna.eyeLens.label },
    bodyMarking: { id: dna.bodyMarking.id, key: dna.bodyMarking.key, label: dna.bodyMarking.label },
    birthSigil: { id: dna.birthSigil.id, key: dna.birthSigil.key, label: dna.birthSigil.label },
    constellation: { id: dna.constellation.id, key: dna.constellation.key, label: dna.constellation.label },
    specialization: { id: specialization.id, key: specialization.key, label: specialization.label, artFitBands: [...(specialization.artFitBands || [])] },
    visual,
    loadout: Object.fromEntries(catalog.gearSlots.map((slot) => [slot.key, Number(loadout[slot.key] || 0)])),
    metadataRevision: Math.max(1, Number(metadataRevision || 1)),
    gearRevision: Math.max(0, Number(gearRevision || 0)),
  };
  return { ...state, stateHash: sha256Hex(canonicalJson(state)) };
}

function normalizedRelativePath(value) {
  const clean = path.posix.normalize(String(value || '')).replace(/^\.\//, '');
  if (!clean || clean.startsWith('../') || path.posix.isAbsolute(clean)) throw new Error('pet_nft_layer_path_invalid');
  return clean;
}

function petNftLayerPlan(state, { catalog = loadPetNftCatalog() } = {}) {
  if (state?.visual?.schema !== 'AXO_PET_VISUAL_STATE_V4_3'
    || state.visual.visualRevision !== catalog.visualRevision
    || state.visual.lineageKey !== state.lineage.key
    || Number(state.visual.level) !== Number(state.growth.level)) {
    throw new Error('pet_nft_visual_state_invalid');
  }
  const assets = new Map(visualAssets(catalog).map((asset) => [asset.assetId, asset]));
  const layers = state.visual.layers.map((selected, z) => {
    const asset = assets.get(selected.assetId);
    const expectedSlot = V4_Z_ORDER[z];
    if (!asset || asset.slot !== expectedSlot || selected.slot !== expectedSlot) {
      throw new Error(`pet_nft_visual_layer_invalid:${expectedSlot}`);
    }
    return {
      z,
      category: expectedSlot,
      trait: asset.trait.name,
      lore: asset.trait.lore,
      degenCulture: asset.trait.degenCulture,
      toolConnection: asset.trait.toolConnection,
      rarityClass: asset.rarity.class,
      rarityWeightBps: Number(asset.rarity.weightBps),
      assetId: asset.assetId,
      required: true,
      opacity: expectedSlot === 'weather_grade' ? Number(catalog.visualSystem.weatherDefaultOpacity) : 1,
      relativePath: normalizedRelativePath(asset.master.path),
      runtimeRelativePath: normalizedRelativePath(asset.runtime.path),
      masterSha256: asset.master.sha256,
      runtimeSha256: asset.runtime.sha256,
    };
  });
  if (layers.length !== V4_Z_ORDER.length) throw new Error('pet_nft_visual_layer_count_invalid');
  return layers;
}

function petNftRuntimeAsset(assetId, {
  catalog = loadPetNftCatalog(),
  artRoot = DEFAULT_ART_ROOT,
} = {}) {
  const cleanId = String(assetId || '');
  if (!/^[a-z0-9_]{3,80}$/.test(cleanId)) throw new Error('pet_nft_runtime_asset_id_invalid');
  const asset = visualAssets(catalog, (item) => item.assetId === cleanId)[0];
  if (!asset) throw new Error('pet_nft_runtime_asset_not_found');
  const base = path.resolve(artRoot);
  const file = path.resolve(base, normalizedRelativePath(asset.runtime.path));
  if (!file.startsWith(`${base}${path.sep}`) || !fs.existsSync(file)) throw new Error('pet_nft_runtime_asset_missing');
  return {
    assetId: cleanId,
    file,
    sha256: asset.runtime.sha256,
    bytes: Number(asset.runtime.bytes),
    mimeType: 'image/webp',
  };
}

async function validatePetNftLayer(file, { catalog, opaque, expectedSha256 = null }) {
  const metadata = await sharp(file).metadata();
  if (metadata.width !== catalog.canvas.masterWidth || metadata.height !== catalog.canvas.masterHeight) {
    throw new Error(`pet_nft_layer_dimensions_invalid:${path.basename(file)}`);
  }
  if (!opaque && !metadata.hasAlpha) throw new Error(`pet_nft_layer_alpha_required:${path.basename(file)}`);
  if (metadata.space !== 'srgb') throw new Error(`pet_nft_layer_color_space_invalid:${path.basename(file)}`);
  if (expectedSha256 && sha256Hex(fs.readFileSync(file)).slice(2) !== String(expectedSha256).toLowerCase().replace(/^0x/, '')) {
    throw new Error(`pet_nft_layer_hash_mismatch:${path.basename(file)}`);
  }
  return { width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, format: metadata.format };
}

async function validatePetNftAssets(state, {
  catalog = loadPetNftCatalog(),
  artRoot = DEFAULT_ART_ROOT,
  assetHashes = null,
} = {}) {
  const layers = petNftLayerPlan(state, { catalog });
  const checks = [];
  for (const layer of layers) {
    const file = path.join(artRoot, layer.relativePath);
    if (!fs.existsSync(file)) {
      if (layer.required) throw new Error(`pet_nft_layer_missing:${layer.relativePath}`);
      continue;
    }
    const expectedSha256 = assetHashes?.get?.(layer.relativePath) || null;
    if (assetHashes && !expectedSha256) throw new Error(`pet_nft_layer_not_in_release:${layer.relativePath}`);
    checks.push({ ...layer, file, ...(await validatePetNftLayer(file, {
      catalog,
      opaque: layer.category === 'environment_back',
      expectedSha256,
    })) });
  }
  return checks;
}

async function renderPetNftComposite(state, {
  catalog = loadPetNftCatalog(),
  artRoot = DEFAULT_ART_ROOT,
  outputFormat = 'png',
  assetHashes = null,
} = {}) {
  const checked = await validatePetNftAssets(state, { catalog, artRoot, assetHashes });
  const background = checked.find((item) => item.category === 'environment_back');
  if (!background) throw new Error('pet_nft_environment_missing');
  const overlays = [];
  for (const item of checked.filter((entry) => entry !== background)) {
    let input = item.file;
    if (Number(item.opacity) < 1) {
      input = await sharp(item.file, { failOn: 'error' })
        .ensureAlpha()
        .linear([1, 1, 1, Number(item.opacity)], [0, 0, 0, 0])
        .png()
        .toBuffer();
    }
    overlays.push({ input, blend: 'over' });
  }
  const master = await sharp(background.file, { failOn: 'error' }).composite(overlays).png().toBuffer();
  let pipeline = sharp(master, { failOn: 'error' }).resize(
    catalog.canvas.deliveryWidth,
    catalog.canvas.deliveryHeight,
    { fit: 'fill', kernel: sharp.kernel.lanczos3 },
  );
  if (outputFormat === 'webp') pipeline = pipeline.webp({ lossless: true, effort: 6 });
  else pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  return pipeline.toBuffer();
}

function buildPetNftMetadata({
  pet,
  state,
  imageUri,
  previousMetadataUri = null,
  externalUrl = 'https://www.axo.pet/hatchery',
  artReleaseManifestSha256 = null,
  gear = [],
  imageVisual = null,
}) {
  if (!/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(imageUri || ''))) throw new Error('pet_nft_image_uri_invalid');
  if (previousMetadataUri !== null && !/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(previousMetadataUri || ''))) {
    throw new Error('pet_nft_previous_metadata_uri_invalid');
  }
  if (state?.visual?.schema !== 'AXO_PET_VISUAL_STATE_V4_3' || state.visual.layers?.length !== 8) {
    throw new Error('pet_nft_visual_state_invalid');
  }
  const safeName = String(pet?.name || 'AXO Pet').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 40) || 'AXO Pet';
  const attributes = [
    ['Category', 'AXO PET'],
    ['Genesis ID', state.genesisId],
    ['Soulbound', 'Yes'],
    ['Lineage', state.lineage.label],
    ['Level', state.growth.level, 'number'],
    ['Growth Stage', state.growth.label],
    ['Role', state.visual.role.name],
    ['Role Rarity', state.visual.role.rarityClass],
    ['Metadata Revision', state.metadataRevision, 'number'],
    ['Gear Revision', state.gearRevision, 'number'],
  ].map(([trait_type, value, display_type]) => ({ trait_type, value, ...(display_type ? { display_type } : {}) }));
  for (const layer of state.visual.layers.filter((item) => item.slot !== 'pet')) {
    const label = {
      environment_back: 'Environment',
      landmark_mid: 'Landmark',
      platform_mid: 'Platform',
      machine_foreground: 'Machine',
      small_tool: 'Tool',
      weather_grade: 'Weather',
      hud_front: 'HUD',
    }[layer.slot] || layer.slot;
    attributes.push({ trait_type: label, value: layer.name });
    attributes.push({ trait_type: `${label} Rarity`, value: layer.rarityClass });
  }
  for (const item of gear) {
    const profile = gearProfile(item);
    attributes.push({ trait_type: `Gear · ${item.slotLabel}`, value: item.label });
    for (const [stat, value] of Object.entries(profile.arenaStats).filter(([, value]) => value > 0)) {
      attributes.push({ trait_type: `Arena · ${item.slotLabel} · ${stat}`, value, display_type: 'number' });
    }
  }
  return {
    name: `AXO PET: ${safeName}`,
    description: `${safeName} is a growing, soulbound ${state.lineage.label} on Robinhood Chain. Its base lineage never changes; its eight-layer scene evolves deterministically with authoritative Hatchery levels through level 10. Scene rarity is cosmetic and every tool-shaped trait carries AXO degen lore, not financial utility.`,
    image: imageUri,
    external_url: externalUrl,
    attributes,
    properties: {
      schema: 'AXO_SOUL_PET_METADATA_V4_3',
      category: 'AXO PET',
      chainId: CONTRACT_CHAIN_ID,
      catalogId: state.catalogId,
      visualRevision: state.visual.visualRevision,
      metadataRevision: state.metadataRevision,
      previousMetadataUri,
      genesisId: state.genesisId,
      genesisHash: state.genesisHash,
      dnaHash: state.dnaHash,
      stateHash: state.stateHash,
      soulbound: true,
      transferableGearOnly: true,
      walletAddressIncluded: false,
      gameplayAuthority: 'AXO_HATCHERY_SQLITE',
      lineage: {
        key: state.lineage.key,
        label: state.lineage.label,
        immutable: true,
      },
      growth: {
        level: state.growth.level,
        stage: state.growth.label,
        role: state.visual.role,
      },
      compositing: {
        canvas: [4096, 4096],
        blend: 'source-over',
        weatherOpacity: 0.5,
        zOrder: [...V4_Z_ORDER],
        artReleaseManifestSha256,
        layers: state.visual.layers.map((layer) => ({
          slot: layer.slot,
          assetId: layer.assetId,
          name: layer.name,
          rarityClass: layer.rarityClass,
          rarityWeightBps: layer.rarityWeightBps,
          masterSha256: layer.masterSha256,
          runtimeSha256: layer.runtimeSha256,
          lore: layer.lore,
          degenCulture: layer.degenCulture,
          toolConnection: layer.toolConnection,
        })),
      },
      imageCompositing: imageVisual ? {
        catalogId: imageVisual.catalogId,
        visualRevision: imageVisual.visualRevision,
        level: Number(imageVisual.level),
        canvas: [...imageVisual.compositing.canvas],
        blend: imageVisual.compositing.blend,
        zOrder: [...imageVisual.compositing.zOrder],
        layers: imageVisual.activeLayers.map((layer) => ({
          slot: layer.slot,
          assetId: layer.assetId,
          optionId: layer.optionId || null,
          runtimeSha256: layer.runtimeSha256,
          source: layer.source,
        })),
      } : null,
      gear: gear.map((item) => {
        const profile = gearProfile(item);
        return {
          id: Number(item.id),
          slot: item.slot,
          key: item.key,
          label: item.label,
          rarity: item.rarity,
          minimumPetLevel: profile.minimumPetLevel,
          arenaOnly: true,
          arenaStats: profile.arenaStats,
        };
      }),
      arenaGearStats: aggregateGearArenaStats(gear.map(gearProfile)),
    },
  };
}

module.exports = {
  ARENA_STATS,
  CONTRACT_CHAIN_ID,
  DEFAULT_ART_ROOT,
  DEFAULT_CATALOG_FILE,
  buildPetNftMetadata,
  canonicalJson,
  aggregateGearArenaStats,
  fitBandForLevel,
  gearArenaStats,
  gearProfile,
  loadPetNftCatalog,
  petNftDna,
  petNftGenesisHash,
  petNftLayerPlan,
  petNftRuntimeAsset,
  petNftState,
  petNftTokenId,
  petNftVisualState,
  renderPetNftComposite,
  sceneAssetAtLevel,
  sha256Hex,
  specializationForPet,
  validatePetNftAssets,
  V4_SCENE_SLOTS,
  V4_VISUAL_REVISION,
  V4_Z_ORDER,
};
