# AXO Pet Arena — unlisted free-play beta

## Current release state — September 11, 2026

The live public frontend is **UI 1.9 revision 3 + travel-1 + clarity-1**, served as an authenticated unlisted free-play beta. The package/host adapter release identifier remains `1.5.0`; combat rules remain exactly `axo-pet-arena-1.2-review`. Matchmaking is enabled and stakes are disabled. This supersedes older opening summaries below without rewriting their historical release evidence.

Current verification: exact September 10 clarity-release hashes still match; the Arena suite passes **243/243**; the public page and `/api/arena/config` return HTTP 200; and 20/20 PM2 services are online. Real browser/device/touch/screen-reader/audio/fullscreen/FPS and first-time-player comprehension remain unverified. Production still uses the single-process JSON store; the reviewed SQLite/CAS and recovery work is source-only and not deployed.

Current process, gaps and recommended order: `review/2026-09-09-project-upgrade/PROCESS-UPDATE-2026-09-11.md`. Item-level ownership/status remains in `review/2026-09-09-project-upgrade/backlog.json`; the staged delivery view remains in `ROADMAP.md` there.

This project supersedes the *mechanics plan* in `../pet-pvp-mechanics`, but does not overwrite that earlier research or the guest Rift Battle game.

## Public beta · AXO.pet

Direct page: **https://axo.pet/arena/**. RA authorized this unlisted public beta on 2026-09-07. It is intentionally absent from website menus and the sitemap and carries `noindex, nofollow`. The page is public; gameplay requires the existing verified Hatchery wallet session and an active wallet-bound Pet. Connect in Hatchery first, then return to Arena. No synthetic profile chooser or private portal access is exposed on the website.

The feature flag is `AXO_PET_ARENA_MODE=free_play` on `axo-app` only. Production Arena state is separate at `axo/state/pet-arena/free-play.json`; lab state was not copied. No wagers, funds movement or Hatchery XP/Pet/NFT/gear writes are part of Arena. Only `axo-app` was restarted; no public-asset build, website menu/sitemap change or other service restart occurred. Deployment proof: `review/public-beta-20260907/PUBLIC-BETA-RELEASE.json`.

## Private lab preview

Private OpenClaw portal: **AXO · Pet Arena**, port **4318**. The portal’s access URL is available in Control UI → Portals. Direct local URL: `http://127.0.0.1:4318/arena/`.

1. Choose a clearly labelled review Pet. These are synthetic profiles, not production Hatchery accounts.
2. **Pet build:** assign stats, replace any of the four equipped moves, learn/upgrade the epic, save.
3. **Practice vs bot** is immediately playable. The server precommits the bot’s move before your submission.
4. **Challenge a player:** share the invitation with another browser profile/device that can reach the same preview. Separate browser contexts give independent identities; ordinary tabs in the same context share an identity.
5. **Tournaments:** create a 4/8/16-player roster, invite equal-level Pets, then seed/start. Each paired player checks in to begin their match. Winners advance automatically.

Keyboard: 1–4 selects the corresponding move. Sound is opt-in. Reduced-motion preference is respected. The server clock does not pause when a tab sleeps or disconnects.

## Implemented

- Canonical six AXO lineages, stat allocations, Hatchery XP thresholds, ten regular moves each, arbitrary four-slot loadouts, skill ranks and six conditional epics.
- Offensive/defensive degen moves: Rug Pull, Reversal, Wen?, Pepe’s Breakout, Diamond Hands, Touch Grass and lineage signatures.
- Stateful authoritative PvP, hidden simultaneous commitments, server validation, cooldowns, energy, reconnects, deadlines, concessions, timeout forfeits and replay receipts.
- Persistent, separately stored Arena builds/rooms/rosters; fixed tournament snapshots, check-in deadlines, automatic advancement and bounded draw rematches.
- Six **ImageGen 2** eight-pose sprite atlases, a generated trading-floor stage, frame playback, lineage tools/reactors, move-specific projectiles, hit feedback and audio cues.
- Mobile/desktop interface, readable move effects, exact canonical level portraits, level-scaled battle rigs and private spectating by invitation.
- A production host adapter in `../../src/game/pet-arena.js`, connected to the existing verified wallet-session codec and a read-only Hatchery snapshot. It does not accept client-provided XP, lineage, ownership, health or battle results.

