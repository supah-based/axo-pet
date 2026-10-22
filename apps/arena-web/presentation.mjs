export const PRESENTATION_KEY = 'axo.arena.presentation.v1';
export const DEFAULT_PRESENTATION = Object.freeze({ quality: 'auto', motion: 'system', readouts: true, contrast: false });
export function presentationPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_PRESENTATION, key))) return { ...DEFAULT_PRESENTATION };
  return { quality: ['auto', 'low', 'high'].includes(value.quality) ? value.quality : 'auto', motion: ['system', 'reduced'].includes(value.motion) ? value.motion : 'system', readouts: typeof value.readouts === 'boolean' ? value.readouts : true, contrast: typeof value.contrast === 'boolean' ? value.contrast : false };
}
export function loadPresentation(storage) {
  try { storage ??= globalThis.localStorage; const raw = storage?.getItem(PRESENTATION_KEY); return raw && raw.length <= 400 ? presentationPreferences(JSON.parse(raw)) : { ...DEFAULT_PRESENTATION }; }
  catch { return { ...DEFAULT_PRESENTATION }; }
}
export function savePresentation(value, storage) {
  const safe = presentationPreferences(value); try { storage ??= globalThis.localStorage; storage?.setItem(PRESENTATION_KEY, JSON.stringify(safe)); } catch { /* Settings work for this session even when storage is disabled. */ } return safe;
}
let preferences = Object.freeze(loadPresentation());
export const activePresentation = () => preferences;
export function updatePresentation(value) { preferences = Object.freeze(savePresentation(value)); return preferences; }
export function presentationBudget(preferences, { reducedMotion = false, saveData = false, memory = 8 } = {}) {
  const p = presentationPreferences(preferences), low = p.quality === 'low' || p.quality === 'auto' && (saveData || memory <= 4);
  return { fps: low ? 30 : 60, maxPixels: low ? 900000 : 1800000, reduced: reducedMotion || p.motion === 'reduced', readouts: p.readouts, particles: low ? 4 : 10 };
}
export function readinessSummary(me) {
  const pet = me.pet, gear = pet.gearLoadout || [], stats = pet.gearStats || {};
  return { exactXp: pet.xp, level: pet.level, gearCount: gear.length, gearPoints: Object.values(stats).reduce((sum, value) => sum + value, 0), verified: pet.identitySource === 'AUTHENTICATED_PET_READ_V1', busy: me.busy === true, completed: (me.rooms || []).filter(room => ['won', 'draw'].includes(room.status)).length };
}
