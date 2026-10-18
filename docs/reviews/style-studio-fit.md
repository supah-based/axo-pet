# Candidate Gear collection fit review

Status: **REVIEW_REQUIRED**. Pose/depth rig V2 supersedes the flat fit in `0626cdb`, which the user rejected for visible rear lining, waistband interiors and tool orientation. The original 56-item V5.1.1 fit review also remains FAILED. No previous technical check is artistic approval.

## V2 changes

- All three vests and all three pants now have separately hashed rear and front surfaces. Rear neckline/armhole panels and waistbands render behind the Pet. Front straps, fabric and belts remain above it. Contours follow the fitted reference when its anchor or scale changes.
- Waist placement is raised to cover the original base clothing edge. Runesmith cuff interiors are also partitioned for depth.
- All three tools are mirrored, sized in their original proportions and registered by the handle to one grip landmark. The gas gun's earlier distorted vertical projection is removed.
- Original lineage-specific fingers render above tools; the bent arm renders above garments. Foreground projections are lossless extractions from the unmodified canonical Pet pixels.
- The fitting-room inspector shows rear, front and worn views for the nine affected designs. Optional attachment guides affect inspection canvases only, not outfit exports or selections.
- Bazaar examples regenerate through the same V2 plan. Complete standalone item art remains separate from the worn surfaces.

## Evidence

The review tools regenerate 180 item/lineage composites and 18 complete preset outfits. The three tools, three vests and three trousers were inspected individually, with six-lineage slot sheets and the preset matrix. A before/after comparison on Rose isolates the harness, trousers and gas gun. The browser preserves the user's ten-piece Rose bookmark and displays the layered outfit full screen. The inspector displays original fingers, the mirrored tool and its marked handle anchor.

See [before/after](style-studio-depth-before-after.png), [fitting room](style-studio-depth-inspector.png), [outfits](style-studio-outfits.png) and [all-item audit](style-studio-fit-audit.png). The earlier body-orientation comparison is historical and superseded.

## Limits and release work

This is an authored 2D rig for the fixed adult website pose. It cannot automatically fit arbitrary art or support animation/new poses. Each garment needs an attachment origin, approved size and authored rear contours; each new pose needs anatomical masks and anchors. This scope does not add a 3D mesh, automatic cloth draping or an animation skeleton.

Native-resolution visual approval remains pending, especially seams, eyewear curvature, finger boundaries and mixed silhouettes beyond the presets. Every possible outfit has not been visually certified. Transparent lenses retain stylized reflections.

No live wardrobe, token metadata, NFT issuance, marketplace activation or production deployment was changed. Canonical slots remain eight; Pants/Footwear need the separately reviewed integration in [gear-slots-v2.md](../architecture/gear-slots-v2.md).
