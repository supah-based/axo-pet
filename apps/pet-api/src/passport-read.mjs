import { createPetReader, boundedRead, PetReadError } from './pet-read.mjs';
import { validatePetHistory, validatePassportRead } from '../../../packages/shared-schemas/src/index.mjs';

const failure = (reason, status = 'UNAVAILABLE') => ({ schemaVersion: 'AXO_PET_HISTORY_FAILURE_V1', status, reason, data: null });
export function createPassportReader(options) {
  const petReader = createPetReader(options), now = options.now || Date.now;
  return passportReaderFromPetReader(petReader, options, now);
}
export function passportReaderFromPetReader(petReader, { readPetHistory, visualCatalog }, now = Date.now) {
  return async (request, { signal } = {}) => {
    const pet = await petReader(request, { signal });
    let history = failure('HOST_NOT_CONNECTED');
    if (typeof readPetHistory === 'function') {
      try {
        history = structuredClone(await boundedRead(historySignal => readPetHistory({ identity: structuredClone(pet.identity), signal: historySignal }), { signal, timeoutMs: 2000 }));
        if (!validatePetHistory(history, { identity: pet.identity, now: now() }).valid) history = failure('SNAPSHOT_MISMATCH', 'INCONSISTENT');
      } catch { history = failure('HISTORY_UNAVAILABLE'); }
    }
    if (signal?.aborted) throw new PetReadError('PET_READ_ABORTED');
    const result = { schemaVersion: 'AXO_PET_PASSPORT_V1', status: 'READY', pet, history };
    if (!validatePassportRead(result, { expectedOwnerAddress: pet.identity.ownerAddress, visualCatalog, now: now() }).valid) throw new PetReadError('PET_PROJECTION_INCONSISTENT');
    return result;
  };
}
