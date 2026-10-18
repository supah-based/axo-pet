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

```bash
npm install
npm run verify
npm test
npm run test:contracts
npm run test:arena
```

Build agents must read `HANDOFF.md` first. See `docs/MIGRATION_PLAN.md` before moving any additional code or runtime responsibility.
