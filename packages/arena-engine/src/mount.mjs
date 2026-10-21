import { createVerifiedArenaAuthenticator } from './verified-pet.mjs';
import { createArenaRouter, arenaStatic } from '../../../apps/arena-web/http.mjs';
import { ArenaService } from '../../../apps/arena-web/service.mjs';

// Supply existing Arena storage and verified Pet ports: no new ledger or state path.
export function mountVerifiedPetArena(app, {
  authenticate, readVerifiedPetSnapshot, visualCatalog, sessionSecret, isPetHost,
  service, originAllowed = origin => ['https://axo.pet', 'https://www.axo.pet'].includes(origin),
  now = Date.now, timeoutMs = 10000,
} = {}) {
  if (!(service instanceof ArenaService) || typeof isPetHost !== 'function') throw Error('Existing ArenaService and exact host guard required.');
  const auth = createVerifiedArenaAuthenticator({ authenticate, readVerifiedPetSnapshot, visualCatalog, secret: sessionSecret, now, timeoutMs });
  app.use(['/arena', '/api/arena'], (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!isPetHost(req)) return res.status(404).json({ error: 'Arena belongs on AXO.pet.' });
    next();
  });
  app.get('/api/arena/config', (_req, res) => res.json({
    mode: 'authenticated', release: '1.5.0', identitySource: 'AXO_PET_READ_V1',
    beta: true, matchmaking: service.matchmaking === true, stakesEnabled: false, previewPolicy: 'COSMETIC_ONLY',
  }));
  app.use('/api/arena', createArenaRouter({ service, authenticate: auth, originAllowed }));
  app.use('/arena', arenaStatic());
  // Existing owner retains ticking and store lifecycle; never double-tick a live service.
  return { service, authenticate: auth };
}
