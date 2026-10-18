# AXO Pet build-agent handoff

This document is the operating handoff for agents and engineers working in the private `axo-pet` repository. Read it before changing code, moving package boundaries, running deployment tooling, or importing data from the existing AXO application.

## 1. Mission

`axo-pet` is the dedicated monorepo for the complete AXO Pet product surface:

- the wallet-bound Hatchery companion;
- Pet Passport and NFT metadata;
- soulbound AXO Pet ERC-721 contracts;
- transferable Level-10 Gear ERC-1155 contracts;
- exact gear slots, catalog definitions and visual layers;
- deterministic V4.3 metadata and V5.1.1 website visuals;
- AXO Arena identity, builds, combat, replays and verified gear bonuses;
- the holder-facing `axo.pet` interface and future Pet games.

The goal is to let several build agents or contributors work on these systems without allowing their shared identity, XP, gear, metadata and game rules to drift apart.

## 2. Current repository state

This repository is an **extraction workspace**, not the production authority.

The initial foundation includes:

- tested `AxoSoulPet`, `AxoPetGear` and `AxoPetGearMarketplace` contracts;
- the active Arena source, tests and runtime battle assets;
- canonical V4.3 trait/art-release manifests;
- the canonical V5.1.1 website visual catalog;
- selected Hatchery, Passport, dashboard and Bazaar web entrypoints;
- copied Pet domain, visual, Arena adapter and Pet API migration inputs;
- repository verification, dependency controls and three-job GitHub CI;
- migration, security and architecture documentation.

The repository does **not** currently contain or control:

- the live Hatchery database or any production player-state file;
- wallet-to-pet bindings, private identity receipts or wallet exports;
- production credentials, signing keys, API tokens or deployment authorization;
- a deployed Pet, Gear or Marketplace contract;
- minted Pet NFTs or issued Gear NFTs;
- the complete generated V5 image universe;
- a standalone production Pet API;
- production routing for the `axo.pet` domain;
- authority to migrate, reset or recompute existing state.

No build agent should describe this repository as deployed, live, migrated or production-authoritative until the production-handover gates in this document are explicitly completed.

## 3. Source-of-truth order

When two files disagree, use this precedence and fix the disagreement rather than silently choosing whichever value is convenient:

1. **Preserved production state and signed historical receipts** in the existing AXO runtime.
2. **Reviewed contract behavior and immutable contract/catalog definitions.**
3. **Versioned shared schemas and compatibility fixtures** once those packages are completed.
4. **Server-side domain and API projections.**
5. **Holder-facing web and Arena presentation.**
6. **Documentation and examples.**

Client-provided ownership, XP, level, lineage, gear, stats, mint state or receipts are never authoritative.

## 4. Repository layout

```text
apps/
  hatchery-web/
    public/                 Extracted Hatchery, Passport, dashboard and Bazaar pages
  arena-web/
    app.mjs                 Browser application and workshop/battle UI
    service.mjs             Arena orchestration
    combat.mjs              Deterministic combat resolution helpers
    catalog.mjs             Levels, stats, lineages, builds and gear-stat validation
    identity.mjs            Authenticated Hatchery identity normalization
    render.mjs              Canvas renderer, VFX and dressed-fighter projection
    normalized-storage.mjs  Arena persistence adapter
    assets/runtime/         Active Arena runtime art and manifests
    tests/                  Unit, presentation and inherited integration tests
  pet-api/
    src/                    Pet NFT and Gear marketplace extraction inputs

packages/
  pet-domain/
    src/engine.js           Existing Hatchery domain migration input
    src/pet-nft.js          NFT DNA, metadata and gear-stat projection
  pet-contracts/
    contracts/              SoulPet, Gear and Marketplace Solidity contracts
    test/                   Hardhat contract tests
    scripts/                Config, release and deployment-planning checks
  gear-catalog/
    catalogs/               V4.3 traits/release and V5.1.1 website visual catalog
  visual-engine/
    src/pet-visual-v5.js    Deterministic V5 visual selection and compositing
  arena-engine/
    src/pet-arena.js        Existing host adapter migration input
  shared-schemas/           Reserved package for versioned cross-system schemas

tests/
  repository.test.mjs       Foundation and invariant tests
scripts/
  verify-repository.mjs     Secret/path/catalog/contract boundary verification
docs/
  MIGRATION_PLAN.md
  architecture/decisions.md
  runbooks/release-gates.md
```

