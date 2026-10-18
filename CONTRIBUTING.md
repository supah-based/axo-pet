# Contributing

Use small pull requests with one system boundary per change.

1. Preserve wallet-pet bindings, XP, identity receipts, gear ownership, Arena receipts, and historical state.
2. Treat unknown ownership, level, slot, catalog, stat, mint, deployment, or chain state as a hard failure.
3. Add tests before changing shared schemas, contract ABIs, XP thresholds, NFT metadata, gear slots, or Arena stat behavior.
4. Never commit runtime state, secrets, deployment authorization, or generated private evidence.
5. Do not deploy, mint, issue gear, move value, or modify production data from repository CI.
6. Record package-boundary changes in `docs/architecture/decisions.md`.

Required checks are repository verification, contract tests, Arena standalone tests, and package-specific tests for every changed workspace.
