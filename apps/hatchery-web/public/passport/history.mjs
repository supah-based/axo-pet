// Portable history consistency guard, also generated as ESM for the Passport client.
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const uint = v => Number.isSafeInteger(v) && v >= 0;
const date = (v, now) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v && Date.parse(v) <= now + 5000;
function validatePetHistory(value, { identity, now = Date.now() } = {}) {
  const fail = code => ({ valid: false, errors: [{ code, path: '/history' }] });
  if (value?.schemaVersion === 'AXO_PET_HISTORY_FAILURE_V1') {
    return exact(value, ['schemaVersion','status','reason','data']) && ['UNAVAILABLE','INCONSISTENT'].includes(value.status)
      && ['HOST_NOT_CONNECTED','HISTORY_UNAVAILABLE','SNAPSHOT_MISMATCH'].includes(value.reason) && value.data === null
      ? { valid: true, errors: [] } : fail('HISTORY_INVALID');
  }
  if (!exact(value, ['schemaVersion','status','ownerAddress','petGenesisId','throughXp','coverage','hatchedAt','xpEvents','achievements'])
    || value.schemaVersion !== 'AXO_PET_HISTORY_V1' || value.status !== 'AVAILABLE' || !identity
    || typeof value.ownerAddress !== 'string' || value.ownerAddress.toLowerCase() !== identity.ownerAddress?.toLowerCase()
    || value.petGenesisId !== identity.genesisId || value.throughXp !== identity.xp) return fail('HISTORY_SNAPSHOT_MISMATCH');
  if (!['COMPLETE','RECENT'].includes(value.coverage) || !(value.hatchedAt === null || date(value.hatchedAt, now))
    || !Array.isArray(value.xpEvents) || value.xpEvents.length > 100 || !Array.isArray(value.achievements) || value.achievements.length > 50) return fail('HISTORY_INVALID');
  let previous = null; const ids = new Set();
  for (const event of value.xpEvents) {
    if (!exact(event, ['id','occurredAt','xpBefore','xpAfter','label']) || !text(event.id, 80) || ids.has(event.id)
      || !date(event.occurredAt, now) || !uint(event.xpBefore) || !uint(event.xpAfter) || !text(event.label, 100)
      || (previous && (event.xpBefore !== previous.xpAfter || event.occurredAt < previous.occurredAt))
      || (value.hatchedAt && event.occurredAt < value.hatchedAt)) return fail('HISTORY_EVENT_INCONSISTENT');
    ids.add(event.id); previous = event;
  }
  if ((previous && previous.xpAfter !== identity.xp) || (value.coverage === 'COMPLETE'
    && (value.xpEvents.length ? value.xpEvents[0].xpBefore !== 0 : identity.xp !== 0))) return fail('HISTORY_XP_MISMATCH');
  ids.clear();
  for (const item of value.achievements) {
    if (!exact(item, ['id','label','description','earnedAt']) || !text(item.id, 80) || ids.has(item.id)
      || !text(item.label, 80) || !text(item.description, 240) || !date(item.earnedAt, now)
      || (value.hatchedAt && item.earnedAt < value.hatchedAt)) return fail('HISTORY_ACHIEVEMENT_INVALID');
    ids.add(item.id);
  }
  return { valid: true, errors: [] };
}
export { validatePetHistory };