## 5. Workspace maturity matrix

Not every workspace has the same readiness. Do not assume that the existence of a `package.json` means the workspace is standalone.

| Workspace | Current condition | Safe work now | Still required |
| --- | --- | --- | --- |
| `apps/arena-web` | Substantial standalone code with a 73-test CI subset | Combat, renderer, accessibility, replay and presentation work covered by standalone tests | Remove remaining AXO-monolith imports from inherited integration tests; complete standalone host/API wiring |
| `packages/pet-contracts` | Compiles and has 35 contract/config tests in CI | Contract review, unit tests, ABI snapshots and non-broadcast planning | Deployment review, immutable asset release, real config and explicit deployment authorization |
| `packages/gear-catalog` | Canonical manifests imported | Schema validation and deduplication | Package a stable public API; define reviewed supply/distribution separately from catalog art |
| `packages/visual-engine` | Core V5 module imported | Pure deterministic visual functions and tests | Replace inherited filesystem assumptions; decide artifact/LFS strategy; import reviewed image universe |
| `apps/hatchery-web` | Static web entrypoints copied | UI decomposition and adapter interfaces | Shared navigation/wallet bootstrapping, assets, API client package and standalone build |
| `apps/pet-api` | Service modules copied as migration inputs | Define ports/interfaces and read-only DTOs | Extract RPC, indexed provider, state store, publisher and server route dependencies |
| `packages/pet-domain` | Core files copied but `engine.js` still references many monolith modules | Isolate pure identity/XP/metadata rules behind tests | Extract all dependencies, remove runtime config access and establish sanitized parity fixtures |
| `packages/arena-engine` | Host adapter copied but paths still target the old layout | Define a stable verified-identity input contract | Repoint imports to workspace packages and remove live-state/path assumptions |
| `packages/shared-schemas` | Reserved skeleton | Create versioned schemas and fixtures | Migrate every duplicated payload shape behind compatibility tests |

## 6. Canonical Pet progression

The current canonical level thresholds are:

| Level | Minimum Hatchery XP |
| ---: | ---: |
| 1 | 0 |
| 2 | 40 |
| 3 | 100 |
| 4 | 180 |
| 5 | 280 |
| 6 | 400 |
| 7 | 550 |
| 8 | 730 |
| 9 | 940 |
| 10 | 1,200 |

Rules:

- Hatchery XP is authoritative; Arena does not create or mutate Hatchery XP.
- Level must be derived from verified XP or read from a contract state that was itself produced by the authoritative signed-growth process.
- Level cannot be accepted from a browser request as an independent claim.
- Existing XP and levels must never be recomputed during repository extraction merely because an implementation has moved.
- Level 10 is the current minimum for NFT Gear equipment.

If a level threshold changes, update and test every affected package atomically. A threshold change is a domain migration, not a cosmetic edit.

## 7. Canonical NFT Gear model

### Slots

The eight exact Gear slots are ordered and numbered as follows:

1. `head` — Headwear
2. `face` — Face / Visor
3. `body` — Body Suit
4. `back` — Back Gear
5. `tool` — Tool
6. `charm` — Charm
7. `companion` — Orbiting Companion
8. `habitat` — Habitat Decoration

Never infer a slot from a filename or visual resemblance. The catalog definition and onchain `GearDefinition.slot` must agree.

### Arena stats

The canonical stat order is:

```text
STR, DEX, CON, INT, WIS, CHA
```

Contract bounds per item:

- six known stat positions;
- maximum `2` points in any one stat;
- maximum `4` points total per item;
- zero-total stat arrays are rejected;
- gear equipment requires Pet level 10 or higher.

Arena aggregate validation currently allows:

- maximum `6` in any one aggregated gear stat;
- maximum `32` total across the eight slots;
- any nonzero Gear bonus only at Level 10.

The contract definition is the item-level authority. Arena limits are an additional defensive aggregate boundary, not permission to invent larger item stats.

### Equipment rules

