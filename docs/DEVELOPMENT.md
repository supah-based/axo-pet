# AXO Pet development workspace

## Source and environments

Source of truth: https://github.com/supah-based/axo-pet. Use feature branches and small reviewed pull requests.
Live product: https://axo.pet. Local source preview: http://127.0.0.1:4320.

The initial checkout was based on `617f5599e6411dc2fa0cf5f36646cc7d022e47a8` on 2026-10-18.
AXO's system handoff from commit `b7b860f` and the subsequent contract lock refresh at `f23a776` have been synchronized.
These identify repository revisions; they do not identify the code running on the live host.
AXO must report the host revision and any host-only patches before a deployment can be prepared.

| Boundary | Repository path | Local behavior | Next integration work |
| --- | --- | --- | --- |
| Home / My AXO / NFT / Bazaar | apps/hatchery-web/public | Editable HTML, CSS and scripts; disconnected wallet | Extract wallet/session and shared host shell |
| Hatchery game | apps/hatchery-web/public/hatchery-game.* | Editable game entrypoint; no real Pet state | Extract the full dashboard and explicit API adapter |
| Arena | apps/arena-web | Existing review server, synthetic Pets, memory-only rooms/builds | Remove remaining host assumptions; verify authenticated identity adapter |
| Pet API | apps/pet-api | Source only | Provide explicit state-store, RPC and evidence interfaces |
| Pet domain | packages/pet-domain | Source with inherited host dependencies | Freeze identity / XP contracts and sanitized parity fixtures |
| NFT / gear / market contracts | packages/pet-contracts | Local compilation and tests | Exact chain, addresses, signer custody and release readback |
| Catalog / visuals | packages/gear-catalog, packages/visual-engine | Canonical manifests; Arena runtime assets included | Reviewed asset bundle, hashes and deterministic compositing |
| Arena host adapter | packages/arena-engine | Extraction input with inherited imports | Integrate only verified Pet and gear projections |
| Cross-package schemas | packages/shared-schemas | Extraction boundary | Version and test exact compatibility contracts |

## Daily workflow

1. Read AGENTS.md and the current handoff. Fetch origin; inspect status before switching branches. Never discard another agent's work.
2. Agree on one boundary and acceptance criteria. Keep production observations separate from local test results.
3. Implement on a feature branch and compare with sanitized canonical fixtures.
4. Run `npm run check` and affected package checks. For preview work run `npm run test:dev`; for contracts also run compile and Solidity lint, matching CI.
5. Commit reviewed source, publish a PR and prepare a handoff using docs/handoffs/TEMPLATE.md.
6. AXO acknowledges the exact commit and supplies host compatibility, deployment/rollback and live-readback evidence through the agreed private channel.

Node and npm must match the repository pins. Root and contract lockfiles are committed; use `npm ci`, not a dependency upgrade, to establish a baseline.
The contract CI installs from packages/pet-contracts separately; its lockfile is independent of the root workspace lock.

## Preview limits

- Source preview is bound to `127.0.0.1`. It is a development tool, not a deployable public host.
- Existing Arena review routes are mounted with an in-memory service. No disk state is loaded or persisted by this entrypoint.
- `/hatchery` explains the missing dashboard instead of silently replacing it with another route. `/hatchery/game` is the extracted game page.
- Hatchery API calls return an explicit unavailable response. No ownership, XP, inventory, reward or mint status is invented.
- A local wallet stub stays disconnected. Host navigation, shell scripts and analytics are omitted; there is no production session or signer integration.
- Only missing public images/fonts and an explicit list of styles can be fetched from axo.pet. Browser credentials, local headers and query strings are not forwarded by the asset reader.
- Missing images/styles can affect fidelity when offline. Public asset fallback is for development, not a permanent extraction strategy.
- Edit source and refresh. A running preview does not establish full application parity or current live contract state.

## First implementation milestones

1. Version shared Pet identity and Gear schemas, defining exact XP/level consistency, eight slots, six stats, verified projections and unavailable/error states. Add synthetic valid/invalid fixtures without changing live behavior.
2. Extract pure Pet identity, XP/level, Gear and metadata functions behind explicit interfaces and parity tests; repair workspace imports package by package.
3. Build the standalone read-only Pet/Passport API from those schemas and ports, including block-consistent Gear reads and sanitized old/new response comparisons.
4. Package missing shell/navigation, wallet/session bootstrap and immutable public assets; wire the UI and authenticated Arena adapter to the read-only contracts.
5. Prepare self-custody transactions and address NFT/gear/onchain gaps against exact chain evidence, followed by a separately authorized release.

AXO can independently confirm live host revision, service ownership and deployment evidence through docs/handoffs/AXO-001.md while the first two source milestones proceed. Root HANDOFF.md contains the full recommended sequence and release criteria.
