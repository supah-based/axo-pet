# Pet growth and item sets V2 — candidate ruleset

The operator requested Pet growth beyond 10, progressively harder XP steps through 20, item minimum equip levels, higher-tier stats, and visually coordinated five-piece sets for different Arena play styles. Gear has no separate XP track. These are source implementations and draft collection definitions, not issued NFTs or an activated market.

## Pet XP and item tiers

The existing total XP ledger remains authoritative. Levels 1–10 retain their exact thresholds. The pure V2 read model derives levels up to 20 from that same total; it never resets XP or invents historical awards. Existing XP above 1,200 is retained. If the host previously truncated XP, AXO must identify that fact and propose a reviewed migration rather than backfill invented XP.

| Pet / item level | Total Pet XP | XP from previous level | Item stat budget | Max one item stat | Set bonus rank |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 1,200 | 260 | 2 | 1 | 1 |
| 11 | 1,600 | 400 | 3 | 2 | 1 |
| 12 | 2,150 | 550 | 4 | 2 | 2 |
| 13 | 2,900 | 750 | 5 | 3 | 2 |
| 14 | 3,900 | 1,000 | 6 | 3 | 3 |
| 15 | 5,200 | 1,300 | 7 | 4 | 3 |
| 16 | 6,850 | 1,650 | 8 | 4 | 4 |
| 17 | 8,900 | 2,050 | 9 | 5 | 4 |
| 18 | 11,400 | 2,500 | 10 | 5 | 5 |
| 19 | 14,400 | 3,000 | 11 | 6 | 5 |
| 20 | 17,950 | 3,550 | 12 | 6 | 6 |

Each family has eleven fixed variants: `family-l10` through `family-l20`. The item's level equals its minimum Pet equip level. Its two role-appropriate stats split the budget, with the odd point going to the primary stat. Every next item level adds one stat point. These string keys are design identities, not onchain numeric IDs. A higher-tier NFT is a distinct definition; acquiring it does not mutate an old NFT. Crafting, burning and automatic upgrades are not implemented.

The ten-slot base loadout permits one item per slot, a total budget of ten times the Pet-level item budget, and at most eight times the Pet-level per-item cap in any one stat. Set bonuses are separately calculated, bounded additions. At LVL 20 these base limits are 120 total and 48 per stat, before the set bonus. All catalog combinations fit these limits. V1 limits and eight-slot numbering are preserved; V2 appends pants as 9 and footwear as 10.

The adult portrait and fitting pose remain visual stage 10 for all Pet levels 10–20. No character reshaping occurs as combat levels increase.

## Six five-piece sets

All sets are available to every lineage. Roles describe a build style, not a class restriction. Each set has five distinct slots; each member family belongs to one set. Every set includes a different headpiece, so only one complete set can be active in a ten-slot loadout. Other equipped items still add their normal stats. Accessory sets allow the player to choose separate clothing.

| Set | Required five families | Stat | Combat focus |
| --- | --- | --- | --- |
| Degen Brawler | Liquidation Crown; Diamond Hands Harness; Diamond Cargo Shorts; Wen Moon Slippers; Banana Market Maker | STR | Attack +rank; damage +rank% |
| Night Node Guardian | Validator Halo; Packet Sniffer; 404 Sleep Vest; Night Node Joggers; Gas Boost High Tops | CON | Defense +2×rank |
| Signal Skirmisher | Signal Runner Headband; Degen Shell Vest; Node Tailored Joggers; Cyan Grip Boots; Validator Spark | DEX | Attack +2×rank; shield break +rank% |
| Hexforge Arcanist | Aetherpunk Circlet; Hexforge Vest; Runesmith Trousers; Hexstep Boots; Exit Liquidity Trident | INT | Damage +2×rank%; shield break +rank% |
| Moon Crew Support | Liquidity Crown; Wen Moon Goggles; Rug Pull Roll; Diamond Paws; Panic Duck | WIS | Defense +rank; healing +2×rank% |
| Whitehat Controller | Degen Node Cap; Copium Respirator; Cold Wallet Jetpack; Gas Fee Guzzler; Touch Grass Vial | CHA | Attack +rank; defense +rank; shield break +2×rank% |

All five matching pieces must actually be equipped. Inventory ownership alone is insufficient. Four pieces grant no bonus. The set tier is the **minimum item level** among its five pieces; rank is `1 + floor((tier - 10) / 2)`. Every active set adds `rank + 1` to its named stat. Item stats rise every level; set bonuses step up every two levels. The generated catalog includes all 66 exact set-tier manifests with required item keys, combined stats and combat modifiers.

Attack is a flat addition to a damaging move before its damage multiplier. Damage percent multiplies the resulting attack value. Defense adds shield points only to moves that already generate a shield; it is not passive damage reduction. Healing and shield break scale existing heal and purge values. Bonuses do not create those effects on moves that lack them. Rounding follows the existing Arena calculation. XP, care, trust, research and rewards receive no set effect.

