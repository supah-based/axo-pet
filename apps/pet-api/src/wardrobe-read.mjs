import { createPetReader, PetReadError } from './pet-read.mjs';
import { createReadHandler } from './read-http.mjs';
import { WARDROBE_READ_VERSION } from '../../../packages/pet-domain/src/wardrobe-preview.mjs';

export { PetReadError as WardrobeReadError };
// Compatibility projection only: no second identity/equipment loader or authority rules.
export const wardrobeFromPetRead = read => ({ ...structuredClone(read), schemaVersion: WARDROBE_READ_VERSION });

// Ports must be bound to the existing authenticated host and preserved Pet ledger.
// No browser-supplied identity, address, XP, inventory, or capability flag is accepted.
export function createWardrobeReader(options) {
  const read = createPetReader(options);
  return async (request, context) => wardrobeFromPetRead(await read(request, context));
}

export function createWardrobeHandler(options) {
  return createReadHandler(createWardrobeReader(options), { unavailableCode: 'WARDROBE_READ_UNAVAILABLE' });
}
