# Covered tops — sleeve-aware clothing supplement

The operator requested sweaters, jackets and shirts that cover the chest and belly, alongside the existing vests. This supplement adds six independent body-slot families, each with item levels 10–20 under the existing progression policy:

| Family | Item | Cut |
| --- | --- | --- |
| `diamond-knit-sweater` | Diamond Knit Sweater | Ivory cable knit, sage ribbing and diamond stitches |
| `copium-club-hoodie` | Copium Club Hoodie | Charcoal pullover, lime lining, kangaroo pocket, hood down |
| `night-node-bomber` | Night Node Bomber | Navy satin bomber, closed zip and cyan piping |
| `whitehat-field-jacket` | Whitehat Field Jacket | Sage utility jacket, covered zip and flap pockets |
| `runebloom-overshirt` | Runebloom Overshirt | Plum button-up, teal embroidery and brass buttons |
| `wen-moon-tee` | Wen Moon Tee | Yellow short-sleeve cotton tee with original banana/moon motif |

The collection now contains **43 families and 473 draft item variants**. The six existing five-piece sets and their 66 tier manifests retain their exact membership and bonuses. These tops are separate families; replacing a required set vest with one of them breaks that set's five-piece bonus. They do not grant ownership, mint status or a new class of stat power.

## Rendering and authoring

Each top has an actual-pose wearable master and an independently generated, complete empty garment for its NFT portrait. The twelve original PNGs are retained in the operator's `gear-tops/art` bundle. Exact built-in image generation prompts are in `reviews/covered-tops-prompts.json`; no API credential is needed for the committed runtime assets.

`covered-tops-v1.source.json` records item-specific clothing-only polygons, neck exclusions, source/target vertices and the existing 57-anchor binding. The registration starts at uniform 0.85 scale, with bounded torso, hem and raised-sleeve corrections to match the canonical short body. Each garment's own cuffs and hem exclude generated wrist and pants pixels. Generated head, hands, legs and background are excluded. Existing Pet bases, painted lineage materials and rig fingerprints are unchanged.

Covered items declare `occlusion: SLEEVED_TOP_V1`, `coverage: closed-torso` and a garment type. The renderer restores the selected base's head along its jaw contour after the top and before face/head Gear, then restores **hands only**, followed by the existing upper-finger grip foreground. A horizontal head cut would restore bare shoulder over clothing; the jaw-shaped mask explicitly excludes shoulders. The tee's cutout leaves the original forearms visible; long sleeves cover them. Legacy vests retain their original full-arm behavior.

Matching head/hands exports exist for all six original and six painted base variants. Missing required foreground assets or an unknown foreground policy fails closed. Fit edits, Reset and exact-rig profile exports retain their existing behavior.

## Studio and Bazaar

Both surfaces offer Covered tops, Sweaters, Hoodies, Jackets, Shirts & tees, and Vests filters. Studio filters preserve equipped pieces and are included in the share URL. Three mix-and-match presets are added: Sweater Weather, Copium After Dark and Field Notes. These are visual presets, not additional bonus sets.

Full-screen NFT portraits continue to use the complete unworn item; fitted art is a separate masked surface. Existing XP/tier gates apply unchanged. No wallet, inventory, XP, contract, supply or production state is written by these controls.

## Rebuild and checks

```sh
node scripts/build-bazaar-collection.mjs --art <gear-progression/art> --tops-art <gear-tops/art>
# Rebuild only this supplement against an existing committed expanded catalog:
node scripts/build-bazaar-collection.mjs --art <gear-progression/art> --tops-art <gear-tops/art> --tops-only
npm run check
```

Runtime WebPs, all 66 new draft metadata documents, source patterns and hashes are committed. A clean source preview needs no image-generation service or original PNGs. Rebuilding from art masters requires both operator art bundles.

Tests verify solid chest/belly coverage, covered versus bare forearms, exact matching-base head/hand pixels, foreground order, transformed meshes, unavailable assets, clothing filters, hashes and preserved set membership. Existing level, contract and Arena checks remain required. Operator visual acceptance is separate from these technical checks.

## AXO integration

This is a supplement to the level-20 rules in AXO-005; it changes no ABI, XP threshold, stat formula, slot number or set membership. **Publish the expanded catalog, renderer, matching head/hands assets and wardrobe filter module together.** Copying only the new garment PNG/WebP files into the old vest compositor restores bare arms over sleeves and gives the wrong result.

Map the six new family/tier definitions through the same reviewed registry and authoritative ownership projection required by AXO-005. Metadata remains draft and unissued. Preserve production player state and use the existing release gates. Revert the catalog and renderer to their matching prior version together if rolling back. Current exchange: AXO-006.