- The Pet is soulbound and remains owned by its exact wallet.
- Gear is ERC-1155 and may be transferable when unequipped and when all release/trading gates are active.
- A wallet must own the exact Pet and the Gear balance used for equipment.
- One slot holds at most one Gear ID.
- Gear must be active and match the exact requested slot.
- Equipped balance is locked from transfer/listing until unequipped or replaced.
- A Gear revision change invalidates stale prepared metadata updates.
- Unknown ownership, level, balance, slot, Gear definition or contract state fails closed.

### One verified projection

The intended architecture is one verified loadout projection:

```text
onchain owner + Pet level + Gear definitions + Gear balances + equipped loadout
                                    |
                                    v
                         verified server projection
                    /              |               \
                   v               v                v
             NFT metadata     website visuals    Arena stats
```

Do not build separate visual and gameplay Gear loaders. A visual item that is not the same verified item supplying stats is a consistency defect.

## 8. Contract responsibilities

### `AxoSoulPet.sol`

Responsibilities:

- one wallet-authorized soulbound ERC-721 Pet identity;
- signed mint and monotonic signed metadata/growth updates;
- disabled approvals and transfer paths;
- exact metadata hash binding;
- level readback through `levelOf(tokenId)`;
- Gear revision invalidation/notification support;
- pause and two-step ownership/controller safety.

The Pet itself is not a tradable gameplay asset.

### `AxoPetGear.sol`

Responsibilities:

- separately tradable ERC-1155 Gear definitions and capped supply;
- exact slot definitions;
- Level-10 equipment gate;
- bounded six-stat Arena data;
- equipped balance locks;
- one Gear ID per Pet slot;
- loadout revision and Pet metadata refresh signaling;
- emergency pause and controlled metadata correction.

Important constants are tested and also checked by `scripts/verify-repository.mjs`.

### `AxoPetGearMarketplace.sol`

Responsibilities:

- fixed-price, self-custody listings;
- exact payment from buyer to seller;
- no Pet trading lane;
- no escrow of the Gear token itself;
- listing only against available unequipped balance;
- invalidation when approval or inventory backing changes;
- pause behavior that blocks new listings/fills while preserving cancellation.

Marketplace source existing in the repository does not mean trading is activated.

### Deployment status

The checked-in configuration is an intentionally invalid example. There is no production deployment configuration in this repository.

Never:

- fill the example with guessed addresses;
- treat a successful local Hardhat test as deployment authorization;
- broadcast from ordinary CI;
- deploy from an unreviewed branch;
- claim audit, production safety or live supply from internal tests alone.

## 9. Metadata and visual model

### V4.3 onchain metadata

`packages/gear-catalog/catalogs/trait-catalog-v4.3.json` and the matching art-release manifest are the imported onchain metadata baseline.

The immutable identity/DNA model and V4.3 metadata should not be silently rewritten to follow website presentation changes.

### V5.1.1 website visuals

`website-visual-catalog-v5.json` defines:

- six lineages;
- ten levels per lineage;
- 60 Pet bases;
- 12 layer families;
- 120 layer options;
- 204 expected runtime images;
- deterministic z-order and Level-10 wardrobe behavior.

The repository does not yet contain the complete 204-image website visual universe. It contains the manifest and the Arena-specific runtime asset set.

A build agent must not weaken hash or file-presence checks to make missing art appear complete. Missing art remains a release blocker.

### Level-10 visual equipment

The visual engine maps a verified Gear loadout to exact V5 options and composites only hash-verified, aligned layers.

Current dressed-Arena behavior:

- equipped fighters use the aligned fixed Level-10 wardrobe baseline;
- the complete dressed stack moves through bounded fighter-level transforms;
- the existing undressed animated rig remains the no-gear, loading and failure fallback;
- full pose-by-pose animated Gear requires dedicated per-pose Gear atlases and is future work.

Do not claim that static aligned Gear already follows every authored combat pose.

## 10. Arena authority boundary

Arena may consume verified Pet identity and Gear stats. It may not become a second Pet ledger.

Authoritative Arena identity input includes:

- wallet owner/address established by the host session;
- immutable Pet genesis identity;
- Pet name and lineage;
- verified Hatchery XP and derived level;
- visual layers produced by the verified visual projection;
- Gear revision, exact loadout and bounded Gear stats;
- observation timestamp and source marker.