## Activation status

**The direct-link public beta is activated on AXO.pet.** The earlier `review/v1.4/BUILD-RECEIPT.json` and private-preview activation receipt remain immutable historical milestones. This later user-authorized release activates the existing authenticated website adapter without adding a menu entry. The parent application mount remains conditional on the exact free-play flag. Browser interaction remains unverified under the established navigation-policy restriction; public HTTP/assets, authorization, code and integration tests are verified separately.

The host adapter uses `Hatchery · AXO.pet`, never the AXO Vision Epoch page. Its existing authenticated-session path is tested with realistic canonical fixtures; no real user's wallet was impersonated or used in QA. Level-10 portraits use the canonical visual-layer projection; levels 1–9 use their original level art. Animation rigs are authored from the six level-9 lineage references; they are **not 60 separately animated growth skins or an animation of every possible wardrobe combination**. Existing gear, care/research trees, Pet XP, Epoch XP, ledgers and reward contracts are not written by Arena.

**No wagers, custody, payouts or tournament entry fees exist in this build.** All `stakesEnabled` responses are false. The v1.3 task did **not** run the parent application build, regenerate public assets, change any environment/configuration, or restart production. The earlier v1.2 main-build disclosure remains in its immutable receipt.

## Verification

From this directory, using the parent AXO dependency installation:

```sh
node --test tests/*.test.mjs
node verify-replay.mjs review/v1.3/synthetic-replay.json
node balance.mjs
```

These unit/service tests and local replay checks do not launch a browser. The existing 4318 preview is already running; do not start another listener or copy the historical portal origin from old receipts. Browser harnesses are retained for a future authorized run only. Do not use raw Playwright, a different browser or an alternate network route to work around the current navigation-policy denial. Reports and historical screenshots are under `review/`; they do not establish current live visual verification. Private preview state is excluded from release bundles and static serving.

Across revisions, 32,400 simulated battles were run. The final **1.2** calibration and unchanged-rule holdout each ran 7,200 battles, with different seeds, mixed allocations/loadouts, six level tiers and three heuristic policies. Holdout aggregate lineage score rates ranged **44.71–55.73%**; eight of 90 matchup/tier cells missed the provisional 35–65% gate. Draw rate fell from **36.42% in the earlier rules to 1.24%** with the disclosed Photo Finish rule. Mean bout length was **8.99 exchanges**. These are bot diagnostics, not proof of optimal-play or human balance. See [DESIGN.md](DESIGN.md) and `review/balance-260910.json`.

## Asset provenance

Generated with the **OpenClaw built-in image tool**, explicitly selecting `openai/gpt-image-2`; no CLI/API-key fallback. Prompts and reference roles: [assets/prompts.json](assets/prompts.json). Original PNGs and two white-background keying revisions: `assets/source/`. Runtime alpha WebP atlases, frame rectangles and SHA-256 hashes: `assets/runtime/manifest.json`.

`build-assets.mjs` performs technical color-keying, removes disconnected export specks, locates frame gutters and packs normalized 512×512 cells into 2048×1024 atlases. It preserves dark costume pixels and full-body anchors. Keep source masters when revising the art.

## Boundaries and next release work

- This is a free-play review, not a wager-ready production release. Exact loadout/level matchups, extreme-stat strategies and prize-tournament tiebreak rules need human sessions and further validation.
- Tournament v1: one rematch for a normal draw; a second draw eliminates both. Double no-show eliminates both immediately. An entire bracket can therefore end without a champion. This rule is displayed before registration; replace it with a tested competitive tiebreak format before prize tournaments.
- Single-process JSON store with atomic replace, rollback-safe deadline ticks and bounded retention. It is not a multi-worker coordinator. Shared-store concurrency, power-loss/fsync durability, capacity/load testing and operational monitoring remain unproven.
- The server is trusted to resolve free-play matches; the receipt hash is a replay fingerprint, **not** a signature, onchain proof or independent anti-cheat audit.
- Future AXO betting: separately scoped exact-token escrow, two explicit deposits, immutable match/build/ruleset commitments, published draw/refund and disconnect policies, bounded settlement, replay/dispute handling and no operator choice of winners. Do not repurpose Epoch/referral vaults or enable money based on this review.

## v1.3 Playtest Continuity

