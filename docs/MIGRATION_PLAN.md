# AXO Pet extraction plan

## Objective

Extract `axo.pet` into an independently reviewable repository without changing live behavior or historical state.

## Phase 0 — repository foundation

- Private repository, documented CODEOWNERS/PR policy and green CI. Enforced private-branch protection remains unavailable on the current GitHub plan.
- Package boundaries, CODEOWNERS, CI and secret/state exclusions.
- Tested contracts and Arena source imported without deployment.
- Canonical catalog manifests imported without the full generated image universe.

## Phase 1 — shared contracts and schemas

- Freeze current contract ABIs and metadata schemas.
- Publish exact slot and six-stat definitions from one package.
- Replace duplicated constants in Hatchery, metadata, Gear and Arena.
- Add compatibility fixtures generated from sanitized, non-wallet production shapes.

## Phase 2 — standalone Arena

- Remove inherited paths into the AXO monolith.
- Package browser/runtime dependencies normally.
- Consume only a signed, verified Pet identity payload.
- Keep battle state isolated from Hatchery XP and rewards.

## Phase 3 — Hatchery and Pet API adapters

- Extract read-only Passport, visual and gear endpoints first.
- Keep the existing AXO state repository authoritative.
- Compare old and new responses over sanitized fixtures.
- Introduce write preparation only after parity and rollback tests.

## Phase 4 — visual artifacts

- Keep catalogs and asset hashes in Git.
- Store the generated image universe through reviewed release artifacts or Git LFS.
- Require deterministic regeneration, dimension/hash checks and visual QA approval.

## Phase 5 — production handover

Requires separate explicit authorization:

1. immutable release review;
2. backup and rollback proof;
3. read-only shadow traffic;
4. exact compatibility report;
5. bounded canary;
6. no-loss verification for wallet bindings, XP, receipts and equipment;
7. production ownership switch.

Deployment, minting and starter-gear issuance are not part of repository extraction.
