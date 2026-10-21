// Opt-in loopback review only. All sessions, NFT records and equipment are invented.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mountVerifiedPetArena } from '../../packages/arena-engine/src/mount.mjs';
import { createVerifiedArenaAuthenticator } from '../../packages/arena-engine/src/verified-pet.mjs';
const require = createRequire(new URL('../../apps/arena-web/package.json', import.meta.url));
const express = require('express');
export function createArenaPipelineReview(service, { seedReport = false } = {}) {
  const fixture = JSON.parse(readFileSync(new URL('../../packages/shared-schemas/fixtures/synthetic-v1.json', import.meta.url)));
  const visualCatalog = JSON.parse(readFileSync(new URL('../../packages/gear-catalog/catalogs/website-visual-catalog-v5.json', import.meta.url)));
  const identity = { ...fixture.identities.level10Minted, name: 'Miso · synthetic', xp: 17950 };
  const app = express(); let ready = Promise.resolve();
  app.use((_req, res, next) => { void ready.then(() => next(), () => res.status(503).json({ error: 'Synthetic review initialization unavailable.' })); });
  app.get('/api/arena/config', (_req, res) => res.json({ mode: 'authenticated', syntheticOnly: true, identitySource: 'AXO_PET_READ_V1', matchmaking: true, stakesEnabled: false, previewPolicy: 'COSMETIC_ONLY' }));
  const sessionSecret = 'synthetic-loopback-review-secret-not-a-live-key';
  const mounted = mountVerifiedPetArena(app, { service, visualCatalog, sessionSecret,
    isPetHost: req => req.hostname === '127.0.0.1', originAllowed: (origin, req) => origin === `http://${req.get('host')}`,
    authenticate: async () => ({ verified: true, address: identity.ownerAddress }),
    readVerifiedPetSnapshot: async () => ({ identity, equipment: fixture.projections.full }),
  });
  if (seedReport) ready = (async () => {
    const player = await mounted.authenticate({});
    const rivalPet = { ...fixture.identities.level10Unminted, ownerAddress: fixture.otherOwner, genesisId: 'AXO-01234ABCDE', lineageId: 'sapphire_tide', name: 'Pixel · synthetic', xp: 17950 };
    const rival = await createVerifiedArenaAuthenticator({ visualCatalog, secret: sessionSecret,
      authenticate: async () => ({ verified: true, address: rivalPet.ownerAddress }),
      readVerifiedPetSnapshot: async () => ({ identity: rivalPet, equipment: { schemaVersion: 'AXO_GEAR_READ_FAILURE_V1', status: 'UNAVAILABLE', reason: 'NOT_MINTED', data: null } }),
    })({});
    const originalClock = service.clock; let stamp = Date.now() - 120000; service.clock = () => stamp;
    try {
      const id = service.challenge(player, {}).id; service.join(rival, id); service.ready(player, id);
      for (const moves of [['market_order', 'diamond_hands'], ['diamond_hands', 'market_order'], ['pepe_breakout', 'market_order'], ['touch_grass', 'pepe_breakout'], ['market_order', 'touch_grass'], ['pepe_breakout', 'diamond_hands']]) {
        const room = service.room(id); if (room.status !== 'playing') break;
        stamp = room.opensAt + 1; service.tick();
        service.choose(player, id, { round: room.battle.round, move: moves[0] });
        service.choose(rival, id, { round: room.battle.round, move: moves[1] });
      }
      const room = service.room(id); stamp = room.opensAt + 1;
      if (room.status === 'playing') service.cancel(rival, id, {});
    } finally { service.clock = originalClock; }
  })();
  return app;
}