Arena must reject:

- unknown lineage;
- malformed XP or impossible level;
- noncanonical stat keys;
- out-of-range Gear stats;
- Gear bonuses before Level 10;
- visual layers that do not match the same loadout;
- client-authored ownership, level or Gear data.

Arena build allocation and Gear stats are separate:

- build allocation spends Arena build points;
- Gear stats do not consume those build points;
- final combat stats are base/build stats plus verified Gear stats;
- Gear never creates Hatchery XP, reward weight or research authority.

## 11. Current extraction gaps

The build agent should expect these gaps and should not hide them with mocks in production code.

### Pet domain gaps

`packages/pet-domain/src/engine.js` still references modules that remain in the existing AXO monolith, including configuration, state repositories, alpha/reward systems, settlement, referrals and chain registry logic.

Required approach:

1. identify pure Pet identity/XP functions;
2. move them behind explicit package interfaces;
3. add sanitized compatibility fixtures;
4. compare old and new outputs exactly;
5. leave unrelated AXO reward/research systems in their current owner package.

Do not copy the entire monolith just to satisfy imports.

### Pet API gaps

The copied services still depend on the existing:

- JSON state store;
- RPC wrapper;
- indexed provider/Blockscout integration;
- NFT publisher;
- art-release loader;
- server route/session middleware.

Create ports for those dependencies. Keep external calls and write preparation outside pure domain packages.

Start with read-only endpoints. Transaction preparation comes only after parity and fail-closed simulations.

### Arena integration gaps

The CI `test:arena` command intentionally runs the standalone 73-test subset. Several inherited tests still import old AXO-monolith paths or expect old root public files.

Do not delete those tests merely to make the full wildcard suite green. Convert them as each dependency is extracted, then move them into the standalone required set.

### Hatchery web gaps

The copied pages still assume shared AXO host behavior such as wallet/session bootstrap, navigation, API routes and static asset paths.

The correct next step is an explicit client/API adapter package, not hardcoded duplicated host logic.

### Artifact gaps

The full V5 generated art universe was intentionally not added to the foundation commit. Select and document one reviewed strategy:

- Git LFS for approved runtime assets;
- immutable GitHub release artifacts plus checked-in hashes;
- deterministic generation with independent pin/readback receipts.

Whichever strategy is selected must support clean-checkout verification and rollback.

## 12. Local setup

Required runtime:

```text
Node.js >=22.13 <23
npm 10.9.8
```

Install:

```bash
npm ci
```

Foundation verification:

```bash
npm run verify
npm test
```

Contract gates used by CI:

```bash
npm --prefix packages/pet-contracts run compile
npm --prefix packages/pet-contracts run lint:solidity
npm --prefix packages/pet-contracts run test:contracts
```

Arena standalone gate used by CI:

```bash
npm run test:arena
```

Combined local gate:

```bash
npm run check
```

Dependency audit:

```bash
npm audit --audit-level=high
```

### Important test distinction

`packages/pet-contracts` also has a full `npm test` command that includes offline release-readiness tests. Those tests expect the complete external art/handoff universe and are not part of foundation CI yet.

Do not weaken or delete the offline tests. They become mandatory once the reviewed art universe is imported or mounted in the new repository layout.

## 13. GitHub and CI setup

Repository CI has three jobs:

1. `repository` — dependency install, repository verification and foundation tests;
2. `contracts` — install, compile, Solidity lint and selected contract tests;
3. `arena` — install and standalone Arena regression tests.

Current workflow characteristics:

- Ubuntu 24.04 is pinned;
- `actions/checkout@v5` and `actions/setup-node@v5` are used;
- permissions are read-only by default;
- CI does not deploy or write production state.

GitHub configuration currently enables:

- private repository visibility;
- dependency vulnerability alerts;
- squash and rebase merges;
- merge commits disabled;
- source branch deletion after merge.

### Branch-protection limitation

GitHub rejected private-repository branch protection for the current account plan. Therefore `main` is not technically protected by GitHub rules.

Until the account plan or organization changes:

