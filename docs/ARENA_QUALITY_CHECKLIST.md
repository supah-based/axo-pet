# AXO Arena quality review and upgrade checklist

Research date: 2026-10-23. Reviewed source: `816a3a9906612d3090f9846b133115aeae3639a7`, fetched and equal to `origin/codex/arena-imagegen-art` when this review began. This is a proposed production-quality backlog. Unchecked items require implementation or fresh acceptance evidence; this document does not report them as completed upgrades.

**Current pass, 2026-10-23:** [AXO-019](handoffs/AXO-019.md) and the [multi-domain review](reviews/arena-quality-review.md) supersede the original unchanged-source baseline below. Every one of the 44 points now has a disposition in the table at the end. Training, replay learning, phone entry, comfort/keys, diagnostics, two painted environments and reproducible balance audits are implemented. Open acceptance boxes continue to mean the whole original acceptance has not been demonstrated; a source upgrade is not an AXO acknowledgment, human study, device result or live release.

The next milestone is one polished journey: verified Pet → choose build/look → enter practice or a challenge → understand every exchange → result → replay or rematch. Give that journey consistent art, sound, responsiveness and recovery before expanding the content schedule. This recommendation applies established development principles to AXO; it is not an industry certification or a promise that a checklist alone makes a game AAA.

## Research and how it applies