- Lobby history now shows up to 50 recent entries with opponent, win/loss/draw, reason, completion date and casual/practice/tournament distinction. Targeted incoming rematches appear here too.
- After a completed battle, **Watch replay** reconstructs the initial frozen builds and every resolved exchange through the unchanged combat engine. Previous/Next, Autoplay/Pause, both fighters' moves, HP/energy/charge, blocked/healed/counter/recoil/liquidation results and reduced-motion rendering are available. Keyboard focus follows the current replay position. Sound remains opt-in; replay does not enable it.
- **Export replay JSON** is participant-only and available only after completion. Portable files contain rules, builds, exchanges, dates, practice distinction and outcome; they omit names, Pet IDs, wallets/owner keys, invite IDs/URLs, art/layers, pending choices, cookies and original room receipts. Keep exports private if exact builds/dates are sensitive. There is no server-side replay upload.
- Local deterministic check: `node verify-replay.mjs /path/to/axo-arena-replay.json`. Unknown schemas/rules, extra fields, invalid moves/effects/outcomes and fingerprint mismatches are rejected. A fingerprint is **not a signature, independent verification or audit**. A re-authored consistent document can receive a new fingerprint. Local verification cannot prove server honesty, actual timestamps, consent, concessions or no-shows.
- **Invite opponent to rematch** creates a separate five-minute, recipient-bound invitation only after a completed casual PvP match. It does not restart the old room. The inviter snapshots a fresh eligible build at invitation; the original opponent snapshots theirs on explicit acceptance. Both original Pet identities must match, levels must remain within one, and busy entries are rejected. Builds lock at entry. The recipient may decline, the inviter may cancel, and outsiders cannot accept. Practice and tournament battles cannot use this endpoint; bracket draw-rematch authority remains unchanged.
- Deadline/expiry/retention ticks now roll back all in-memory mutations if persistence fails, including bracket advancement. A request first commits its due clock tick, then its own mutation atomically; a rejected late action does not undo a successfully persisted deadline. Failed moves are never assumed saved by the UI. Persistent connection/save feedback offers retry; successful polling clears it.
- New synthetic review identities persist before their cookie is acknowledged, so immediate restart does not lose a newly created review Pet.
- Retention: newest 500 completed standalone rooms / seven days; newest 100 terminal tournament groups / seven days, removed with their rooms; unreferenced profiles capped at 1,000 / 30 days. Active rooms, registration/playing tournaments, their bracket rooms and referenced profiles are protected. Legacy profiles without activity dates start their retention clock on first new-runtime tick. No Hatchery records are read or written by retention. History is deliberately temporary; export before expiry.
- The state ruleset remains v1.2 and prior room receipts are not recomputed. `review/BUILD-RECEIPT.json` and prior v1.2 bundle stay immutable. Private prechange state/source backups live under `review/v1.3/` with private filenames and are excluded from the source bundle and static serving.

Browser QA must use a separate synthetic state/server; do not point `browser-continuity.mjs` at the parent's preserved preview. `browser-restart.mjs` creates and removes a dedicated synthetic store under the review directory. No wallet impersonation is involved.

## v1.4 Challenge Room — tested private-review source

Lobby → **Challenge Room** opens an authenticated in-Arena board. Create a casual challenge, then explicitly **Post to Challenge Room**. Creating does not post automatically. The existing waiting-room screen also has Post/Remove controls. **Remove from Challenge Room** removes discovery only: the same challenge, locked build, busy status and original five-minute deadline remain. Optional copy-link sharing is manual; no external social/community publication occurs.

Cards show the Pet display name, canonical lineage/class, level, and exact already-public local canonical portrait when the stored art matches the allowlist (otherwise a neutral icon). They show posting/expiry times, free-play/no-AXO clarity, and an explicit **Accept challenge** action. Acceptance immediately starts the existing room. The board never fetches invitation detail to render cards. Own-card detail opens the existing waiting room. No text/post composer, callouts, links, uploads, chat, handles or extra media are accepted. Suspicious link/handle/address/identity-shaped names use “Arena Pet”, never an ID; ordinary names remain intact. This minimization is not a semantic guarantee against every possible personal detail in a pre-existing display name.

