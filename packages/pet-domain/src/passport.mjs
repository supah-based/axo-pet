import { assertWardrobeRead, createWardrobeSession } from './wardrobe-preview.mjs';
import { validatePetHistory } from '../../shared-schemas/src/index.mjs';

const thresholds = [0,40,100,180,280,400,550,730,940,1200];
export function assertPassportRead(read, owner, now = Date.now()) {
  if (!read || Object.keys(read).length !== 4 || !['schemaVersion','status','pet','history'].every(key => Object.hasOwn(read,key))
    || read.schemaVersion !== 'AXO_PET_PASSPORT_V1' || read.status !== 'READY' || read.pet?.schemaVersion !== 'AXO_PET_READ_V1') throw Error('Passport unavailable.');
  assertWardrobeRead({ ...read.pet, schemaVersion: 'AXO_WARDROBE_READ_V1' }, owner, now);
  if (!validatePetHistory(read.history, { identity: read.pet.identity, now }).valid) throw Error('Passport history is inconsistent.');
  return read;
}
export function growthProgress(pet) {
  if (!Number.isSafeInteger(pet?.xp) || pet.xp < 0 || pet.level !== thresholds.filter(x => pet.xp >= x).length) throw Error('Invalid preserved growth.');
  const floor = thresholds[pet.level - 1], next = thresholds[pet.level];
  return { floor, next: next ?? null, remaining: next === undefined ? 0 : next - pet.xp,
    percent: next === undefined ? 100 : Math.floor(100 * (pet.xp - floor) / (next - floor)),
    excess: next === undefined ? pet.xp - floor : 0 };
}
export function createPassportSession(options) {
  return createWardrobeSession({ ...options, validateRead: assertPassportRead,
    identityOf: value => value.pet.identity, expiryOf: value => value.pet.expiresAt });
}
