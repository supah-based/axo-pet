# Architecture decisions

## ADR-028 — Versioned local defense and energy candidate

**Decision:** Put real numeric defense/energy changes behind an explicit Training Dojo ruleset, defaulting to current V1. Canonically validate the copied build, preserve exact XP/gear bounds/mastery, reuse historical simultaneous HP/status/terminal behavior, and replace only candidate energy accounting with an explicit receipt. Give successful blocks a bounded conditional refund and Reversal a meaningful capped return. Both known-reply comparisons and local steps dispatch the same version. Temporary local kits never save a build. Keep the match service, bot policy, historical replay verification and contracts outside this candidate; reject unsupported versions and server ruleset inputs.

**Reason:** Free-attack recovery and modest counter payoff underused defense in finite reference tests. A mirrored numerical comparison and playable prototype make the proposal reviewable without rewriting historical rules or granting Preview power. Human strategy, longer-horizon recovery, asymmetric gear and lineage acceptance are still needed before an official versioned room/replay design. Cosmetic tiers and all V2 Gear gates remain independent. See ARENA_DEFENSE_ENERGY.md and AXO-023.

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

## ADR-018 — Participant battle reports from frozen portable replays

**Decision:** Compute post-battle reports in a pure browser module from cloned, deterministic and fingerprint-checked completed replay V1/V2 records. Keep names/perspective in the private room UI; derive stats, effects, HP and exact XP exclusively from frozen entry builds and replay frames. Connect completed results/history to the report and exact exchange replay frames through the existing fenced navigation. Add only browser modules/CSS to the static allowlist, with no report API, store, share capability or write path.

**Reason:** Players need to understand damage, defence, healing and gear contributions without confusing present-day Pet state or preview clothes with the build that fought. Explicit effect accounting handles counters, caps, self/storm damage, administrative finishes and photo-finish overkill. Existing participant authorization, privacy and replay evidence limits remain intact. Live acceptance depends on AXO-010 binding and AXO-011 readback; source QA does not establish production parity. See ARENA_BATTLE_REPORTS.md.

## ADR-019 — Verified Command Center and isolated fitted motion lab

**Decision:** Present the existing verified Arena projection in a new lobby while loading candidate clothing only in a public, cosmetic Style Lab. Pin the existing catalog and share the exact anatomy fit/depth model through an explicit runtime-media allowlist. Animate the registered costume as one fixed-pose actor; keep proposed tiers/sets outside builds, API writes, ownership and transactions. Bound decoded caches/canvas/cadence, suspend hidden RAF and apply OS/manual reduced motion consistently. Keep local graphics settings free of Pet fields and share only sanitized reference-look fragments.

**Reason:** Players need fitted styles, motion and clear entry controls without promoting design previews to live combat authority or breaking garment/hand masks. Whole-actor choreography is an honest interim presentation; authored multi-pose equipment animation, real-device profiling and host parity remain production milestones. Existing replay controls can improve without altering frozen results. See ARENA_COMMAND_CENTER.md and AXO-012.

## ADR-020 — Bounded articulated equipment with one rigid grip plane

**Decision:** Skin the existing reviewed adult rest surfaces through a shared 2D joint mesh, with bounded authored attack/block/hit/victory poses and shared receipt timing. Tool, palm and original finger foreground share a rigid transform; clothes/anatomy keep identical weights and original depth order. Restrict live animation to verified V1 layers and six exact adult hashes; keep candidate poses in Style Lab. Use bounded GPU batches/cache, static checked-equipment fallback, explicit failed-art status and private read-only equipped-pose inspection. Leave replay formats, numeric gear and gameplay authority unchanged.

**Reason:** Independent layer transforms drift at wrists, while a flat portrait cannot articulate equipped combat. A calibrated mesh reuses accepted imagery and preserves masking without generating a new collectible art universe or activating future gear. Large bends/new camera angles require new art/rig review; positive visible-surface tests do not establish blanket visual acceptance or measured device FPS. See ARENA_EQUIPPED_POSES.md and AXO-013.

## ADR-021 — Cohesive presentation with explicit game confirmation

**Decision:** Share the existing SVG vocabulary and introduce a final scoped art-direction stylesheet without changing canonical art or game rules. Give phone identity and equipped artwork separate regions, bound terminal framing, derive participant outcome from the frozen winner, and keep result veils noninteractive outside their controls. Use a normal room/view-bound match-exit dialog that preserves original countdown cancellation intent while server time continues. Keep proposed wardrobe numbers in optional inspection and provide presentation-only phone navigation.

**Reason:** Attractive assets alone do not make a reliable game interface. Mobile overlap, clipped terminal actors, interception by transparent overlays and native confirmation stalls undermined the existing presentation. These changes improve interaction and hierarchy while retaining identity, XP, numerical gear, masks, combat, persistence and V2 locks. Source visual evidence is separate from formal art acceptance, real-wallet parity, device performance and production release. See ARENA_ART_DIRECTION.md and AXO-014.

## ADR-022 — Fitted-only Arena visuals with separate V1 combat authority

