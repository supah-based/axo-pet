# Revised AXO Arena design, implemented review rules

## Product loop

**Hatchery grows the Pet. Arena expresses the build.** Existing verified Hatchery activities remain the only source of Pet XP in this release. Arena neither mints XP nor changes care/research skills, research trust, Epoch standing, wallet balances or gear power. Free respec between entries encourages testing; a challenge/roster snapshots and locks the chosen build.

## Timing and combat

- A battle is one bout of at most **180 seconds**, with at most **14 exchanges**. Tournament rounds contain separate bouts; a whole tournament is not limited to three minutes.
- Each exchange gives both players **10 seconds** to choose in secret. Both choices lock before reveal; a committed move cannot be changed to counter a newly seen choice.
- A **1.8-second** reveal window separates exchanges. Earlier commitments may shorten the match but cannot extend its deadline. Clock enforcement lives on the server and continues across refreshes, disconnects and process restart.
- Missing a turn selects Gas Station. Three consecutive missed turns forfeit; double absence draws. A challenge/check-in expires after five minutes, outside the actual battle clock.
- Shields and healing resolve before incoming attacks. Rug Pull strips up to its stated shield amount and an existing attack buff; it never touches actual tokens. Both committed attacks land. A double KO triggers the published **Photo Finish** rule: compare remaining HP before zero-clamping as a proportion of each Pet’s max HP; the smaller proportional overkill survives at 1 HP. Exact equality draws. This is calculated with integer cross-multiplication, never a random or hidden-initiative tiebreak. DEX orders the visual reveal, while also scaling the relevant lineages' attacks; it does not secretly grant extra turns.
- Shields last one exchange. Reversal counters only damage it actually blocked, up to its stated cap. Healing is capped at max HP. No stun loops, random misses, random critical hits or live-price multipliers.
- From exchange 10, **Liquidation** deals 6 unavoidable damage to each Pet, then +4 each exchange. Healing is halved. At the 14-exchange or 180-second limit, higher remaining HP percentage wins; exact equality draws. Photo Finish resolves unequal double KOs; exact proportional ties still draw.

## Growth and stats

Canonical level thresholds: **0, 40, 100, 180, 280, 400, 550, 730, 940, 1200 XP**, levels 1–10. These are read, not recomputed into the live ledger.

- Six starting allocation points, then **+2 per level**. Point cost is one up to stat 16 and two above 16.
- Stat caps: 14 at levels 1–3, 16 at 4–6, 18 at 7–9, 20 at 10.
- Every lineage starts at **10 in all six stats**, total **60**. Player allocation, stat-scaling pairs, move utility and bounded passives create the differences; no lineage is born with extra health. STR = strength; DEX = dexterity; CON = constitution; INT = intelligence; WIS = wisdom; CHA = charisma.
- Max HP = round(112 + 3 × (level − 1) + 1.5 × (CON − 10)).
- Direct damage = round(move power + 0.35 × (level − 1) + 0.55 × weighted stat deviation). A lineage's two attack stats are weighted 65/35 relative to 10.
- Shields gain round-compatible 0.35 × positive CON deviation; heals gain 0.35 × positive WIS deviation. WIS reduces direct damage by 0.2% per point above 10, capped at 2%.
- CHA increases the Ghost signature's next-exchange weaken strength; rival WIS resists it. Weaken caps at 12%. Other lineages' CHA usefulness depends on their listed attack scaling; not every stat is equally good for every lineage.
- Energy starts at 6, caps at 10, regenerates 2 per exchange. Gas Station has no damage/shield and restores another 2: **4 total**, subject to cap. Cooldowns count intervening exchanges.

## Four of ten, plus an epic

All lineages share these comparable move budgets, with lineage attack scaling and two signature variants. **Any four unlocked regular moves** may be equipped; Market Order and Diamond Hands are not mandatory slots.

| Move | Unlock | Base effect | Cost / cooldown |
|---|---:|---|---|
| Market Order | 1 | 19 damage | 0 / 0 |
| Diamond Hands | 1 | 22 shield | 0 / 0 |
| Rug Pull | 1 | 18 damage, remove up to 10 shield and existing attack buff | 3 / 2 |
| Reversal | 1 | 13 shield, counter up to 12 actually blocked damage | 3 / 2 |
| Wen? | 2 | 10 shield, 2 extra energy | 0 / 2 |
| Pepe’s Breakout | 2 | 31 damage, 6 self-recoil | 4 / 2 |
| Touch Grass | 4 | Heal 23, cleanse existing weaken | 3 / 3 |
| Exit Liquidity | 4 | 22 damage, 50% shield bypass | 3 / 2 |
| Lineage attack | 6 | One budgeted signature below | 3 / 2 |
| Lineage recovery | 8 | 13 shield + 10 heal, lineage-specific name | 3 / 3 |

