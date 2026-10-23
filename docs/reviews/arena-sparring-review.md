# AXO-022 — Research-led mechanics review

Base: `2dd4bd05b579cc5009300da143544a4fada080e5` (AXO-021). [Research, implementation and audit interpretation](../ARENA_ADAPTIVE_SPARRING.md). This follows the existing [44-point roadmap](../ARENA_QUALITY_CHECKLIST.md); its live/device/player gates remain open.

| Domain | Finding | Change / evidence |
| --- | --- | --- |
| Tactical opposition | Static bot favored raw values and ignored rival behavior/interactions. | Opt-in one-exchange actual-engine evaluation and last-four-resolved-type weighting; no hidden-choice access. |
| Variety | Same bot personality did not encourage trying different responses. | Three level-aware style builds, declared tendencies/lessons and safe seeded variation. Styles are not difficulty labels. [Chooser](arena-sparring-chooser.png). |
| Recovery | Base healing could be overvalued during Liquidation; available healing was unused in Reader reference runs. | Actual capped/halved/floored engine result used; Reader audit has 666 heals versus zero. Dedicated half-heal regression. |
| Defensive play | Some defense/counter choices remain rare despite broader usage. | Recorded counts and future defense-economy hypothesis; no unsupported V1 rebalance. Guardian win rate falls in this finite audit. |
| Fairness | Replanning after a player commits would undermine simultaneous play. | Bot commits once at entry/after resolution. A throwing human-pending getter verifies no read, including when a new bot commitment is needed; repeat calls preserve it. |
| Authority | AI must not become an XP/gear/ownership input. | Strict practice-only style enum; verified own snapshot frozen, reference NPC gear zero, all preview/V2 locks unchanged. |
| Tutorial correctness | Guided replay bot Pet labels inherited player gear while its build was gear-free. | Shared bot factory clears new/replayed NPC equipment labels, revision and stats. Existing records stay untouched. |
| Compatibility | Changing an existing fight's opponent policy would make rollout surprising. | Opt-in optional metadata only; ordinary/guided/old rooms keep legacy selection, pending moves survive load. |
| Replay | Policy changes must not invalidate historical combat verification. | Full service fight exports verified V1 replay; browser watched initial/final frames and original rules notice. No replay schema/ruleset change. |
| Entry UX | Need deliberate style selection, duplicate-click and stale-view fences. | Radio chooser + Start sparring, local-only cancel/focus restoration, pending button disabled and late result cannot replace another view. |
| Header/layout | First rival badge was covered by the absolute stage. | Moved into the existing top strip rather than adding a stage sibling. [Result](arena-sparring-result.png) preserves fitted actors and gear masks. |
| Mobile | Long descriptions could hide controls or overflow. | 390/320px browser widths have matching page scroll widths; dialogs 362/292px, Start bottom ~760/664px after keyboard scrolling. Native modal scroll and controls reachable. [Phone](arena-sparring-mobile.png). |
| Capacity | More thoughtful decisions add server work. | Hard maximum 36 engine evaluations per new bot decision, no API/model/GPU dependency. Player/room/load limits retained. Sustained host-load acceptance still needed. |
| Validation | Need consistency and gameplay evidence, not only screenshots. | 455 required tests and [3,456-game audit](arena-sparring-audit.json), with 1,728 identical mirrored outcomes and source hashes. |

Browser review used invented loopback identity, 17,950 exact XP and fixture V1 equipment, with no wallet/ledger/chain. It opened the chooser, played a six-exchange Receipt Reader match with attack/guard/burst and some real-clock missed turns, then reviewed replay and Spar again/cancel. This is not a human difficulty study. Browser console warnings/errors: none. No new art, geometry, mask, sound or V2 behavior was introduced.

Local suite passes 455 tests: 236 Arena standalone + 15 engine, 41 contracts, 13 source-preview and the existing shared suites. Exact source/publication/CI pin is recorded in [AXO-022](../handoffs/AXO-022.md). Remaining acceptance: authenticated host input/DTO/state adapters, normalized-store rollback/readback, CPU/load, physical phone/readers/audio, and consenting novice/experienced playtests. Ask players to identify each rival's tendencies, exploit a recovery window, change a repeated pattern and explain a missed/blocked attack. Record observations, not private receipts or wallet mappings.
