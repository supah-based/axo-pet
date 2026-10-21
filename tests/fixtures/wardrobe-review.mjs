// Loopback-only browser QA. Never included by the production Wardrobe entrypoint.
import { mountWardrobe } from '/wardrobe/view.mjs';
const root = document.querySelector('[data-axo-wardrobe]');
const session = { connected: true, address: '0x1111111111111111111111111111111111111111' };
await mountWardrobe(root, {
  syntheticReview: true,
  sessionBridge: { getSession: () => session, ready: () => Promise.resolve(), connect: () => Promise.resolve(), subscribe: () => () => {} },
  read: async ({ signal }) => {
    const response = await fetch('/__dev/wardrobe-fixture', { signal, credentials: 'omit' });
    const fixture = await response.json(); if (fixture.syntheticOnly !== true) throw Error('Synthetic review required.'); return fixture.read;
  },
});
