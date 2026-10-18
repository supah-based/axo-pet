// Candidate art preview only. Never use this module to authorize equipment or stats.
export const STUDIO_SLOTS = Object.freeze(['head', 'face', 'body', 'pants', 'footwear', 'back', 'tool', 'charm', 'companion', 'habitat']);
export const STUDIO_PLANES = Object.freeze(['habitat', 'back', 'pet', 'footwear', 'pants', 'body', 'face', 'head', 'tool', 'charm', 'companion']);

export function validateSelection(catalog, lineage, selection) {
  if (catalog.schema !== 'AXO_GEAR_STYLE_STUDIO_V1' || catalog.status !== 'CANDIDATE' || catalog.level !== 10) throw new Error('Unsupported candidate collection.');
  const base = catalog.lineages.find(item => item.id === lineage);
  if (!base) throw new Error('Unknown level-10 reference.');
  const picked = {};
  for (const [slot, id] of Object.entries(selection)) {
    if (!STUDIO_SLOTS.includes(slot)) throw new Error('Unknown equipment slot.');
    if (!id) continue;
    const item = catalog.items.find(item => item.id === id);
    if (!item || item.slot !== slot) throw new Error('Item does not match its slot.');
    picked[slot] = item;
  }
  return { base, picked };
}

export function buildRenderPlan(catalog, lineage, selection) {
  const { base, picked } = validateSelection(catalog, lineage, selection);
  if (picked.footwear && !base.footwearBase) throw new Error('Footwear base mask unavailable.');
  return STUDIO_PLANES.flatMap(plane => plane === 'pet'
    ? [{ kind: 'pet', id: base.id, src: picked.footwear ? base.footwearBase.asset : base.asset }]
    : picked[plane] ? [{ kind: 'gear', id: picked[plane].id, slot: plane, src: picked[plane].wearable.asset }] : []);
}

export function selectionFromURL(catalog, search) {
  const params = new URLSearchParams(search);
  const lineage = params.get('lineage') || catalog.lineages[0].id;
  const preset = params.has('look') ? catalog.presets.find(item => item.id === params.get('look')) : null;
  if (params.has('look') && !preset) throw new Error('Unknown collection look.');
  const selection = { ...(preset?.selection || {}), ...Object.fromEntries(STUDIO_SLOTS.filter(slot => params.has(slot)).map(slot => [slot, params.get(slot)])) };
  validateSelection(catalog, lineage, selection);
  return { lineage, selection };
}

export function selectionToURL(lineage, selection) {
  const params = new URLSearchParams({ lineage });
  for (const slot of STUDIO_SLOTS) if (selection[slot]) params.set(slot, selection[slot]);
  return '?' + params.toString();
}

export async function drawStudioLook(canvas, catalog, lineage, selection, loadImage) {
  const plan = buildRenderPlan(catalog, lineage, selection);
  // Load every plane before drawing. A missing layer must not become a successful partial outfit.
  const images = await Promise.all(plan.map(layer => loadImage(layer.src)));
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  images.forEach(image => ctx.drawImage(image, 0, 0, canvas.width, canvas.height));
  return plan;
}