- contributors should still use pull requests;
- require all three CI jobs to pass before merging;
- avoid force-pushing `main`;
- keep changes small and package-scoped;
- treat CODEOWNERS as review guidance even though enforcement is unavailable.

Do not make the repository public merely to obtain free branch protection without explicit operator approval.

## 14. Security and privacy rules

Never commit:

- private keys, mnemonics, passwords or API tokens;
- `.env` files other than reviewed examples;
- live databases or player-state exports;
- wallet mappings or identity records;
- production transaction receipts containing private context;
- deployment authorization or production signer configuration;
- guessed contract addresses represented as canonical;
- private media-source paths from an agent workstation;
- raw production logs containing wallets, sessions or credentials.

`scripts/verify-repository.mjs` blocks several dangerous file names, paths and secret markers. This is a backstop, not permission to add other private material.

Use sanitized fixtures with synthetic IDs that cannot be confused with real users. A fixture must not silently become a second production ledger.

## 15. How to make common changes safely

### Change an XP threshold

1. Treat it as a domain migration.
2. Identify every source of the threshold.
3. Update canonical schema/domain code first.
4. Add old/new boundary tests.
5. Prove historical state is preserved rather than recomputed.
6. Update Arena level derivation and UI labels.
7. Produce an explicit migration/compatibility report.
8. Do not deploy without separate authorization.

### Add a Gear item

1. Add a reviewed catalog definition with exact ID, slot, rarity, metadata hash and stat array.
2. Confirm the stat array is six positions in canonical order.
3. Enforce per-stat and total-item caps.
4. Add aligned visual art and hash evidence.
5. Test ownership, slot match, equip, replace, unequip and transfer locks.
6. Test metadata aggregation and Arena import.
7. Define supply/distribution separately; a catalog entry does not authorize minting.

### Add or change a Gear slot

This is a cross-system protocol change. Update atomically:

- Solidity slot count and validation;
- catalog slot IDs/keys;
- metadata schema;
- visual z-order and option mapping;
- API response schema;
- Arena identity and renderer validation;
- Marketplace filtering/UI;
- repository invariant tests;
- migration and compatibility documentation.

Never append a UI-only slot that the contract cannot represent.

### Change Gear stats

1. Keep the six-stat order stable unless performing an explicit versioned migration.
2. Update contract and server bounds together.
3. Ensure Arena does not consume unverified client stats.
4. Keep Gear bonuses separate from build-point allocation.
5. Add deterministic before/after combat fixtures.
6. Confirm no Hatchery XP, rewards or trust fields change.

### Change metadata or visuals

1. Preserve immutable identity fields.
2. Keep V4.3 onchain metadata and V5 website presentation boundaries explicit.
3. Update hashes/manifests.
4. Run exact file/dimension/hash checks.
5. Inspect visual composites, including tool-to-paw grip and layer occlusion.
6. Never mark a visual release approved solely because generation completed.

### Change Arena combat

1. Keep combat deterministic from authoritative input.
2. Preserve receipt fields and replay verification.
3. Test all six lineages and both seats where relevant.
4. Keep presentation-only motion/VFX outside authoritative state.
5. Maintain reduced-motion behavior and bounded renderer work.
6. Confirm no new endpoint or client input silently becomes authoritative.

## 16. Recommended next build sequence

The safest useful sequence is:

### Step 1 — version shared schemas

Create schemas for:

- authenticated Pet identity;
- Pet NFT metadata state;
- Gear definition and loadout;
- verified Gear projection;
- Arena identity/build input;
- transaction-preparation response;
- compatibility and readback receipts.

Add schema versions from the start. Unknown fields should be handled intentionally rather than silently discarded.

### Step 2 — extract pure Pet domain logic

Move pure functions for:

- XP-to-level calculation;
- immutable identity/DNA;
- token ID and genesis hash derivation;
- Gear stat aggregation;
- metadata construction;
- loadout validation.

Keep file I/O, RPC, credentials and live-state access outside the domain package.

### Step 3 — repair workspace imports

Replace inherited monolith paths with workspace imports. Do this package by package, with compatibility tests after every boundary.

Do not create circular dependencies. The desired dependency direction is:

```text
shared-schemas / gear-catalog
            ^
            |
pet-domain / visual-engine
            ^
            |
pet-api / arena-engine
            ^
            |
hatchery-web / arena-web
```

