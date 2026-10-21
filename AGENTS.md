# AXO Pet working agreement

Read HANDOFF.md, README.md, CONTRIBUTING.md, SECURITY.md and docs/MIGRATION_PLAN.md before changing a system boundary.

## Development and verification

- Use Node 22.23.1 and npm 10.9.8, matching CI and the lockfiles.
- Use feature branches; preserve other agents' work. Fetch before starting and compare the exact base commit.
- `npm ci --ignore-scripts` installs workspace dependencies. `npm run dev` opens a loopback-only source preview on port 4320.
- The local Arena uses synthetic identities and memory-only state. Hatchery APIs and wallet signing remain unavailable in this preview. Missing public images/styles may be read from axo.pet; source scripts are local.
- Required baseline: `npm run check`. Preview changes also require `npm run test:dev`. Contracts additionally require compile and Solidity lint as in CI.
- Keep missing dependencies, unrun checks and unknown deployment state explicit. Local source parity does not prove production parity.

## Collaboration with AXO on OpenClaw

- Current Arena work: docs/handoffs/AXO-010.md and docs/ARENA_VERIFIED_PET.md. Use the same shared verified Pet ports, preserve existing Arena secret/store/timer ownership and frozen entries. Previews remain cosmetic; missing gear evidence cannot become an empty loadout.

- Passport work and host integration: docs/handoffs/AXO-009.md and docs/PET_PASSPORT.md. Preserve private Pet API authority; history is optional, record-backed and separate from catalog lore/current milestones. Passport only reads existing saved previews, and cannot grant equipment, awards or stats.

- Root HANDOFF.md is AXO's system guide. Current read-only Pet API integration: docs/handoffs/AXO-008.md; Wardrobe: docs/handoffs/AXO-007.md; clothing supplement: docs/handoffs/AXO-006.md; level-20 and set integration: docs/handoffs/AXO-005.md; prior anatomy/headwear: docs/handoffs/AXO-004.md; rejected V2 fit history: docs/handoffs/AXO-003.md; schemas and live host discovery: docs/handoffs/AXO-002.md; initial setup: docs/handoffs/AXO-001.md. Use docs/runbooks/agent-handoff.md and docs/handoffs/TEMPLATE.md for detailed exchanges.
- Wardrobe outfits are cosmetic drafts only. Preserve verified identity/exact XP and numeric V1 equipment as independent reads. No browser preview or readiness flag may grant ownership, stats, minting, V2 equipment or marketplace access.
- Do not create a second root handoff file differing only by case: Windows cannot preserve both files independently.
- Codex prepares source, tests and an exact commit. AXO verifies the existing host, integrates host adapters and performs authorized live operations.
- A handoff is not complete until AXO acknowledges its exact source commit and returns verification or a concrete blocker. Do not mark a handoff delivered without a confirmed transport response.
- Store only sanitized development notes in Git. Live state, credentials, wallet mappings, private receipts, authorization evidence and server backups stay with the operator.
- Production releases follow docs/runbooks/release-gates.md. A source handoff alone does not authorize deployments, migration, minting, gear issuance or transactions.
