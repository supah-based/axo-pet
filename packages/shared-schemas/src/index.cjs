'use strict';
const Ajv = require('ajv');
const protocol = require('./protocol.cjs');
const schemas = require('./schemas.cjs');
const { validatePetHistory } = require('./passport-history.cjs');
const { ARENA_STATS, GEAR_SLOTS, VISUAL_Z_ORDER, MIN_EQUIP_LEVEL, levelForXp } = protocol;
const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const compiled = Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [key, ajv.compile(schema)]));
const error = (code, path) => ({ code, path });
const result = errors => ({ valid: errors.length === 0, errors });
function shape(key, value) {
  const check = compiled[key];
  return check(value) ? [] : check.errors.map(issue => error('SCHEMA_INVALID', issue.instancePath || '/'));
}
function checkUint(value, path, errors) {
  if (BigInt(value) > (2n ** 256n - 1n)) errors.push(error('UINT256_RANGE', path));
}
const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
function validatePetIdentity(value, { expectedOwnerAddress } = {}) {
  const errors = shape('petIdentity', value);
  if (errors.length) return result(errors);
  if (value.level !== levelForXp(value.xp)) errors.push(error('XP_LEVEL_MISMATCH', '/level'));
  if (expectedOwnerAddress !== undefined && !sameAddress(value.ownerAddress, expectedOwnerAddress)) errors.push(error('OWNER_MISMATCH', '/ownerAddress'));
  if (value.nft.status === 'MINTED') checkUint(value.nft.tokenId, '/nft/tokenId', errors);
  return result(errors);
}
function validateGearDefinition(value) {
  const errors = shape('gearDefinition', value);
  if (errors.length) return result(errors);
  checkUint(value.maxSupply, '/maxSupply', errors);
  const total = ARENA_STATS.reduce((sum, stat) => sum + value.arenaStats[stat], 0);
  if (total < 1 || total > 4) errors.push(error('ITEM_STAT_TOTAL', '/arenaStats'));
  return result(errors);
}
function validateVerifiedGearProjection(value, { identity, visualCatalog } = {}) {
  const errors = shape('gearProjection', value);
  if (errors.length) return result(errors);
  if (!identity) return result([error('IDENTITY_REQUIRED', '/')]);
  const identityCheck = validatePetIdentity(identity);
  if (!identityCheck.valid) return result(identityCheck.errors.map(issue => error(issue.code, `/identity${issue.path}`)));
  if (identity.nft.status !== 'MINTED') return result([error('PET_NOT_MINTED', '/identity/nft')]);
  checkUint(value.petTokenId, '/petTokenId', errors);
  if (!sameAddress(value.ownerAddress, identity.ownerAddress)) errors.push(error('OWNER_MISMATCH', '/ownerAddress'));
  if (value.petGenesisId !== identity.genesisId || value.petTokenId !== identity.nft.tokenId) errors.push(error('TOKEN_MISMATCH', '/petTokenId'));
  if (!sameAddress(value.chain.petContract, identity.nft.contractAddress) || value.chain.chainId !== identity.nft.chainId) errors.push(error('CHAIN_MISMATCH', '/chain'));
  if (value.revision !== identity.gearRevision) errors.push(error('STALE_GEAR_REVISION', '/revision'));
  if (value.items.length && identity.level < MIN_EQUIP_LEVEL) errors.push(error('MINIMUM_LEVEL', '/items'));
  const slots = new Set(), ids = new Set(), totalStats = Object.fromEntries(ARENA_STATS.map(stat => [stat, 0]));
  for (const [index, item] of value.items.entries()) {
    const path = `/items/${index}`;
    if (slots.has(item.slot)) errors.push(error('DUPLICATE_SLOT', `${path}/slot`)); slots.add(item.slot);
    if (ids.has(item.id)) errors.push(error('DUPLICATE_GEAR_ID', `${path}/id`)); ids.add(item.id);
    if (item.id !== item.definition.id) errors.push(error('GEAR_ID_MISMATCH', `${path}/definition/id`));
    if (item.slot !== item.definition.slot) errors.push(error('SLOT_MISMATCH', `${path}/definition/slot`));
    if (!item.definition.active) errors.push(error('INACTIVE_GEAR', `${path}/definition/active`));
    checkUint(item.balance, `${path}/balance`, errors);
    if (BigInt(item.balance) > BigInt(item.definition.maxSupply)) errors.push(error('BALANCE_EXCEEDS_SUPPLY', `${path}/balance`));
    for (const issue of validateGearDefinition(item.definition).errors) errors.push(error(issue.code, `${path}/definition${issue.path}`));
    for (const stat of ARENA_STATS) totalStats[stat] += item.definition.arenaStats[stat];
  }
  if (ARENA_STATS.some(stat => totalStats[stat] !== value.stats[stat])) errors.push(error('AGGREGATE_STATS_MISMATCH', '/stats'));
  // JSON validation cannot prove a chain read or asset bytes. The caller supplies trusted identity and reviewed catalog evidence.
  if (!visualCatalog) return result([...errors, error('VISUAL_CATALOG_REQUIRED', '/visual')]);
  if (visualCatalog.schema !== 'AXO_PET_WEBSITE_VISUAL_CATALOG_V5' || visualCatalog.catalogId !== 'AXO_PET_WEBSITE_VISUALS_V5'
    || visualCatalog.canonicalWebsiteVisual !== true || visualCatalog.visualRevision !== '5.1.1'
    || !Array.isArray(visualCatalog.bases) || !Array.isArray(visualCatalog.layers) || !Array.isArray(visualCatalog.hudByLineage)) {
    return result([...errors, error('VISUAL_CATALOG_INVALID', '/visual')]);
  }
  const base = visualCatalog.bases.find(entry => entry?.lineageKey === identity.lineageId && entry.level === identity.level);
  const hud = visualCatalog.hudByLineage.find(entry => entry?.lineageKey === identity.lineageId);
  const seen = new Set(); let previousZ = -1;
  for (const [index, layer] of value.visual.layers.entries()) {
    const path = `/visual/layers/${index}`;
    if (seen.has(layer.slot)) errors.push(error('VISUAL_LAYER_DUPLICATE', `${path}/slot`)); seen.add(layer.slot);
    if (layer.z !== VISUAL_Z_ORDER.indexOf(layer.slot) || layer.z <= previousZ) errors.push(error('VISUAL_LAYER_ORDER', `${path}/z`));
    previousZ = layer.z;
    let expected;
    if (layer.slot === 'pet') expected = base;
    else if (layer.slot === 'hud_front') expected = identity.level === 10 ? hud : null;
    else {
      const item = value.items.find(entry => entry.slot === layer.slot);
      const option = item ? (item.id > 10 ? item.id % 1000 : item.id) : layer.optionId;
      if (GEAR_SLOTS.includes(layer.slot) && (!item || option !== layer.optionId)) errors.push(error('VISUAL_EQUIPMENT_MISMATCH', path));
      const family = visualCatalog.layers.find(entry => entry?.slot === layer.slot);
      expected = identity.level === 10 && Array.isArray(family?.options) ? family.options.find(entry => entry?.id === option) : null;
    }
    if (!expected || expected.url !== layer.url || expected.runtimeSha256 !== layer.sha256
      || (['pet', 'hud_front'].includes(layer.slot) && layer.optionId !== null)) errors.push(error('VISUAL_ASSET_MISMATCH', path));
  }
  for (const slot of ['pet', ...(identity.level === 10 ? ['background', 'hud_front'] : []), ...slots]) {
    if (!seen.has(slot)) errors.push(error('VISUAL_LAYER_MISSING', `/visual/${slot}`));
  }
  return result(errors);
}
function validateGearReadResult(value, context) {
  const verified = value?.status === 'VERIFIED_ONCHAIN';
  const checked = verified ? validateVerifiedGearProjection(value, context) : result(shape('gearReadFailure', value));
  return { ...checked, usable: verified && checked.valid };
}
function validatePetRead(value, { expectedOwnerAddress, visualCatalog, now = Date.now() } = {}) {
  const errors = shape('petRead', value);
  if (errors.length) return result(errors);
  const observed = Date.parse(value.observedAt), expires = Date.parse(value.expiresAt);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || !Number.isFinite(now)
    || new Date(observed).toISOString() !== value.observedAt || new Date(expires).toISOString() !== value.expiresAt
    || expires - observed !== 60000 || observed > now + 5000 || expires <= now) errors.push(error('READ_EXPIRED_OR_INVALID', '/expiresAt'));
  for (const issue of validatePetIdentity(value.identity, { expectedOwnerAddress }).errors) errors.push(error(issue.code, `/identity${issue.path}`));
  const equipment = validateGearReadResult(value.equipment, { identity: value.identity, visualCatalog });
  for (const issue of equipment.errors) errors.push(error(issue.code, `/equipment${issue.path}`));
  const base = visualCatalog?.schema === 'AXO_PET_WEBSITE_VISUAL_CATALOG_V5' && visualCatalog.catalogId === 'AXO_PET_WEBSITE_VISUALS_V5'
    && visualCatalog.canonicalWebsiteVisual === true && visualCatalog.visualRevision === '5.1.1'
    && Array.isArray(visualCatalog.bases) && visualCatalog.bases.find(entry => entry?.lineageKey === value.identity.lineageId && entry.level === value.identity.level);
  if (!base) errors.push(error('VISUAL_CATALOG_INVALID', '/authoritativeVisual'));
  const expected = equipment.usable ? value.equipment.visual.layers
    : base ? [{ slot: 'pet', z: 5, optionId: null, url: base.url, sha256: base.runtimeSha256 }] : [];
  const actual = value.authoritativeVisual.layers;
  if (value.authoritativeVisual.equipmentIncluded !== equipment.usable || actual.length !== expected.length
    || expected.some((layer, index) => ['slot', 'z', 'optionId', 'url', 'sha256'].some(key => actual[index]?.[key] !== layer[key]))) {
    errors.push(error('READ_VISUAL_MISMATCH', '/authoritativeVisual'));
  }
  return result(errors);
}
class SchemaValidationError extends Error {
  constructor(errors) { super(`AXO schema validation failed: ${errors.map(issue => `${issue.code}:${issue.path}`).join(', ')}`); this.name = 'SchemaValidationError'; this.errors = errors; }
}
function validatePassportRead(value, context = {}) {
  const errors = shape('passportRead', value);
  if (errors.length) return result(errors);
  return result([...validatePetRead(value.pet, context).errors,
    ...validatePetHistory(value.history, { identity: value.pet.identity, now: context.now }).errors]);
}
const assertWith = validate => (value, context) => { const checked = validate(value, context); if (!checked.valid) throw new SchemaValidationError(checked.errors); return value; };
module.exports = { XP_THRESHOLDS: protocol.XP_THRESHOLDS, GEAR_SLOTS, ARENA_STATS, LINEAGES: protocol.LINEAGES, VISUAL_Z_ORDER,
  MIN_EQUIP_LEVEL, levelForXp, schemas, validatePetIdentity, validateGearDefinition, validateVerifiedGearProjection, validateGearReadResult, validatePetRead,
  assertPetIdentity: assertWith(validatePetIdentity), assertGearDefinition: assertWith(validateGearDefinition),
  assertVerifiedGearProjection: assertWith(validateVerifiedGearProjection), assertPetRead: assertWith(validatePetRead),
  validatePetHistory, validatePassportRead, assertPassportRead: assertWith(validatePassportRead), SchemaValidationError };
