# Architecture decisions

## ADR-001 — Dedicated private monorepo

**Decision:** Maintain Hatchery, Pet NFT, Gear, visuals and Arena in one private `axo-pet` monorepo.

**Reason:** These systems share identity, XP, level, slot, metadata, visual and stat contracts. One repository allows atomic review while separate packages preserve ownership boundaries.

## ADR-002 — Existing AXO runtime remains authoritative

**Decision:** Repository extraction does not move or recompute live state.

**Reason:** Wallet-pet bindings, XP, identity receipts, submissions, Epoch history, gear ownership and Arena receipts are durable state. A source split must not become a data migration.

## ADR-003 — Verified gear projection

**Decision:** One fail-closed gear projection drives metadata, visuals and supported-game stats.

**Reason:** A separately inferred visual or stat loadout can diverge from onchain ownership and slot locks.

## ADR-004 — Bounded game-only bonuses

**Decision:** Gear stats may affect supported games but not Hatchery XP, trust, research authority, access, Epoch rank, rewards or payouts.

## ADR-005 — No deployment from ordinary CI

**Decision:** CI may compile, test, validate and package. It may not broadcast contracts, mint NFTs, issue gear, alter player state or move value.

## ADR-006 — Local source preview and exact-commit agent handoffs

**Decision:** Provide a loopback source preview with an in-memory synthetic Arena and explicitly unavailable host APIs. Coordinate Codex and AXO through source PRs, sanitized handoff records and exact source acknowledgments.

**Reason:** The extraction workspace needs a usable editing loop without implying production parity. AXO retains host integration knowledge, and live releases need traceable source, rollback and post-change evidence under the existing release gates.
