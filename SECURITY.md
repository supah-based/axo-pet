# Security policy

Report security issues privately to the repository owner. Do not open a public issue for custody, signing, identity, wallet-binding, contract, or authorization defects.

## Repository boundary

This repository must never contain:

- wallet private keys, mnemonics, API tokens, passwords, or signing material;
- live Hatchery databases, player-state exports, receipts, identity records, or wallet mappings;
- production deployment configuration or authorization receipts;
- unreviewed contract addresses represented as canonical;
- inferred XP, ownership, mint, gear, or reward state.

All deployment, minting, gear issuance, custody, value movement, public release, and production-state migration remain explicit operator actions outside normal CI.
