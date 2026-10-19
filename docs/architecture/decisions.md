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
