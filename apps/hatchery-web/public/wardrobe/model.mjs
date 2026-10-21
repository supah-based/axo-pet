// Cosmetic drafts only. This module cannot establish ownership or authorize transactions.
export const WARDROBE_READ_VERSION = 'AXO_WARDROBE_READ_V1';
export const PREVIEW_VERSION = 'AXO_WARDROBE_PREVIEW_V1';
export const WARDROBE_LOCKS = Object.freeze({ equipV2: false, mint: false, marketplace: false, previewStats: false });
const slots = ['head', 'face', 'body', 'back', 'tool', 'charm', 'companion', 'habitat', 'pants', 'footwear'];
const lineages = ['emerald_sprout', 'sapphire_tide', 'amethyst_dream', 'solar_peach', 'rose_bloom', 'midnight_mint'];
const thresholds = [0, 40, 100, 180, 280, 400, 550, 730, 940, 1200];
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => record(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const address = x => typeof x === 'string' && /^0x(?!0{40}$)[a-f0-9]{40}$/i.test(x);
const sha256 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
export const sameWallet = (a, b) => address(a) && address(b) && a.toLowerCase() === b.toLowerCase();

// Client transport guards; the authenticated host additionally runs the full shared V1 validators.
export function assertWardrobeRead(read, owner, now = Date.now()) {
  if (!exact(read, ['schemaVersion', 'status', 'observedAt', 'expiresAt', 'identity', 'equipment', 'authoritativeVisual'])
    || read.schemaVersion !== WARDROBE_READ_VERSION || read.status !== 'READY') throw Error('Pet read unavailable.');
  const observed = Date.parse(read.observedAt), expires = Date.parse(read.expiresAt), pet = read.identity;
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || expires <= now || observed > now + 5000
    || expires <= observed || expires - observed > 60000) throw Error('Pet read expired. Refresh your wallet view.');
  if (!record(pet) || pet.schemaVersion !== 'AXO_PET_IDENTITY_V1' || !sameWallet(pet.ownerAddress, owner)
    || !/^AXO-[A-F0-9]{10}$/.test(pet.genesisId) || typeof pet.name !== 'string' || !pet.name.trim() || pet.name.length > 80
    || !lineages.includes(pet.lineageId) || !Number.isSafeInteger(pet.xp) || pet.xp < 0
    || pet.level !== thresholds.filter(t => pet.xp >= t).length || !Number.isSafeInteger(pet.gearRevision) || pet.gearRevision < 0) throw Error('Verified Pet identity unavailable.');
  const gear = read.equipment;
  if (!record(gear)) throw Error('Equipment read unavailable.');
  if (gear.status === 'VERIFIED_ONCHAIN') {
    if (gear.schemaVersion !== 'AXO_VERIFIED_GEAR_PROJECTION_V1' || !sameWallet(gear.ownerAddress, owner)
      || gear.petGenesisId !== pet.genesisId || gear.revision !== pet.gearRevision || pet.nft?.status !== 'MINTED'
      || gear.petTokenId !== pet.nft.tokenId || gear.chain?.chainId !== pet.nft.chainId
      || !sameWallet(gear.chain?.petContract, pet.nft.contractAddress) || !Array.isArray(gear.items) || gear.items.length > 8
      || new Set(gear.items.map(i => i.slot)).size !== gear.items.length
      || gear.items.some(i => !slots.slice(0, 8).includes(i.slot) || !Number.isSafeInteger(i.id) || i.id < 1 || i.id !== i.definition?.id || i.slot !== i.definition?.slot)) throw Error('V1 equipment does not match this Pet.');
  } else if (gear.schemaVersion !== 'AXO_GEAR_READ_FAILURE_V1' || !['UNAVAILABLE', 'INCONSISTENT'].includes(gear.status) || gear.data !== null) throw Error('Unknown equipment state.');
  const visual = read.authoritativeVisual;
  if (!exact(visual, ['visualRevision', 'equipmentIncluded', 'layers']) || visual.visualRevision !== '5.1.1'
    || visual.equipmentIncluded !== (gear.status === 'VERIFIED_ONCHAIN') || !Array.isArray(visual.layers) || !visual.layers.length || visual.layers.length > 11
    || visual.layers.some(l => !record(l) || !Number.isSafeInteger(l.z) || !/^\/hatchery-nft-v5(?:\.1\.1)?\/[a-z0-9_]+\.webp$/.test(l.url) || !sha256(l.sha256))
    || visual.layers.some((l, i) => i && l.z <= visual.layers[i - 1].z)) throw Error('Authoritative portrait unavailable.');
  return read;
}

