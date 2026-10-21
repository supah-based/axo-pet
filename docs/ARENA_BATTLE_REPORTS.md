# Arena battle reports

Completed Arena fights now have a participant-only Battle report with resolved damage, defence, healing, energy, frozen entry attributes and an exchange timeline. It is a read-only view over the existing portable replay, built on AXO-010. No combat balance, XP, gear ownership, persistence schema or transaction path changes.

## Player flow

- Open **Battle report** on a completed result, or select a completed entry in **Match history**. Waiting/playing entries still open their existing room view.
- Compare both frozen fighters' exact XP, V1 level, final/max HP, damage dealt, actual damage blocked, actual healing and energy spent. Expand **Frozen entry attributes & moves** for the pre-gear build, V1 gear contribution, total attributes and moves/ranks used at entry.
- Expand an exchange and choose **Watch exchange** to open that exact frame in the existing replay. Return to the report, watch from the beginning, export the existing replay JSON, return to the result or open the existing Pet build editor.
- A private route `/arena/#challenge=<room-id>&view=report` opens the report for a participant after authentication. It is not a public share capability. No new report endpoint, public result page, download payload or external share action is introduced.
- Cosmetic Wardrobe previews and current equipment/XP changes do not participate in the report. Battles still grant no Hatchery XP. V2 level/item/set transactions and bonuses remain locked.

## Evidence and arithmetic

`battle-report.mjs` clones the portable replay, runs the existing deterministic `replayFrames` validator and checks its SHA-256 fingerprint before producing a completed report. Both portable replay V1 (zero gear) and V2 (frozen gear stats) work with the unchanged combat ruleset. Unfinished, malformed, inconsistent or fingerprint-mismatched records produce no report. Late reads after a room/view/wallet change are discarded by the existing client generation guards.

The report model contains anonymous fighter sides, lineages, exact entry XP, levels, frozen attributes/moves, totals and exchange state. It contains no wallet, Pet genesis/seed, equipment IDs, outfit choices or current profile data. Private frozen names and player perspective are attached only by the existing authenticated room UI and escaped before rendering. A report is not a new NFT ownership attestation or signed receipt.

Definitions:

| Readout | Source and meaning |
| --- | --- |
| Attack damage | Opponent's resolved incoming attack effect, after shields |
| Counter damage | Opponent's resolved counter-damage effect, credited to the defending fighter |
| Damage dealt | Attack + counter damage, before the zero-HP clamp; it can exceed actual HP lost |
| Blocked / healed | Actual resolved blocked damage and restored HP, not nominal move power |
| Recoil / liquidation | Self-damage and storm effects, separate from opponent damage dealt |
| Energy spent | Sum of the frozen move costs |
| Energy recovered | `energyAfter - energyBefore + moveCost`; actual recovery after the ten-energy cap |
| Peak damage / best block | First exchange attaining the largest positive resolved amount; absent for zero effects |
| Before gear | Lineage attributes + Arena allocation from the frozen build |
| V1 gear / entry total | Frozen bounded gear stats / pre-gear attributes + gear |
| Duration / finish reason | Existing server replay metadata, not independently verified timing |

Zero-exchange forfeits/concessions show no invented combat events. Administrative finishes are labelled; the existing replay consistency/fingerprint check does not independently prove timing, consent, ownership or administrative decisions. Photo finishes preserve the combat engine's final 1 HP and keep overkill amounts separate from actual HP loss.

## Delivery

Publish these files as a matching client/static-router change on top of AXO-010:

- New: `apps/arena-web/battle-report.mjs`, `battle-report-view.mjs`, `battle-report.css`.
- Updated: `apps/arena-web/app.mjs`, `index.html`, `http.mjs`.

The HTML links the new stylesheet, and the static router exposes exactly the two browser modules and stylesheet. Server modules, state and fixtures remain unserved. No new environment variable, adapter, Pet API permission, database, signer or store migration is required. Existing replay authentication remains participant-only; spectator consent does not permit exporting/analysing a private replay through this endpoint.

Preserve AXO-010's verified ports, secret/profile namespace, exact XP, Arena store/timer ownership, V1 replay exporter and gear-aware V2 exporter. Real host source differences and AXO-010 integration remain UNKNOWN until AXO acknowledges them.

## Tests and review

`npm run check`: 314 tests, including ten report calculation/markup cases, six report navigation/account-race cases and one opt-in review isolation case. The existing eight route regression tests are now in the required Arena standalone/CI command. Coverage includes counter attribution, capped healing/energy, recoil/storm, photo-finish overkill, zero-exchange finishes, frozen gear/XP, input immutability, forged records, escaped labels and participant/view boundaries.

For a labelled synthetic six-exchange desktop/mobile review:

```js
import { createDevServer } from './scripts/dev-server.mjs';
createDevServer({ arenaReview: 'reports' }).listen(4326, '127.0.0.1');
```

Open Arena → Match history → the completed fixture. This explicitly seeds two invented identities and a completed replay in memory through the shared verified-reader adapter and normal Arena service operations. The ordinary source preview and `arenaReview:true` do not seed history. No real wallet, ledger or chain is accessed. Never install the preview server, synthetic ports or fixtures on the actual host.

## AXO acceptance and rollback

1. Acknowledge AXO-011's exact source and confirm the actual AXO-010 host integration/source. Preserve host-only patches.
2. Publish the matching files above with their pinned hashes; keep private/no-store API responses and existing participant replay access unchanged.
3. Check a real completed V1 replay and a V2 equipped replay against the existing server verifier. Compare exact entry XP/HP, gear contributions, resolved effects and final outcome; current gear changes must not alter historical reports.
4. Check Match history/direct private route, exchange jumps, return navigation, export and build-editor links. Reject corrupted records and deny an unrelated wallet or spectator. Check logout/account changes during loading and while a report is open, plus 390-pixel controls/tables/timeline.
5. Follow existing release gates for authorized promotion. Roll back the paired HTML/client/static-router assets to the prior revision if acceptance fails. There is no report data migration to reverse: preserve the Arena store, historical rooms, Pet state and existing replay records.
6. Return sanitized results, exact deployed source/assets and any concrete blocker. Source/browser QA does not establish live-wallet or production parity.
