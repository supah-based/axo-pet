# Arena degen interface

AXO-016 replaces the dashboard-like green presentation with AXO's street-poster direction: charcoal ink, acid lime, violet, condensed display type, hand-drawn tags and sticker decals. The fitted Pet remains the focal point. This is a browser presentation change; AXO-015's fitted art and all existing authority boundaries remain in force.

## Design and interaction

- One clear lime Challenge Room action, secondary practice control and compact invitation/tournament choices. The Pet poster has separate identity, fitted-art and cosmetic-caption regions on phones.
- Five fixed SVG marks in `interface-kit.mjs` provide a graffiti AXO tag, axolotl doodle, star, diamond and hand-drawn orbit. Marks are decorative, hidden from accessibility and never receive pointer events. No account text enters SVG, and no raster art or external font service is added.
- Typography uses installed display-font fallbacks; platform metrics can differ. Normal body copy, controls, numeric XP and health/energy meters retain readable system type. Names remain escaped and wrap within their region.
- Style Lab becomes a compact Drip Lab. Native motion/pose disclosure starts closed; export, save, outfit/filter and tier controls remain available. The lineage/tier panel no longer stretches its select to fill inherited rows. The header explicitly clears inherited page-header padding.
- Desktop wardrobe preview has bounded independent scrolling. Phone controls retain 44-pixel navigation/action targets, visible keyboard focus, cosmetic labels and View outfit/Browse gear navigation. Reduced-motion and higher-contrast settings continue to apply. No new continuous animation or RAF loop is added.
- The same ink/tape palette reaches build cards, battle HUD, action rail, confirmation and result badge. No result-overlay pointer fences, countdown intent, receipt timing, rig coordinates or hand-mask surfaces are changed.

## Publish as a group

Load `degen.css` **after** `art-direction.css`. Publish it with the changed index, static router, command-center, Style Lab, app copy and interface kit; revalidate cached client resources as part of the existing host release process. Retain the previous CSS files, exact fitted catalog/model/media and active fitted-only renderer. No new host endpoint, database, contract, numeric ID or Arena store/secret/timer is required. Do not deploy the labelled memory-only review host or local navigation.

Verified identity, exact XP, equipped numeric V1 items, frozen fight stats and replay outcomes are unchanged. New gear remains visibly cosmetic Preview, including browser-local looks and replay reconstruction. V2 ownership, equip, mint and marketplace actions remain locked.

AXO should check real-session source parity, empty and long-name Pets, desktop/phone/short-landscape navigation, both fighter directions, all outcome controls, disclosures, filters, focus, contrast, reduced motion and actual target devices. Formal visual acceptance, live parity and device performance remain separate from synthetic source screenshots. Follow existing release gates. Roll back client/index/router/CSS as one group to AXO-015 without touching player or battle state.

See [AXO-016](handoffs/AXO-016.md), [review evidence](reviews/arena-degen-design-review.md) and [verification record](reviews/arena-degen-design.json).
