# Architecture decisions

## ADR-001 — Dedicated private monorepo

**Decision:** Maintain Hatchery, Pet NFT, Gear, visuals and Arena in one private `axo-pet` monorepo.

**Reason:** These systems share identity, XP, level, slot, metadata, visual and stat contracts. One repository allows atomic review while separate packages preserve ownership boundaries.

## ADR-002 — Existing AXO runtime remains authoritative

**Decision:** Repository extraction does not move or recompute live state.

**Reason:** Wallet-pet bindings, XP, identity receipts, submissions, Epoch history, gear ownership and Arena receipts are durable state. A source split must not become a data migration.

## ADR-003 — Verified gear projection

**Decision:** One fail-closed gear projection drives metadata, visuals and supported-game stats.

**Reason:** A separately inferred visual or stat loadout can diverge from onchain ownership and slot locks.

## ADR-004 — Bounded game-only bonuses

**Decision:** Gear stats may affect supported games but not Hatchery XP, trust, research authority, access, Epoch rank, rewards or payouts.

## ADR-005 — No deployment from ordinary CI

**Decision:** CI may compile, test, validate and package. It may not broadcast contracts, mint NFTs, issue gear, alter player state or move value.

## ADR-006 — Local source preview and exact-commit agent handoffs

**Decision:** Provide a loopback source preview with an in-memory synthetic Arena and explicitly unavailable host APIs. Coordinate Codex and AXO through source PRs, sanitized handoff records and exact source acknowledgments.

**Reason:** The extraction workspace needs a usable editing loop without implying production parity. AXO retains host integration knowledge, and live releases need traceable source, rollback and post-change evidence under the existing release gates.

## ADR-007 — Versioned Pet and Gear adapter contracts

**Decision:** Publish strict, non-mutating V1 identity, Gear definition, verified projection and unavailable-result schemas from shared-schemas, with ESM/CommonJS exports and synthetic compatibility fixtures. Trusted host adapters establish authority; validation checks consistency and cannot manufacture verification.

**Reason:** Metadata, website visuals and Arena must agree on one verified loadout. Keeping this first milestone additive preserves live behavior while the existing host interfaces are documented. Quests and database upgrades target existing AXO services; no parallel quest ledger is introduced.

## ADR-008 — Separate collectible artwork and fitted candidate wearables

**Decision:** Keep the Style Studio collection outside canonical Gear definitions and verified inventory. Store full-frame collectible artwork separately from pose-registered wearable exports, with an explicit fixed-pose mask rig. Derive Bazaar outfit examples from the same render plan as the Studio.

**Reason:** A centered standalone NFT image and a fitted Pet overlay have different geometry and occlusion needs. Baked wearable cutouts preserve the base artwork and avoid rear collars/temples crossing foreground anatomy. Candidate art review must not become ownership, stat, chain or release authority.

## ADR-009 — Preview Pants/Footwear separately from the eight-slot protocol

**Decision:** Add Pants and Footwear as independent candidate Studio slots, with separate left/right shoe placements, fixed-pose base-foot suppression and a stance-aware trouser projection. Keep the canonical eight-slot contract and schemas unchanged pending the versioned integration in `gear-slots-v2.md`.

**Reason:** The existing Gear contract uses one-based slots 1–8 and a fixed eight-entry loadout ABI. Expanding a cosmetic preview must not silently change ownership validation, existing slot numbers or Arena stat caps.

## ADR-010 — Anchored front/rear fits with original Pet foreground

**Decision:** Replace candidate flat overlays with a pose-versioned rig, item attachment origins, rear/front surfaces and lossless original-Pet arm/finger foreground projections. Require compatible pose/depth assets and preserve handheld source proportions. Expose isolated layer inspection in Style Studio.

**Reason:** Scaling and isolated holes cannot place rear lining behind the wearer or make fingers wrap a tool consistently. Authored depth segmentation and anatomical anchors address these failures while retaining the source app, canonical art and ownership boundaries. New poses and art still require fitting and visual review.

## ADR-011 — Fixed-pose anatomical surfaces and portrait contexts

**Decision:** After operator rejection of V2 fits, make the V3 anatomy atelier the main fitting preview. Preserve the canonical adult pose at 1:1 inside a 2:3 portrait, register cloth UV surfaces to anatomical landmarks, and fit newly authored tools through four-corner palm planes with original-finger occlusion. Expose head pattern guides and exact-rig fit profiles. Bake lineage material paintings into pose-registered full base images, with matching foreground anatomy; keep scenes independent of wearables and canonical originals.

**Reason:** Repeated rectangle scaling did not resolve perspective, lining and grip failures. A small reference wardrobe with explicit geometry and depth can be reviewed before extending styles. Complete lineage bases and independent scenes add visual context without changing ownership, traits, contracts or live state. See ANATOMY_ATELIER.md; visual acceptance remains pending.

## ADR-012 — Level-20 Pet growth and fixed Gear tiers with five-piece sets

**Decision:** Add an explicit candidate V2 ruleset preserving existing XP through level 10 and extending progressively harder steps to 20. Keep fixed item levels 10–20, matching minimum Pet equip levels and increasing bounded stats. Define six visually coordinated five-piece sets with role-specific stat and combat bonuses derived from verified equipped families; mixed tiers use the minimum. Keep V1 schemas, contracts, deployment planners and active Arena routes unchanged; provide additive V2 schemas, contracts, a read-only host comparison and opt-in Arena calculations.