The board response omits owner/wallet keys, genesis IDs, exact XP, loadouts/builds/ranks, choices, receipts/replays, invitation-recipient state, cookies/headers and external URLs. Portrait paths are exact canonical local paths; no arbitrary art/wardrobe URLs or layers are projected. Room IDs remain internal action capabilities, not visible names. Existing invitation/detail/spectating semantics are unchanged: someone who knows a challenge ID can still open its authenticated full room detail under the prior rules. Discovery therefore is **not a new confidentiality boundary for existing room detail**. Do not post if that existing invitation-level visibility is unsuitable.

Only the owner with the exact entered Pet can post/remove a normal casual waiting challenge. Practice, brackets/check-ins, nonwaiting states, recipient rematches and malformed state fail closed. Accept reuses authoritative within-one-level, distinct Pet/genesis and busy gates; self-accept is rejected. Parallel accepts cannot occupy two second seats in the single-process service. Successful same-Pet board acceptance retries acknowledge the original result without creating another battle. Post retries do not bump the timestamp. Remove/repost can reorder the card, never extend challenge expiry. Unknown/stale cards return a useful error and the board refreshes. The UI polls roughly every 3.4 seconds and disables visibly expired cards; the server, not the screen, decides availability.

**Retention/capacity:** newest 50 valid posted active rooms, deterministically sorted by posted time, creation time and room ID. Metadata lives only on existing bounded rooms (`challengePostedAt` plus successful `challengeAccepted` acknowledgment); no second feed, archived posts or database. Existing 2,000-room capacity and v1.3 terminal/profile retention remain unchanged. Accept/start/cancel/expiry/remove makes a card immediately absent from server listings. Metadata is removed with its underlying room, never replayed as a historical feed. Compatible old waiting rooms default unposted and can opt in; invalid legacy shapes are not advertised or silently repaired. Restart preserves saved opt-in/removal and the original deadline; due expiry and all new actions retain v1.3 rollback-safe atomic persistence. Neither state version nor old receipts are rewritten.

Verification (separate synthetic state only):

```sh
npm test
npm run test:challenge-room
```

The v1.4 harness starts its own temporary loopback listener and synthetic store, restarts only that listener, and removes the store on exit. It does not use port 4318 or the parent process. Evidence is in `review/v1.4/`; bundle uses an explicit allowlist excluding every private state/backups/cookie/runtime log. Current live browser verification is BLOCKED_BY_NAVIGATION_POLICY. Historical harness reports are retained as provenance, not as permission for another run or proof of current live interaction. No browser harness may be used as an alternate route around the denial.

No combat/catalog/balance, image asset, tournament/replay rules, production adapter/mount, parent build, environment/config, PM2, portal, gateway, wallet/RPC/value movement, Hatchery/Pet/NFT/XP/gear/identity ledger or public navigation changes. This is not public activation, real-wallet testing, an independent audit, multi-worker safety, fsync/power-loss durability, load testing or proven competitive balance. Parent handoff: `review/v1.4/PREVIEW-HANDOFF.md`.


## Game UI 1.5 — 2026-09-07

The Arena now uses a viewport-filling game shell. The ready room centers the existing animated AXO fighter, with a compact action rail and four-slot loadout dock instead of a large landing-page hero and action cards. **Find a rival**, **Practice**, **Invite player**, **Tournaments** and **Match history** remain the same server-backed flows.

**Pet workshop:** exact canonical appearance plus an existing-lineage battle rig; compact attributes with remaining point budget; four equipped slots; offense/defense/epic collection tabs; rank/refund controls and explicit Save build. On narrow screens, Loadout & epic / Stats tabs keep the setup panels manageable. Current stat caps, XP/skill eligibility and entry locks remain server-enforced. No Hatchery XP, care skills, Pet identity, NFT or gear is edited here.

**Combat:** viewport-filling stage, overlaid health HUD and hard-limit clock, exchange indicator, four compact attack slots, energy pips, epic charge and Gas Station controls. Keyboard **1–4** selects a regular move, **E** the epic, **R** Gas Station; forms, open dialogs, replay, repeated keys, modifiers, reveal windows and disabled controls do not submit actions. Both hidden commitments still resolve together. Full effects remain accessible through move descriptions/tooltips and the expandable combat log. Conceding a playing battle now asks for confirmation. Results retain replay/export/rematch controls without restarting a battle automatically.