Contracts and catalogs may be consumed by upper layers; browser applications must not become contract/domain authorities.

### Step 4 — create sanitized parity fixtures

Build fixtures for:

- levels 1, 9 and 10;
- minted and unminted Pets;
- no Gear and full eight-slot Gear;
- wrong owner;
- wrong slot;
- stale Gear revision;
- stat mismatch;
- unavailable RPC/indexer;
- missing visual file/hash mismatch.

Run the same fixtures against the old adapter and the extracted implementation. Differences must be explained and approved.

### Step 5 — standalone read-only Pet API

Implement read-only holder, metadata, visual and Gear projection endpoints first. Pin related onchain reads to one block tag.

Fail closed on unavailable or inconsistent evidence. Do not infer success from cached UI state.

### Step 6 — complete standalone UI builds

Only after stable schemas and read APIs:

- package Hatchery wallet/session bootstrap;
- package shared navigation and styling;
- wire Passport and Bazaar to extracted DTOs;
- serve V5 assets from a documented immutable strategy;
- run browser and accessibility tests in CI.

### Step 7 — transaction preparation

Prepare, simulate and return self-custody transactions for mint/update/equip/unequip/market actions. The server should not hold user keys or broadcast on their behalf.

This step still does not authorize a live contract deployment or Gear distribution.

## 17. Definition of done for extraction

The repository is ready to become the production code authority only when all of the following are true:

- every workspace has explicit inputs, outputs and dependency ownership;
- shared schemas are versioned and used across server and browser boundaries;
- all inherited monolith imports are removed or intentionally adapter-wrapped;
- old and new read-only outputs match across sanitized fixtures;
- full Arena tests run standalone;
- full contract offline-release tests pass with the reviewed art universe;
- all required visual assets are immutable and independently verified;
- clean checkout can install, build and test without workstation-specific paths;
- no live state or secrets are required for ordinary tests;
- production backup, rollback and shadow-read plans exist;
- an operator explicitly authorizes each deployment or migration step.

## 18. Production handover gates

Production handover is a separate project phase. At minimum require:

1. exact reviewed commit and clean CI;
2. immutable ABI, catalog and asset review;
3. production database/state backup with restoration proof;
4. read-only shadow traffic against the extracted API;
5. exact compatibility report for identity, XP, NFT, Gear and Arena outputs;
6. bounded canary with rollback;
7. no-loss checks for wallet bindings, XP, receipts, equipment and revisions;
8. exact deployed bytecode/config readback if contracts are involved;
9. explicit authorization for deployment, minting, Gear issuance or production routing;
10. post-change health, logs and user-path verification.

A source repository split must never silently become a state migration.

## 19. Agent completion checklist

Before reporting any task complete, the build agent should answer:

- What package owns this behavior?
- What is the authoritative input?
- What fails closed?
- Did any schema, ABI, XP rule, slot, stat or metadata field change?
- Were historical state and receipts preserved?
- Were exact focused tests run?
- Did repository verification pass?
- Did dependency audit remain acceptable?
- Did GitHub CI pass on the exact pushed commit?
- Was any external deployment, mint, Gear issue, value movement or production write requested and explicitly authorized?
- Is the working tree clean and does the remote branch match local HEAD?

If any answer is unknown, report the task as incomplete or blocked rather than filling the gap with an assumption.

## 20. Quick command reference

```bash
# Inspect state
git status --short
git log --oneline -5

# Install exactly
npm ci

# Repository safety and invariants
npm run verify
npm test

# Arena standalone regression set
npm run test:arena

# Contract gates
npm --prefix packages/pet-contracts run compile
npm --prefix packages/pet-contracts run lint:solidity
npm --prefix packages/pet-contracts run test:contracts

# Combined foundation gate
npm run check

# Dependency audit
npm audit --audit-level=high

# Review package boundaries
find apps packages -maxdepth 2 -name package.json -print
```

## 21. Final operating principle

Build the extracted system in layers, preserve the old authority until parity is proven, and make every identity, XP, Gear and game claim traceable to current evidence.

**Read the chain. Keep the receipts. Preserve the Pet.**
