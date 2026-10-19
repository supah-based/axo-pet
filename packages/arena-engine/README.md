# Arena engine

Host adapter that converts verified Pet identity and gear state into Arena input.

Arena must never accept client-supplied ownership, XP, level, lineage, gear stats or reward authority. Unknown or mismatched gear projections fail closed.

`src/progression-v2.mjs` is an opt-in candidate calculation module: `buildPetV2`, `newBattleV2`, `valuesV2`, `resolveV2`. It derives level 20 and five-piece bonuses from individual items under the V2 policy. Existing Arena routes remain V1. The host must resolve trusted family/tier membership and stats from reviewed definitions and block-consistent owned/equipped balances before calling it. Synthetic callers and matching schemas are not authority. See `docs/GEAR_PROGRESSION_V2.md` and AXO-005.