The **⛶** control requests native fullscreen only after a user click, with an explicit exit state and a fallback message when unsupported. The game already fills its available viewport without this API. Sound remains off until explicitly enabled; reduced motion removes CSS animation and preserves the existing renderer setting. Mobile/landscape rules and safe-area padding are included. Canvas backgrounds use aspect-preserving cover; effects scale with stage height; the canvas no longer reallocates on every frame.

This is a frontend-only release: runtime backend/config version remains 1.4.0, while the page metadata is `1.5-game-ui`. No backend/service restart, website-menu or sitemap change, balance change, image generation or private-state migration occurred. All existing art remains byte-identical. Cache-versioned HTML loads the new frontend modules/styles.

Verification: **73 automated tests passed**, including **10 non-browser DOM/event, CSS-contract and canvas-command tests**. The tests exercise real UI event handlers against synthetic service fixtures using the existing installed DOM parser; they do not launch a browser, load images from a network, render screenshots or prove visual layout. Browser navigation remains policy-blocked, so visual fit and human play feel are explicitly unverified. Public HTTP readback matches the published HTML/JS/CSS/renderer hashes. Browser harness selectors were maintained for a future authorized run only and were not executed. Evidence and a state-free source bundle are under `review/v1.5/`.


## Visual game UI 1.6 — 2026-09-07

Frontend-only follow-up to UI 1.5: icon-led ready-room mode menu, illustrated inline-SVG move icons, tactile attack slots, exchange-count cooldown badges, locked-choice labels, epic charge ring, segmented health/energy HUD, field-guide dialog and refined workshop/challenge/history/bracket surfaces. The guide warns that opening it does not pause a live battle. Closing it restores focus when the original control still exists. Shortcuts remain disabled in dialogs and input controls. Menus do not create battles automatically.

Animation uses the **same eight original atlas poses**, not new hand-drawn frames. A pure time-based motion sampler supplies breathing, anticipation, lunge, recovery and victory transforms; pose changes cross-fade over 90ms. Attack trails, impact rings and up to 14 deterministic particles per fighter distinguish attacks from guard/recharge effects. Damage text derives only from resolved exchange receipts. No random gameplay, fake damage or simulation writes were introduced. Rendering targets 60 fps using requestAnimationFrame; actual device frame rate is unmeasured. Hidden documents skip painting; stopped/disconnected renderers stop scheduling; total canvas allocation is bounded to 1.8 million pixels. Reduced motion is read live from the system preference and disables transforms, blends and VFX. The source pose count remains eight and must not be advertised as a newly drawn 60-frame sprite sheet.

Verification: **77/77 tests**, no failures/skips, including 14 UI/animation/canvas contracts. The animation tests cover finite values across phase samples, mirrored lunges, source-pose bounds, reduced motion, blending, render/particle budgets, hidden-tab suspension, stopping and immutable authoritative combat state. UI tests exercise icon menus, guide close/focus behavior, no menu service writes, dialog keyboard guard, move locking, loadouts, rank gates and replay/history. Final HTTP source hashes match the four published frontend files, auth is required, private paths stay inaccessible and both health checks return 200. All 20 process identities/restart counters and 18 artwork files are preserved. No backend changes, restart, wallets/funds, Hatchery writes or website menu/sitemap additions.

Evidence: `review/v1.6/BUILD-RECEIPT.json`, `PUBLIC-VERIFICATION.json`, `test-results.tap`. Prior release evidence stays unchanged. Browser navigation remains policy-blocked; no browser or alternate driver was launched. Real screenshots, touch fit, audio/fullscreen operation, device FPS and human play feel remain unverified. This is a visual-polish upgrade, not a claim of AAA production certification.


## Energy HUD 1.7 — 2026-09-07

Energy was already enforced by the original combat engine: start 6/10, recover 2 after every resolved exchange; paid attack and defense moves cost 3–4; Market Order and Diamond Hands cost zero; recharge restores up to 4 total without attacking or shielding. Builder's first two successful blocks may add one energy. Cooldowns and epic conditions are independent gates. This release does not rebalance those rules or invalidate old replays.

Both fighters now have an accessible energy meter beneath health. The command dock includes a prominent reactor bar, current/cap readout, recovery rules and spend preview. Move badges explicitly label FREE, energy cost, shortage or cooldown. Hover/focus updates a before-spend/base-recovery forecast; conditional Builder refunds are labeled as conditional. Selecting a move remains one explicit commitment, not a new preview-confirm workflow. Low energy highlights the panel without trapping the player: free basics and recharge remain available when server-legal. Workshop slots display their move costs. Values derive from authoritative fighter state and frozen skills, not a second energy simulation.