**Reason:** The operator chose further Pet levels and fixed item minimums rather than a separate Gear XP track, then requested five-piece bonuses for all play styles and trading incentives. Distinct item definitions support acquisition without silently changing existing NFTs. Source policy cannot establish ownership, live balance or deployment authority. AXO must integrate pinned family/tier mappings and authoritative reads before release. See GEAR_PROGRESSION_V2.md and AXO-005.

## ADR-013 — Item-specific covered clothing and anatomical foregrounds

**Decision:** Add six covered body-slot families with separate whole-item portraits and pose-first cloth surfaces. Trace each garment's own cuffs and hem and register its shoulder to the canonical pose. Covered tops require matching-base jaw/head and hands-only foregrounds; bare-arm restoration remains specific to vests. Publish the renderer, catalog, foreground exports and shared wardrobe filters together. Existing item-tier rules and five-piece membership are unchanged.

**Reason:** Full-width head restoration repaints bare shoulder over sleeves, while reusing another garment's outline can retain generated pants or wrist pixels. Explicit cloth contours, jaw-shaped occlusion and shoulder registration preserve the base anatomy without showing these unwanted fragments. Separate clothing filters support mix-and-match looks. These are candidate art definitions pending visual acceptance and verified host integration; no NFTs are issued. See COVERED_TOPS_V1.md and AXO-006.

## ADR-014 — Authenticated V1 Wardrobe reads and isolated cosmetic previews

**Decision:** Mount a Wardrobe module in the existing Hatchery view and wallet flow. Require one coherent authoritative V1 Pet/equipment snapshot behind a private GET-only adapter. Keep numeric V1 equipment/canonical appearance separate from candidate try-ons. Save only cosmetic choices under a wallet/Pet-scoped local key and permanently label exported portraits Preview. Expire reads, fence account races and retain fresh same-wallet snapshots during background revalidation. V2 transaction/stat paths remain absent and locked.

**Reason:** Users can style their own lineage immediately without turning preview metadata into ownership, equip authority or gameplay bonuses. A shared authenticated snapshot boundary can later support the standalone Pet API, Passport and Arena without introducing another XP ledger. Missing host adapters remain explicit; synthetic browser QA cannot establish live verification. See MY_AXO_WARDROBE.md and AXO-007.

## ADR-015 — Standalone Pet reads with one coherent authenticated projection

**Decision:** Move Wardrobe's authoritative read into a shared Pet reader and strict `AXO_PET_READ_V1` DTO. Serve it through a standalone loopback-only HTTP service with explicit existing-host ports and a Wardrobe compatibility endpoint. Keep liveness separate from bounded dependency readiness. Reject client identity claims, expire reads from their start time, propagate cancellation and retain explicit equipment failures. No Pet database, write preparation or consumer gameplay migration is introduced.

**Reason:** Hatchery, Passport and Arena need the same identity, exact XP, equipment revision and canonical appearance. A shared reader prevents drift while retaining the preserved host as authority. Schemas cannot prove RPC/session execution; production binding and same-block evidence remain AXO's adapter responsibility. Shadow parity and release gates precede any live routing. See READ_ONLY_PET_API.md and AXO-008.

## ADR-016 — Passport history records and separate cosmetic wardrobes

**Decision:** Replace the private Passport section with a focused component using the shared Pet reader and an optional, bounded existing-host history port. Validate exact owner/genesis/current-XP context, chronological XP continuity, partial coverage and dated awards. Share the history guard and account/expiry lifecycle with the browser. Keep lineage lore and current milestones distinct from dated personal records, and read existing saved previews in a separate stamped portrait without changing canonical V1 appearance or equipment.

**Reason:** A richer Passport needs history without reconstructing player state from a current total, and styles without claiming ownership. Missing/inconsistent history must remain unavailable rather than becoming empty awards or fabricated dates. Existing host records and real-session parity remain AXO's integration responsibility. No ledger, mint/equip/market writes, award issuance or Arena migration is included. See PET_PASSPORT.md and AXO-009.

## ADR-017 — Shared verified Pet identity in Arena and frozen V1 gear replays

**Decision:** Replace the monolith Arena mount with explicit existing-host verified-session/coherent-snapshot ports delegating to the same Pet reader as Wardrobe and Passport. Preserve exact XP, V1 level/stat bounds, numeric equipment, existing HMAC keys, operator-owned Arena persistence/timer and frozen entry builds. Reject browser Pet/gear/preview authority. Add a private loadout panel, account-race clearing and canonical hash-checked fighter layers. Export bounded frozen gear stats in additive portable replay V2 while retaining V1 replay compatibility.

**Reason:** Separate identity/equipment reads could drift, unknown gear could become an inferred empty loadout, and replay exports omitted combat bonuses. A shared reader and explicit evidence failures remove those ambiguities without introducing a second Pet ledger or activating future levels/sets. Wardrobe previews remain local cosmetic drafts outside Arena combat/export. Host ports, existing-store compatibility and real-wallet parity require AXO evidence before release. See ARENA_VERIFIED_PET.md and AXO-010.
