# Pet API

Standalone read-only Pet service plus legacy Pet NFT/Gear preparation extraction inputs.

`npm run dev:pet-api` from the root (or `npm start` here) starts `src/start.mjs` on `127.0.0.1:4330`. GET `/api/pet/v1/me` returns one validated `AXO_PET_READ_V1` identity, exact XP, equipment and canonical visual projection. `/healthz` is liveness; `/readyz` checks an explicitly bound dependency probe. Without the existing authenticated host ports, private reads/readiness remain unavailable.

`src/pet-read.mjs` owns the shared reader. `src/server.mjs` can also mount inside the existing host. `src/wardrobe-read.mjs` retains the AXO-007 factory and version through the same reader; it contains no duplicate authority logic. Set `AXO_PET_API_ADAPTER_MODULE` only to a trusted absolute local module exporting actual host ports. See [the setup/acceptance guide](../../docs/READ_ONLY_PET_API.md) and [AXO-008](../../docs/handoffs/AXO-008.md).

The imported CommonJS NFT/marketplace modules remain disconnected migration inputs. The standalone entrypoint does not import them or expose write/transaction routes. Production session/ledger/RPC integrations, live parity and release gates remain AXO's host work. No production database, credentials, signing, issuance, V2 activation or Arena migration is included.
