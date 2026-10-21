# Standalone read-only Pet API

`apps/pet-api/src/start.mjs` runs a loopback-only Node HTTP service without the AXO monolith. It has no Pet store, RPC client, signer or write routes. The existing host remains the identity/XP/equipment authority. AXO supplies its existing verified-session and coherent snapshot adapters as trusted local code; this repository contains no production adapter or credentials.

## One projection

GET `/api/pet/v1/me` returns the strict shared `AXO_PET_READ_V1` envelope:

```text
schemaVersion, status: READY, observedAt, expiresAt
identity             AXO_PET_IDENTITY_V1, preserved exact XP and V1 level
equipment            AXO_VERIFIED_GEAR_PROJECTION_V1 or explicit read failure
authoritativeVisual  reviewed V5.1.1 paths, hashes and matching layer order
```

Each request authenticates once and invokes the snapshot port once. Identity, chain evidence, equipment revision, numeric definitions, aggregate stats and visuals must agree. Valid empty equipment is distinct from missing/inconsistent equipment. Equipment failure preserves the independently verified identity and canonical base, explicitly omitting equipment; it does not grant zero-stat equipment or an Arena-ready fallback. Missing/invalid identity fails the entire read. XP remains exact, including XP above 1,200; this V1 projection still uses the preserved level-10 cap. The candidate level-20 rules remain separate.

GET `/api/hatchery/wardrobe` uses the same reader and changes only the envelope version to `AXO_WARDROBE_READ_V1`. Existing Wardrobe clients and the AXO-007 handler factory remain compatible. There is no second Gear resolver. Separate requests may legitimately see different snapshots; consumers should pass one envelope through a render/update, rather than assembling identity and equipment from unrelated requests.

Both endpoints are private/no-store and vary by Cookie and Authorization. Queries, request bodies and non-GET methods are rejected. Browser addresses/headers/preview documents cannot select a wallet or supply identity. No CORS permission or unauthenticated wallet lookup is exposed. Reads have a ten-second enforced deadline, forward cancellation to ports, and discard late results. Their 60-second validity starts before host I/O. Consumers must discard expired responses and clear identity on session/account changes; a refresh must run the existing authentication again.

`validatePetRead` / `assertPetRead` are exported through both ESM and CommonJS `@axo/pet-schemas`. Server consumers must validate against the authenticated expected owner, reviewed visual catalog and current time. The schema checks shape and consistency; it cannot prove session signatures, actual RPC execution, current chain state, asset availability or asset bytes. The host adapter must establish that evidence, and clients must verify fetched asset bytes against the supplied hashes.

## Start and mount

Use Node 22.23.1 and the existing lockfile installation:

```sh
npm ci --ignore-scripts
npm run dev:pet-api
```

The default listener is `127.0.0.1:4330`. Without an adapter, `/healthz` returns RUNNING, `/readyz` returns 503 NOT_CONNECTED, and private reads return 503 without data. This mode creates no fixture session or Pet. `AXO_PET_API_PORT` may choose another port from 1–65535; the service always binds loopback.

For a host integration, set `AXO_PET_API_ADAPTER_MODULE` to an **absolute local module path** through the operator's existing service configuration. The path is trusted code selection, never a URL or user request parameter. The module must export:

```js
export async function createPetApiPorts() {
  return {
    authenticate,             // (request, {signal}) -> verified session or null
    readVerifiedPetSnapshot,  // ({session: {verified:true,address}, signal}) -> {identity,equipment}
    visualCatalog,           // independently reviewed canonical V5.1.1 manifest
    checkReadiness,           // ({signal}) -> {ready:boolean}; no user data
  };
}
```

These are actual existing-host integrations, not example JSON flags. Authentication must verify the existing server session, expiry/revocation and account eligibility before returning `{verified:true,address}`. It may use existing server-side session storage or existing cryptographic verification; do not invent a new wallet login or accept a forwarded wallet address as authentication. Session fields beyond verified/address are not forwarded to the snapshot port or response. The standalone process must be able to access the established read services securely; do not copy live state into this repository to make it run.

The snapshot adapter reads the preserved ledger without recomputing or writing XP. It must establish one coherent identity/equipment view: pin all related chain reads to one block number/hash, read ownership, balance, definition, loadout and revision there, and verify the revision/ledger context still agrees before returning. Retry a bounded number of times or return an explicit shared read failure when consistency cannot be established. A block hash in JSON alone is insufficient. No synthetic DTOs, guessed numeric mappings or relabelled legacy success flags are acceptable.

The readiness probe checks the adapter's real dependencies and compatible catalog. It has a two-second deadline; any failure/timeout returns sanitized 503 UNAVAILABLE. Missing probes return NOT_CONNECTED. A 200 READY is dependency health, not proof of a particular wallet or Gear read. Health output contains no provider URLs, paths, accounts, keys or raw exceptions.

An existing host can alternatively mount `createPetApiHandler(ports)` behind its existing router or call `createPetReader(ports)` directly on the server. Do not call these from browser-authored input. Keep existing `createWardrobeHandler(ports)` mounts if that is how AXO-007 is integrated; both delegate to the shared reader. The standalone service does not serve the web app or Gear assets.

For separate-process deployment, route only the two documented API paths through the existing **same-origin** axo.pet reverse proxy to the loopback service, preserving the legitimate session credentials. Do not expose the listener publicly, forward a public wallet-address header as identity, or overwrite unrelated legacy routes. The proxy must retain private/no-store behavior and must not cache authenticated responses. Keep health endpoints operator-facing. No production proxy configuration or service manager choice is guessed here; AXO returns the actual host-specific plan.

## Host acceptance and rollback

1. Record the exact host/source revisions and preserve host patches; run `npm run check` on the candidate source.
2. Shadow-read the new reader alongside existing read paths without changing traffic or writing state. Compare exact identity, XP, mint state, numeric equipment, revision, block context and visuals. Keep player records and full receipts private; commit only sanitized counts/outcomes and code.
3. Test real authorized sessions, signed-out/revoked sessions, two-wallet switching/concurrent reads, unminted/low-level Pets, verified empty/full equipment, stale revisions, unavailable providers/assets, abort/timeout and hash mismatches. An unavailable result is an expected safe outcome; it is not verified parity.
4. Verify Wardrobe remains cosmetic: V1 values stay unchanged during tier-20 try-on; saved looks/export cannot enter the verified DTO or unlock transactions. Existing care, quests, Passport and Arena routes retain their behavior.
5. Prepare an immutable source/assets release and proxy rollback. Any live rollout follows the existing release gates and scoped operator authorization. On regression restore the prior route/process; no Pet data migration or XP rollback should be necessary because this service performs no writes.
6. Return the exact deployed source, configuration version (without secrets), sanitized parity totals, health/readback results and rollback result in AXO-008. ACKNOWLEDGED, RELEASED and VERIFIED require separate evidence.

## Next consumers

The Wardrobe is the first compatibility consumer. The next milestone is the Passport redesign, reading this same envelope for identity, XP and equipped appearance; lineage history, XP receipts and achievements require separate existing-ledger read ports with their own evidence. Arena integration follows afterward and must consume verified equipment only. Missing equipment must remain unavailable, and cosmetic previews cannot become combat stats or set bonuses. Neither consumer migration is enabled by this API milestone.

```sh
npm run test:pet-api
npm run test:wardrobe
npm run check
```
