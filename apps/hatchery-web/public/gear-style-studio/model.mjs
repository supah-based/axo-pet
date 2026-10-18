// Candidate art preview only. Never use this module to authorize equipment or stats.
export const STUDIO_SLOTS = Object.freeze(['head', 'face', 'body', 'pants', 'footwear', 'back', 'tool', 'charm', 'companion', 'habitat']);
export const STUDIO_PLANES = Object.freeze(['habitat', 'back', 'body-rear', 'pants-rear', 'pet', 'footwear', 'pants', 'body', 'pet-arms', 'face', 'head', 'tool', 'pet-grip', 'charm', 'companion']);

export function validateSelection(catalog, lineage, selection) {
  if (catalog.schema !== 'AXO_GEAR_STYLE_STUDIO_V1' || catalog.status !== 'CANDIDATE' || catalog.level !== 10) throw new Error('Unsupported candidate collection.');
  const base = catalog.lineages.find(item => item.id === lineage);
  if (!base) throw new Error('Unknown level-10 reference.');
  if (catalog.fitSystem?.version !== 2 || base.poseId !== catalog.fitSystem.poseId) throw new Error('Missing compatible pose fitting profile.');
  const picked = {};
  for (const [slot, id] of Object.entries(selection)) {
    if (!STUDIO_SLOTS.includes(slot)) throw new Error('Unknown equipment slot.');
    if (!id) continue;
    const item = catalog.items.find(item => item.id === id);
    if (!item || item.slot !== slot) throw new Error('Item does not match its slot.');
    if (item.wearable.poseId !== base.poseId) throw new Error('Wearable pose mismatch.');
    if (['body', 'pants'].includes(slot) && !item.wearable.rear) throw new Error('Garment depth layer unavailable.');
    picked[slot] = item;
  }
  return { base, picked };
}

export function buildRenderPlan(catalog, lineage, selection) {
  const { base, picked } = validateSelection(catalog, lineage, selection);
  if (picked.footwear && !base.footwearBase) throw new Error('Footwear base mask unavailable.');
  const foreground = key => {
    if (!base.occluders?.[key]) throw new Error('Pet foreground occlusion unavailable.');
    return [{ kind: 'occluder', id: `${base.id}-${key}`, plane: `pet-${key}`, src: base.occluders[key].asset }];
  };
  return STUDIO_PLANES.flatMap(plane => {
    if (plane === 'pet') return [{ kind: 'pet', id: base.id, plane, src: picked.footwear ? base.footwearBase.asset : base.asset }];
    if (plane === 'pet-arms') return picked.body || picked.pants ? foreground('arms') : [];
    if (plane === 'pet-grip') return picked.tool ? foreground('grip') : [];
    if (plane.endsWith('-rear')) {
      const item = picked[plane.slice(0, -5)];
      return item ? [{ kind: 'gear', id: item.id, slot: item.slot, plane, depth: 'rear', src: item.wearable.rear.asset }] : [];
    }
    const item = picked[plane];
    return item ? [{ kind: 'gear', id: item.id, slot: plane, plane, depth: 'front', src: item.wearable.asset }] : [];
  });
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
