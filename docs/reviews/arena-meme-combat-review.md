# Arena mechanics, attacks and meme culture review

Date: 2026-10-23. Reviewer: Codex. Base: `eee8206f8e1426d586d4c82a6f1b48c3b8ef61a2`. Exact implementation is pinned in [AXO-020](../handoffs/AXO-020.md). Browser scope: Windows in-app Chromium, synthetic memory-only Arena on loopback port 4335. Public `https://axo.pet/arena/` entry was also inspected without a wallet. No live fight, wallet/session import, state migration or onchain action.

## Findings and response

| Finding | Action / evidence | Disposition |
| --- | --- | --- |
| Default training moves could not demonstrate strip/pierce/counter/sustain variety. | Four legal level-aware dummy playbooks, tested across all ten V1 levels and six lineages. Own exact XP/build/gear remains copied. | SOURCE_FIXED |
| Learning listed mechanics but lacked a controlled response comparison. | Counterplay map resolves all legal dummy replies from one immutable local state; HP, energy and receipt amounts remain exact. Select then explicitly resolve. | SOURCE_FIXED |
| Crypto humor was stored in the catalog but missing from the reference cards. | Existing canonical move jokes now appear next to plain mechanical descriptions; generated lobby gas-pump decal links to learning. | SOURCE_FIXED |
| New painted effects were initially hidden entirely behind the actor body. | Browser review led to contact-edge placement and a bounded scale adjustment. All effects stay behind the Pet/tool/finger planes. | SOURCE_FIXED_WITH_ART_ACCEPTANCE_OPEN |
| Repeated timing captures were awkward for art/hand-mask review. | Training-only contact-frame inspection with an explicit hold label, release on new step/reset and context fence. No live/replay pause or receipt/audio replay. | SOURCE_FIXED |
| An old regression assumed fitted combat would request zero additional public images. | Updated the assertion to require exactly the three immutable credential-free FX URLs, still rejecting every legacy costume/Pet request. | TEST_CONTRACT_UPDATED |
| More noise could obscure different attack categories. | New candle accents limited to real burst/signature/epic damage; default jabs/slashes retain existing forms. Six fixed reusable slots, short fades, optional disable and reduced/Low controls. | SOURCE_VERIFIED; human/device acceptance open |
| Bot advantage did not establish a justified live numerical rebalance. | Retained all engine/catalog numbers; added 176,004-pair / 6,912-state audit with all twelve moves and explicit methodological limits. | DESIGN_REVIEW; player evidence required |
| Live update parity cannot be inferred from the repository or login page. | Confirmed public entry requires verified Hatchery session; no authenticated combat inspected. | AXO_HOST_GATE_OPEN |

## Review checklist

- [x] All twelve moves represented in the finite local audit; legal choices, immutable inputs, HP/energy/charge bounds and real-engine comparison amounts checked.
- [x] Counterplay and playbook controls do not submit a match/XP/equipment command or read a hidden rival choice.
- [x] Recoil, shields, counter, pierce, healing, cooldown/energy, simultaneous attack and epic gates retain existing V1 rules.
- [x] Generated WebPs preserve alpha, hashes, sizes/dimensions and fixed public routes. No generated SVG stand-ins or NFT registrations.
- [x] Optional asset failure, corrupt/oversized bytes, wrong dimensions, bounded cache, credential omission and no retry loop covered.
- [x] Reduced motion/disable removes painted transients; essential numeric/text information remains. Local frame hold ignores live/replay contexts.
- [x] Fitted-only artwork, rigid tool/palm/finger masks, exact XP, numeric V1 equipment, frozen combat and V2 locks remain independent.
- [x] Desktop and narrow counterplay/controls/lobby reviewed; recorded browser warning/error list empty.
- [ ] Full six-lineage/all-family motion art acceptance, physical phone/headphone/readers/vision/contrast, sustained/thermal performance and live-host readback.
- [ ] Consenting-player strategy/feel study and balance approval before numerical ruleset changes.

Required `npm run check`: **431 passing tests**, including **229 Arena**, **41 contracts** and **11 source-preview** tests. These are source checks, not live or human acceptance. [Audit JSON](arena-counterplay-audit.json) includes scope, counts, examples and source hashes; the prior three-seed V1 simulation remains in [AXO-019's evidence](arena-quality-balance.json).

Browser evidence: [held contact](arena-meme-contact.png), [390 px counterplay](arena-meme-counterplay-mobile.png) and [painted lobby culture](arena-meme-lobby.png). At 390 px the page width stayed 390 and the comparison scrolled inside a 325 px region; at 320 px the page stayed 320 and the region was 255 px. The short diagnostic sample reported 3/3 checked effects ready, 56 Hz paint cadence, p95 21 ms, JS draw p95 0.9 ms at 407,150 canvas pixels. This was a short local sample with an inspection frame, not a sustained device, GPU or thermal benchmark.

## Next gameplay decisions

Observe players choosing attack/guard/strip/pierce/recovery from the same loadout and ask them to explain energy, recoil and why the reply changed the result. Review the prior Solar bot flag using mirrored human matches and legal ranked/stat/gear variants. Proposed numbers belong in a separately versioned candidate ruleset with replay compatibility and explicit approval; do not silently retune V1 or map Preview sets into combat. Prioritize observed comprehension/feel defects before adding more abilities.
