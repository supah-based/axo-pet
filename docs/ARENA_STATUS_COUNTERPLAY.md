# Arena status and counterplay clarity

AXO-021 reviews the remaining gap between the V1 engine and what a player can understand while choosing. It adds a readonly status panel in battle, inspection and Training Dojo, two local scenarios, and two original built-in imagegen assets. Combat rules, authoritative identity/exact XP/numeric V1 gear and frozen entries remain unchanged. Preview clothing stays cosmetic and all V2 transactions/marketplace actions stay locked.

## Findings and changes

The old “next attack” wording suggested a boost could be banked through defensive turns. In V1, current boost and weakness are replaced after **every resolved exchange**. The client now describes a one-exchange window, including expiration after defending/refueling, purge before attacks, cleanse before attacks and possible new weakness afterward. Rose's displayed passive uses the same explanation. The historical engine/catalog are retained; this is a presentation correction rather than an unversioned combat/replay change.

Epic charge alone is insufficient. The visible EPIC CHECK separates learned/spent, charge and the exact lineage counter. It uses the accepted own fighter snapshot and does not read pending choices. Only the existing server `legal` list enables live moves. Midnight's attacks into an attacking rival are explicitly distinguished from Reversal's damage returned on a successful block. Cooldowns state intervening exchanges, and final snapshots do not suggest that expired boosts can be used after a battle.

The new **One-exchange boost & weakness** scenario gives both copied fighters a labeled synthetic modifier window. Defend/refuel to see it expire, or compare attacks. The **Liquidation · exchange 10** scenario starts both at 65% HP: 6 unavoidable damage each, rising by 4 each exchange, with healing halved and rounded down before the missing-HP cap. A shield cannot stop the storm. Both scenarios remain local, have no live countdown, and perform no service/XP/equipment writes.

## Painted counter and culture

The return-arrow art is selected only for Reversal with actual blocked damage and actual counter damage in the resolved receipt. It fires at shared `contactCue(last, defender)`—Reversal's delayed response beat, aligned with existing pose/audio/readouts. It replaces the painted block texture for that counter instead of stacking both. The browser review found the original inner-edge position was substantially hidden behind the Pet; the final position moves it into the space between fighters, slightly below face height. It still draws before all fitted actors, clothing, tools and registered finger masks. No gear geometry or mask changes were needed.

The Liquidated graffiti decal gives the late-exchange training lesson a crypto identity. It is decorative HTML art, not a false combat event or reward. The existing base attack/hit treatment remains quieter. This follows Riot's published guidance on meaningful hierarchy and limiting clutter, interpreted for AXO's turn-based game: [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/) and [VALORANT shaders and clarity](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity).

Both assets were generated with built-in `image_gen`; no SVG substitute or runtime generator. Final files:

| Asset | Saved path | Dimensions | Bytes |
| --- | --- | --- | --- |
| Counter return | `apps/arena-web/assets/runtime/tactics-v1/counter-return.webp` | 512 × 512 | 90,080 |
| Liquidated decal | `apps/arena-web/assets/runtime/tactics-v1/liquidated.webp` | 640 × 427 | 133,172 |

The [manifest](../apps/arena-web/assets/runtime/tactics-v1/manifest.json) pins output/source hashes. [Exact prompt set](art/arena-tactics-prompts.json). Derivation is resizing and WebP encoding only; generated alpha is preserved. Masters are retained in the workspace's `work/arena-tactics/source/`, outside Git/public delivery. The optional combat cache is now four fixed textures, 412,524 bytes total and at most eight reused sample slots; the decal loads separately in its lesson. Existing streamed size/hash/dimension checks, omitted credentials, timeout, one-attempt failure behavior and reduce/disable/Low controls are preserved. Diagnostics report the four-texture readiness even without a recent frame sample; missing frame intervals are not a performance result.

## Verification and integration

Run `npm run check` and `node scripts/audit-arena-status.mjs`. The [focused audit](reviews/arena-status-audit.json) covers 2,304 states / 57,600 legal pairs: levels 6/10, all six lineages on each seat, four playbooks per seat and both new scenarios. It checks immutable input, bounds, modifier/status/epic-condition agreement and counter selection in both seats. It includes 2,448 active counters and 7,200 late-heal effects. This is finite mechanics consistency evidence, not an optimal-policy or human balance verdict.

See the [review and remaining acceptance](reviews/arena-status-review.md), [AXO-021 integration packet](handoffs/AXO-021.md) and [existing 44-point roadmap](ARENA_QUALITY_CHECKLIST.md). Keyboard focus/open disclosures survive accepted combat/inspection revisions; local drill resets do not touch host state. Source tests and synthetic screenshots do not establish authenticated live parity, sustained device performance, listening acceptance or AAA certification.