Trees present offense and defense as two named lineage branches. XP unlocks the regular move nodes automatically; **one skill point per level after level 1** upgrades the player's selected nodes. Rank I costs 1; Rank II requires Rank I and costs another 2. Each rank adds 2 to nonzero damage/shield/heal components. Budgets and level restrictions are checked again on the server. Hybrid builds are allowed.

An epic is a separate button, never one of the four slots. Learning costs 1 point at level 6; mastery costs another 2 at level 10. Base effect: **35 damage + 8 shield**, with the same capped scaling. It requires 100 charge, the lineage's condition, and an unused epic. Normal attacks earn 18 charge, other non-epic actions 12; taking direct damage adds 8. Charge caps at 100. Using the epic spends it and is once per bout.

## Lineages, readable advantages and costs

| Lineage | Attack scaling | Signature / recovery | Epic condition | Bounded passive |
|---|---|---|---|---|
| Emerald Protocol Builder | INT / CON | Liquidity Lock: 20 damage + 5 shield / Compound Copium | Proof of HODL: block in 2 exchanges | First 2 blocks restore 1 energy |
| Sapphire Chain Courier | DEX / WIS | MEV Sidestep: 21 damage + 30% bypass / Bridge Back | Finality Express: use 3 different equipped moves | Every third attack bypasses 2 shield |
| Amethyst Ghost Crew | INT / CHA | Ghost Candle: 20 damage + 10% next-exchange weaken / Priced In | Shadow Fork: damage in 3 exchanges | First 3 attacks into a non-attacking rival gain 2 damage |
| Solar Momentum Racer | STR / DEX | FOMO Candle: 28 damage, 4 recoil / Dead Cat Bounce | Send It: attack in 2 consecutive exchanges | Consecutive attacks gain 1 damage; support resets streak |
| Rose Signal Riot | CHA / WIS | Narrative Pump: 21 damage + 3 next-exchange attack buff / WAGMI Wave | Cult of the Hoodie: heal/block in 2 exchanges | First 3 successful support exchanges grant a 3-damage next-exchange attack buff |
| Midnight White-Hat Unit | INT / DEX | Receipt Check: 21 damage, strip 6 shield and existing buff / Patch Tuesday | Exploit Denied: attack an attacking rival twice | First 3 attacks into a shield gain 2 damage |

No rarity or cosmetic item adds power. Emerald trades tempo for resilience; Sapphire pays energy for bypass; Ghost must predict a non-attacking move; Solar's burst hurts itself; Rose's buffs expire and can be purged; Midnight gains little into unshielded attackers. These are intended tradeoffs, subject to test results rather than assumed perfect balance.

## Likeness and animation

Six ImageGen 2 atlases, eight key poses each: idle, breathing idle, wind-up, attack, defense, hit, epic machinery, victory. Their reference roles are **character likeness and canonical lineage equipment**, sourced from the six level-9 Hatchery scenes. Cream axolotl body, green eyes, pink branching gills and tail remain recognizable. Runtime animation combines key poses with movement, effects and damage feedback—not just a still portrait being renamed.

Emerald uses its orb/reactor, Sapphire the routing rings/node machine, Amethyst the hologram/ghost projector, Solar its scanner/turbine, Rose the wand/amplifier, Midnight its tablet/gyroscopic scanner. Rug Pull sweeps a red floor effect; Pepe’s Breakout fires a rising green candle; epics show each actual generated machine pose. Canonical current-level art is also shown separately; the review does not pretend it generated all 60 growth skins or every wardrobe overlay as animation.

## Challenges and rosters

Challenge links are unpredictable identifiers, not wallet addresses. Only the two authenticated players can submit moves. An invited viewer can spectate but never sees a pending move. Casual challenges require levels within 1; tournament rosters require exactly equal levels. Builds freeze at entry; XP growth outside the Arena affects the next entry, not an ongoing bout.

4/8/16-player rosters close before cryptographic random seeding. This fixes pairings, not combat outcomes. Hosts cannot submit winners. Each match has a five-minute ready check. Concessions/no-shows advance the opponent. A normal draw creates one rematch; a second draw eliminates both and can create a bye. Double no-show eliminates both immediately. All of these v1 rules are disclosed before joining. No pot is associated with a roster.