Validation: 81/81 tests, zero failures/skips. Four new mechanics tests cover cap/recovery, paid attack and defense costs, insufficient-energy rejection, free fallbacks and recharge vulnerability. DOM assertions cover meters, cost labels and forecasts. Public entry/app/styles hashes match and both health checks return 200. No backend/renderer change, restart, Hatchery writes, wagers or website-menu additions. Browser visual QA remains policy-blocked and unperformed. Evidence: review/v1.7/BUILD-RECEIPT.json and PUBLIC-VERIFICATION.json.


## UI 1.8 released — integrated combat presentation — 2026-09-07

Live at https://axo.pet/arena/ on the already authorized authenticated free-play beta. UI1.8 replaces the oversized separate console with a unified battlefield HUD: mirrored HP/energy, central clocks, over-field four-move dock, epic/recharge and noncommitting move inspection. No website menu/sitemap entry was added.

All12 moves have distinct presentation envelopes and effects, with six lineage signature/recovery/epic geometries. Four Emerald clips (Market Order, Rug Pull, Pepe’s Breakout and Reversal) use16 additional authored poses; other combinations retain original lineage rigs with procedural motion/VFX. The parent-prepared transparent atlas is additive; original atlases and canonical Hatchery artwork are unchanged. Actual receipt damage/block/heal/counter/recoil/storm drives feedback. Opt-in sound, live reduced motion and bounded image/RAF/pixel/voice budgets remain.

Independent review exposed stale-request races, reconnect history replay and a completed-log overlay regression. The final release fixes those plus terminal-attack obstruction: view/request generations, monotonic matching revisions, silent resync, accessible completed logs and a bounded final reveal before the large result card. Outcome/clock/input authority stays immediate and server-owned.

Proof:136/136 root and staged Arena tests; all15 independent regression checks; all14 public HTTP/source/auth/private-path/health checks pass. Backend1.4.0 and combat axo-pet-arena-1.2-review are unchanged. No Arena service restart, config/flag change, parent build, live authenticated gameplay write, wallet/RPC/funds/wager/Hatchery XP/identity write occurred. All20 services were online; the unrelated whale-flow worker changed its PID/restart count concurrently, so whole-estate PID preservation is NOT claimed.

Browser/compositor/touch/native audio/fullscreen/device-FPS/human play QA remains NOT_PERFORMED_POLICY_BLOCKED. Offline DOM/Canvas/CSS and HTTP checks are not visual proof or AAA certification. Evidence: review/v1.8/RELEASE-RECEIPT.json; original review findings and repair evidence are preserved.


## UI 1.9 / revision 3 — five-lineage authored clips — 2026-09-08

Published additive signature and epic artwork for Sapphire, Amethyst, Solar, Rose and Midnight: 40 new painted poses / ten four-pose clips in five lazy-loaded transparent atlases. Four Emerald clips /16 existing added poses remain byte-identical. Remaining move/lineage combinations retain original rigs and procedural motion. Existing UI1.9 impact-2 presentation, matchmaking/presence/countdown, backend1.5.0 and combat axo-pet-arena-1.2-review are preserved. Cache query is ui=1.9&rev=3. No new website menu or route.

Independent review passed with no blockers and one P3 cosmetic ray-tip remnant. Parent removed only that exterior Amethyst recovery fleck plus its antialias fringe; decoded pixels everywhere else remain identical. Original findings/receipts are preserved. Final staged and promoted-root suites pass212/212; all8 immutable independent probes pass after the repair; all23 public source/asset/auth/privacy/health checks pass.20/20 services online; no task restart/config/state write, although the unrelated whale-flow worker restarted concurrently.

The supplied new artwork has broader/chibier proportions and some orientation differences; preserved short crossfades can ghost. Offline inspections/tests are not browser or in-game screenshots. Real browser/mobile/touch/native audio/fullscreen/device FPS/play feel remain NOT_PERFORMED_POLICY_BLOCKED. No AAA certification or all72-authored-clips claim.

Canonical evidence: review/v1.9/FIVE-LINEAGE-RELEASE-RECEIPT.json. Public originals and private source master are preserved; only the explicit static allowlist was promoted.
