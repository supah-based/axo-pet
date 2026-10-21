import { validatePetIdentity, validateGearReadResult } from '../../../packages/shared-schemas/src/index.mjs';
import { WARDROBE_READ_VERSION } from '../../../packages/pet-domain/src/wardrobe-preview.mjs';

const failure = (reason, status = 'UNAVAILABLE') => ({ schemaVersion: 'AXO_GEAR_READ_FAILURE_V1', status, reason, data: null });
export class WardrobeReadError extends Error {
  constructor(code, httpStatus = 503) { super(code); this.code = code; this.httpStatus = httpStatus; }
}

// Ports must be bound to the existing authenticated host and preserved Pet ledger.
// No browser-supplied identity, address, XP, inventory, or capability flag is accepted.
export function createWardrobeReader({ authenticate, readVerifiedPetSnapshot, visualCatalog, now = Date.now }) {
  if (typeof authenticate !== 'function' || typeof readVerifiedPetSnapshot !== 'function') throw Error('Verified host ports are required.');
  return async function readWardrobe(request, { signal = AbortSignal.timeout(10000) } = {}) {
    const session = await authenticate(request, { signal });
    if (session?.verified !== true || !/^0x(?!0{40}$)[a-f0-9]{40}$/i.test(session.address || '')) throw new WardrobeReadError('VERIFIED_SESSION_REQUIRED', 401);
    const snapshot = await readVerifiedPetSnapshot({ session, signal });
    if (!snapshot?.identity) throw new WardrobeReadError('PET_IDENTITY_UNAVAILABLE');
    const identity = structuredClone(snapshot.identity);
    if (!validatePetIdentity(identity, { expectedOwnerAddress: session.address }).valid) throw new WardrobeReadError('PET_IDENTITY_INCONSISTENT');
    const equipment = structuredClone(snapshot.equipment ?? failure('RPC_UNAVAILABLE'));
    const checked = validateGearReadResult(equipment, { identity, visualCatalog });
    const safeEquipment = checked.valid ? equipment : failure('UNKNOWN_OWNERSHIP', 'INCONSISTENT');
    const base = visualCatalog?.schema === 'AXO_PET_WEBSITE_VISUAL_CATALOG_V5' && visualCatalog.canonicalWebsiteVisual === true
      && visualCatalog.visualRevision === '5.1.1' && visualCatalog.bases?.find(b => b.lineageKey === identity.lineageId && b.level === identity.level);
    if (!base) throw new WardrobeReadError('PET_VISUAL_UNAVAILABLE');
    const layers = checked.usable ? structuredClone(equipment.visual.layers) : [{ slot: 'pet', z: 5, optionId: null, url: base.url, sha256: base.runtimeSha256 }];
    const observed = now();
    return {
      schemaVersion: WARDROBE_READ_VERSION, status: 'READY', observedAt: new Date(observed).toISOString(), expiresAt: new Date(observed + 60000).toISOString(),
      identity, equipment: safeEquipment,
      authoritativeVisual: { visualRevision: '5.1.1', equipmentIncluded: checked.usable, layers },
    };
  };
}

export function createWardrobeHandler(options) {
  const read = createWardrobeReader(options);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Cookie');
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { code: 'READ_ONLY' }); }
    if (new URL(req.url, 'http://host.invalid').search) return send(400, { code: 'NO_CLIENT_IDENTITY_PARAMETERS' });
    try { return send(200, await read(req)); }
    catch (error) { return send(error instanceof WardrobeReadError ? error.httpStatus : 503, { code: error instanceof WardrobeReadError ? error.code : 'WARDROBE_READ_UNAVAILABLE' }); }
  };
}
