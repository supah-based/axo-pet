# Arena adaptive sparring

AXO-022 improves the opponent side of V1 combat. Players choose Candle Chaser (pressure), Diamond Guardian (blocks/counters) or Receipt Reader (adaptive) before starting an explicit practice entry. These are styles, not ranked difficulty tiers. Actual combat rules, verified identity/exact XP/numeric equipment, deadlines, replays, fitted art/grip/finger masks and cosmetic-only Previews remain unchanged. All V2 Gear transactions and marketplace actions remain locked.

## Research → review → implementation

[Riot's counterplay article](https://www.leagueoflegends.com/en-us/news/dev/quick-gameplay-thoughts-may-14/) emphasizes understandable responses and room for opponents to act, while warning against making every effect cumbersome. [Matthew Davis's Into the Breach postmortem slides](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf) show designing around readability, constraints, deterministic turns and telegraphed threats. Our inference is to improve adversary variety within AXO's existing simultaneous-commit rules, without exposing PvP choices or adding rule complexity. The [GDC Slay the Spire session abstract](https://www.gdcvault.com/play/1025731) describes combining metrics and community feedback; only the indexed abstract was available, not the talk. Synthetic results below inform review; they do not replace player testing.

The old practice policy assigned a static score to base attack/heal/shield values. It did not use rival behavior, score actual counter/pierce interactions, or reduce healing for Liquidation. In the controlled Reader-build audit it never used its available Touch Grass. The new policy evaluates the actual result of each legal own move against each legal rival reply through the unchanged V1 engine: at most six × six = 36 simulations per decision. It accounts for shields, returned damage, recoil, buffs, weakness, healing caps, Liquidation, simultaneous finishes, energy and epic progress. It looks one exchange ahead; it is not an optimal multi-turn solver.

Recent **resolved move types**, limited to four exchanges, adjust reply weights. Every legal reply retains positive weight. Profile-specific preferences affect decisions, not damage/stats. Seeded variation chooses among near-best outcomes, while a guaranteed finishing choice cannot be dropped for a nonwinning one. Room IDs provide reproducibility, not a security secret or promise of unpredictability.

## Authority and compatibility

`sparring-policy.mjs` accepts only the accepted battle snapshot, seat, style and seed. It receives no room, current pending submission, identity, outfit or clock. The service commits once before human input and preserves an existing bot commitment. Only `POST /api/arena/challenges` with `{practice:true,sparring:"pressure"|"guardian"|"adaptive"}` opts in. Invalid styles, guided+sparring, PvP+sparring and extra identity/gear/private-choice fields are rejected. The response exposes descriptive `practiceOpponent` metadata; it never exposes the bot choice or score matrix before reveal.

Existing rooms and ordinary/guided practice without the opt-in metadata retain the original policy. The five tutorial lessons remain unchanged. New sparring rivals use distinct level-aware legal V1 loadouts at the player's exact XP/V1 level, with zero owned gear. A related correction ensures newly replayed guided-tutorial bots also clear copied equipment labels/revision/stats; their combat build was already gear-free. Existing records are not rewritten.

Room metadata is optional `{version:1,profile}` under the existing storage version. No secret, signing, XP, inventory, reward, ruleset or database migration is introduced. Completed V1 replay verification still consumes frozen builds and resolved moves, independently of the opponent policy. The public static router serves only `sparring-meta.mjs` and `sparring.css`; policy/service modules are not public routes.

## Evidence and next mechanics question

`node scripts/audit-arena-sparring.mjs` produces the [source-hashed report](reviews/arena-sparring-audit.json). It runs **3,456 games / 1,728 mirrored pairs**: levels 6/10, all six lineages on both seats, three style builds, two scripted rival strategies, seeds 17/2026. Each old/new comparison uses the same build, isolating policy. Each table row is 576 games including correlated mirrored repeats; there is no statistical-significance or human-difficulty claim.

| Style | Legacy win % | New win % | Mean exchanges, old → new |
| --- | ---: | ---: | ---: |
| Candle Chaser | 88.9 | 80.9 | 5.53 → 5.53 |
| Diamond Guardian | 62.5 | 56.6 | 6.40 → 6.94 |
| Receipt Reader | 69.4 | 76.0 | 6.11 → 6.90 |

Reader used Touch Grass 666 times versus zero, and epic 450 versus 360. Guardian used Reversal 166, Diamond Hands 290 and Wen 8 times, versus none under the old policy. Pressure used Rug Pull 360 times versus zero. Stronger win rates are not universal; the gain is different, mechanics-aware sparring and a better adaptive reference. Neither the table nor the browser loss certifies difficulty.

**Next balance hypothesis:** defensive resource/counter choices are still uncommon in these finite matchups. Test Reversal's attack-versus-counter trade and Wen's energy value with consenting players and isolated candidate rules before changing V1 numbers. Prior Solar heuristic outliers remain unresolved. Do not silently nerf or buff the historical engine on the strength of bot simulations.

`npm run check`: PASS, 455 tests (251 Arena, 41 contracts, 13 source-preview). [Review and browser proof](reviews/arena-sparring-review.md); [AXO integration](handoffs/AXO-022.md). Authenticated live parity, physical-phone/audio, sustained CPU/network and real-player comprehension/feel remain separate acceptance.
