# Defense Lab — blocks, counters and energy

AXO-023 adds a playable **local balance candidate** to Training Dojo. Choose **Combat rules → Defense Lab · candidate**, then **Your drill loadout → Guard & counter · local kit**. Pick both moves and resolve; the counterplay map compares real candidate outcomes. Switching rules/kit resets the simulation. Your saved build, official matches, historical replays, identity, exact XP and verified V1 equipment are unchanged. Preview clothing remains cosmetic and all V2 Gear transactions/marketplace actions remain locked.

## Why these changes

V1 grants two energy after every exchange, including free attacks. Reversal costs three energy for a base 13 shield and at most 12 returned damage. That makes pressure an efficient way to replenish energy while a successful counter can offer little advantage over attacking. The previous sparring audit also showed limited use of defensive choices.

Riot's [counterplay design discussion](https://www.leagueoflegends.com/en-us/news/dev/quick-gameplay-thoughts-may-14/) argues for understandable responses with clear strengths and weaknesses, warning that excessive response requirements can make play clunky. Its [2XKO 1.1.5 system changes](https://2xko.riotgames.com/en-gb/news/game-updates/2xko-patch-notes-1-1-5/) illustrate tuning resource gain and defensive opportunities together to limit loops. Our inference is to test a small, explicit resource tradeoff in AXO, using its own simultaneous-turn engine; those games' numeric budgets are not transferable evidence for these values.

## Candidate 1 rules

Ruleset: `axo-arena-defense-lab-1`, independent of Gear V2.

| Rule | Current V1 | Defense Lab candidate |
| --- | --- | --- |
| Base energy recovery | 2 per exchange | 1 per exchange |
| Successful guard recovery | No shared refund | +1 if at least 8 damage was actually blocked |
| Reversal cost | 3 EN | 2 EN |
| Reversal base shield | 13 | 17 |
| Reversal max return | 12 | 16; still capped by damage actually blocked |
| Gas Station recovery | 2 extra + 2 base = 4 | 3 extra + 1 base = 4 |
| Wen recovery | 2 extra + 2 base = 4 | 2 extra + 1 base = 3; 4 with a qualifying block |

All recovery is capped at 10. Emerald retains +1 EN for its first two successful blocks, even if below the new eight-damage threshold. The shared guard refund applies to any actual qualifying shield, including signature/epic shields. It is not a persistent shield or separate meter. Learned Reversal ranks keep their existing shield increments. Other costs, damage budgets, counter cooldown, HP, lineages, status expiry, charge/epic conditions, simultaneous attacks, photo finish, Liquidation and terminal rules remain V1.

A counter into a heal/guard/refuel returns nothing and earns no guard refund. Shield break reduces the shield before contact and therefore reduces the possible counter. Pierce bypasses protection; return still cannot exceed the part blocked. Refuelling guarantees energy but offers no shield. Reversal retains two intervening exchanges of cooldown. A free attack and Gas Station remain legal at zero energy.

The receipt lists starting energy, spend, base recovery, move recovery, guard refund, lineage refund and capped result for each fighter. Move reference uses the selected ruleset and local kit. Current V1 remains the default. No candidate setting is persisted or posted to an Arena service.

## Architecture and authority

`defense-energy.mjs` rebuilds canonical V1 inputs through `buildPet`, applies bounded candidate move deltas, then uses the existing simultaneous resolver for HP/status/cooldown/terminal behavior. After resolution it replaces only local energy recovery and appends a local energy breakdown. It refuses a noncandidate version. `tactics-model.mjs` dispatches only the two known versions; unknown versions fail closed. Both comparison rows and actual steps use that dispatch.

No match service, room store, opponent policy, replay exporter/verifier or contract imports the candidate. The server challenge allowlist rejects a candidate `ruleset` request; the V1 portable verifier rejects candidate versions. The public module is a simulation calculator, never an identity or move-permission boundary. The local guard kit changes four simulated move slots without saving them. Original exact XP and validated gear bounds are retained; the dummy owns no gear. Level 11–20 visual styles cannot increase V1 combat level or grant stats.

The existing fitted renderer, rigid tool/palm/finger masks, contact cue and raster return effect are reused unchanged. New controls neither pause a live clock nor issue a move. Local renderer resources still dispose with the Dojo view.

## Balance evidence

Run `node scripts/audit-arena-defense.mjs` to reproduce [the source-hashed report](reviews/arena-defense-audit.json). It contains **3,456 games / 1,728 mirrored pairs**: all 36 lineage matchups, levels 1/6/10 plus level-10 symmetric capped V1 gear (32 total), six role pairings and both seats. Each version gets the same builds and finite one-exchange policies enumerating legal known replies, with tie seed 17. Mirrored games are correlated, not independent player observations.

| Metric | V1 | Candidate |
| --- | ---: | ---: |
| Games per ruleset | 1,728 | 1,728 |
| Mean exchanges | 6.84 | 7.53 |
| Defensive move share | 12.7% | 19.0% |
| Reversal selections | 282 | 2,178 |
| Draws | 396 | 294 |
| Fights reaching Liquidation | 13.3% | 21.4% |
| Fights ending at the 14-exchange limit | 0 | 0 |
| Fighter turns ending below 3 EN | 5.2% | 19.3% |
| Guard build wins against pressure | 23.6% | 36.1% |

These policies find counters more useful, make energy scarcity visible and still finish fights. Aggregate Solar wins drop from 75.0% to 53.5% in this suite; Rose remains at 26.4%. Support versus adaptive averages 10.57 exchanges and often reaches Liquidation. Wen is selected zero times by these short-horizon policies; Gas Station is selected four times. This is a policy/decision-horizon coverage gap, not proof those recovery moves are irrelevant or balanced. Do not promote the candidate to PvP based on this audit alone.

Before a separately authorized official ruleset: collect consenting novice/experienced playtests, longer-horizon strategies, asymmetric gear and mastery allocations; inspect skill availability by level and recovery choices; agree on duration/draw/lineage targets. Then design versioned room creation, persistence, replay reconstruction, bot evaluation, move cards and energy forecasts together. Preserve historical rules. Do not activate the candidate by changing `VERSION`, rewriting stored battles or relaxing any V2 Gear gate.

[Review and screenshots](reviews/arena-defense-review.md); [AXO integration handoff](handoffs/AXO-023.md).