export function emptyPreview(catalog) {
  return { schemaVersion: PREVIEW_VERSION, poseId: catalog.rig.poseId, rigSha256: catalog.rigSha256, items: {}, sceneId: catalog.defaultScene || null, appearance: true };
}
export function assertPreview(look, catalog) {
  if (!exact(look, ['schemaVersion', 'poseId', 'rigSha256', 'items', 'sceneId', 'appearance']) || look.schemaVersion !== PREVIEW_VERSION
    || look.poseId !== catalog.rig.poseId || look.rigSha256 !== catalog.rigSha256 || !record(look.items) || Object.keys(look.items).length > 10
    || typeof look.appearance !== 'boolean' || (look.sceneId !== null && !catalog.scenes.some(s => s.id === look.sceneId))) throw Error('This saved preview is incompatible.');
  for (const [slot, entry] of Object.entries(look.items)) {
    const item = catalog.items.find(i => i.id === entry?.family && i.slot === slot);
    if (!slots.includes(slot) || !exact(entry, ['family', 'itemLevel']) || !item || !item.variants.some(v => v.itemLevel === entry.itemLevel)) throw Error('Unknown preview piece or tier.');
  }
  return look;
}
export function previewSelection(look, catalog) {
  assertPreview(look, catalog);
  return Object.fromEntries(Object.entries(look.items).map(([slot, entry]) => [slot, entry.family]));
}
export function withPreviewItem(look, catalog, family, itemLevel) {
  assertPreview(look, catalog);
  const item = catalog.items.find(i => i.id === family);
  if (!item || !item.variants.some(v => v.itemLevel === itemLevel)) throw Error('Unknown preview item.');
  const next = structuredClone(look);
  next.items[item.slot] = { family, itemLevel };
  return next;
}
export function withPreviewOutfit(look, catalog, presetId, itemLevel) {
  const preset = catalog.presets.find(p => p.id === presetId);
  if (!preset) throw Error('Unknown outfit.');
  let next = { ...emptyPreview(catalog), sceneId: look.sceneId, appearance: look.appearance };
  for (const family of Object.values(preset.selection)) next = withPreviewItem(next, catalog, family, itemLevel);
  return next;
}

export async function previewStorageKey(owner, genesisId, cryptoImpl = globalThis.crypto) {
  if (!address(owner) || !/^AXO-[A-F0-9]{10}$/.test(genesisId)) throw Error('A verified Pet is required to save an outfit.');
  const bytes = new TextEncoder().encode(owner.toLowerCase() + ':' + genesisId);
  const hash = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return 'axo:wardrobe:preview:v1:' + [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export class PreviewOutfits {
  constructor(storage, key, catalog) { this.storage = storage; this.key = key; this.catalog = catalog; }
  list() {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return [];
    if (raw.length > 100000) throw Error('Saved previews are too large.');
    const data = JSON.parse(raw);
    if (!exact(data, ['schemaVersion', 'entries']) || data.schemaVersion !== PREVIEW_VERSION || !Array.isArray(data.entries) || data.entries.length > 12) throw Error('Saved previews are unreadable.');
    for (const e of data.entries) {
      if (!exact(e, ['id', 'name', 'createdAt', 'look']) || !/^[a-f0-9-]{36}$/.test(e.id) || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40 || !Number.isFinite(Date.parse(e.createdAt))) throw Error('Invalid saved outfit.');
      assertPreview(e.look, this.catalog);
    }
    if (new Set(data.entries.map(e => e.id)).size !== data.entries.length) throw Error('Duplicate saved outfit.');
    return data.entries;
  }
  save(name, look, id = globalThis.crypto.randomUUID(), now = new Date().toISOString()) {
    assertPreview(look, this.catalog);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw Error('Name your outfit in 1–40 characters.');
    const entries = this.list();
    if (entries.length >= 12) throw Error('You have 12 saved previews. Remove one to save another.');
    entries.push({ id, name: name.trim(), createdAt: now, look: structuredClone(look) });
    this.storage.setItem(this.key, JSON.stringify({ schemaVersion: PREVIEW_VERSION, entries }));
    return id;
  }
  remove(id) {
    const entries = this.list().filter(e => e.id !== id);
    this.storage.setItem(this.key, JSON.stringify({ schemaVersion: PREVIEW_VERSION, entries }));
  }
}

// A wallet change clears the previous read immediately; late responses never restore it.
export function createWardrobeSession({ read, onState, now = Date.now, timer = setTimeout, cancelTimer = clearTimeout,
  validateRead = assertWardrobeRead, identityOf = value => value.identity, expiryOf = value => value.expiresAt }) {
  let generation = 0, current = null, abort = null, expiry = null, session = { connected: false };
  const clear = () => { abort?.abort(); cancelTimer(expiry); current = null; };
  const fresh = () => current && sameWallet(identityOf(current).ownerAddress, session.address) && Date.parse(expiryOf(current)) > now();
  const expireAt = ticket => { expiry = timer(() => { if (ticket === generation) { current = null; onState({ status: 'EXPIRED', read: null }); } }, Date.parse(expiryOf(current)) - now()); };
  async function change(next, { background = false } = {}) {
    const retained = background && next?.connected === true && sameWallet(next.address, session.address) && fresh() ? current : null;
    const ticket = ++generation; clear(); current = retained; session = { connected: next?.connected === true, address: next?.address };
    if (!session.connected || !address(session.address)) { onState({ status: 'DISCONNECTED', read: null }); return; }
    abort = new AbortController();
    if (retained) { expireAt(ticket); onState({ status: 'REFRESHING', read: current }); }
    else onState({ status: 'LOADING', read: null });
    try {
      const value = await read({ signal: abort.signal });
      if (ticket !== generation) return;
      validateRead(value, session.address, now()); current = structuredClone(value);
      cancelTimer(expiry); expireAt(ticket);
      onState({ status: 'READY', read: current });
    } catch (error) { if (ticket === generation) { current = null; onState({ status: 'UNAVAILABLE', read: null, message: 'Your verified Pet read is unavailable. Retry to continue.' }); } }
  }
  return { change, refresh: (next = session) => change(next, { background: true }), current: () => fresh() ? structuredClone(current) : null, dispose: () => { generation++; clear(); } };
}