| Primary source | Principle used in this plan |
| --- | --- |
| [Riot: Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/) | Preserve character recognition across cosmetics, give important events visual priority and limit competing effects. Apply this to AXO silhouettes, move categories and readable HUD layers. |
| [Riot: TFT Rise of the Elements learnings](https://teamfighttactics.leagueoflegends.com/en-gb/news/dev/dev-tft-rise-of-the-elements-learnings/) | Clear anticipation and impact make abilities more satisfying; crowded combat is difficult to follow. Review AXO exchange staging and strategic counterplay together. |
| [Riot: How the VALORANT Arsenal was built](https://playvalorant.com/en-gb/news/dev/how-the-valorant-arsenal-was-built/) | Art, animation beats, effects and sound communicate a consistent identity and state. Design each AXO move as a coordinated sequence. |
| [Riot: VALORANT shaders and gameplay clarity](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity) | Balance art, performance and competitive integrity; lower graphics settings must preserve meaningful information. Apply the principle without adopting shooter-specific networking or hardware targets. |
| [Microsoft XAG 103: Additional channels for visual and audio cues](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103) | Reinforce important cues with text, shapes and sound; color alone cannot carry their meaning. |
| [Microsoft XAG 105: Audio accessibility](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/105) | Provide independent audio controls so ambience and music cannot obscure useful cues or narration. |
| [Microsoft XAG 107: Input](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107) and [117: Motion settings](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117) | Support alternate inputs and configurable motion. Account for timing demands and distractions as well as button remapping. |
| [Microsoft XAG 102: Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102) | Review text, controls and important gameplay elements against their actual backgrounds and states. |
| [Google web.dev: Rendering performance](https://web.dev/articles/rendering-performance) | Profile the full rendering pipeline. A 60 Hz frame spans about 16.7 ms, with less time available to application work because the browser also needs time. |
| [Riot: Prototype — Building a Game's Substance](https://www.riotgames.com/en/r-and-d-office/prototype-building-a-games-substance) | Test a representative playable experience with the intended audience, ask specific questions and iterate from observed play. |

These are development guidance and historical developer case studies, checked on the research date. The numerical acceptance goals below are proposed AXO targets, not figures claimed by those studios or accessibility certification.

## Current evidence and gaps

Source progress after this review: [AXO-018](handoffs/AXO-018.md) adds the first combat/contact/audio pass, an original PCM bank and volume/mono/lifecycle coverage. It advances B/C work while leaving physical listening, latency, full visual acceptance and live parity open. The baseline table below describes the pre-upgrade reviewed SHA; see [the new guide](ARENA_COMBAT_FEEL_SOUND.md) for current source behavior.

| Domain | Already in this source | Still needs evidence or improvement |
| --- | --- | --- |
| Identity and equipment | Shared verified V1 Pet projection, exact XP, numeric gear and frozen entry stats; cosmetic Previews remain separate. | AXO acknowledgment of exact source and real-session Hatchery/Passport/Arena parity. Current handoff evidence records these as pending. |
| Art and clothing | Fitted collection, registered hand masks, six lineage paintings, 43 style families, six candidate sets and 10–20 preview tiers. Imagegen graffiti/stickers replace decorative SVG art. | Formal visual acceptance across combinations, scenes, poses and both fighter directions. Candidate tiers/sets are not live ownership or power. |
| Motion | Bounded 2D equipped rig, shared cue timing, attack/block/hit/victory poses, static/GPU failure paths. | Move-by-move feel review and art acceptance through transitions; new camera angles need compatible authored art/rig work. |
| Audio | `render.mjs` uses short triangle-oscillator cues, an eight-voice limit and a sound toggle. | Authored sound palette, mix, independent volume controls and device listening tests. |
| Interface | Degen visual language, challenge entry, guided practice, build editing, HUD/readouts, results, replays, mobile controls and presentation preferences. | First-session usability, actual contrast/assistive-technology review and a clearer phone entry path. |
| Performance | Auto/Low/High presentation budgets target 30/60 fps; bounded actors, asset verification and hidden-tab cleanup. | Physical-device frame traces, memory/thermal measurements, loading and recovery budgets. Configured caps do not establish achieved FPS. |
| Multiplayer and balance | Server authority, private commitments, reconnect warnings, challenge rooms, practice, tournaments, replay reports and a seeded heuristic balance simulator. | Host load/recovery evidence and human matchup testing. Bot simulations are not proof of competitive balance. |
| Verification | AXO-017 records 383 passing tests and exact-source CI; saved desktop/mobile source-review images exist. | Fresh acceptance for each new upgrade, current browser automation, production readback and external playtests. |

Source anchors: [presentation budgets](../apps/arena-web/presentation.mjs), [client flows](../apps/arena-web/app.mjs), [audio/rendering](../apps/arena-web/render.mjs), [balance simulator](../apps/arena-web/balance.mjs), [fitted art policy](ARENA_FITTED_PREVIEWS.md), [rig limits](ARENA_EQUIPPED_POSES.md), [AXO-017 evidence](reviews/arena-imagegen-art.json).

The saved [390×844 lobby review](reviews/arena-imagegen-mobile.png) places the large Pet card before the entry buttons, leaving play actions below the first viewport. The [earlier mobile combat review](reviews/arena-degen-combat-mobile.png) is a useful stress case for a busy background, small labels and stage/HUD space. These are dated synthetic artifacts, not a new live browser or physical-device audit. Review those compositions again after layout changes. Keep synthetic review banners in development; do not use their occupied height as a production requirement.

## How to use the checklist

- **P0:** Required evidence before claiming live readiness or activating dependent systems. Client polish can proceed while AXO collects host evidence.
- **P1:** Next quality milestone: the complete fight journey.
- **P2:** Expansion after that journey passes its acceptance review.
- Check an item only when its artifact, exact source, reviewer and result are recorded. Existing partial implementation is a starting point, not automatic acceptance.
- Owners name responsibilities: **Client** is repository work, **Art/Audio** is asset and creative review, **AXO** is existing-host integration, and **Operator/Players** provide release or playtest acceptance. This assigns no external messages or deployments.

## A. Verified foundation and live reliability — P0, AXO + Client

- [ ] **A1 — Exact live source.** AXO acknowledges the reviewed commit and returns sanitized client/asset version readback. Record source-ready and live-integrated status separately; a handoff file alone does not wake AXO.
- [ ] **A2 — One Pet everywhere.** Verify the same authenticated Pet identity, exact XP, current V1 level, numeric equipment and stats across Hatchery, Passport and Arena. A mid-fight wardrobe/XP change must not change frozen entry stats.
- [ ] **A3 — Honest connection states.** Exercise submission, delayed acknowledgment, rejection, timeout and reconnect. Pending input must never be called accepted before server confirmation. Preserve hidden choices, original deadlines and duplicate-request handling.
- [ ] **A4 — Host resilience.** Test refresh, expired session, account switch, interrupted request and host restart against the existing store/timer ownership. AXO supplies a measured concurrency baseline, recovery evidence and rollback/readback under [release gates](runbooks/release-gates.md).

## B. Combat feel and readable impact — P1, Client + Art/Audio

- [ ] **B1 — Move language.** Make a reference sheet for attack, guard/block, support, recharge and epic: pose silhouette, cue shape, sound and short label. A cosmetic tool must not imply a different equipped skill or damage type.
- [ ] **B2 — Coordinated beats.** Review anticipation → release → impact → recovery for all twelve motion profiles. Align impact art, receiver reaction, HP/energy readouts and audio with the same resolved exchange. Move-specific anticipation/audio starts only after legal reveal; pending opponents remain neutral. Keep simultaneous-combat rules intact.
- [ ] **B3 — Impact tuning.** Prototype restrained recoil, contact shadows, trails and optional camera impulse. Try a brief presentation-only impact hold in replay/practice first; it must not delay live commands, alter deadlines or conceal the next decision window. Reduced motion retains the result in static cues.
- [ ] **B4 — Explain the exchange.** Show damage dealt, damage blocked, healing and costs with distinct labels/shapes. Review mirrored attacks, simultaneous epic effects, lethal trades and draws. The live result and detailed battle report must reconcile exactly.

## C. Sound and musical identity — P1, Art/Audio + Client

- [ ] **C1 — AXO sound kit.** Produce cleared original or licensed assets for selection, accepted lock, rejection, countdown, attack, block, hit, heal/recharge, epic and results. Define degen/tech/arcane timbres with small controlled variations; keep an asset/provenance manifest.
- [ ] **C2 — Mix controls.** Add persistent master, gameplay/UI effects and music/ambience volumes for the channels actually shipped. Include mute and mono compatibility; test clear priority for critical cues over background audio.
- [ ] **C3 — Reliable playback.** Start audio only through a user gesture. Test unsupported/suspended audio, tab hiding, replay seeking, reconnect, repeated receipts and teardown: no stuck loops, doubled impacts or surprise resume bursts.
- [ ] **C4 — Listening acceptance.** Review phone speakers, headphones and muted play. Every necessary cue has a visible equivalent. Music transitions between lobby, match and result without drowning out command/timeout information.

## D. Gear, anatomy and character acting — P1, Art + Client

- [ ] **D1 — Fit matrix.** For every supported lineage and wearable style family, inspect both fighter directions and idle/attack/block/hit/victory extremes. Review all six complete sets plus mixed outfits, bare slots and covered tops. Include head/gills, neck/collar, sleeve/cuff, pants/tail and boots/floor seams. Habitats retain their existing lab-only scope.
- [ ] **D2 — Grip acceptance.** Check each tool's handle, perspective and scale at anticipation/contact/recovery. Palm, tool and finger/upper-thumb foreground must keep one rigid grip binding; reject palm blobs, floating fingers and sleeve/handle crossings.
- [ ] **D3 — Expressive, stable acting.** Improve breathing, gaze, anticipation, recovery and distinct win/loss reactions inside the reviewed rig envelope. Larger turns, cloth bends or new hand poses require compatible source art and a versioned registration review before use.
- [ ] **D4 — Fallbacks and exports.** Review unsupported/younger Pets, missing/corrupt images, GPU loss and restored contexts. Preserve correct checked art or an explicit unavailable state. Portraits remain 2:3 and marked Preview; replay looks remain labelled current cosmetic reconstruction where no historical snapshot exists.

## E. Game interface and phone usability — P1, Client + Players

- [ ] **E1 — Phone entry.** Put an appropriate Play/Practice/Resume action in the first useful phone viewport alongside a compact Pet summary. Keep the larger Pet poster available and make active-entry resumption unambiguous. Verify with real users at 320/390 px and with browser bars visible.
- [ ] **E2 — Combat hierarchy.** Keep HP, energy, choice status and time-to-lock legible above environmental detail. Fit both actors and the command area deliberately in portrait and landscape; menus/logs may not hide commands or intercept result buttons.
- [ ] **E3 — Complete interaction states.** Review default, focus, hover, pressed, selected, pending, disabled-with-reason, error and success states for entry, skills and rematch. Prevent double submissions; polling must preserve focus, disclosure state and scroll position.
- [ ] **E4 — Useful results.** Give a clear win/loss/draw explanation, a report link and a deliberate rematch/return action. Retain accurate free-play/reward disclosures. Reuse available legitimate history rather than inventing XP, streaks or awards.

## F. AXO art direction and world — P1 core, P2 expansion; Art + Client

- [ ] **F1 — Small art bible, P1.** Specify type roles, charcoal/lime/violet palette, spacing, material/lighting rules, decal density and calm areas around text. Preserve AXO's cute axolotl silhouette and original degen humor across scenes and gear.
- [ ] **F2 — Stage separation, P1.** Review fighter silhouettes against every scene in grayscale and at phone size. Keep graffiti/candlestick detail away from critical reads, give ground contact a consistent light/shadow treatment and test bright/dark clothing together.
- [ ] **F3 — Authored environments, P2.** Build a few distinctive arenas with imagegen raster art, saved prompts and pinned optimized assets. Separate registered background/foreground planes where needed; optional atmosphere must preserve framing, fit, readability and performance.
- [ ] **F4 — Match ceremony, P2.** Explore a short versus introduction, lineage motif and victory presentation. Make them skippable where appropriate; late join/refresh must go directly to current state. Never replay a countdown or hide an active server deadline.

## G. Accessibility and control — P1, Client + accessibility reviewers

- [ ] **G1 — Full input path.** Complete lobby → build → fight → report → rematch using keyboard only and touch only. Add configurable shortcuts where useful, update their hints and avoid conflicts while typing. Maintain visible focus and generous touch targets.
- [ ] **G2 — Readable information.** Measure text and essential non-text contrast in every UI state against actual artwork. Review text scaling/200% zoom, long names and narrow/landscape layouts. Keep plain type for instructions and numeric information.
- [ ] **G3 — Perceivable combat.** Test mute, color-vision simulations and a screen reader. Expose turn/choice/result information through appropriate semantic text and concise announcements; avoid announcing every timer tick. No vital information depends only on hue or motion.
- [ ] **G4 — Comfortable motion and learning.** Audit OS/manual reduced motion, disabled camera shake and calm backgrounds. Extend guided practice with step/review tools using explicit practice rules if needed. Public match clocks remain server-authoritative; opening settings never silently pauses them.

## H. Performance and loading — P1, Client + AXO/device reviewers

- [ ] **H1 — Real hardware matrix.** Nominate actual low-end Android, iPhone/Safari and integrated-GPU desktop devices and browser versions. Capture frame distributions, long tasks, memory, decoding and thermal behavior for two dressed fighters and heavy effects.
- [ ] **H2 — Budget acceptance.** Start with the proposed goals below, record a baseline and fix the largest measured bottleneck. High/Low settings must convey the same battle information. Report frame-time percentiles and missed-frame rates, not just configured FPS caps.
- [ ] **H3 — Predictable loading.** Prioritize entry controls and checked base/selected gear. Test cold cache, slow network, offline assets and partial failure. Reserve layout space, show useful progress/failure states and keep verified combat readouts usable.
- [ ] **H4 — Long-session health.** Run 30 minutes of fights, wardrobe changes, replay seek, route changes and hidden/resume cycles. Check actor/image/GPU/audio resource release and memory plateau; context loss must recover to a correct checked still or rig.

## I. Strategy, balance and training — P1 research, P2 rule changes; Client + Players

- [ ] **I1 — Reproducible baseline, P1.** Run the existing seeded balance simulator across current supported levels/builds with pinned source and several seeds. Flag outliers and inspect matchup replays. Bot heuristics and a 35–65% script flag do not establish a human-balance target.
- [ ] **I2 — Learnable counterplay, P1.** Have players explain attack/defense/support choices, costs, cooldowns and epic conditions after a practice fight. Add precise practice lessons for observed misunderstandings without revealing opponents' private commitments.
- [ ] **I3 — Gear/set design review, P2.** Evaluate attack, damage, defense and hybrid roles, mixed builds and five-piece set tradeoffs across candidate levels 10–20. Audit minimum-level rules and power outliers in an isolated candidate simulation. Activation requires verified contracts/catalog numeric-ID mappings, balance approval and existing release gates.
- [ ] **I4 — Fair competitive design, P2.** Prototype population-appropriate matchmaking, skill bands and season rules from measured participation. State the rules for level/gear advantages. Rank/rewards/progression need an explicit authoritative record design before implementation; previews never award power or XP.

## J. Retention, spectators and community — P2, Client + AXO + Players

- [ ] **J1 — Meaningful goals.** Explore mastery challenges and recorded achievements with a clear authoritative event source. Separate Pet XP, item requirements, cosmetic discovery and competitive results in the interface. Do not grant battle XP under the current rules.
- [ ] **J2 — Replay learning.** Improve exchange bookmarks, reason summaries and comparison tools using validated completed replays. Preserve access limits and distinguish historical combat records from current browser cosmetic reconstruction.
- [ ] **J3 — Safe expression.** Keep stamped look/portrait sharing, explicit spectator consent and revocation, report/block flows and sanitized names. Review spam, long names and empty boards; an empty queue should offer practice without pretending bots are human opponents.
- [ ] **J4 — Sustainable content cadence.** Plan small cohesive collections and occasional environments around playtest demand. Record art/animation acceptance, localization impact, licensing and performance costs for each drop. Seasonal themes require original AXO assets and clear cosmetic labels.

## K. QA and player evidence — P1, Client + Players + AXO

- [ ] **K1 — Current end-to-end coverage.** Repair browser test portability and selectors before relying on it: `browser-smoke.mjs` currently hard-codes a Linux Chromium path and an older native-confirm flow. Cover current entry, game dialog, hidden choices, results, rematch and cosmetic boundaries using appropriate test tooling.
- [ ] **K2 — Repeatable acceptance matrix.** Execute the scenarios below against each candidate exact source. Attach screenshots/video, traces and defects, with synthetic and real-host evidence clearly separated. Automation must be complemented by visual and human review.
- [ ] **K3 — First audience study.** Recruit 8–12 consenting intended players across novice/experienced and phone/desktop use. Observe practice → build → challenge → result; ask specific comprehension/feel questions. This is a proposed qualitative discovery sample, not a statistically representative study.
- [ ] **K4 — Iterate from evidence.** Fix the highest-impact observed problems, then repeat with fresh participants. Use minimal consented diagnostics for entry failures, timeouts, disconnects, completion and rematch intent; never log wallet secrets, private choices or raw identity receipts. Formal outcome and analytics claims need appropriate samples and privacy review.

## Proposed acceptance goals for the next milestone

These are initial project goals to validate on named devices and revise from baseline evidence. They are not current measurements.

| Area | Proposed goal | Evidence |
| --- | --- | --- |
| First-use comprehension | At least 8 of the first 10 participants finish guided practice without moderator rescue and explain lock timing, energy and the result. | Observed sessions and task notes; directional evidence only. |
| Phone entry | Relevant Play/Practice/Resume control visible in the first useful 320/390 px portrait viewport, with accurate entry locks and no overlap. | Browser-bar-aware captures and touch walkthrough. |
| Local input response | p95 input-to-visible pending/selection feedback ≤100 ms on target devices; measure server acknowledgment separately. | Instrumented marks plus sampled interaction recordings. This is not an end-to-end network guarantee. |
| Frame pacing | Sustained 60 fps High and 30 fps Low during active combat on nominated devices; aim for ≤5% frame intervals above 1.5× the mode's 16.7/33.3 ms interval after warm-up. | Five-minute traces, p50/p95/p99 intervals, missed frames, device/browser/thermal context. |
| Cold entry | On a documented 10 Mbps/100 ms RTT test profile, usable entry controls within 3 s and checked selected fighter art within 5 s; handle failures explicitly. | Repeat cold-cache runs; measure host authentication latency separately. |
| Gear registration | No visible detached grip, reversed tool, sleeve/palm seam or head/gill collision in accepted matrix states. | Exact-source contact sheets plus motion clips and art reviewer acceptance. |
| Session stability | No unhandled errors, growing retained actor/audio resources or stale-account content during the 30-minute scripted session. | Resource traces and cleanup/assertion evidence. |
| Result correctness | All reviewed outcomes/readouts reconcile with resolved server receipts, including draws and reconnects; cosmetic changes produce zero combat-stat changes. | Deterministic tests plus host parity cases. |

For web responsiveness, Google's good INP threshold of 200 ms is a useful page-level reference, but it does not measure server acceptance or continuous combat frame pacing. [Rendering performance](https://web.dev/articles/rendering-performance) explains the distinction and browser overhead.

## Acceptance scenarios

| Scenario | Required variants |
| --- | --- |
| Entry/build/style | Verified and unavailable Pet; exact XP; empty/saved/mixed/complete look; active entry; unsupported adult art/younger base. |
| Fight | Attack/block/hit/support/epic/recharge; both directions; two simultaneous effects; no opponent-choice leak. |
| Results | Win, loss, draw, lethal trade, timeout/forfeit; report, replay, rematch and return; no fake rewards. |
| Gear | Six lineages × every supported wearable family and critical pose extremes; six complete sets; mixed covered tops/tools/headgear; explicit empty slots. |
| Devices | Desktop, named Android and iOS hardware; 320/390 portrait, landscape, zoom/text scale, soft keyboard and browser chrome. |
| Inputs/access | Keyboard, touch, screen reader, mute, reduced motion, contrast/color-vision review and long/localized copy. |
| Network/lifecycle | Slow cold load, failed asset, interrupted command, duplicate receipt, session expiry, account change, refresh, reconnect and hidden/resume. |
| Rendering | High/Low, GPU unavailable/lost/restored, resource teardown, current Preview/replay labels and 2:3 export. |

## Recommended build sequence

1. **Combat/audio reference fight:** implement B1–B4 and C1–C4 for one accepted dressed outfit, both seats and a complete match. Include D2, G3/G4 and H1/H2 in its acceptance. Reuse that event/cue design across the existing move profiles only after review.
2. **Phone-first match journey:** E1–E4, G1/G2 and K1; test entry, learning, command, result and rematch on the current art. Preserve the degen theme and fitted geometry.
3. **All-gear acceptance and device hardening:** expand D1–D4, F1/F2 and H1–H4 to the full supported matrix; run K2/K3 and iterate.
4. **Live integration and playtest gate:** AXO completes A1–A4 and operator-controlled rollout/readback under existing release gates. Use I1/I2 and K4 to choose the next gameplay changes.
5. **Content and competition:** F3/F4, I3/I4 and J1–J4 after evidence supports them. Contract/mapping and authoritative-history dependencies remain explicit.

A small complete fight is the proposed next implementation boundary. This plan does not request an engine rewrite, new production database, new wallet, V2 activation or changes to the current combat rules.

## Review record

For each accepted item record: checklist ID, exact source commit, reviewer, date, environment/device/browser, synthetic or live scope, evidence location, pass/fail and remaining defects. Keep player identifiers, private recordings, production receipts and raw telemetry out of Git; link only sanitized artifacts approved for the repository.

Original baseline review: research plus source/document/saved-image inspection on 2026-10-23. No physical-device, real-wallet, accessibility-user or production performance test was performed for that baseline. Runtime code and game assets were unchanged at that point; AXO-018/019 subsequently changed source/assets as documented above.

Documentation verification: 44 unique checklist IDs, all local checklist links resolve, and `git diff --check` passes. The required `npm run check` baseline passes all 383 tests, including 41 contract and 184 Arena tests, using the pinned Node/npm tooling with loopback test connectivity. These checks establish the unchanged source baseline; they do not close the quality-acceptance tasks above.

## AXO-019 disposition of all 44 points

Follow-up [AXO-020](handoffs/AXO-020.md), 2026-10-23: [mechanics/culture review](reviews/arena-meme-combat-review.md) advances B1/B2/B4 (move language/receipt FX), F3 (original raster assets), G4 (local inspection), H3 (checked bounded optional art), I2 (counterplay learning) and K2 (repeatable evidence). It adds a 176,004-pair audit, four dummy playbooks and exact reply comparisons. External requirements and every live/V2 gate in this matrix remain open; source additions do not substitute for player/device/host acceptance.

Each row refers to the exact implementation pinned in AXO-019, reviewed by Codex on 2026-10-23. **SOURCE** means implementation plus scoped source evidence; **PARTIAL** includes work shipped with broader acceptance open; **EXTERNAL** needs host/device/player evidence; **DESIGN** is a documented dependency/proposal rather than a shipping backend. Evidence and acceptance owners are explicit. See the linked review for screenshots, test scope and limitations.

| ID | Status | Evidence / upgrade in this pass | Remaining action and owner |
| --- | --- | --- | --- |
| A1 | EXTERNAL | Pinned source/PR/CI and AXO-019 packet. | AXO acknowledges commit, returns host asset/source readback. |
| A2 | PARTIAL | Existing verified projection/frozen-entry tests retained; Dojo copies exact V1 build. | AXO compares same authenticated Pet in all three live views. |
| A3 | PARTIAL | Existing race/ack/hidden-choice tests retained; readonly receipt panels add no submission. | AXO runs delayed/rejected/reconnect host cases. |
| A4 | EXTERNAL | No store, timer or API ownership change. | AXO supplies restart/session/account/concurrency/rollback evidence. |
| B1 | SOURCE | 12-move reference, category/condition/cost explanations and shared pose/cue/audio mapping in guide/current modules. | Art/players accept move recognition on named devices. |
| B2 | PARTIAL | Existing all-profile/both-seat choreography regression tests; exact engine-based Dojo review. | QA captures full simultaneous-epic motion clips and human readability. |
| B3 | PARTIAL | Existing restrained contact/recoil/hold; added optional camera impulse, default off, motion fences intact. | Players compare comfort/feel; no live deadline changes. |
| B4 | SOURCE | Pinned Last exchange, exact Dojo energy/damage/block/heal, replay/report consistency tests and browser seek. | AXO live receipts; QA human comprehension. |
| C1 | SOURCE | AXO-018 original 13-cue PCM/provenance/hash/signal checks retained. | AXO reads back bank; sound reviewer accepts timbre. |
| C2 | SOURCE | Gesture/mute/master/effects/ambience/mono controls retained; local prefs independent. | QA phone/headphone mix acceptance. |
| C3 | SOURCE | Bounded voice/lifecycle/receipt/replay/hidden cancellation tests retained. | QA target-browser suspended/output device cases. |
| C4 | EXTERNAL | Visual equivalents and listening packet documented; no physical hearing claim. | Sound reviewer/players listen on phone/headphones and muted. |
| D1 | PARTIAL | All-family/six-base mesh/depth and existing equipped pose tests pass; fitted Style Lab reviewed. | Art reviewer accepts full sets/mixes in both directions and motion. |
| D2 | PARTIAL | Same rigid palm/tool/foreground binding and positive-surface tests; no changed registrations. | Art reviewer checks every tool at contact/recovery. |
| D3 | PARTIAL | Existing bounded idle/attack/block/hit/win/loss acting preserved through new scenes/Dojo. | Art reviewer approves motion matrix; new turns require new compatible art. |
| D4 | PARTIAL | Existing unavailable/unsupported/GPU/2:3 Preview/reconstruction checks retained. | QA rendered corrupt/GPU-restoration/export cases on target devices. |
| E1 | PARTIAL | New compact Practice/Resume; browser 320/390 first viewport and active locks in DOM tests. | Players/QA test physical bars, touch, soft keyboard. |
| E2 | PARTIAL | New calm background; corrected 320 px terminal log overlap; no actor/gear transform change. | QA landscape/heavy simultaneous-effect hierarchy. |
| E3 | PARTIAL | Named controls, remapped hints, retained focus/scroll and command fences; existing error/ack tests. | QA full interactive state matrix with touch/keyboard/slow network. |
| E4 | SOURCE | Truthful recorded moments, report/replay highlights, result log dialog; missed-turn loss reviewed. | AXO live finish/rematch parity and players' outcome comprehension. |
| F1 | SOURCE | Small original AXO art bible in ARENA_QUALITY_PASS.md. | Art owner maintains/approves future additions. |
| F2 | PARTIAL | Quiet-floor prompts, default dimming and phone/desktop compositing; rig-independent art. | Art/QA grayscale, vision simulation and bright/dark outfit acceptance. |
| F3 | SOURCE | Two imagegen environments, saved prompts, WebP hash/size/dimension/MIME tests, 417,216 bytes. | AXO asset readback; art/device acceptance. |
| F4 | PARTIAL | Existing server-fenced versus countdown and terminal poses retained; no extra blocking ceremony. | Art/players evaluate timing; host refresh/late-join readback. |
| G1 | PARTIAL | Six configurable shortcuts, conflict swap, typing/dialog guards; phone controls and empty-state paths. | QA completes full keyboard-only/touch-only target-device journey. |
| G2 | PARTIAL | Plain type option, dimming/contrast rules, named selects; reviewed narrow layouts. | QA measures all-state contrast, zoom, long/localized copy. |
| G3 | PARTIAL | Existing semantic status/readouts, concise announcements and mute equivalents retained. | Screen-reader/vision users assess actual assistive output. |
| G4 | SOURCE | No-clock local drills, step breakdown, manual/OS motion fences, calm setting and default-off impulse. | Players validate learning/comfort; live clocks continue. |
| H1 | EXTERNAL | Device acceptance packet; local browser is identified as synthetic/emulated. | Operator nominates hardware; QA records thermal/GPU/browser traces. |
| H2 | PARTIAL | Local bounded p50/p95/p99/JS probe, short measured sample and high-refresh cadence fix/test. | QA sustained five-minute High/Low traces/missed-frame and latency goals. |
| H3 | PARTIAL | New optimized assets pinned; existing failed/loading fitted art handling and fixed public routing retained. | AXO/QA cold cache, 10 Mbps/100 ms RTT, offline/partial host delivery. |
| H4 | PARTIAL | Existing actor/audio teardown/cache bounds; new frame history capped at 360. | QA 30-minute mixed-session memory/context-loss/hidden-resume trace. |
| I1 | SOURCE | CLI directory/cwd/seed repair, mirrored paired seats; 10,800 fights, three seeds, hashes and 90 cells/seed. | Designers inspect Solar/outlier matchups with human play; no automatic nerf. |
| I2 | PARTIAL | Repeatable actual-engine attack/shield/counter/heal/epic drills and move reference. | Players explain counterplay after practice; revise from observed errors. |
| I3 | PARTIAL | Offline 396-case six-role/tier/lineage audit; mixed-stat isolation and under-level rejection report. | Designers playtest rounding/sustain/power; AXO verifies contracts/mappings before any activation. |
| I4 | DESIGN | Population-first competition proposal; current level-bound casual rules retained. | Product/AXO supply participation, authoritative rating/season/recovery rules. |
| J1 | PARTIAL | Recorded single-battle moments without awards; persistent mastery event requirements documented. | AXO/design approve authoritative history/achievement design before persistence. |
| J2 | SOURCE | Four replay bookmarks, record-backed guard/heal/epic/one-HP moments, frozen/current-look disclosure. | Players evaluate learning usefulness and future comparisons. |
| J3 | PARTIAL | Empty board now offers practice/Dojo; consent/revoke/moderation/private replay/Preview sharing tests retained. | AXO/QA host abuse/load/long-name and revocation acceptance. |
| J4 | DESIGN | Original scenes plus small-drop art/fit/byte/localization/player-demand checklist in guide. | Content owner schedules only after demand and asset/device acceptance. |
| K1 | PARTIAL | Portable browser executable/output/native-dialog source repair; current independent DOM tests and in-app journey review. | QA executes/modernizes full CLI selectors/two-session/rematch flow; CLI was not run here. |
| K2 | PARTIAL | Multi-view synthetic screenshots, source suite, simulation JSON and this complete disposition matrix. | QA/AXO fill physical/live/network/long-session variants and clips. |
| K3 | EXTERNAL | Specific consenting novice/experienced phone/desktop study tasks and questions documented. | Operator recruits players; no invented sessions/results. |
| K4 | PARTIAL | Re-review fixed dropdown/label and terminal overlap issues; local metrics collect no telemetry. | Players/QA return sanitized observed defects, iterate with fresh participants. |

No source row closes an external requirement by implication. AXO-019 contains the next concrete owner actions; none of these review artifacts authorize V2 activation, rewards, a live rollout or a claim of AAA/device/accessibility certification.

AXO-021 follow-up: [status/counterplay review](reviews/arena-status-review.md) addresses modifier duration, visible epic gates, counter semantics/timing/occlusion, late-game learning and disclosure focus. It adds a focused 57,600-pair audit and two original raster assets. These extend source evidence for combat clarity, counterplay learning, phone UI and culture; the external acceptance column above remains open.
