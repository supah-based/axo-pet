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

- Current Arena interface: docs/handoffs/AXO-016.md and docs/ARENA_DEGEN_DESIGN.md. Publish the new degen stylesheet last with its client/router/index and fixed vector decal helper. Keep decorative marks noninteractive and outside rig transforms; preserve fitted-only visuals, Preview labels, all authority/transaction locks, focus, contrast/reduced motion and result/countdown fences. Test narrow headers as well as page overflow.

- Current active Arena visuals: docs/handoffs/AXO-015.md and docs/ARENA_FITTED_PREVIEWS.md supersede AXO-012–014’s active V1 costume path. All active actors/pose inspection use the newer fitted-only cosmetic pipeline with registered masks, adult-base eligibility and explicit Preview/current replay reconstruction labels. Never restore old costume fallbacks or remap numeric V1 ownership/stats to style IDs. Preserve verified equipment/XP/combat and dispose bounded actors on view/account changes.

- Prior Arena design pass: docs/handoffs/AXO-014.md and docs/ARENA_ART_DIRECTION.md. Keep the final stylesheet/shared icon kit with the client/router, accurate participant results, nonintercepting result veil, terminal framing, explicit match-exit room/view/countdown fences and cosmetic-only wardrobe. The collapsed source menu is development-only. No AAA/live/device performance claim follows from synthetic screenshots.

- Current equipped animation work: docs/handoffs/AXO-013.md and docs/ARENA_EQUIPPED_POSES.md. Keep the reviewed adult/base hashes, shared timing, bounded mesh envelope, rigid grip/finger binding and V1/candidate separation. Missing checked art must not become unrelated costume imagery. Preserve combat/server authority and release the actor resources on view/account changes.

- Current Arena presentation work: docs/handoffs/AXO-012.md and docs/ARENA_COMMAND_CENTER.md. Keep the public fitted Style Lab cosmetic-only, pin catalog/runtime media, preserve V1 identity/XP/gear and existing combat/replay authority. Publish the exact shared anatomy model/catalog/media with the client/static-router changes; no new host state or V2 activation.

- Current Arena report work: docs/handoffs/AXO-011.md and docs/ARENA_BATTLE_REPORTS.md. Derive reports only from validated completed participant replays; preserve frozen entry XP/gear, replay access, account/view fences and cosmetic-only Previews. No new report store or live state mutation.

- Arena shared-reader work: docs/handoffs/AXO-010.md and docs/ARENA_VERIFIED_PET.md. Use the same shared verified Pet ports, preserve existing Arena secret/store/timer ownership and frozen entries. Previews remain cosmetic; missing gear evidence cannot become an empty loadout.

- Passport work and host integration: docs/handoffs/AXO-009.md and docs/PET_PASSPORT.md. Preserve private Pet API authority; history is optional, record-backed and separate from catalog lore/current milestones. Passport only reads existing saved previews, and cannot grant equipment, awards or stats.

- Root HANDOFF.md is AXO's system guide. Current read-only Pet API integration: docs/handoffs/AXO-008.md; Wardrobe: docs/handoffs/AXO-007.md; clothing supplement: docs/handoffs/AXO-006.md; level-20 and set integration: docs/handoffs/AXO-005.md; prior anatomy/headwear: docs/handoffs/AXO-004.md; rejected V2 fit history: docs/handoffs/AXO-003.md; schemas and live host discovery: docs/handoffs/AXO-002.md; initial setup: docs/handoffs/AXO-001.md. Use docs/runbooks/agent-handoff.md and docs/handoffs/TEMPLATE.md for detailed exchanges.
- Wardrobe outfits are cosmetic drafts only. Preserve verified identity/exact XP and numeric V1 equipment as independent reads. No browser preview or readiness flag may grant ownership, stats, minting, V2 equipment or marketplace access.
- Do not create a second root handoff file differing only by case: Windows cannot preserve both files independently.
- Codex prepares source, tests and an exact commit. AXO verifies the existing host, integrates host adapters and performs authorized live operations.
- A handoff is not complete until AXO acknowledges its exact source commit and returns verification or a concrete blocker. Do not mark a handoff delivered without a confirmed transport response.
- Store only sanitized development notes in Git. Live state, credentials, wallet mappings, private receipts, authorization evidence and server backups stay with the operator.
- Production releases follow docs/runbooks/release-gates.md. A source handoff alone does not authorize deployments, migration, minting, gear issuance or transactions.
