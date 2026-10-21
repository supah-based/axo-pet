import { validatePetIdentity, validateGearReadResult, validatePetRead } from '../../../packages/shared-schemas/src/index.mjs';

export const PET_READ_VERSION = 'AXO_PET_READ_V1';
export class PetReadError extends Error {
  constructor(code, httpStatus = 503) { super(code); this.name = 'PetReadError'; this.code = code; this.httpStatus = httpStatus; }
}
const failure = (reason, status = 'UNAVAILABLE') => ({ schemaVersion: 'AXO_GEAR_READ_FAILURE_V1', status, reason, data: null });

// Enforce a wall-clock deadline even when a host port ignores cancellation.
export async function boundedRead(work, { signal, timeoutMs = 10000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error('Read deadline must be 1–10000 ms.');
  const controller = new AbortController(); let timer, rejectAbort;
  const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(new PetReadError('PET_READ_ABORTED')); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new PetReadError('PET_READ_ABORTED');
    timer = setTimeout(() => { controller.abort(); rejectAbort(new PetReadError('PET_READ_TIMEOUT')); }, timeoutMs);
    timer.unref?.();
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), cancelled]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

// These server-only ports establish authority. JSON validation cannot prove RPC or session checks.
export function createPetReader({ authenticate, readVerifiedPetSnapshot, visualCatalog, now = Date.now, timeoutMs = 10000 }) {
  if (typeof authenticate !== 'function' || typeof readVerifiedPetSnapshot !== 'function') throw Error('Verified host ports are required.');
  const catalog = structuredClone(visualCatalog);
  return async function readPet(request, { signal } = {}) {
    const observed = now();
    return boundedRead(async readSignal => {
      const session = await authenticate(request, { signal: readSignal });
      if (readSignal.aborted) throw new PetReadError('PET_READ_ABORTED');
      if (session?.verified !== true || !/^0x(?!0{40}$)[a-f0-9]{40}$/i.test(session.address || '')) throw new PetReadError('VERIFIED_SESSION_REQUIRED', 401);
      const verifiedSession = Object.freeze({ verified: true, address: session.address });
      const snapshot = await readVerifiedPetSnapshot({ session: verifiedSession, signal: readSignal });
      if (readSignal.aborted) throw new PetReadError('PET_READ_ABORTED');
      if (!snapshot?.identity) throw new PetReadError('PET_IDENTITY_UNAVAILABLE');
      const identity = structuredClone(snapshot.identity);
      if (!validatePetIdentity(identity, { expectedOwnerAddress: verifiedSession.address }).valid) throw new PetReadError('PET_IDENTITY_INCONSISTENT');
      const equipment = structuredClone(snapshot.equipment ?? failure('RPC_UNAVAILABLE'));
      const checked = validateGearReadResult(equipment, { identity, visualCatalog: catalog });
      const safeEquipment = checked.valid ? equipment : failure('UNKNOWN_OWNERSHIP', 'INCONSISTENT');
      const base = Array.isArray(catalog?.bases) && catalog.bases.find(entry => entry?.lineageKey === identity.lineageId && entry.level === identity.level);
      if (!base) throw new PetReadError('PET_VISUAL_UNAVAILABLE');
      const layers = checked.usable ? structuredClone(equipment.visual.layers)
        : [{ slot: 'pet', z: 5, optionId: null, url: base.url, sha256: base.runtimeSha256 }];
      const read = {
        schemaVersion: PET_READ_VERSION, status: 'READY', observedAt: new Date(observed).toISOString(), expiresAt: new Date(observed + 60000).toISOString(),
        identity, equipment: safeEquipment,
        authoritativeVisual: { visualRevision: '5.1.1', equipmentIncluded: checked.usable, layers },
      };
      if (!validatePetRead(read, { expectedOwnerAddress: verifiedSession.address, visualCatalog: catalog, now: now() }).valid) throw new PetReadError('PET_PROJECTION_INCONSISTENT');
      return read;
    }, { signal, timeoutMs });
  };
}
