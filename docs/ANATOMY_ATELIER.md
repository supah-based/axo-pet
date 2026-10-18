# AXO anatomy atelier V3

The previous V1/V2 Gear fits were rejected by the operator. `/gear-studio` now opens a new, fixed-pose fitting foundation. The earlier 30 designs remain at `/gear-concepts` for design reference; their fits are not accepted. Bazaar examples use the new renderer and assets.

This milestone contains one five-piece reference outfit: Degen Node Cap, Degen Shell Vest, Node Tailored Joggers, Cyan Grip Boots and a handheld tool. Three newly authored tool choices are available: Banana Market Maker, Gas Fee Guzzler and Validator Spark. It is a small reference wardrobe to review before adapting the larger design archive.

## Pose and geometry

Portraits, complete item art, transparent wearables and scenes are 1024×1536 (2:3). Thumbnails are 240×360. The unchanged 1024-square canonical level-10 Pet sits at (0,256), at 1:1 scale. Six original bases are checked against V5.1.1 hashes and visible RGBA pixels. The generated dressed mannequin supplies cloth texture only: its generated Pet anatomy is never composited.

`anatomy-rig-v3.json` defines 57 anatomical anchors. Each garment consists of traced source UV polygons registered onto actual Pet surfaces, triangulated without folds. Vest fronts and clasp, splayed trouser legs and individual shoes have separate surfaces. Invisible rear fabric is excluded from the worn projection. The selected base’s bent arm draws over clothing. Closed footwear uses a separate, reversible toe-suppressed base projection.

Tools have new, broad grips and compact heads. Their grip plane leans 18° toward the raised fingers. Its measured four-corner source grip maps to the raised palm through a projective transform, sampled by an 8×12 UV grid. This controls handle width, height and perspective together. Four matching-base finger/thumbnail regions draw above the handle. Only the upper thumb belongs to that foreground; its rounded ball stays behind the handle. All three upright tools start at the operator’s saved X −14, Y 2, scale 120% and rotation 11°, replacing the earlier banana-only values. These absolute defaults are shared by the workbench, Reset, profile export and baked Bazaar portraits; edits replace them rather than stacking another transform. The standalone tool portrait retains the complete object; it never inherits finger masks. A new pose or differently rendered hand requires a new socket and occlusion contours.

Cap, crown and hood fitting guides use skull, brow, temples, chin, neck and six gill-root anchors. Hood rear and face rim are separate patterns. The renderer supports rear-headwear / Pet / front-headwear / original-gill planes. The new Degen Node Cap is the first test item: separate fitted crown and brim surfaces, with the original gill projection in front. Its complete NFT artwork retains the full lining and brim. Crown and hood artwork remain to be authored.

## Lineage appearance and scenes

`lineage-bases-v3.source.json` defines six complete painted base variants: sage Emerald, icy Sapphire, lavender Amethyst, apricot Solar, pink Rose and teal Midnight. Their eye colors and organic skin pigmentation are part of each full base image. Generated paintings are UV-registered to fixed anatomical landmarks, with the exact shared Emerald silhouette and contour shading, then baked once. Runtime selects one full base; it does not draw a marking or iris overlay. Matching arm, finger, gill and closed-footwear projections come from that same baked base. **Original base** provides comparison with the untouched canonical lineage references. These candidate bases do not change canonical lineage metadata or NFT traits.

Three separately generated opaque contexts are available: Degen Den, Tech Hatchery and Arcane Workshop. Their floor registration aligns with the fixed Pet pose. Scenes draw behind the Pet or the complete Gear portrait, and are excluded from transparent wearables. **Transparent** remains available for inspection. Full-screen artwork and PNG export use the same scene choice.

## Fitting workflow

1. Choose lineage, scene and pieces. Use **Show base** and **Original base** to compare with the reference.
2. Show a landmark group. Select a point, drag it, use arrow keys or enter X/Y. Coordinates refer to the original 1024-square anatomy, before the portrait offset.
3. Adjust each item's position, scale and rotation independently. Changes stay in memory until **Export fit**. Scene and selection bookmarks do not persist geometry edits.
4. Export a fit profile with the exact pose and rig fingerprint. Import rejects other rigs, unknown fields, non-finite/out-of-envelope anchors and item transforms. A render rejects folded meshes or non-finite coordinates; frame edges clip naturally during fitting. No missing image may leave a partially drawn new portrait.
5. Inspect single items on all six lineages, all scene/item portraits and cap/crown/hood maps. Technical checks do not constitute operator visual acceptance.

`anatomy-fit.mjs` is the source renderer; the generated public `gear-anatomy/model.mjs` must be byte-identical. Source definitions live in `packages/gear-catalog/collections/anatomy-*.json`. The public catalog records candidate status, asset hashes, dimensions and registration. It has no ownership, equipment, stat or chain authority.

## Build and verification

Use Node 22.23.1 / npm 10.9.8 and the locked Sharp dependency. Original generated PNGs are in the operator's `gear-fit-foundation` review bundle, alongside the exact prompts. They are art authoring inputs, not production state. Runtime WebP material/cloth atlases and every baked base/fitted output are committed. Grid cells containing only negligible generated alpha noise are excluded from handheld meshes. Review composition can run from the checkout alone; full texture rebuilding requires those PNG inputs.

```sh
node scripts/build-anatomy-studio.mjs --master <degen-master.png> --scenes <scene-art-directory> --tools <tool-art-directory> --bases <lineage-base-PNG-directory> --head <degen-node-cap.png>
node scripts/review-anatomy-studio.mjs --out <review-directory>
npm run test:style
npm run check
```

Required reviews include 42 isolated item/lineage fits, six outfits, three Pet/scene portraits, 21 Gear/scene portraits and three head pattern maps. Tests cover all 64 valid slot combinations on six lineages, immutable canonical pixels, projective grip corners, depth ordering, shared base silhouettes, baked-base selection, X/Y/rotation, source/browser parity and atomic image loading.

## AXO integration boundary

This is source-preview work. Existing Hatchery APIs and database remain authoritative; no quest ledger or parallel production service is created. Canonical Gear still has eight slots. Pants and Footwear need the versioned protocol work in `architecture/gear-slots-v2.md` before real equipment support. The current exchange is `handoffs/AXO-004.md`. AXO must acknowledge the exact pushed source SHA, review host differences and return visual/integration findings before any separately authorized live release. No deploy, metadata change, mint, Gear issuance or transaction is performed here.
