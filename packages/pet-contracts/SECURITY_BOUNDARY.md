# AXO Pet NFT security boundary

## Protected properties

1. A wallet can mint at most one AXO Pet and one canonical genesis hash can mint at most once.
2. The token ID is exactly the uint256 form of the signed genesis hash.
3. The pet is permanently soulbound: approvals are disabled and all standard transfer paths revert.
4. Only the current controller-selected state signer can authorize a mint or metadata/state update.
5. Signed mint content binds the recipient, DNA, trait IDs, IPFS URI hash, state hash, nonce, and expiry.
6. Signed updates require the exact next revision; growth never decreases.
7. Immutable DNA does not change after mint.
8. The controller can pause minting and updates, rotate the signer, rotate the gear notifier, and transfer control only through two-step ownership.
9. The controller cannot renounce either contract.
10. Gear maximum supply is fixed at definition and cannot be increased.
11. Equipped gear remains owned by the holder but its final available unit cannot transfer until unequipped.
12. Duplicate IDs in one ERC-1155 batch cannot bypass equipped-balance accounting.
13. Gear cannot grant XP, rank, trust, evidence weight, research authority, access, rewards, or a financial return.
14. The authoritative Hatchery ledger is preserved without reset or silent recomputation.
15. The marketplace can transfer only the immutable gear ERC-1155 and exact payment ERC-20 supplied at deployment.
16. Marketplace listings never escrow gear; purchases move exact payment directly to the seller and gear directly to the buyer atomically.
17. Listing creation and purchase use only unequipped balances, and stale approval or backing inventory makes an offer invalid.
18. The marketplace starts paused, supports seller cancellation while paused, charges no platform fee, accepts no native ETH, and cannot renounce controller ownership.
19. The V4.3 application fixes one lineage and the legacy V4 DNA hash per canonical genesis pet, then derives all seven surrounding scene layers deterministically from immutable DNA plus authoritative Hatchery level.
20. V4.3 scene updates are processed at most one level at a time, cannot reroll or manually select a scene, and bind the exact eight asset IDs into the signed state hash and retained receipt.
21. Visual revision `4.3.0` keeps weather directly above the pet at exactly 50% opacity, below machine, tool, and HUD; the opacity and order are server-owned catalog policy and cannot be changed by client input.

## Accepted trust

- The controller can rotate the state signer and metadata notifier contract.
- The state signer can authorize exact public visual states and IPFS metadata updates.
- The controller can define gear, mint up to each immutable cap, change its metadata URI, and deactivate it.
- The marketplace controller can pause and unpause new listings and purchases. Sellers retain cancellation access while it is paused.
- IPFS persistence depends on pinned content remaining retrievable from independent gateways.
- Onchain ownership permanently reveals the wallet-to-pet relationship despite wallet-hidden share cards.

## Explicitly out of scope for V1

- lost-wallet or social recovery;
- pet transfer or sale;
- pet burn/remint or account migration;
- auctions, bids, royalties, native-asset settlement, custodial order books, or liquidity guarantees;
- defining gear supply, initial allocation, primary-sale pricing, or distribution;
- value-bearing gameplay;
- relayed pet minting or metadata updates without the holder wallet;
- storing private identity, trust, research, calls, referrals, rewards, or moderation onchain;
- marketplace compatibility guarantees beyond the implemented token standards;
- changing historical blockchain ownership evidence during account deletion.

## Deployment blockers

Production deployment and live mint activation remain blocked until all of the following are true:

- final 4096px core launch art passes the layer QA gates;
- composite images and metadata are content-addressed and pinned redundantly;
- the exact 280-file V4.3 art manifest (140 masters and 140 runtime previews) and each selected master-layer hash are verified at runtime;
- the complete layer archive has an immutable IPFS URI and independently confirmed redundant pins; local file validation is insufficient;
- state-signer custody and rotation are reviewed;
- mint consent explicitly discloses public wallet ownership and irreversible chain history;
- account deletion and lost-wallet behavior are accepted;
- exact controller, signer, deployer, nonce, chain block/hash, predicted addresses, bytecode, runtime hashes, and gas ceilings are frozen;
- both contracts pass tests, lint, dependency audit, static security review, and deployment simulation;
- the Hatchery mint/update confirmation flow fails closed on any receipt mismatch;
- post-deployment bytecode, ownership, signer, gear linkage, URI, pause, and interface reads reconcile independently;
- live mint activation is separate from contract deployment and occurs only after a bounded test mint is verified.

Marketplace deployment and live trading additionally remain blocked until the exact marketplace runtime, immutable gear and AXO bindings, controller, deployment block, source verification, Blockscout index reads, wallet approval disclosures, bounded list/cancel/purchase tests, and an explicit trading activation are independently reconciled. Building this source and interface does not authorize a broadcast, gear definition, mint, initial distribution, primary-sale price, or unpause.
