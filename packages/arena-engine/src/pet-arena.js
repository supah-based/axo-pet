'use strict';
// Compatibility entrypoint: await ready before listening. No independent legacy reads.
function mountPetArena(app, options = {}) {
  if (!options.service || typeof options.authenticate !== 'function' || typeof options.readVerifiedPetSnapshot !== 'function') {
    throw Error('Arena requires the existing service and shared verified Pet ports; see docs/ARENA_VERIFIED_PET.md.');
  }
  const ready = import('./mount.mjs').then(({ mountVerifiedPetArena }) => mountVerifiedPetArena(app, options));
  ready.catch(() => {});
  return { ready };
}
module.exports = { mountPetArena };
