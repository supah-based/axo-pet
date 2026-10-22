# Equipped combat poses

AXO-013 adds a bounded articulated 2D pose system for the existing adult artwork. Attack, block, hit and victory now move the head, torso, arm joints and stance; they are no longer limited to transforming one flat equipped portrait. Anticipation, recovery and defeat are included. This uses the original painted surfaces and a calibrated skinning mesh, not newly painted multi-angle frames or a 3D character.

## What is authoritative

Combat identity, exact XP, V1 level, numeric equipment, stats, legal moves, receipts and winner still come from the existing verified server projection and frozen entries. Poses consume accepted resolved moves/effects and the existing outcome blend. No pending opponent choice is inspected. The shared `animation-cues.mjs` retains the original presentation timings and is used by both the old effects and equipped rig; it contains no combat damage or XP rules.

The canonical path requires `AUTHENTICATED_PET_READ_V1`, level 10 and one of the six exact adult base hashes in `equipped-canonical.mjs`. All layers must pass the existing URL, SHA-256 and dimension checks before texture upload. Unsupported paintings/younger Pets keep their actual canonical still; unknown art never becomes a different adult. If required verified art is loading or fails verification, an explicit status replaces the fighter art while verified battle stats remain in use. GPU unavailability preserves the same checked equipped still, rather than substituting another outfit.

Style Lab uses the same pose math with the separately pinned candidate catalog and existing fit plan. Its proposed tiers 10–20 and sets remain cosmetic-only. The live renderer never imports candidate selections or their proposed stats. No Gear mint/equip/trading action, numeric-ID mapping, level rule, ABI, NFT metadata, database or replay format changes.

## Rig and hand registration

`equipped-rig.mjs` defines ten transforms: world, torso, head, two raised-arm joints and grip, two resting-arm joints, and the two stance/foot regions. Rest coordinates are 1024×1536, with the original 1024-square Pet at Y=256. Head, clothing, base and foreground surfaces use the same normalized mesh weights. Hats/gills retain the head transform; sleeve/cuff pixels follow the same arm field as the underlying anatomy. Pants and shoes share the leg field.

Handheld tools and the final finger/upper-thumb foreground bind to the **same rigid grip matrix**. The entire original palm/finger region is pinned to that matrix too. Weapon, palm and mask cannot drift through separate position/rotation/scale adjustments. The rigid matrix has unit determinant, so tool width and hand proportions are preserved. Rear/front order and sleeve/head/hand foreground policy still come from the original fitted plan. Canonical V1 depth order remains unchanged; the rig does not silently refit legacy item designs or replace their original images.

Authored angles are deliberately bounded. Larger trial bends folded visible sleeve/neck surfaces and were reduced before acceptance. Automated coverage checks combine all six original/material bases, head/hand/arm/gill foregrounds and candidate body/head/leg surfaces. Visible-alpha triangles (alpha >16/255) must keep positive area through authored pose transitions and receipt samples. Crossings in fully transparent gaps are not visible surfaces. This does not establish operator acceptance of every possible gear combination or support for new camera angles/hand shapes; those need additional source art and a reviewed rig/version.

## Rendering and lifecycle

`equipped-puppet.mjs` renders premultiplied-alpha textures through a WebGL mesh into a padded offscreen surface. Adjacent layers with the same binding merge without reordering. Current output is 672×928 (623,616 pixels), with 512×768 textures and at most 16 batches; the current mesh has 4,032 triangles. A renderer retains at most three actors and releases them on context/view changes and stop. A fully populated 16-batch texture budget is about 24 MiB per actor, excluding decoded source images, canvases and driver overhead. No real-device memory or FPS claim is made.

Unchanged/paused poses reuse the completed GPU surface. Hidden tabs retain the existing RAF suspension and historical-receipt fences. Context loss returns no partial actor; the checked static fit remains available, and restoration rebuilds the GPU resources. Disposal deletes buffers, textures and programs, removes listeners and releases the context.

OS/manual reduced motion suppresses moving clips and effects. Explicit static pose studies and still victory/defeat silhouettes remain inspectable. PNG export paints the current selection immediately before capture, keeps a 2:3 output and burns in Preview plus pose/tier labels.

## Inspecting results

- In Style Lab, use **Pose study**, **Pose blend** and **Compare attack / block / hit / victory**. The comparison shows the same candidate outfit under all four poses. It never changes stats or claims NFT ownership.
- In **Pet & equipped gear**, choose **Preview equipped combat poses**. This private read-only snapshot loads only its checked V1 art, shows four stamped stills, and releases the extra GPU context immediately. It accepts no candidate wardrobe selection. Closing or changing accounts aborts pending work and prevents late content from repopulating the dialog.
- Portable replay V1/V2 still contains frozen combat builds/gear stats, not a portable verified visual snapshot. Its existing lineage art path is preserved; this update does not invent historical equipment imagery for those exports.

## AXO integration

Publish the modified client/render/index/router, `verified-visuals.mjs`, `verified-panel.mjs`, Style Lab/CSS and these five new modules together:

1. `animation-cues.mjs`
2. `equipped-rig.mjs`
3. `equipped-puppet.mjs`
4. `equipped-canonical.mjs`
5. `equipped-inspector.mjs`

Keep the existing canonical and fitted media/catalog/model byte-identical. The router exposes only the new module filenames; no broad source mount, new port, database, wallet, graphics permission or weaker CSP is needed. Preserve AXO-010/011/012 host integration and operator-owned service/store/secret/timer.

Verify actual private identity/XP/gear parity; both mirrored fighters; accepted attack/block/hit and final victory; sleeve/cuff, headwear, fingers and tool order; multiple equipment sets; 390-pixel controls; OS/manual reduced motion; context loss/unavailable graphics; slow/failed images; close/session races and rollback. Do not change the current combat/stat/ownership or V2 locks to enable the animation.

Roll back the client modules/static router together to the accepted prior source, preserving all player and Arena records. Authorized production rollout still follows existing release gates. Return exact host/source hashes and sanitized readback, or a concrete blocker, through [AXO-013](handoffs/AXO-013.md).
