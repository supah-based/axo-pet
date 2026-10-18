# AXO Pet NFT release readiness (offline / non-broadcast)

This checklist is intentionally separate from the existing unsigned deployment plan. It does not deploy, pin, mint, enable marketplace activity, or grant approval. V5 website art is not a contract metadata revision: the deployed NFT/gear plan remains independently gated.

## Offline evidence

Run from `contracts/pet-nft`:

```sh
node scripts/offline-release-readiness.js
node scripts/visual-qa-inventory.js > /tmp/axo-pet-nft-v5-qa-inventory.json
node scripts/release-gates.js --qa-proof /path/to/qa-proof.json --operator-approval /path/to/operator-approval.json --pin-readbacks /path/to/pin-readbacks.json
npx hardhat test test/offline-release-readiness.test.js
```

The first command verifies the checked-in 73-job / 193-output generation ledger, each prompt/reference/source/output byte, and the current V5.1.1 runtime manifest assets. Its sorted SHA-256/size/path index digest is deterministic and printed for archive construction/reconciliation. It does not create an archive or claim that any archive is pinned. The existing receipt says these 73 jobs completed; this check independently reopens their local evidence.

The inventory command emits exactly 60 rows, each tied to the existing lineage contact sheet and its current hash, all explicitly `PENDING_HUMAN_REVIEW`. QA proof JSON must provide `{"proofs":[{"lineageKey":"emerald_sprout","level":1,"evidencePath":"...","sha256":"64 hex chars","visualDecision":"PASS","reviewer":"..."}, ...]}` with exactly one row for each of six lineages × levels 1–10. Human reviewer must inspect each level in its sheet, record PASS, and preserve the reviewer identity. Hashes alone never mark visual judgment complete.

Approval is a separate operator-supplied JSON receipt with `decision: "APPROVED"`, `scope: "AXO_PET_NFT_RELEASE"`, operator identity and timestamp; its authenticity still requires independent human review. Pin readbacks are separate: exactly two named distinct providers, same CID, and two locally saved downloaded files inside the project root, each hashed by the checker against `archiveSha256` through `localReadbackPath`. The gate tool only reads local files and never makes network calls or accepts credentials. It cannot independently prove which provider delivered those bytes or that the CID resolves to them, so even supplied matching evidence remains **requiring independent operator review**, never broadcast-ready. Missing or malformed records remain BLOCKED; there are no default/placeholder passes.

## Deployment rehearsal gates — all non-broadcast

1. Freeze the exact release inventory and archive index digest; preserve source manifest and per-file hashes.
2. Complete and review all 60 visual QA rows; reconcile any rejected/replaced asset to the generation ledger.
3. Obtain the separate operator approval and two-provider same-CID, byte-exact independent pin readbacks. Do not enter API keys in receipts or commands.
4. Review metadata schema/URIs and confirm no V5 website-only art change is silently treated as an onchain metadata migration.
5. Complete signer custody, holder-mint-consent, account-deletion/recovery, and gear-supply policy reviews.
6. Run focused and full contract/application tests, security review, and a transaction simulation against current exact chain/config evidence.
7. Run the existing `npm run deploy:plan -- --config <review-config>` only as an unsigned review artifact. Verify its output says `broadcastAuthorized: false`; do not run deployment scripts or activation calls.
8. Stop at review-ready. Actual deployment, mint activation, gear definition, marketplace deployment/unpause/trading, and public release each require their own explicit authorization and independent readback.

Current independent gates are not implied by this document or by the website's V5 visual activation. This rehearsal creates no approval, pin receipt, credential, deployment, or transaction.
