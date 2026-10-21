// Opt-in loopback review only. All sessions, NFT records and equipment are invented.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mountVerifiedPetArena } from '../../packages/arena-engine/src/mount.mjs';
const require = createRequire(new URL('../../apps/arena-web/package.json', import.meta.url));
const express = require('express');
export function createArenaPipelineReview(service) {
  const fixture = JSON.parse(readFileSync(new URL('../../packages/shared-schemas/fixtures/synthetic-v1.json', import.meta.url)));
  const visualCatalog = JSON.parse(readFileSync(new URL('../../packages/gear-catalog/catalogs/website-visual-catalog-v5.json', import.meta.url)));
  const identity = { ...fixture.identities.level10Minted, name: 'Miso · synthetic', xp: 17950 };
  const app = express();
  app.get('/api/arena/config', (_req, res) => res.json({ mode: 'authenticated', syntheticOnly: true, identitySource: 'AXO_PET_READ_V1', matchmaking: true, stakesEnabled: false, previewPolicy: 'COSMETIC_ONLY' }));
  mountVerifiedPetArena(app, { service, visualCatalog, sessionSecret: 'synthetic-loopback-review-secret-not-a-live-key',
    isPetHost: req => req.hostname === '127.0.0.1', originAllowed: (origin, req) => origin === `http://${req.get('host')}`,
    authenticate: async () => ({ verified: true, address: identity.ownerAddress }),
    readVerifiedPetSnapshot: async () => ({ identity, equipment: fixture.projections.full }),
  });
  return app;
}
