# AXO Pet NFT contracts

Static, non-proxy Robinhood Chain contracts for the AXO Hatchery:

- `AxoSoulPet`: one signer-authorized, ERC-5192 soulbound ERC-721 per canonical Hatchery pet. Immutable visual DNA is stored alongside monotonic growth, selected public visual traits, an exact state hash, and an IPFS metadata URI. ERC-4906 metadata events let indexers refresh evolved artwork.
- `AxoPetGear`: capped, controller-defined ERC-1155 cosmetic items. Gear is transferable while unequipped. Equipping locks one exact balance into one of eight visual slots and signals the linked pet; gear never affects XP, rank, trust, research, rewards, or access.
- `AxoPetGearMarketplace`: fixed-price, non-escrow sales of unequipped gear for one immutable payment token. AXO moves buyer-to-seller and gear seller-to-buyer atomically. The marketplace starts paused, takes no platform fee, cannot trade pets, and supports listing cancellation while paused.

The contracts do not store or calculate Hatchery XP, trust, accuracy, submissions, moderation, rewards, referrals, calls, or social identity. `state/hatchery.sqlite` remains authoritative.

## Commands

```bash
npm install
npm run check
npm run config:check -- --config deployment-config.example.json
npm run deploy:plan -- --config deployment-config.example.json
```

Every checked-in deployment path is review-only and does not broadcast. Production deployment requires a separate exact config, complete art/IPFS receipts, current nonce/block evidence, reviewed mint consent and recovery behavior, full contract/app validation, and a deployment receipt.

## Mint/update trust model

The controller rotates a dedicated `stateSigner`. That signer creates EIP-712 authorizations binding the recipient, genesis hash, deterministic DNA, exact state hash, bounded trait IDs, metadata hash, gear revision, revision, and deadline. A mint must be submitted by its exact recipient wallet and an update by the current token owner; the signer attests state but cannot replace holder consent.

Pet updates require an exact next revision and can never reduce the level. Metadata URIs must use `ipfs://` and match the signed URI hash. The pet contract stores no secret and never accepts an unsigned application assertion.

## Gear trust model

The controller defines each item once with a slot, maximum supply, status, and metadata hash. The controller may update gear metadata or pause a compromised item, but cannot exceed its fixed maximum supply. Equipped balances cannot transfer until the owner unequips them. Gear metadata and catalog rarity are cosmetic classifications, not financial claims.

## Marketplace trust model

Listings are fixed-price AXO offers and never move gear into escrow. Creating a listing proves operator approval and sufficient unequipped balance. A listing becomes non-executable if its approval expires, its time window closes, or any inventory backing the remaining offer disappears. Purchase moves the exact ERC-20 payment directly to the seller before moving gear directly to the buyer; the whole transaction reverts if either leg fails.

The contract has no native-ETH path, bid/auction path, royalty path, platform fee, rescue custody, or server broadcaster. Deployment starts paused. A verified deployment and explicit unpause/trading activation are separate future gates.

## V4.3 application envelope and contract boundaries

The V4.3 application keeps the reviewed V1 contract ABI as a compatibility envelope while binding the complete V4.3 visual state into `stateHash` and immutable IPFS metadata. The legacy bounded trait integers remain contract fields; they do not permit scene selection or rerolls. The public collectible is always titled `AXO PET: <pet name>` and categorized `AXO PET`.

The art runtime contains 140 master traits (48 alpha-repaired pet bodies, 12 pixel-identical pet controls, and 80 unchanged V4.2 scene traits) plus 140 matching runtime previews. Visual revision `4.3.0` uses this effective order: environment, landmark, platform, pet, weather at 50% opacity, machine, tool, HUD. A pet's lineage and V4 DNA hash never change. Each level from 1 through 10 deterministically selects a new seven-layer surrounding scene, and updates catch up one level at a time so no earned evolution is skipped.

- no pet transfers, approvals, burns, recovery transfer, or wallet migration;
- no open/public unsigned mint;
- no onchain XP or trust;
- no pet sale, pet price, royalty, or revenue promise;
- marketplace source does not imply a deployment, live listing, floor, volume, or liquidity;
- no gear gameplay power;
- no proxy or implementation upgrade;
- controller ownership is two-step and cannot be renounced;
- IPFS content must have a completed primary upload, a separately listed secondary pin, and byte-exact retrieval from two independent HTTPS gateway hosts before a mint or update authorization is issued.
- The runtime must load the exact 280-file V4.3 release manifest, match its configured SHA-256, and verify each of the eight selected master-layer hashes against it.
- Local validation alone cannot unlock minting: the complete V4.3 layer archive must have an immutable IPFS URI plus separately confirmed redundant pins.
- Contract deployment, art-archive publication, mint activation, gear supply, and marketplace trading remain separate RA-authorized gates.

See `SECURITY_BOUNDARY.md`, `../../docs/AXO_PET_NFT_V4_RUNTIME_SYSTEM.md`, and `../../docs/AXO_PET_NFT_ART_PRODUCTION_GUIDE.md`.