For example a complete LVL 10 Hexforge set adds INT +2, damage +2% and shield break +1%; a complete LVL 20 set adds INT +7, damage +12% and shield break +6%. Four LVL 20 pieces plus one LVL 10 piece use the LVL 10 bonus. Removing that fifth piece removes all set additions. These are candidate balance values requiring playtesting before release; six roles do not imply equal win rates.

## Implemented source boundaries

- `shared-schemas/src/progression-v2.mjs`: pure XP, item and base loadout policy. `gear-sets-v2.mjs`: immutable family membership, exact five-piece activation and bonuses. Dedicated package subpaths expose both.
- `shared-schemas/src/index-v2.*`: strict additive V2 identity and Gear definition validators; V1 exports and validators are unchanged. JSON validation does not establish ownership or ledger authority.
- `pet-domain/src/progression-v2.cjs`: non-mutating `SHADOW_ONLY` comparison from a valid host V1 identity. It reports candidate growth and migration requirements; it never writes player state or claims a V1 chain level changed.
- `AxoSoulPetV2`: candidate maximum 20, EIP-712 domain version 2, monotonic signed growth. It still trusts the authorized host signer for the XP-derived level.
- `AxoPetGearV2`: immutable minimum equip level and stats per definition, ten slots, level-gated equip, capped loadouts and existing ERC-1155 balance locks. Level and stats are fixed; metadata edits cannot change them.
- `arena-engine/src/progression-v2.mjs`: opt-in build/battle/resolve functions applying the actual stat and combat bonuses. Ordinary Arena service routes remain V1 until explicit host adoption. Client-supplied aggregate Gear stats are rejected by the V2 builder.
- `/gear-studio`: 43 families, XP/tier controls, individual mixed-tier try-on, apply-tier action, six set presets, completion counts and missing pieces. Fit profiles remain geometry only. The six covered tops and clothing filters are documented in COVERED_TOPS_V1.md and AXO-006; they preserve this progression and exact set membership.
- `/marketplace`: six set cards, tier/slot/style/set/search filters, locked try-on gates and full portrait artwork. The existing verified market/API flow is separate and retains unavailable states. No listings or prices are fabricated.

## Art authoring and reproducibility

The nine-design V3 foundation remains immutable as a regression reference. `bazaar-expansion-v1.source.json` adds 28 families. Fifteen new masters use the reference-Pet camera for garments, headwear and facewear, or the upright tool template. Only traced accessory surfaces survive extraction. Optical windows use real alpha holes, preserving painted lineage eyes. Back equipment and habitats draw behind the Pet; matching-base gills, arm and upper fingers restore foreground occlusion. All full Gear art is separate from worn art.

```sh
node scripts/build-bazaar-collection.mjs --art <gear-progression/art> --tops-art <gear-tops/art>
npm run check
npm --prefix packages/pet-contracts run compile
npm --prefix packages/pet-contracts run lint:solidity
```

Exact built-in image generation prompts are in `reviews/gear-progression-prompts.json` and `reviews/covered-tops-prompts.json`. Runtime WebPs, UV patterns, hashes and 473 draft metadata files are committed. Original authoring PNGs remain in the operator's `gear-progression/art` and `gear-tops/art` bundles; rebuilding from master images requires those inputs. Rendering the committed collection does not. `sync-bazaar-examples.mjs` keeps static examples and their try-on URLs aligned with the same catalog. AXO-005 records the original 37-family / 407-variant milestone; AXO-006 supplements it with six covered top families and 66 variants.

## Host, chain and release requirements

AXO must pin the reviewed source/catalog, resolve numeric contract IDs to exact family/tier definitions, and compare immutable definition stats/minimums and block-consistent owned/equipped balances. That allowlist establishes family membership; neither browser family strings nor arbitrary token metadata may grant a set bonus. Apply set policy only after verified-session, Pet ownership, authoritative XP and chain/loadout checks. There is no V2 verified host projection endpoint in this source workspace yet.

Existing V1 contracts are not upgradeable here. V2 public Gear definition tuples and ten-entry loadouts differ; existing host decoders, metadata builders, signers and transaction planners must be versioned explicitly. Current deployment planners still target V1. Do not point them at V2 contracts or overwrite V1 addresses. The market's minimal ERC-1155 interface works with candidate V2 Gear in tests; its live bindings and activation still require separate authorization. Buying high-tier Gear is allowed below the equip level; wearing it remains locked.

Before any release: AXO returns the host source revision and differences; operator reviews art and progression/balance; authoritative XP snapshots are compared without ledger writes; V2 ABI, signer-domain, ownership and visual adapters are prepared; fresh immutable metadata/supply/ID mappings and chain migration are reviewed; existing backup, rollback and release gates pass. Reverting source alone cannot reverse new contracts or issued NFTs. No deployment, issuance, market activation or player migration is authorized by this source handoff.
