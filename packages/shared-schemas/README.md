# Shared schemas

Versioned Pet identity and Gear data contracts, with JSON Schema draft-07 definitions and strict runtime validation.

```js
import { validatePetIdentity, assertVerifiedGearProjection } from '@axo/pet-schemas';

const checked = validatePetIdentity(identity, { expectedOwnerAddress: verifiedSession.address });
if (!checked.valid) throw new Error('Pet identity unavailable');
assertVerifiedGearProjection(projection, { identity, visualCatalog: reviewedCatalog });
```

CommonJS uses `require('@axo/pet-schemas')`. Raw structural schema objects are exported as `schemas`, or through `@axo/pet-schemas/schemas`.
The runtime entrypoints target server/tooling consumers. A strict-CSP browser integration must use a separately precompiled validator build; these exports are not a drop-in browser script.

## V1 contracts

| Contract | Version marker | Main invariants |
| --- | --- | --- |
| Pet identity | AXO_PET_IDENTITY_V1 | Canonical genesis/seed/lineage; safe nonnegative XP; exact derived level; owner context; explicit minted/unminted NFT state |
| Gear definition | AXO_GEAR_DEFINITION_V1 | Exact slot; six known stats; 0–2 per stat, 1–4 total; positive bounded uint256 supply; IPFS metadata identity |
| Verified projection | AXO_VERIFIED_GEAR_PROJECTION_V1 | Pet/owner/chain/revision agreement; active definitions and owned balances; unique slots/IDs; exact summed stats; Level-10 equipment; canonical visual assets and z-order |
| Read failure | AXO_GEAR_READ_FAILURE_V1 | Explicit unavailable/inconsistent evidence; data is null; no cached inventory or stats accepted as verified |

Each object rejects unknown properties and unknown versions. Validation never coerces strings into numbers, inserts defaults, strips properties, mutates the payload or recomputes historical state.
NFT token IDs, balances and supplies are canonical decimal strings bounded to uint256; application Gear IDs and counters are safe integers. Addresses compare case-insensitively without rewriting the original input.

`validatePetIdentity`, `validateGearDefinition` and `validateVerifiedGearProjection` return `{ valid, errors }`; errors contain stable codes and field paths without copying user values. Their `assert...` forms throw `SchemaValidationError` and return the original reference on success.
`validateGearReadResult` additionally returns `usable`; a valid unavailable response always has `usable: false`.

## Authority and adapter boundary

Validation is not authentication, a chain read, a signature check or proof that an image exists. A trusted host adapter must establish the verified session, ownership, canonical Pet snapshot and consistent block-tagged contract reads before constructing these DTOs.
The projection validator requires a trusted identity and reviewed visual catalog. It compares asset paths/hashes against that catalog; the visual engine must still verify the actual bytes, dimensions and alpha before compositing.
Neither a matching asset hash nor a valid projection certifies perspective, mask quality or physical Gear fit. The current Level-10 wardrobe failed operator visual review; see docs/reviews/level10-gear-fit.md. Data usability is not art-release approval.
The V1 visual mapping retains the existing ID-to-option convention and canonical z-order. Slot authority always comes from the Gear definition, never from a filename.

These are new adapter contracts, not an automatic reinterpretation of legacy live payloads. Existing host/Arena payloads need explicit, reviewed mappers and old/new fixture comparisons before adoption. This change does not replace the production Pet ledger or introduce a quest database.
Metadata DTOs, transaction preparation and live quest payloads remain subsequent adapter work. V4.3 metadata and V5.1.1 website visuals keep their distinct revisions.

## Fixtures and checks

`fixtures/synthetic-v1.json` contains explicitly invented owners, contracts, block evidence and state. It includes levels 1/9/10, minted/unminted identity, empty/eight-slot loadouts, invalid mutations and unavailable evidence. Its visual hashes reference the checked-in public catalog; it contains no live player data or private records.

```sh
npm run test:schemas
```

Tests compare all XP boundaries, eight slots and six stats with the existing Arena/domain/catalog rules; validate all 56 launch definitions; check all six lineage base/HUD projections; and reject ownership, revision, equipment, asset, order and evidence mismatches. The schemas are compiled once using [Ajv's strict, non-coercing options](https://ajv.js.org/options.html).
