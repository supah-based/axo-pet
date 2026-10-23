# Arena mechanics audit and painted degen effects

AXO-020 builds on AXO-019. The review found that counterplay was difficult to explore with the single default training loadout, and that the existing catalog's crypto jokes were mostly absent from the learning view. This pass adds legal dummy playbooks, a known-build counterplay map, a local contact-frame inspector and original painted effects/decals. The live V1 combat engine, numeric balance, verified equipment/XP and fitted rig/masks are unchanged. V2 remains locked.

## What the audit says about attacks and mechanics

The existing free attack, guard, counter, shield strip, pierce, recoil burst, heal/cleanse, recharge, lineage utility and gated epic form a useful starting vocabulary. Their purpose depends on HP, energy, cooldowns, passive/epic progress and the opponent's choice. A single damage ranking would conceal those trade-offs. The previous seeded-bot audit's Solar advantage remains a playtest investigation, not approval to rebalance live numbers.

This audit resolves **176,004 legal move pairs in 6,912 synthetic states**, using four playbooks on each seat, six lineages, levels 1/4/6/10 and opening/recovery/epic-ready demonstrations. Every move appears; input immutability, legal outcomes, HP/energy/charge bounds and comparison/engine agreement are asserted. [The report](reviews/arena-counterplay-audit.json) pins source hashes and representative comparisons. Reproduce with `node scripts/audit-arena-counterplay.mjs`.

These are finite one-exchange checks over legal reference builds, with zero owned gear. They do not test optimal policy, every stat/rank/gear allocation, player comprehension, live latency or human balance. No damage, cooldown, cost, XP threshold or combat rule is changed. Before considering a new ruleset, collect consenting-player observations and exact-host parity, compare repeated attack/guard/support policies with mirrored seats, then test any proposed numbers in an isolated versioned engine. Cosmetic style remains independent of power.

## Learning upgrades

Training Dojo now offers **Balanced**, **Pressure / break & pierce**, **Diamond vault / guard & counter** and **Copium crew / heal & recover**. Reference dummy moves are filtered to the copied V1 level and filled to four valid slots. The authenticated player's build/loadout/gear stays unchanged; the dummy has no owned equipment. Existing modified-start scenarios remain explicit local simulations.

Expand **Counterplay map** to compare the currently selected legal move against each legal dummy reply from exactly the same state. Rows show real resolved damage dealt/received, block, healing, HP and energy after the exchange. Selecting a row sets the dummy choice; it does not resolve or submit a live action. The table is a bounded keyboard-scroll region on narrow screens. Known reference choices are not a live-rival prediction or hidden-choice lookup. The twelve move cards now expose the existing catalog's short degen jokes beside the mechanical explanation.

After a resolved drill, **Inspect contact frame** holds the supplemental presentation at a shared contact cue for art/gear inspection. This works only with `presentationContext: training`; live/replay contexts ignore the requested hold. Reset/new exchange releases it. It does not repeat audio, alter the receipt, write a match or pause any public server clock.

## Generated raster artwork

All four originals were made with the **built-in image_gen tool**, using actual transparency. [Exact prompts](art/arena-meme-prompts.json), [runtime manifest](../apps/arena-web/assets/runtime/meme-v1/manifest.json) and `meme-art-bank.mjs` pin provenance/hashes/sizes. Masters are preserved locally in `work/arena-memes/source/` and the original imagegen library. Derivation is resize/WebP encoding only.

| Saved runtime file under `apps/arena-web/assets/runtime/meme-v1/` | Dimensions | Bytes | Use |
| --- | --- | --- | --- |
| `gas-chaos.webp` | 640×427 | 88,066 | LOW GAS / HIGH CHAOS lobby decal with original axolotl gas-pump art |
| `diamond-guard.webp` | 512×512 | 121,556 | Confirmed blocked damage, at the incoming contact cue |
| `candle-burst.webp` | 512×512 | 106,340 | Confirmed burst/signature/epic damage; regular jabs retain the quieter existing cue |
| `copium-bloom.webp` | 512×512 | 94,548 | Actual HP restored, with grass/vapor recovery motif |

Total **410,510 bytes**; the optional combat bank is 322,444 bytes. These are scene effects and decoration, not new gear NFTs or worn overlays. Painted cues draw toward the contact edge behind all actors so the Pet silhouette, held tool, fingers and masks remain in front. Existing travel paths, numeric readouts, contact timing, audio and lineage-specific forms remain. No effect pretends a missed/zero-effect action hit or healed.

Presentation settings add **Painted degen combat effects**. Reduced motion suppresses transient painted cues; Low mode uses smaller, shorter cues. Text values and normal readable mechanics remain. The fixed cache holds at most three checked effects; requests omit credentials, reject redirects, bound streamed bytes and verify hashes/dimensions before decoding. Unsupported/corrupt art becomes an absent optional effect, without blocking combat or retry loops. Late asset loading never replays an old receipt. The diagnostic panel reports only the ready count, alongside its existing local frame sample.

## Design evidence and scope

The choice to retain distinct normal/special cues, protect the actor silhouette and keep numbers above decorative effects applies [Riot's gameplay-clarity guidance](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/). Separating cosmetic quality from essential information follows [Riot's art/performance/integrity discussion](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity). These are design principles applied to AXO, not an adoption of shooter frame targets or an external certification. Sources checked 2026-10-23.

[The review](reviews/arena-meme-combat-review.md) covers code, synthetic browser evidence and limitations. The public live Arena entry was reachable and required a Hatchery wallet; authenticated fights/AXO-019 deployment parity were not verified. See [AXO-020](handoffs/AXO-020.md) for the exact client/static publish unit, acceptance and recovery. This source exchange does not authorize live rollout or V2 activation.
