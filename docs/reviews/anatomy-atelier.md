# Anatomy atelier V3 — candidate review

Status: REVIEW_REQUIRED. The operator rejected the previous V2 fits. Technical validation below is not visual acceptance and no live release has occurred.

The new reference wardrobe contains a panel-fitted vest, tapered joggers, independent boots and three freshly generated tools. It uses 57 anatomical anchors and 2:3 portraits, with canonical 1:1 pose placement. Head patterns map caps, crowns and hoods; finished headwear artwork remains future work. Historical designs stay in the unapproved archive.

Six complete lineage bases have painted eye colors and skin pigmentation. The material-registration build preserves one exact shared canonical alpha silhouette and original contour shading; all matching foreground projections derive from the baked base. Runtime draws a full base, with no eye/marking overlay. Original canonical bases remain immutable. Generated source paintings drifted in proportion, so their raw exports are not used directly for gear fitting.

The hand socket leans 18° toward the raised fingers. The tool mesh registers four handle corners in perspective, with matching-base fingers in front. Numeric X/Y, size and rotation are independent. Previously, crossing a portrait boundary rejected the render and left the old image visible. Canvas clipping now handles frame boundaries. Browser checks independently changed X and Y at 118% scale / 9° rotation and confirmed different rendered PNGs, then restored the default fit.

Exact implementation: `5d1a140263c7a05564352a7ca37d07ef6ec20306`; [all three CI jobs pass](https://github.com/supah-based/axo-pet/actions/runs/39169571162). Local `npm run check` passes 189 tests: 3 repository, 43 shared-schema, 32 visual/style, 35 contract, 73 Arena and 3 preview-server checks. The final test log is in the operator review workspace. Tests include all 32 valid slot combinations on six lineages, exact canonical visible pixels, shared candidate silhouette alpha, projective palm corners, transforms, profile round trips, original/baked foreground pixels, asset hashes/dimensions, source/browser parity and atomic loading.

Review outputs include 36 isolated item/lineage fits, six dressed portraits, six painted bases, three Pet/scene portraits, 18 complete Gear/scene portraits and three head pattern maps. Complete images and transparent worn exports are separate. Scenes never become wearable alpha.

Review at native resolution: neckline/armholes, waistband/cuffs, shoe edges, thumbnail/handle intersections, head/gill keep-outs, painted skin near contours and iris alignment. The fixed pose and silhouette do not imply support for arbitrary poses, animation or unregistered artwork. The operator must approve fit and appearance before extending the larger catalog.

Evidence: [lineage bases](anatomy-bases.png), [six outfits](anatomy-outfits.png), [single-fit matrix](anatomy-fit-audit.png), [head patterns](anatomy-head-patterns.png), [scene portraits](anatomy-scenes.png), [Gear portraits](anatomy-gear-portraits.png), [browser portrait](anatomy-browser.png), [position control check](anatomy-position-controls.png). Exact generation prompts: [anatomy-prompts.json](anatomy-prompts.json). Current exchange: [AXO-004](../handoffs/AXO-004.md).
