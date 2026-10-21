'use strict';
const { GEAR_SLOTS, ARENA_STATS, LINEAGES, deepFreeze } = require('./protocol.cjs');
const integer = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', minimum, maximum });
const text = (pattern, maxLength = 256) => ({ type: 'string', pattern, maxLength });
const address = text('^0x(?!0{40}$)[a-fA-F0-9]{40}$', 42);
const hash = text('^0x(?!0{64}$)[a-fA-F0-9]{64}$', 66);
const uint256 = text('^(0|[1-9][0-9]{0,77})$', 78);
const positiveUint256 = text('^[1-9][0-9]{0,77}$', 78);
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const stats = maximum => object(Object.fromEntries(ARENA_STATS.map(stat => [stat, integer(0, maximum)])));
const version = value => ({ const: value });
const nft = { oneOf: [object({ status: version('UNMINTED') }), object({ status: version('MINTED'), chainId: version(4663), contractAddress: address, tokenId: uint256 })] };
const petIdentity = object({
  schemaVersion: version('AXO_PET_IDENTITY_V1'), genesisId: text('^AXO-[A-F0-9]{10}$', 14),
  appearanceSeed: text('^[a-f0-9]{16}$', 16), ownerAddress: address,
  name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
  lineageId: { enum: LINEAGES }, xp: integer(), level: integer(1, 10), gearRevision: integer(), nft,
});
const gearDefinition = object({
  schemaVersion: version('AXO_GEAR_DEFINITION_V1'), id: integer(1), slot: { enum: GEAR_SLOTS },
  rarity: { enum: ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] }, active: { type: 'boolean' },
  maxSupply: positiveUint256, metadataUri: text('^ipfs://(?:b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})(?:/[^\\s]*)?$', 512),
  metadataHash: hash, arenaStats: stats(2),
});
const visualLayer = object({
  slot: { enum: ['background', 'pet', 'hud_front', ...GEAR_SLOTS] }, z: integer(0, 13),
  optionId: { anyOf: [integer(1, 10), { type: 'null' }] },
  url: text('^/hatchery-nft-v5(?:\\.1\\.1)?/[a-z0-9_]+\\.webp$', 256),
  sha256: text('^[a-f0-9]{64}$', 64),
});
const gearProjection = object({
  schemaVersion: version('AXO_VERIFIED_GEAR_PROJECTION_V1'), status: version('VERIFIED_ONCHAIN'),
  ownerAddress: address, petGenesisId: text('^AXO-[A-F0-9]{10}$', 14), petTokenId: uint256, revision: integer(),
  chain: object({ chainId: version(4663), blockNumber: integer(1), blockHash: hash, petContract: address, gearContract: address }),
  items: { type: 'array', maxItems: 8, items: object({ id: integer(1), slot: { enum: GEAR_SLOTS }, balance: positiveUint256, definition: gearDefinition }) },
  stats: stats(6), visual: object({ visualRevision: version('5.1.1'), layers: { type: 'array', minItems: 1, maxItems: 11, items: visualLayer } }),
});
const gearReadFailure = object({
  schemaVersion: version('AXO_GEAR_READ_FAILURE_V1'), status: { enum: ['UNAVAILABLE', 'INCONSISTENT'] },
  reason: { enum: ['RPC_UNAVAILABLE', 'INDEXER_UNAVAILABLE', 'ASSET_MISSING', 'ASSET_HASH_MISMATCH', 'STALE_REVISION', 'UNKNOWN_OWNERSHIP', 'NOT_MINTED'] }, data: { type: 'null' },
});
const petRead = object({
  schemaVersion: version('AXO_PET_READ_V1'), status: version('READY'),
  observedAt: text('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$', 24),
  expiresAt: text('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$', 24),
  identity: { $ref: 'urn:axo:pet:identity:v1' },
  equipment: { anyOf: [{ $ref: 'urn:axo:pet:gear-projection:v1' }, { $ref: 'urn:axo:pet:gear-read-failure:v1' }] },
  authoritativeVisual: object({ visualRevision: version('5.1.1'), equipmentIncluded: { type: 'boolean' },
    layers: { type: 'array', minItems: 1, maxItems: 11, items: visualLayer } }),
});
const draft = (name, shape) => ({ $schema: 'http://json-schema.org/draft-07/schema#', $id: `urn:axo:pet:${name}:v1`, ...shape });
module.exports = deepFreeze({ petIdentity: draft('identity', petIdentity), gearDefinition: draft('gear-definition', gearDefinition),
  gearProjection: draft('gear-projection', gearProjection), gearReadFailure: draft('gear-read-failure', gearReadFailure),
  petRead: draft('read', petRead) });
