# Arena fitted cosmetic presentation

AXO-015 replaces the outdated V1 costume overlays in the active Arena lobby, Pet build, combat, replay and pose gallery with the newer fitted collection. It supersedes the active-art choices in AXO-012–014. Verified V1 identity, exact XP, numeric equipped items and frozen combat bonuses remain independent and authoritative.

## Art and authority

- Every active client `ArenaRenderer` opts into `fittedOnly`. Loading, corrupt or missing fitted art never falls through to old costumes, lineage sprite atlases or unrelated outfits. The old private inspector is no longer publicly routed.
- `fitted-preview.mjs` uses the same pinned catalog, anatomy `fitPlan`, painted lineage bases, garment surfaces, ordering and original foreground finger masks as Style Lab. Uniform canvas scaling and the existing bounded 2D puppet preserve registration; tool, palm and fingers share the rigid grip transform. No new artwork or large-angle rig is claimed.
- The six default looks use newer covered tops, pants, footwear, headwear and hand tools. Style Lab's **Use in Arena · Preview** saves a cosmetic selection and reopening the lab restores it. Explicit shared look parameters take precedence. The apply action sits above the portrait; the phone caption sits below the artwork.
- All fighter styles are visibly **Preview / cosmetic only**. The verified-Pet panel separately lists actual numeric V1 equipment and bonuses. No proposed tier, stat or set bonus enters builds, receipts, API requests or transactions.
- Browser look preferences are bounded to six reference lineages and slot/item IDs in `axo.arena.cosmetic-looks.v1`. They contain no wallet, Pet ID, XP, ownership, stats, tier or receipt. Habitats stay in Style Lab. Storage failure retains a session-only cosmetic choice.
- This browser's lineage preference can style both players, bots and replay references. It is not an opponent's owned outfit or an authenticated opponent preference. Portable replays contain frozen combat data, not historical visual snapshots; their outfit is labelled a current cosmetic reconstruction.

## Eligibility and fallback

An authenticated Pet requires V1 level 10, one of the six supported lineages and the exact reviewed adult base hash. Younger Pets or unreviewed bases cannot be replaced by an adult reference: only their checked bare base can be shown, with an explicit fit-support status. Clearly synthetic bots and portable replay references can use the appropriate level-10 lineage reference.

Catalog bytes, image bytes and 1024×1536 source dimensions are checked before compositing at 512×768. Assets come exclusively from the existing fitted manifest/router, without forwarding cookies or following redirects. The catalog and anatomy/model/media hashes remain unchanged.

GPU failure uses the same checked fitted still image. Pose inspection shows a single static Preview when articulation is unavailable; it does not manufacture four animated poses. Failed art has a visible status. Caches retain at most three actors and twenty images; requests have ten-second limits, an 8 MiB image bound and a 4 MiB catalog bound. View/context changes clear actors; stopping aborts pending work and releases GPU resources. These bounds are not measured target-device performance evidence.

## Host integration and rollback

Publish the client, renderer, three new fitted modules, Style Lab, verified panel, command-center, styles, index and static-router changes together with the existing exact catalog/model/runtime-media route. The shared model, catalog and raster files are unchanged. Remove the public old inspector route. Do not copy the memory-only synthetic review host into production.

No server adapter, endpoint, contract, numeric-ID mapping, Pet database, gear record, XP rule, Arena store/secret/timer or combat rule changes. Historical V1 NFT art, manifests and offline renderer tests remain available for evidence/compatibility; they are not active Arena costume fallbacks. Do not delete or remap live owned equipment to cosmetic style IDs.

AXO must verify real-session identity/XP/numeric gear and frozen fight parity, actual base eligibility, selected/default/empty styles, both fighter directions, finger/tool masking, route/account cleanup, mobile controls, GPU/static/failed-art paths and replay labels. Follow the existing release gates and separately authorized rollout. Roll back client/CSS/static routing together to AXO-014 without changing player or battle state; the unused cosmetic preference key needs no migration.

See [AXO-015](handoffs/AXO-015.md) and [review evidence](reviews/arena-fitted-gear-review.md). Source QA is separate from AXO acknowledgment, production parity and operator visual acceptance.
