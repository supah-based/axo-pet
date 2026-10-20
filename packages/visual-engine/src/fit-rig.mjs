// Build-time fitting geometry. Anchors are in normalized, alpha-trimmed item space.
// Runtime consumes the baked front/rear planes, never player-supplied transforms.
export function resolveAnchoredRect(fit, rig) {
  const target = rig.anchors[fit.anchor];
  if (!target || !Array.isArray(fit.origin) || fit.origin.length !== 2 || !Array.isArray(fit.size) || fit.size.length !== 2) throw new Error('Incomplete fitting anchor.');
  if (!fit.origin.every(n => Number.isFinite(n) && n >= 0 && n <= 1) || !fit.size.every(n => Number.isInteger(n) && n > 0 && n <= 1024)) throw new Error('Invalid fitting geometry.');
  if (fit.rotation) throw new Error('Anchored rotation requires a transformed anchor.');
  const [u, v] = fit.origin, [width, height] = fit.size;
  const rect = [Math.round(target[0] - (fit.mirrorX ? 1 - u : u) * width), Math.round(target[1] - v * height), width, height];
  if (rect[0] < 0 || rect[1] < 0 || rect[0] + width > rig.canvas[0] || rect[1] + height > rig.canvas[1]) throw new Error('Anchored item outside fitting canvas.');
  return rect;
}

export function assertPoseRig(rig) {
  if (rig.schema !== 'AXO_POSE_FIT_RIG_V2' || rig.version !== 2 || rig.poseId !== 'website-v5-adult-l10' || rig.canvas?.join(',') !== '1024,1024') throw new Error('Unsupported pose fitting rig.');
  for (const key of ['neck', 'waist', 'grip']) {
    if (!Array.isArray(rig.anchors[key]) || rig.anchors[key].length !== 2 || !rig.anchors[key].every(n => Number.isFinite(n) && n >= 0 && n <= 1024)) throw new Error('Invalid pose landmark.');
  }
  for (const key of ['arms', 'grip']) if (!rig.foreground[key]?.length) throw new Error('Missing foreground occlusion mask.');
}