## Balance evidence and remaining gates

Final ruleset **1.2**: 7,200 calibration + 7,200 frozen-rules holdout battles; 32,400 simulations across the full iteration history. Holdout score = win + half a draw: Emerald **44.77%**, Sapphire **50.25%**, Amethyst **53.08%**, Solar **55.73%**, Rose **44.71%**, Midnight **51.46%**. Mean **8.99 exchanges**; 3,989 epic uses; **1.24% draws**. Eight of 90 matchup/tier groups fall outside 35–65%, so not every matchup meets the provisional target.

The earlier simultaneous-KO rules produced **36.42% draws**. Photo Finish reduced that sharply without dropping either committed attack or introducing random results. Moving all base stats to 10 and bounding the lineage passives reduces inherited stat advantages. Full source hashes and per-matchup results are retained in `review/balance-260910.json`, with earlier revisions preserved separately.

This is a playable **free-play review**, not a declaration of finished competitive balance. Especially test level-1 Builder versus Racer and the level-8 support matchups with humans; bots may be using defenses poorly. Extreme allocation/loadout search and longer human sessions remain necessary before any money mode. Do not use hidden buffs or quietly change outcomes to force 50% win rates.

No wagering activation is implied by these tests. Exact-token escrow, refund/dispute rules, independently reviewed settlement and tournament prize handling are a separate implementation, not a hidden flag in this free-play engine.


## v1.3 continuity architecture (2026-09-07)

Application version 1.3.0 deliberately retains rules/state version `axo-pet-arena-1.2-review`; `catalog.mjs` and `combat.mjs` are byte-identical to v1.2. There are no new balance rules. Replay exports are versioned independently (`AXO_ARENA_PORTABLE_REPLAY_1`).

`replay.mjs` is a browser/Node pure reconstruction and strict schema validator. It rebuilds each fighter from allowlisted frozen build inputs, starts at `newBattle`, runs every pair of committed moves through `resolve`, and compares each full exchange and final combat outcome. `replay-export.mjs` selects privacy-bounded fields and hashes canonical sorted-key JSON with SHA-256. `verify-replay.mjs` checks files locally with a 128 KiB input bound. Raw owner identities and invitation capabilities never enter this format. Legacy terminal rooms are projected without changing their original receipts.

Combat determines KO, Photo Finish and exchange-limit finishes. Clock finishes deterministically compare reconstructed HP; the supplied clock event remains a server assertion. Concession/check-in/missed-turn finishes validate allowed result structure but do not claim independent evidence of those external events. Replays show every resolved exchange, not unresolved hidden commitments or invented turns. Administrative completion may contain zero exchanges.

Casual rematches are new recipient-bound waiting rooms, with private recipient key/Pet fields never included in public room views or exports. The host's fresh snapshot is locked at invitation; acceptance validates and snapshots the invited opponent. This uses existing entry-level eligibility, not an invented wallet-auth path. A later Hatchery change does not rewrite an already frozen build. Current authenticated adapters still validate ownership on each move; concurrent cross-worker ownership enforcement is not claimed. Tournament slots continue to use original roster snapshots and the existing one-draw-rematch rule.

Every timer mutation, including expiry, tournament advancement and retention, runs inside synchronous `atomic()`: clone before mutation, persist only when state differs, restore on any thrown persistence error. Request transactions first run a separately atomic due tick, then atomically apply the requested operation; nested helper ticks are suppressed. Persistence errors return a sanitized 503. Atomic rename is not a claim of fsync/power-loss durability. No database, dependency or multi-worker coordination was introduced.

Retention removes terminal tournaments with their entire room group so bracket links never dangle. All live room/bracket references and pending invitation recipients protect profiles. Standalone completion, group completion and unreferenced profile limits are documented in README. Legacy terminal groups receive a first-observed terminal timestamp when none exists. Preview state is backed up before the new runtime first applies these additive metadata fields; separate synthetic stores supply all QA.


## v1.4 Challenge Room architecture (2026-09-07)

Application version 1.4.0 keeps `axo-pet-arena-1.2-review`, combat/catalog, prior receipts and v1.3 compatibility unchanged. Challenge discovery is an authenticated opt-in derived view, not chat, social publication or money mode.

