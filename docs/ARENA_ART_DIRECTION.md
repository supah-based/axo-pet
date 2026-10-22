# Arena art direction and interaction pass

AXO-014 reviews the AXO-013 source against the presentation qualities expected of a polished game: a clear focal point, consistent visual language, readable combat, deliberate feedback and reliable controls. It improves those qualities; it is not certification that Arena is an AAA production. No new raster art, paid fonts or external asset dependency is introduced.

## Presentation

`art-direction.css` is the final scoped presentation layer after the existing stylesheets. The lobby reuses the committed Arena environment as a decorative stage behind the actual equipped Pet. Identity, exact XP and V1 item counts remain server-derived. Phone layouts place identity above the character rather than across its headgear. The entry caption describes the loadout source instead of naming a lineage tool as though it were the equipped item.

`interface-kit.mjs` shares the existing combat SVG icon vocabulary with lobby modes and moves. A consistent system-font stack, warm green materials, ivory text and restrained purple accents replace mixed type styles and generic glyphs. The combat HUD keeps identity, numerical HP/energy and fixed command hotkeys; the large fighter artwork is the equipped appearance. Bare lineage thumbnails are hidden in that HUD so they cannot imply a different equipped costume.

Completed fights show participant Victory/Defeat/Draw derived from the existing winner and seat; canonical winner text is retained. Terminal whole-actor tilt is capped at 0.16 radians and the anchor accounts for rotated portrait extent, preventing the previous off-screen defeat pose. Shared rig weights, grip/finger masks, equipment images and combat calculations are unchanged. The completed command dock is hidden, move inspection remains among result actions, and the explicitly opened combat log moves to the header. The transparent result veil no longer intercepts return controls; the actual result card remains interactive. Short-landscape results scroll independently.

Style Lab keeps Preview badges, marked exports and cosmetic-only tiers/sets. Proposed design numbers start collapsed. Phone controls can move between the fitted portrait and gear selection without changing the selection, account or game state. System/manual reduced motion remains authoritative for animation; the phone jump respects the same budget. The local development navigation is now collapsed by default, retaining its synthetic/source warning while avoiding a large toolbar over phone controls. That script is development-only and is not needed on the live host.

## Match-exit confirmation

Conceding or cancelling an active countdown now opens the normal game dialog instead of `window.confirm`. Nothing is submitted until the second explicit action. Keep playing, close and Escape cancel the panel. The server clock continues. The dialog binds to the current view and room; changing route closes it. A completed fight is not conceded again. A cancellation opened during countdown retains `beforeFight:true` even if FIGHT starts while the panel is open, allowing the existing server to reject it rather than converting it into a loss. Existing non-playing invitation cancellations are unchanged.

No new request endpoint, authorization, automatic move, timer, ledger, XP, numeric equipment mapping, ownership, combat statistic or V2 transaction is introduced. Public Style Lab continues to avoid private polling and writes.

## Host integration and rollback

Publish the modified client, command center, Style Lab, renderer and index with `interface-kit.mjs`, `art-direction.css` and the explicit static-router additions. Keep the prior AXO-010–013 verified-reader/equipment/animation integration and canonical/catalog/media hashes. Preserve host-owned store, timer and secret handling. Do not deploy the synthetic review setup or development navigation to production.

Verify real equipped and empty Pets, long names, active roster locks, both winner seats/draws, equipped terminal silhouettes, modal cancel/confirm/route and countdown races, result return/replay/inspection, open log and 390-pixel/short-landscape layouts. Check system/manual reduced motion, high contrast, failed image/static graphics fallback and target-device performance. Formal art acceptance, real wallets and independent release readback remain operator/AXO work.

Roll back the client/CSS/static-router group together to the accepted AXO-013 source. There is no player-state migration to reverse. Separately authorized releases still follow the existing backup, rollout and readback gates. [AXO-014](handoffs/AXO-014.md) pins the source and CI and requests sanitized host evidence.
