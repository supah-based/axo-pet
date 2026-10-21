import { createHmac } from 'node:crypto';
import { createPetReader, PetReadError } from '../../../apps/pet-api/src/pet-read.mjs';
import { validatePetRead } from '../../shared-schemas/src/index.mjs';
import { STATS } from '../../../apps/arena-web/catalog.mjs';

export const ARENA_PET_SOURCE = 'AUTHENTICATED_PET_READ_V1';
const zeroStats = () => Object.fromEntries(STATS.map(key => [key, 0]));

// Server-only mapping, not authentication for browser-supplied JSON.
export function arenaIdentityFromPetRead(read, { expectedOwnerAddress, visualCatalog, secret, now = Date.now() } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw Error('Existing Arena session secret (32+ characters) required.');
  if (!expectedOwnerAddress || !validatePetRead(read, { expectedOwnerAddress, visualCatalog, now }).valid) throw new PetReadError('ARENA_PET_INCONSISTENT');
  const { identity: p, equipment: gear, authoritativeVisual } = read;
  const verified = gear.status === 'VERIFIED_ONCHAIN';
  // An unminted Pet cannot have V1 gear. Other missing evidence is never an empty loadout.
  const notMinted = p.nft.status === 'UNMINTED' && gear.status === 'UNAVAILABLE' && gear.reason === 'NOT_MINTED';
  if (!verified && !notMinted) throw new PetReadError('ARENA_EQUIPMENT_UNAVAILABLE');
  const layers = structuredClone(authoritativeVisual.layers);
  return {
    // Preserve existing profile/room ownership and the operator's existing secret.
    key: createHmac('sha256', secret).update('arena:' + p.ownerAddress.toLowerCase()).digest('hex'),
    pet: {
      genesisId: p.genesisId, name: p.name, lineageId: p.lineageId, xp: p.xp, level: p.level,
      art: layers.find(layer => layer.slot === 'pet').url, layers, gearRevision: p.gearRevision,
      gearLoadout: verified ? gear.items.map(item => ({
        id: item.id, slot: item.slot, label: `V1 ${item.slot} #${item.id}`, rarity: item.definition.rarity,
        arenaStats: structuredClone(item.definition.arenaStats),
      })) : [],
      gearStats: verified ? structuredClone(gear.stats) : zeroStats(), identitySource: ARENA_PET_SOURCE,
    },
    // Ephemeral /me evidence. Observation times never rewrite persisted profiles.
    verification: {
      schemaVersion: read.schemaVersion, observedAt: read.observedAt, expiresAt: read.expiresAt,
      equipmentStatus: verified ? 'VERIFIED_ONCHAIN' : 'NOT_MINTED', revision: p.gearRevision,
      ...(verified ? { blockNumber: gear.chain.blockNumber, blockHash: gear.chain.blockHash } : {}),
      previewPolicy: 'COSMETIC_ONLY', battlePolicy: 'FROZEN_AT_ENTRY',
    },
  };
}

export function createVerifiedArenaAuthenticator({ secret, ...ports }) {
  if (typeof secret !== 'string' || secret.length < 32) throw Error('Existing Arena session secret required.');
  const catalog = structuredClone(ports.visualCatalog);
  const readPet = createPetReader({ ...ports, visualCatalog: catalog });
  return async (request, options = {}) => {
    const read = await readPet(request, options);
    return arenaIdentityFromPetRead(read, {
      expectedOwnerAddress: read.identity.ownerAddress, visualCatalog: catalog, secret,
      now: ports.now ? ports.now() : Date.now(),
    });
  };
}
