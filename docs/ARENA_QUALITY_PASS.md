# Arena quality pass — training, readable combat and review evidence

AXO-019 extends AXO-018 with a local Training Dojo, resolved-exchange inspection, replay highlights, recorded battle moments, a compact phone entry action, configurable keys/comfort and two imagegen environments. [The review](reviews/arena-quality-review.md) assesses every one of the 44 roadmap points; source completion and external acceptance are distinct.

## Training and combat learning

Open **Training Dojo** from the lobby or quiet Challenge Room. It copies the authenticated `/me` build, exact XP and V1 equipment-derived stats. The reference dummy uses a same-XP V1 default build with no owned gear. Select opening, recovery, simultaneous-finish or epic-readiness demonstrations, choose the dummy lineage and both legal moves, then resolve one exchange at a time. The same existing V1 combat engine supplies damage, block, healing, costs, energy recovery and terminal conditions. The three modified starting-state demonstrations are explicitly local simulations. An unlearned epic stays unlearned. Reset never writes a match, XP or equipment record.

The 12-move reference explains categories, costs, cooldowns, pierce, counter, healing before attacks, exchange-ten healing reduction and lineage epic conditions. Try-on clothing never changes a move. To test other equipped moves, change the saved battle build through the existing Pet Build flow between entries. The Dojo does not offer an unverified skill/level editor.

**Last exchange** pins the resolved receipt when opened; a new poll cannot silently replace its explanation. Live clocks continue in panels and while visiting training. Replay highlights jump to validated frozen frames: largest total exchange, best total block, best recovery and final exchange. Report moments describe that participant's recorded guard/heal/epic/one-HP result, with no lifetime achievement or award claim. Historical combat values stay frozen; outfit reconstruction remains current and cosmetic.

## Presentation and controls

Presentation settings add six remappable letter/number shortcuts, conflict swapping, plain typography, dimmed background, optional contact camera impulse and environment selection. Existing mute/mono/audio levels, High/Low, combat readouts and OS/manual reduced motion remain available. Rebinding updates visible hints, `aria-keyshortcuts` and the field guide. Typing, dialogs, modifiers, key repeat and illegal/locked moves retain their input fences.

All new preferences use the bounded local `axo.arena.controls.v1` schema. They contain no Pet identity, equipment, ownership, XP or stats. Local rendering diagnostics retain at most 360 frame intervals and JS draw costs. Values are local browser paint cadence/submission measurements, not GPU timing, network latency or target-device acceptance. No telemetry is sent. The renderer accumulates its frame-time remainder so a 144 Hz display does not unnecessarily undershoot the configured 60 Hz budget.

Phone entry places a compact exact-XP/V1 summary and Practice or Resume action before the large Pet poster. Terminal combat logs open in a result dialog instead of overlapping the narrow HUD. Empty boards offer explicit solo learning; no bot is represented as a human rival. Tournament empty copy now gives a usable next action.

## Small art bible

| Role | Rule |
| --- | --- |
| Identity | Original cute adult axolotl silhouette, six painted lineages; registered clothing/head/gill/grip anatomy is authoritative for fit. |
| Palette | Charcoal surfaces `#111218`/`#211b2c`, lime `#d6ff55` for primary actions, violet `#be9bff` for secondary emphasis. Health/energy/results also have words, values and shapes. |
| Type | Painted raster logo and expressive display headings; plain system text for rules, numeric readouts, controls and optional whole-interface plain mode. |
| Space | 8/12/16/24 px rhythm, 44 px minimum touch controls on the new surfaces, readable panel widths and visible focus. |
| Materials/light | Concrete/metal, restrained emissive lime/violet, coherent ground contact; no independent lighting deformation of tools/fingers. |
| Decals | At scene edges and brand surfaces; keep text/control areas quiet. Dimming is default and adjustable. No decorative SVG replacement of generated artwork. |
| Environments | Rooftop Dojo and Runeforge are original imagegen raster backgrounds with a quiet open lower floor and no baked fighters, gear or HUD. Cover crop keeps actor geometry unchanged. |
| New content gate | Save prompts/provenance/hashes/byte cost, inspect phone crops and both fighter directions, recheck fitted poses and reduced motion before release. Avoid near-copy licensed character/universe assets. |

The two optimized 1536×864 WebPs total **417,216 bytes**. [Manifest](../apps/arena-web/assets/runtime/environments-v1/manifest.json) and [exact prompts](art/arena-environments-prompts.json) pin provenance and bytes. Source masters are preserved outside Git. No silhouette, mesh, fit plan, wearable image, palm/tool/thumb mask or Pet artwork was changed by this pass.

## Balance and future systems

The V1 CLI now creates its output directory, validates its seed/budget, works independently of cwd and pairs the same legal builds with reversed seats/styles. Three seeds run 10,800 fights across six levels/lineages. [Sanitized results](reviews/arena-quality-balance.json) include all 90 matchup cells per seed and source hashes. Solar's aggregate 53.7–56.1% bot score merits human inspection; 40 games per matchup and heuristic move choices do not justify an automatic nerf.

Run `node scripts/review-arena-candidate.mjs` for the isolated candidate audit. All 396 combinations (six sets × 11 tiers × six lineages) validate completion/mixed-set behavior and reject one-level-under equipment; 18 representative value comparisons are saved in [the candidate report](reviews/arena-candidate-roles.json). Identical synthetic per-slot stat pairs isolate role differences, rather than claiming to model every catalog allocation. Percent bonuses can round to zero on small move values, and the Guardian's flat shield/CON gains need particular human testing. No live rules or contract/mapping readiness changes follow from this audit.

Competitive planning remains a proposal: retain current level-bound casual entry, show real participation before adding skill bands, define gear/level advantage explicitly, and consider a normalized practice format only through an approved versioned ruleset. Ranked ratings, seasons and rewards need server-owned event records, privacy/recovery design and operator decisions. Do not make the empty queue look populated.

Learning goals currently use only individual resolved battle moments. An eventual mastery system needs idempotent event IDs, rule versions, revocation/correction and participant access before persistent awards; it cannot infer history from current XP. Small future content drops should follow player demand, with an outfit/environment budget and art/fit/localization/device review. No speculative season clock, achievement ledger, matchmaking backend or reward grant ships here.

## Host integration and acceptance

Publish the client/static unit described in [AXO-019](handoffs/AXO-019.md) with existing AXO-015–018 media/audio dependencies. No new database, host secret, signer, wallet, chain call, or public API endpoint is needed. Training requires the existing verified `/me` path. Preserve frozen entries, private commitments, timers, numeric V1 equipment and all V2 transaction/marketplace locks.

The optional legacy browser CLI now accepts `ARENA_BROWSER_EXECUTABLE`, falls back to Playwright's configured browser location, creates its report folder and fails unexpected native dialogs. It was **not executed** in this session; its full selector/journey modernization remains open. Current browser review used the permitted in-app browser plus independent DOM/engine tests. Physical devices, screen-reader users, five-minute performance/cold-network traces, a 30-minute session, consenting-player studies and live source/identity parity remain explicit acceptance gates.
