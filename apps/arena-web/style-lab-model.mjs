export const ATELIER_CATALOG_SHA256 = '45876f1faa4cd538ca4de3a70d0551cce392256cd2d610d62e3e52242e51069b';
export const LAB_MOVES = Object.freeze(['idle', 'market_order', 'diamond_hands', 'rug_pull', 'reversal', 'wen', 'pepe_breakout', 'touch_grass', 'exit_liquidity', 'lineage_a', 'lineage_b', 'epic', 'recharge']);
export const FITTED_MOTION = Object.freeze({
  market_order: [.18, .47, 25, 3, .035, 'slash'], diamond_hands: [.25, .56, -6, 2, -.012, 'shield'],
  rug_pull: [.23, .58, -19, 3, -.03, 'ribbon'], reversal: [.16, .62, -11, 2, -.02, 'counter'],
  wen: [.27, .54, 0, 5, .01, 'question'], pepe_breakout: [.22, .5, 29, 25, .045, 'candle'],
  touch_grass: [.28, .59, 0, 5, -.008, 'garden'], exit_liquidity: [.12, .43, 33, 10, .045, 'portal'],
  lineage_a: [.22, .56, 25, 14, .03, 'signature'], lineage_b: [.27, .6, -4, 9, -.013, 'support'],
  epic: [.3, .64, 18, 32, .025, 'epic'], recharge: [.3, .62, 0, 4, -.006, 'energy'],
});
export function atelierMediaUrl(path) {
  const match = /^\/(gear-anatomy\/v3|gear-bazaar\/v1)\/([a-z0-9][a-z0-9_.-]*\.webp)$/.exec(path || '');
  if (!match || match[2].includes('..')) throw Error('Unknown fitted runtime asset.');
  return `/arena/atelier/media/${match[1].startsWith('gear-anatomy') ? 'anatomy' : 'bazaar'}/${match[2]}`;
}
export function atelierManifest(catalog) {
  const assets = new Map();
  function scan(value) { if (!value || typeof value !== 'object') return; if (typeof value.asset === 'string' && value.asset.endsWith('.webp') && /^[a-f0-9]{64}$/.test(value.sha256 || '')) { atelierMediaUrl(value.asset); const old = assets.get(value.asset); if (old && old.sha256 !== value.sha256) throw Error('Conflicting fitted asset evidence.'); assets.set(value.asset, { url: value.asset, sha256: value.sha256, width: value.width, height: value.height }); } for (const child of Object.values(value)) if (child && typeof child === 'object') scan(child); }
  scan(catalog.lineages); scan(catalog.scenes); for (const item of catalog.items) { scan(item.wearable); scan(item.itemArt); scan(item.thumbnail); }
  return assets;
}
export function labSelection(catalog, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(slot => !catalog.slots.includes(slot))) throw Error('Invalid cosmetic slot.');
  const out = {}; for (const [slot, id] of Object.entries(value)) { if (id === null || id === '') continue; if (!catalog.items.some(item => item.id === id && item.slot === slot)) throw Error('Invalid cosmetic family.'); out[slot] = id; } return out;
}
export function proposedLoadout(catalog, selection, tier) {
  if (!Number.isInteger(tier) || tier < 10 || tier > 20) throw Error('Preview tier must be 10–20.');
  selection = labSelection(catalog, selection);
  const stats = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 }, sets = [];
  for (const id of Object.values(selection)) { const variant = catalog.items.find(item => item.id === id).variants.find(v => v.itemLevel === tier); if (!variant) throw Error('Unknown candidate tier.'); for (const key of Object.keys(stats)) stats[key] += variant.arenaStats[key]; }
  for (const set of catalog.sets) { const count = Object.entries(set.pieces).filter(([slot, id]) => selection[slot] === id).length; const active = count === 5, bonus = set.tiers.find(entry => entry.itemLevel === tier).bonus; if (active) for (const key of Object.keys(stats)) stats[key] += bonus.stats[key]; sets.push({ id: set.id, name: set.name, role: set.role, count, active, bonus }); }
  return { tier, proposedMinimumLevel: tier, proposedXpThreshold: catalog.progression.xpThresholds[tier - 1], stats, sets, authority: 'COSMETIC_PREVIEW_ONLY' };
}
// Fixed-pose garments move as one registered actor: no head/hand/cloth separation.
export function fittedActorMotion(time, elapsed, { move = 'idle', reduced = false, tier = 10 } = {}) {
  if (!LAB_MOVES.includes(move) || !Number.isFinite(time) || !Number.isFinite(elapsed) || !Number.isInteger(tier) || tier < 10 || tier > 20) throw Error('Invalid motion preview.');
  const inactive = { x: 0, y: 0, rotation: 0, scale: 1, glow: .12 + (tier - 10) * .012, impact: 0, trail: 0, effect: 'none', phase: 'idle' };
  if (reduced) return inactive;
  if (move === 'idle' || elapsed < 0 || elapsed >= 1800) return { ...inactive, y: Math.sin(time / 650) * 2 };
  const [windup, impactAt, reach, lift, tilt, effect] = FITTED_MOTION[move], phase = elapsed / 1800, smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  let x, y, rotation, segment;
  if (phase < windup) { const q = smooth(phase / windup); x = -5 * q; y = 3 * q; rotation = -.012 * q; segment = 'anticipation'; }
  else if (phase < impactAt) { const q = smooth((phase - windup) / (impactAt - windup)); x = -5 + (reach + 5) * q; y = 3 - (lift + 3) * q; rotation = -.012 + (tilt + .012) * q; segment = 'release'; }
  else { const q = smooth((phase - impactAt) / (1 - impactAt)); x = reach * (1 - q); y = -lift * (1 - q); rotation = tilt * (1 - q); segment = 'recovery'; }
  return { x, y: y + Math.sin(time / 650) * 2, rotation, scale: 1, glow: inactive.glow, effect, phase: segment, trail: Math.sin(Math.min(1, phase / impactAt) * Math.PI / 2) * (1 - smooth((phase - impactAt) / (1 - impactAt))), impact: Math.max(0, 1 - Math.abs(phase - impactAt) / .15) };
}
