# Arena multi-domain quality review

Date: 2026-10-23. Source base: `e0a78dd833aae37980967923c6b200ad14d2d681`; candidate implementation pinned in [AXO-019](../handoffs/AXO-019.md). Reviewer: Codex. Environment: Windows, in-app Chromium browser, loopback port 4333, invented memory-only Pet/gear. No live wallet, private production record, deployment or physical-device measurement.

## Findings and changes

| View/domain | Review result and response |
| --- | --- |
| Gameplay and attacks | Added no-clock repeated Dojo drills on the existing engine, all 12 move explanations and an exact damage/block/heal/energy breakdown. Both simultaneous attacks remain legal/resolved together; recoil, counter, liquidation and Photo Finish retain their existing meanings. |
| Repeated learning | Browser review found dropdowns resetting after each exchange. Legal choices now persist; cooldown/energy invalidation selects a new legal option. Named selects and focus/scroll restoration retained. |
| Combat receipt | Added pinned Last exchange inspection; source tests confirm no POST/state change, hidden-choice access or cosmetic-power injection. Live timers continue. |
| Result | At 320 px the old log covered the result's match tools. Moved terminal log access to a result button/dialog, then rechecked it in the browser. Result and report remain tied to frozen server outcome, including missed-turn loss. |
| Replay/report | Browser checked six-exchange report and Best block → exchange 2 seek. Added evidence-derived recorded moments and four highlight jumps; no lifetime/XP/reward claims. |
| Lobby | Practice visible at 320×740 and 390×844 before the Pet poster; actual measured button bottom 443 px at 320. Resume selection/active-entry locks covered in DOM tests. |
| Pet Build | Checked 320 px source view with exact V1 level/XP/equipment distinction and no page overflow. No XP allocation or NFT records changed. |
| Style Lab | Checked loaded 43-style catalog and 473 candidate tiers at 320 px, current fitted Preview labels and no page overflow. Existing pose/rig/grip tests retained. No new gear art or registrations. |
| Challenge Room | Checked explicitly empty board and solo practice/Dojo paths. Presence remains opt-in; no fake humans or external posting. |
| Tournament | Checked 320 px entry/empty view; replaced vague developer placeholder with roster/link guidance. Full real multi-user tournament was not rerun in the browser; existing service tests remain. |
| Settings/access | Browser checked environment/plain type/diagnostics; source tests cover key swapping, typing/dialog fences, local-only preferences, High/Low/reduced motion and mute equivalents. Full screen-reader/contrast/zoom/hardware acceptance remains open. |
| Rendering | Corrected high-refresh paint scheduling. Deterministic 144 Hz driver paints about 600 times in ten seconds at the 60 Hz budget, with 360-sample history and pixel cap. Actual local short sample: 58 Hz, p50 16.7 ms, p95 25 ms, p99 29.2 ms, JS draw p95 0.6 ms, 407,150 canvas pixels. Not a GPU/thermal/sustained FPS result. |
| Art | Generated Rooftop Dojo/Runeforge raster backgrounds, saved prompts, optimized/pinned 417,216 bytes and added default dimming. Same fitted actor/hand masks draw independently. Grayscale/physical phone/art-director acceptance still needed. |
| Audio | Retained AXO-018 receipt scheduling, original checked PCM, gesture/mute/mono/volume/lifecycle bounds. Browser console review recorded no warnings/errors; no new physical listening or latency claim. |
| V1 strategy | Fixed report-directory/cwd and seat-bias tooling; ran 10,800 heuristic fights. Aggregate Solar bot advantage flagged for investigation; no unapproved combat rebalance. |
| V2 sets | Offline audit validates 396 cases and all under-level rejections. All six roles have different bonus axes; small-percent integer rounding and defense/sustain need player evidence. Nothing activates V2 or proves NFT mappings. |
| Reliability/privacy | Required source suite retains verified-reader, account/view race, pending/ack, private replay, consent, fixed asset routing and resource-bound assertions. No new endpoint or player telemetry. |

## Gameplay/attack review checklist

- [x] Attack, block, counter, shield break, pierce, heal/cleanse, recoil, recharge, lineage specials and epic have readable source-backed descriptions.
- [x] Dojo outcomes/costs derive from the actual V1 engine; modified starting presets and unowned reference dummy are disclosed.
- [x] Counter return, receiver reactions, damage/block/heal/recoil/storm labels and original audio use the shared resolved-contact timing; current choreography regression tests pass.
- [x] Both seats and all 12 profiles retain finite paths and guarded contact; no early hit or opponent-choice reveal in source tests.
- [x] New receipt/replay/report controls are read-only and preserve frozen XP/numeric V1 gear/combat.
- [x] Fitted-only rig, rigid grip and finger/upper-thumb masks stay unchanged; no old costume fallback restored.
- [x] Readiness, unavailable epic, cooldown, energy, lock/pending and terminal conditions remain distinct.
- [x] Reviewed lobby, learning, build, cosmetics, board, tournament entry, result/log, report/replay and settings from multiple sizes/domains; fixed the concrete issues above.
- [ ] Human comprehension/feel, full all-family motion art acceptance, physical listening, live parity, long-session/device performance and competitive balance approval.

## Evidence

- [Desktop Dojo](arena-quality-dojo-desktop.png), [phone entry](arena-quality-phone-entry.png), [replay](arena-quality-replay.png), [result log](arena-quality-result-log.png), [local diagnostic sample](arena-quality-diagnostics.png).
- [Three seeded V1 runs](arena-quality-balance.json), [isolated set-role audit](arena-candidate-roles.json), [guide and art bible](../ARENA_QUALITY_PASS.md).
- Required check: PASS, 419 tests including 218 Arena, 41 contracts and ten source-preview tests. Final source/push/CI evidence is pinned in AXO-019; source tests and screenshots do not establish live acceptance.

All captured identities/gear are invented fixtures. The missed-turn practice finish was intentionally allowed while reviewing other views; it verifies honest timeout/result handling, not a successful user tutorial or player study. Browser-measured page widths equalled viewport at 320/390 px for reviewed views; browser controls are emulated, not physical mobile hardware.

## External acceptance packet

AXO: acknowledge the exact commit, reconcile host-only changes, read back all new modules/environment hashes/MIME and existing fitted/audio media, verify private Pet/XP/numeric gear parity and frozen entry behavior, then provide authorized release/rollback evidence. Keep deploy and V2 readiness separate.

Operator/QA: name actual Android, iPhone/Safari and desktop targets; run cold entry/network loss, five-minute High/Low traces, a 30-minute mixed session, phone/headphone listening, keyboard/touch/screen-reader/200% zoom/color-vision/contrast and all-family motion fit acceptance. Report device/browser/thermal context and defects.

Players: recruit consenting novice/experienced phone/desktop participants for practice → build → challenge → result. Record whether they explain simultaneous lock, energy, counterplay and outcome, plus observed friction/feel. Keep recordings/identities private; return sanitized findings. No study, concurrency baseline or production telemetry has been fabricated.