- `GET /api/arena/challenge-room`: atomic due tick, filter strict normal waiting-room shapes and full canonical frozen-build consistency, newest-first bounded 50-card allowlist projection; private own-entry controls and busy status are only for the authenticated caller. No extra feed object is persisted. Public canonical art must exactly equal the level/lineage local path; anything else is omitted.
- `POST /api/arena/challenge-room/:id/post` accepts exactly `{posted: boolean}`. Owner and entered Pet must match. Post sets a server timestamp once; remove deletes it. Both are idempotent and increment room revision only for an actual metadata change. Neither touches the frozen build, deadline or waiting status. Unsupported status/legacy shape fails closed.
- `POST /api/arena/challenge-room/:id/accept` accepts only `{}`. It checks the current listing inside the same synchronous transaction as the existing `join()`, which enforces busy, genesis and level gates and starts combat. The response contains only room ID, status, accepted and stakesEnabled; the client navigates to the existing battle only after success. Same owner/Pet retries acknowledge only a previous board acceptance. No asynchronous persistence gap or parallel second-seat race is introduced. Multi-worker coordination remains unclaimed.
- The HTTP router retains authenticated sessions, same-origin mutations, bounded JSON and rate limits. Unknown body fields including free text are rejected. All exceptions pass the existing sanitized response handler. Due ticks are separately atomic before request mutation; persistence errors cannot return a board purporting failed expiry/post/remove/accept to be saved.
- Existing 2,000 total-room ceiling and v1.3 room/profile retention bound the derived board. The opt-in timestamp and board-accept retry marker are retained only with their room. Legacy unposted rooms remain unposted; malformed posting timestamps are absent. There is no catch-up publication on restart. A successful due tick remains durable even if the following request is rejected.
- The board screen uses names, not IDs; exact local portrait or neutral icon; explicit no-stake labels; keyboard actions and focus restoration; polite count/status feedback; empty/create/post/open/busy states and persistent reconnect feedback. It polls while visible and never preloads full room details for cards. Sound/reduced-motion behavior is inherited unchanged.

Privacy is field minimization, not a new access policy for old invitation endpoints. IDs remain action capabilities; prior authenticated room-detail/spectating behavior can still expose the existing frozen builds/Pet details to someone holding an ID. No extra text or new image is accepted, and arbitrary local/remote image paths never enter card projection. Display-name screening removes obvious links/handles/address/identity strings but cannot prove a name contains no semantic personal information. Public human moderation, stronger invitation access, anti-abuse/load policy and multi-worker storage remain separately scoped work. No production or public activation follows from synthetic evidence.


## UI 1.8 released — integrated combat presentation — 2026-09-07

Live at https://axo.pet/arena/ on the already authorized authenticated free-play beta. UI1.8 replaces the oversized separate console with a unified battlefield HUD: mirrored HP/energy, central clocks, over-field four-move dock, epic/recharge and noncommitting move inspection. No website menu/sitemap entry was added.

All12 moves have distinct presentation envelopes and effects, with six lineage signature/recovery/epic geometries. Four Emerald clips (Market Order, Rug Pull, Pepe’s Breakout and Reversal) use16 additional authored poses; other combinations retain original lineage rigs with procedural motion/VFX. The parent-prepared transparent atlas is additive; original atlases and canonical Hatchery artwork are unchanged. Actual receipt damage/block/heal/counter/recoil/storm drives feedback. Opt-in sound, live reduced motion and bounded image/RAF/pixel/voice budgets remain.

Independent review exposed stale-request races, reconnect history replay and a completed-log overlay regression. The final release fixes those plus terminal-attack obstruction: view/request generations, monotonic matching revisions, silent resync, accessible completed logs and a bounded final reveal before the large result card. Outcome/clock/input authority stays immediate and server-owned.

Proof:136/136 root and staged Arena tests; all15 independent regression checks; all14 public HTTP/source/auth/private-path/health checks pass. Backend1.4.0 and combat axo-pet-arena-1.2-review are unchanged. No Arena service restart, config/flag change, parent build, live authenticated gameplay write, wallet/RPC/funds/wager/Hatchery XP/identity write occurred. All20 services were online; the unrelated whale-flow worker changed its PID/restart count concurrently, so whole-estate PID preservation is NOT claimed.

Browser/compositor/touch/native audio/fullscreen/device-FPS/human play QA remains NOT_PERFORMED_POLICY_BLOCKED. Offline DOM/Canvas/CSS and HTTP checks are not visual proof or AAA certification. Evidence: review/v1.8/RELEASE-RECEIPT.json; original review findings and repair evidence are preserved.
