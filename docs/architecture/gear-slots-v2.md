# Pants and Footwear: versioned integration proposal

The user requested independent Pants and Footwear equipment slots. The candidate Style Studio now supports both, with three designs per slot. They are usable for art preview only.

## Existing contract boundary

`AxoPetGear.sol` declares `SLOT_COUNT = 8`, validates one-based slots 1 through 8, and exposes `loadout()` as a fixed `uint256[8]` return. Shared verified projections and the immutable launch catalogs also describe eight slots. The repository does not establish the live deployment state.

Do not simply change the existing ABI or interpret new preview items as existing Gear IDs. Preserve current slot numbers 1–8 in their canonical order. A reviewed next version can append **9 = pants** and **10 = footwear**, after AXO verifies the actual host and chain configuration.

## Required implementation work before real equipment

1. AXO verifies whether a Gear contract is deployed, its exact bytecode/ABI, controller and existing ownership/equipment state. Keep all private evidence on the host.
2. Select a compatible contract strategy. Existing `loadout()` consumers expect eight entries; a versioned contract or explicit V2 accessor/projection must preserve that compatibility. Do not assume a proxy or migration capability.
3. Add versioned shared schemas, catalog mappings, signed projection checks and host adapters for ten slots. Unknown extra slots must continue to fail closed in V1 consumers.
4. Keep the six stats and the current per-item and aggregate caps. Ten cosmetic slots do not authorize raising Arena caps or changing XP/rewards. Extend tests for ten-item combinations, equipment locks, transfer rules and marketplace integration.
5. Freeze reviewed item definitions and separate standalone-art and wearable URIs, then complete the existing visual, onchain and operator release gates. Test old eight-slot Pets and new ten-slot projections against sanitized fixtures before a host rollout.

No contract, canonical schema, canonical slot number, inventory, player state or chain write is changed by the preview implementation. This proposal records the remaining real-equipment work for AXO; it is not deployment authorization.
