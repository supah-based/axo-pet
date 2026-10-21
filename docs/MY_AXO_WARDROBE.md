# My AXO Wardrobe

The Wardrobe is a cosmetic fitting room inside `/hatchery?view=wardrobe`. It reads the wallet's existing authoritative V1 Pet identity and exact XP, shows verified numeric V1 equipment separately, and offers the 43 candidate styles at fixed preview tiers 10–20. A tier-20 try-on does not change a V1 Pet into a level-20 Pet. Lower-level Pets use their exact canonical stage in the authoritative panel; their separate fitting-room portrait is explicitly an adult fit preview of the same lineage.

## Host integration

The existing Hatchery HTML, session service and state repository remain host-owned. The public page and `pet-shell.js` were inspected on 2026-10-21 to identify `main.hatchery-dashboard`, `.pet-view-switcher` and the existing `axo:session` wallet flow. Their full source is not copied over the host. Add this stylesheet and module to the current Hatchery document:

```html
<link rel="stylesheet" href="/wardrobe/wardrobe.css">
<script type="module" src="/wardrobe/entry.mjs"></script>
```

The entry adds the Wardrobe journey link, selects its view and mounts in the existing main element. Only this view hides the other top-level Hatchery panels and mobile care drawer; care/quest code and state are retained. Other views get navigation only. The shared shell currently recognizes Pet/Quests; the module sets the Wardrobe view after deferred scripts finish. The host may additionally recognize `wardrobe` directly in its router. Preserve all unrelated host patches.

Mount `createWardrobeHandler` from `apps/pet-api/src/wardrobe-read.mjs` on **GET `/api/hatchery/wardrobe`**, behind the existing wallet session:

```js
const handleWardrobe = createWardrobeHandler({
  authenticate: existingVerifiedSessionAdapter,
  readVerifiedPetSnapshot: existingAuthoritativeSnapshotAdapter,
  visualCatalog: reviewedV511Catalog,
});
```

`authenticate(request, {signal})` must authenticate the existing server session and return `{verified: true, address}` only after its checks. Never construct that result from a browser address, header or JSON flag. `readVerifiedPetSnapshot({session, signal})` must return one coherent `{identity, equipment}` snapshot. Identity is the strict shared `AXO_PET_IDENTITY_V1` DTO, from the preserved ledger with exact safe-integer XP and V1 level. Equipment is the strict `AXO_VERIFIED_GEAR_PROJECTION_V1` DTO built from block-consistent ownership, balances, immutable definitions, loadout, revision and reviewed visual mappings, or an explicit `AXO_GEAR_READ_FAILURE_V1` result.

Legacy `/api/hatchery`, `/api/hatchery/nft` and `/api/axo-pet/me` payloads are not these new DTOs. Do not rename a legacy status or add `verified: true` to make them pass. AXO must implement the reviewed mapper and chain evidence behind this port. Missing identity fails closed; unavailable or inconsistent equipment remains unavailable, never an inferred empty loadout. The handler validates the shared V1 rules and pins canonical visual paths/hashes. It exposes no writes, transaction preparation or V2 projection.

The response `AXO_WARDROBE_READ_V1` carries identity, equipment, canonical visual layers, observation time and a 60-second expiry. It is private/no-store, varies by Cookie and has no cross-origin access. Query-supplied identity parameters and non-GET methods are rejected. The browser verifies the expected wallet, clears private views immediately on account change, fences late responses, and expires reads. Visible pages refresh every 40 seconds and on return to the tab; save/share also recheck the current wallet and freshness.

## Preview boundary

The fitting room uses `gear-bazaar/v1/catalog.json` and the tested anatomy renderer, including sleeves and palm/tool/finger ordering. Its base lineage comes from the verified Pet; XP and level cannot be edited. Filters cover clothing types, slots, themes and search. Complete looks include coordinated set appearances, but compute or grant no stats or set bonus. Actual V1 equipment remains an independent numeric-ID list and canonical portrait.

V2 equip, mint and marketplace actions are permanently locked in this milestone. No response field, URL, storage value or item tier can unlock them. There are no V2 transaction handlers, signer calls, ID guesses or writes to the legacy market. Contract addresses and numeric family/tier mappings must be independently verified before a separately reviewed activation change.

## Saved looks and portraits

`AXO_WARDROBE_PREVIEW_V1` stores only the pose/rig version, cosmetic family/tier choices, scene and base-painting choice. It rejects unknown fields, slots, items, scenes and incompatible rigs. Up to 12 named looks are stored locally per verified wallet and Pet, under a hashed scope. Wallet addresses, genesis IDs, identity, XP, V1 equipment, proofs, stats, mint state and numeric contract IDs are not saved in outfit documents. Storage failure or corruption is visible and never silently overwritten. No server-side outfit database is introduced.

The 1024×1536 canvas and its exported PNG both contain an opaque **PREVIEW** badge and a cosmetic/no-ownership footer. Export opens a full portrait with a download link. Native file sharing is used where supported; otherwise the same PNG is offered for saving. No wallet address, XP, NFT ID, private proof or Pet name is included. No upload or public receipt is created. Account changes and read expiry invalidate the export view.

## Source preview and verification

The ordinary local Hatchery Wardrobe is at `/hatchery?view=wardrobe`. It can browse styles but cannot invent a verified wallet or Pet when the host adapter is absent. Other full Hatchery views retain their existing extraction-boundary page.

An explicitly opt-in loopback review (`createDevServer({wardrobeReview:true})`) provides `/hatchery/wardrobe-review` and a 390×844 mobile review frame. It uses the existing invented schema fixtures, labels the Pet/equipment synthetic and stamps exports **SYNTHETIC PREVIEW**. It does not enable the real private endpoint, wallet connection, signing or any ledger. These review routes are absent by default and must not be installed on the host.

```sh
node scripts/sync-wardrobe-runtime.mjs
npm run test:wardrobe
npm run test:dev
npm run check
```

The browser model copy must be byte-identical to `packages/pet-domain/src/wardrobe-preview.mjs`. Tests cover exact XP, V1 mapping and revision failures, account races, expiry, storage isolation, hostile/corrupt previews, read-only HTTP/cache behavior and synthetic route isolation. Browser review covers real controls and export rendering using synthetic data; it cannot establish production session or chain parity. AXO's integration and live verification are tracked in AXO-007.

## Subsequent priorities

1. Extract a standalone read-only Pet API around the same authoritative snapshot port and reviewed projections, without creating a parallel ledger.
2. Redesign the Passport using lineage history, XP receipts/timeline, achievements and explicit equipped/preview distinctions.
3. Make Arena consume the same verified Pet projection; preview choices remain cosmetic and must never enter verified Gear stats.
