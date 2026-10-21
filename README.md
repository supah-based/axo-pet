# AXO Pet

Private monorepo for the `axo.pet` product surface:

- AXO Hatchery and Pet Passport;
- soulbound AXO Pet NFT contracts;
- Level-10 ERC-1155 gear and exact equipment slots;
- deterministic Pet metadata and V5 visual compositing;
- AXO Arena identity, combat, replay, and verified gear bonuses.

## Current status

This repository is an **extraction workspace**, not a production deployment. The initial import contains the tested Pet contracts, active Arena source/runtime assets, canonical V4.3/V5.1.1 catalog manifests, selected Hatchery web entrypoints, and migration inputs from the existing AXO application.

No contract is deployed from this repository. No NFT is minted. No gear is issued. No live database, player state, credential, wallet mapping, receipt, or production authorization is stored here.

## Structure

```text
apps/
  hatchery-web/     Holder-facing Hatchery, Passport, gear and Bazaar UI
  arena-web/        Arena client/server, combat presentation and tests
  pet-api/          Read/prepare API extraction boundary
packages/
  pet-domain/       Identity, XP, levels and Pet metadata
  pet-contracts/    SoulPet, Gear and Marketplace contracts
  gear-catalog/     Canonical slot, item and visual manifests
  visual-engine/    Deterministic Pet compositing
  arena-engine/     Host adapter between verified Pet state and Arena
  shared-schemas/   Cross-package request/response and receipt schemas
tests/              Repository, integration and browser gates
docs/               Architecture decisions and migration runbooks
```

## Safety model

- The existing AXO runtime remains authoritative until an explicitly reviewed migration.
- Unknown wallet, ownership, XP, level, mint, slot, gear, stat, contract or chain state fails closed.
- Gear bonuses are bounded to supported games. They never modify Hatchery XP, trust, research authority, access, Epoch rank, rewards or payouts.
- Production deployment, state migration, minting, gear distribution and value movement require separate operator authorization.

## Development

**Arena shared Pet integration** now reads the same verified identity, exact XP, numeric V1 equipment and canonical layers as Wardrobe and Passport. A private loadout panel distinguishes real equipped bonuses from cosmetic Previews; battle entries freeze their stats and gear-aware replays preserve them. The host mount requires existing verified ports and Arena service/store, with no new Pet ledger or V2 activation. See [the Arena guide](docs/ARENA_VERIFIED_PET.md) and [AXO-010](docs/handoffs/AXO-010.md). Live host parity remains pending.

**Pet Passport** now has a focused `/passport` page and an upgraded private section on `/nft`, with exact V1 XP, canonical appearance, lineage chapters, optional recorded XP/achievement history, and separate equipped/saved-Preview wardrobes. It consumes the shared Pet API; absent history stays unavailable and no dates/awards are invented. See [the Passport guide](docs/PET_PASSPORT.md) and [AXO-009](docs/handoffs/AXO-009.md). The normal local page has no fabricated session; labelled synthetic UI review remains opt-in.

Use the existing [live Hatchery and quests](https://axo.pet/hatchery?view=quests) to inspect the actual product.
`npm run inspect:live` checks the existing public overview and marketplace APIs without a wallet or database connection.
Wallet-private quest progress and host/database diagnostics require the existing AXO interfaces requested in [AXO-002](docs/handoffs/AXO-002.md).

**Standalone read-only Pet API** now runs with `npm run dev:pet-api` on loopback port 4330. GET `/api/pet/v1/me` exposes one strict V1 identity/XP/equipment/visual projection; the Wardrobe endpoint delegates to the same reader. Existing host ports remain required: without them private reads/readiness return unavailable, with no mock Pet or second ledger. See [the API guide](docs/READ_ONLY_PET_API.md) and [AXO-008](docs/handoffs/AXO-008.md). Production host binding and live parity remain pending.

**My AXO Wardrobe** mounts inside `/hatchery?view=wardrobe`, with separate authoritative V1 equipment and cosmetic try-ons, clothing filters, complete looks, local saved previews and visibly marked portrait exports. Its GET-only read adapter requires the existing verified session and preserved Pet snapshot; the ordinary local preview cannot manufacture these. All V2 transactions and bonuses remain locked. See [the Wardrobe guide](docs/MY_AXO_WARDROBE.md) and [AXO-007](docs/handoffs/AXO-007.md) for host integration and explicit synthetic review.

The `/gear-studio` and Bazaar source previews now contain 43 fitted families, 473 fixed item-level variants (10–20) and six five-piece sets with role-specific Arena bonuses. Six covered tops add a sweater, hoodie, two jackets, overshirt and tee, with clothing filters and sleeve-aware foreground masks. Candidate Pet progression extends the preserved XP curve to level 20. Full Gear portraits and worn surfaces remain separate, using the calibrated adult pose, six complete lineage paintings and three scenes. Additive V2 schemas/contracts and opt-in Arena calculations implement the proposed level and ten-slot rules; V1 and the live host remain unchanged. See [the covered tops guide](docs/COVERED_TOPS_V1.md), [the progression and set guide](docs/GEAR_PROGRESSION_V2.md), [the art method](docs/ANATOMY_ATELIER.md), and [AXO-006](docs/handoffs/AXO-006.md) alongside [AXO-005](docs/handoffs/AXO-005.md). The rejected 30-design fit remains archived at `/gear-concepts`; operator art/balance acceptance and AXO host integration are pending.

Use Node **22.23.1** (`.node-version`) and npm **10.9.8**, matching CI.

```bash
npm ci --ignore-scripts
npm run dev
```

Open **http://127.0.0.1:4320** for the editable source preview. Refresh after edits.
Home, My AXO, NFT, Bazaar and the Hatchery game entrypoint use repository source.
Arena is playable with clearly labeled synthetic Pets and memory-only state, reset on restart.
Other full `/hatchery` dashboard views and authenticated Pet API ports still require extraction or binding from the existing host. The Wardrobe module can be installed in the existing dashboard without replacing it.
Wallet connections are disabled locally. Missing public images and shared styles are read from
`https://axo.pet` through a fixed-origin asset allowlist; no API or production write is proxied.
Set `AXO_PREVIEW_LIVE_ASSETS=0` for offline use, with missing host images/styles left unavailable.
`PORT` may select a different loopback port; 4320 avoids the historical 4318 lab listener.

```bash
npm run verify
npm test
npm run test:schemas
npm run test:contracts
npm run test:arena
npm run test:dev
```

Build agents must read [HANDOFF.md](HANDOFF.md) first for AXO's system context.
See `docs/MIGRATION_PLAN.md` before moving any additional code or runtime responsibility.
The shared Codex/AXO exchange is [AXO-001](docs/handoffs/AXO-001.md). See [the agent handoff runbook](docs/runbooks/agent-handoff.md) for the workflow,
and [the development map](docs/DEVELOPMENT.md) for the current extraction boundaries.
