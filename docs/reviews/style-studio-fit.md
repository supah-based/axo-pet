# Candidate Gear collection fit review

Status: **REVIEW_REQUIRED**. Suitable for design review; not a canonical art release or equip approval.

The original 56-item V5.1.1 fit review remains FAILED. This collection is a separate set of 30 concepts, with no canonical ID, metadata or state replacement. The first 24-item candidate also failed the user's body-orientation review; the corrected mirrored body projections below supersede those earlier candidate exports.

## Changes verified in the preview

- Standalone collectibles fill their own image frame. Their wearable exports use separate registered canvases.
- All six original references retain their exact canonical bytes and hashes. Closed footwear selects an additional derived projection with base toes suppressed; barefoot looks select the original.
- Backpacks and ground plates sit behind the Pet. The body mask protects the chin/neck, raised arm and bent arm. Tool masks preserve the visible fingers over the grip.
- The moon goggles use a wider mirrored projection and a front-frame mask. The visor excludes rear temples from the forehead. The crown and halo were moved above the forehead.
- Grips were shifted toward the raised hand after the first rendered review. The harness neckline contour was revised to preserve its front webbing.
- All three body wearables are now mirrored and reduced from approximately 320×280 to 291×255 at (377,470). Neckline cutouts follow the garment transform; a central anatomical neck mask removes lining from the throat.
- Pants and Footwear are independent candidate slots, with three designs each. Trouser cuffs spread toward the feet rather than using a rigid rectangular stretch. Shoes use independent left/right placements, ankle apertures and base-toe suppression. Body garments cover the waistband; trouser cuffs render over boots.
- The Bazaar hero, three outfit examples and six lineage cards now consume the same candidate render plan and complete 1024-square canvases. No full-body example is placed in the former cropped widescreen image container.

## Evidence

The tooling generated 180 item/lineage composites and 18 full outfits. The complete preset matrix and the critical body, goggles, visor, grip, trouser and footwear fits were visually inspected. The body comparison includes the previous orientation, mirroring alone, and the smaller mirrored projection on Solar. Contact sheets and full-resolution composites are retained in the user's `gear-style-studio` deliverables. The browser showed the Studio, full-screen item/outfit views, preset selection, lineage switching and combined filters. The Bazaar-to-item route opened the full-screen artwork viewer.

## Remaining approval work

AXO/operator should inspect every design at native resolution before an art release, especially neckline/arm seams, eyewear curvature and grip intersections. The contour masks are authored for this fixed level-10 pose, not derived from semantic meshes. Mixed tool, head and back silhouettes can overlap in combinations beyond the three presets; every possible outfit has not been visually approved. Transparent lenses retain stylized reflections and can obscure part of an eye by design.

No live wallet wardrobe, token metadata, NFT issuance, marketplace activation or production deployment was tested or changed by this candidate UI work. The current canonical eight slots remain unchanged; Pants/Footwear need the reviewed versioned integration in [gear-slots-v2.md](../architecture/gear-slots-v2.md).
