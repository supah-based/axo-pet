'use strict';
const path = require('node:path');
const { v5LoadoutFromGearItems, v5WebsiteVisualState } = require('../hatchery/pet-visual-v5');
const { version: arenaRelease } = require('../../labs/pet-arena/package.json');

// Explicit free-play feature gate. No escrow, signer, rewards or Hatchery writes.
function mountPetArena(app, { currentSession, hatchery, sessionSecret, visualCatalog, resolveGear, isPetHost, stateFile, normalizedStorage } = {}) {
  let timer;
  const ready = Promise.all([
    import('../../labs/pet-arena/http.mjs'),
    import('../../labs/pet-arena/service.mjs'),
    import('../../labs/pet-arena/identity.mjs'),
    import('../../labs/pet-arena/catalog.mjs'),
    normalizedStorage?.file ? import('../../labs/pet-arena/normalized-storage.mjs') : Promise.resolve({ NormalizedArenaStore: null }),
  ]).then(([http, { ArenaService }, { hatcheryIdentity }, { VERSION }, { NormalizedArenaStore }]) => {
    const store = normalizedStorage?.file ? new NormalizedArenaStore({ file: normalizedStorage.file, version: VERSION }) : null;
    const service = new ArenaService({ matchmaking: true, privacyMode: 'strict', store, file: store ? null : (stateFile || path.join(__dirname, '../../state/pet-arena/free-play.json')) });
    const api = http.createArenaRouter({
      service,
      async authenticate(req) {
        const session = currentSession(req);
        if (!session?.address) return null;
        const snapshot = hatchery.snapshot(session.address);
        const gear = snapshot.hatched && typeof resolveGear === 'function' ? await resolveGear(session.address) : null;
        const loadout = gear?.status === 'VERIFIED_ONCHAIN' ? v5LoadoutFromGearItems(gear.items) : {};
        const visual = snapshot.hatched ? v5WebsiteVisualState(snapshot.pet, {
          catalog: visualCatalog,
          level: snapshot.pet.level,
          loadout,
        }) : null;
        return hatcheryIdentity(snapshot, { address: session.address, secret: sessionSecret, visual, gear });
      },
      originAllowed(origin) { return origin === 'https://axo.pet' || origin === 'https://www.axo.pet'; },
    });
    timer = setInterval(() => { try { service.tick(); } catch (error) { console.error('Arena timer persistence failed:', error.message); } }, 250);
    timer.unref();
    return { api, pages: http.arenaStatic(), service };
  });
  // Attach a rejection handler immediately; a failed store does not affect the other AXO services.
  ready.catch(() => {});
  app.use(['/arena', '/api/arena'], (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!isPetHost(req)) return res.status(404).json({ error: 'Arena belongs on AXO.pet.' });
    return next();
  });
  app.get('/api/arena/config', (_req, res) => ready
    .then(() => res.json({ mode: 'authenticated', release: arenaRelease, beta: true, matchmaking: true, stakesEnabled: false }))
    .catch(() => res.status(503).json({ error: 'Arena temporarily unavailable.' })));
  app.use('/api/arena', (req, res, next) => ready.then(v => v.api(req, res, next)).catch(() => res.status(503).json({ error: 'Arena temporarily unavailable.' })));
  app.use('/arena', (req, res, next) => ready.then(v => v.pages(req, res, next)).catch(() => res.status(503).send('Arena temporarily unavailable.')));
  return { ready, close() { clearInterval(timer);ready.then(v=>v.service.store?.close?.()).catch(()=>{}); } };
}
module.exports = { mountPetArena };