**Decision:** At the operator's request, replace the older active V1 costume overlays with the newer fitted pipeline in lobby, build, combat, replay and pose inspection. Supersede ADR-019/020's candidate-art exclusion from active presentation while preserving their authority boundaries. Use manifest-checked fit-plan surfaces, reviewed adult-base eligibility, existing bounded joints/rigid grip and a checked new still or explicit failed-art status. Never fall back to old costumes. Store only bounded reference-lineage cosmetic selections in browser preferences; label all actors Preview and replay appearance as a current reconstruction. Retain numeric V1 equipment/XP/frozen combat data separately and keep transactions locked.

**Reason:** Showing the old misaligned overlays on the active Pet while fitting new clothing only inside Style Lab left the operator's visual issue unresolved. Shared fitted presentation removes that divergence without promoting candidate IDs/stats to ownership or combat authority. Existing NFT records and historical art must not be deleted or remapped. Opponent preferences and historical visual snapshots are not recorded by current replay formats. See ARENA_FITTED_PREVIEWS.md and AXO-015.

## ADR-023 — Resolved contact cues and bounded optional PCM audio

**Decision:** Share contact timing between visuals and a presentation-only audio plan derived from new resolved receipts. Use a small original offline-rendered PCM bank with pinned public bytes/hashes, explicit gesture enablement, independent volume/mono controls, a bounded mix and interruption fences. Preserve continuous ambience between exchanges, cancel obsolete effects, keep reconnect history/replay seeks silent and leave the fitted rig/grip/masks untouched.

**Reason:** Single oscillator tones at receipt arrival did not communicate move contact or the outcome. Coordinating supplemental sound and localized contact effects improves feedback without exposing private choices, changing gameplay timing or granting cosmetic styles power. Source checks and synthetic browser review remain separate from physical listening, device latency and live acceptance. See ARENA_COMBAT_FEEL_SOUND.md and AXO-018.

## ADR-024 — Local combat learning with evidence-scoped quality review

**Decision:** Copy the authenticated V1 build into a no-write local Training Dojo using the existing engine. Label modified initial-state drills, reference dummy and clothing explicitly. Derive exchange explanations, replay highlights and single-battle moments only from resolved data. Add strictly cosmetic local controls/comfort, bounded paint/JS diagnostics, independent raster backgrounds and a compact phone entry. Review every quality-roadmap point with explicit source/external evidence and owners. Keep candidate set audits offline and unimported by the live V1 service.

**Reason:** Learning and replay review should explain real rules without simulating ownership, rewards, future-level authority or a paused public clock. Source tests, synthetic views and heuristic balance runs answer different questions from live parity, physical-device traces and consenting-player studies. Persistent mastery, ranking and seasons require an authoritative record design before implementation. See ARENA_QUALITY_PASS.md and AXO-019.

## ADR-025 — Known-build counterplay and optional painted combat culture

**Decision:** Compare legal dummy replies using the unchanged engine in Training Dojo, with four level-aware reference playbooks and a context-fenced contact-frame inspector. Preserve the copied authenticated player's build and zero-write boundary. Use three immutable hash-bound imagegen FX textures for resolved heavy hits/blocks/heals and a separate decorative lobby decal. Keep effects behind registered actors and hand masks, respect reduce/disable controls and bound public media loading/cache. No V1 numerical rebalance follows from a finite synthetic audit.

**Reason:** A reference sheet alone did not demonstrate shield stripping, pierce or recovery trade-offs. Crypto expression can improve identity when it follows real resolved events and does not obscure character/readout hierarchy or imply power/ownership. Human strategy/feel, physical performance and actual-host parity remain separate evidence. See ARENA_MEME_COMBAT.md and AXO-020.

## ADR-026 — Explain accepted status without changing historical V1 rules

**Decision:** Project own accepted fighter counters, modifiers, cooldowns and Liquidation into readonly semantic text. Separate epic learned/spent, charge and condition; server legal/phase/lock state remains the only live action permission. Correct rendered one-exchange expiry wording without changing the historical engine/catalog. Demonstrate altered initial states exclusively in labeled no-write local drills. Add one fixed checked raster counter texture, selected by actual returned damage at the shared delayed Reversal contact, and a decorative training decal. Prefer one meaningful painted counter over stacked block/counter effects, behind unchanged fitted masks.

**Reason:** Incorrect duration language and hidden progress can make valid choices feel broken. Specific event feedback and crypto humor should clarify decisions while preserving replay determinism, authoritative identity/XP/equipment, Preview isolation and all V2 transaction locks. Source, live and physical/player acceptance remain separate. See ARENA_STATUS_COUNTERPLAY.md and AXO-021.

## ADR-027 — Opt-in V1 opponent policy with precommit isolation

**Decision:** Add three explicit unguided practice styles whose pure policy evaluates at most 36 actual V1 exchanges using accepted fighter state and four resolved move types. Keep current submissions/identity/preview/clock outside policy inputs, commit once before human input and preserve existing commitments. New style metadata is optional; ordinary/guided/old rooms retain legacy decisions and historical combat/replay rules stay unchanged. Share a gear-free bot factory, including new tutorial replay entries. Serve presentation metadata/CSS publicly, not the evaluator/service. Publish the server/client unit together.

**Reason:** A raw-value opponent did not demonstrate important combat interactions or recovery choices. More useful adversaries can improve tactical practice without an unversioned PvP rebalance or new XP/gear authority. Distinct styles and finite mirrored comparisons are different from human difficulty acceptance. Optional metadata allows rollback without migrating player state. See ARENA_ADAPTIVE_SPARRING.md and AXO-022.
