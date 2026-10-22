# AXO-013 equipped combat pose review

Date: 2026-10-22. Scope: AXO-012 source plus new equipped pose/render/inspection paths. Browser checks use invented identities and memory-only fights.

| Domain | Findings acted on | Evidence and limits |
| --- | --- | --- |
| Anatomy and fitting | Independent transforms would separate tools from fingers. Bound weapon, palm and foreground fingers to one rigid grip; sleeves, headwear and pants share anatomy weights. Reduced trial bend angles after visible folds. | Grip matrix equality/unit determinant; six adult bases and candidate foreground/material surfaces tested through pose blends and all move samples. No newly painted side views or acceptance of every legacy design. |
| Timing and combat | A second timing table could drift from impacts. Extracted the existing cues unchanged and shared them with poses; incoming hits and final stances follow accepted receipts/outcomes. | Move continuity, renderer integration and synthetic attack/block receipts. No damage, stats, XP, legal-move or winner changes. |
| Authority and privacy | Failed checked art previously fell through to unrelated clothing. Added explicit art status and kept actual verified stats. Private pose gallery excludes candidate selections. | Hash/dimension failures, unsupported bases, empty loadouts, session/view fences and no-write tests. Real-wallet parity remains AXO work. |
| Controls and export | Export could capture a previous RAF sample; it now paints the selected pose before capture. Added pose blend and four-pose boards. | DOM export/pause tests; real desktop and 390-pixel controls. Preview marks remain in portraits. |
| Rendering and lifecycle | Bounded GPU batches/actors; premultiplied alpha; unchanged-pose reuse; release resources on replacement/account/close. Gallery releases its GPU context after capturing stills. | Mock GPU allocation/loss/restoration/disposal and unavailable-driver tests; actual browser GPU review. No target-device FPS or memory measurement. |
| Browser review | Inspected candidate clothing and the canonical V1 gallery, mobile grid and synthetic practice with no console warnings before concession. | Screenshots in the verification record. Native concession confirmation stalled automation; that confirmation/reload was not verified. No change to its implementation. |

Full local gate: `npm run check` passes 360 tests, including 161 Arena tests. Exact implementation CI is recorded separately after source publication. AXO must verify host integration, real equipment and empty Pets, target devices, operator art acceptance and release/readback gates before any authorized deployment.
