# Arena and the shared verified Pet

Arena now consumes the same `AXO_PET_READ_V1` reader as Hatchery Wardrobe and Passport. The existing host remains the identity, XP and equipment authority. This is source integration; production binding and real-wallet parity are pending AXO-010.

## Authority and gameplay

- One verified session and one coherent `readVerifiedPetSnapshot` call per authenticated Arena request. The server maps exact identity/XP, gear revision, numeric V1 IDs, bounded item definitions/stats and canonical hashed layers. No browser-supplied Pet DTO or saved outfit is accepted as evidence.
- Current combat remains V1: the preserved XP curve caps the derived level at 10, while all XP above 1,200 is retained exactly. The proposed level 11–20 rules and five-piece sets are not activated.
- Verified empty equipment is allowed and labelled. Missing, inconsistent, stale, wrong-owner or unknown equipment returns 503 before Arena state is changed. An unminted Pet may play without gear only with explicit `UNAVAILABLE / NOT_MINTED` evidence; this never implies an NFT or verified empty chain loadout.
- Existing Arena entry packing freezes Pet identity/XP, allocation, moves, gear revision and stats. Later `/me` reads may show new XP/gear; existing rooms and tournament rosters retain their entry snapshot. Unknown evidence blocks authenticated requests, including reconnects/moves; server clocks continue and normal timeouts still apply. Do not bypass verification to restore availability.
- Wardrobe previews remain local cosmetic drafts. Their clothing, item levels and set definitions do not enter Arena identity, requests, builds, fights, rewards or replay exports. The new panel links to Wardrobe and Passport; it does not equip a preview on a combat fighter.
- No battle XP, payouts, signers, escrow, mint/equip/market actions or new Pet persistence.

## Existing-host ports

Use the exact same verified-session and coherent snapshot functions bound for AXO-008. Import the source module in the existing host process; no extra private endpoint or second Pet database is necessary.

```js
import { mountVerifiedPetArena } from './packages/arena-engine/src/mount.mjs';

mountVerifiedPetArena(existingExpressApp, {
  authenticate: existingVerifiedSessionPort,
  readVerifiedPetSnapshot: existingCoherentPetSnapshotPort,
  visualCatalog: pinnedCanonicalWebsiteVisualCatalog,
  sessionSecret: existingArenaSessionSecret,
  isPetHost: existingExactAxoPetHostGuard,
  service: existingArenaService,
});
```

Names above are placeholders for already reviewed host functions, not new environment settings. Actual locations are UNKNOWN until AXO confirms them. `authenticate(request,{signal})` must verify the real session and return `{verified:true,address}` only after that check. `readVerifiedPetSnapshot({session,signal})` returns `{identity,equipment}` using preserved host records and verified chain evidence. Retain account-active checks, actual owner binding, exact genesis/XP/level, Pet token/contract/chain, equipment revision, numeric definitions, positive balances and canonical catalog/hash checks. Take chain equipment at one confirmed block/hash and recheck Pet revision/identity coherence as required by AXO-008. Schema validation alone cannot prove RPC/session execution.

Requests have a bounded 10-second read deadline and propagate client disconnects. Ports should honor cancellation. Private failures disclose no raw adapter errors, addresses, credentials or state. The mount supplies exact-host/no-store gates; existing TLS/trusted-proxy handling must not accept an attacker-controlled forwarded host. Mutations retain the same-origin and JSON/8 KiB limits.

For a CommonJS host, `require('./packages/arena-engine/src/pet-arena.js').mountPetArena(app,options)` returns `{ready}`; **await `ready` before listening**. The old `currentSession/hatchery/resolveGear/stateFile` configuration is rejected. It performed separate reads and referenced absent monolith paths; do not retain it as a fallback.

## Arena state and compatibility

Supply the existing `ArenaService` using the workspace module and its preserved JSON file or `NormalizedArenaStore`. Keep authenticated mode and strict privacy. Preserve the exact file/store, ruleset version, existing session secret and timer owner. This mount creates no service, state path, timer or store, and does not close an operator-owned store. It intentionally avoids double ticking or replacing an existing persistence owner.

The HMAC profile key still uses `HMAC-SHA256(existingSecret, 'arena:' + lowercaseOwner)`. Do not rotate the secret or rename the owner namespace while adopting the adapter. Existing profile allocations/ranks/moves survive if valid; live read refreshes do not rewrite observation timestamps into profiles. Frozen old rooms are not rewritten. Schema-compatible JSON fields add hashed layers and a new identity-source tag without changing the Arena state version. AXO must verify this against a private sanitized copy of the actual store before any promotion; source tests do not prove live persistence parity.

GET `/api/arena/me` adds ephemeral `verification` evidence (observation/expiry, equipment status, revision/block, cosmetic/frozen-entry policies). Owner addresses, session/HMAC keys and credentials are not returned. POST `/build` accepts only allocation, ranks and moves; POST `/move` accepts only round/move. Client XP, Pet/gear and preview/outfit authority is rejected. Existing builds/combat use only server gear stats.

## Browser and replay delivery

Publish the changed `apps/arena-web/{index.html,app.mjs,http.mjs,render.mjs,replay.mjs,replay-export.mjs,styles.css}` and new `verified-panel.mjs` / `verified-visuals.mjs` together with the server adapter. The static allowlist serves the two browser modules, never server state or adapter source. Retain existing runtime battle assets and pinned canonical V5.1.1 catalog/assets.

The lobby and Pet build have a **Pet & equipped gear** panel: exact XP/current V1 level, numeric IDs, equipment revision/block and six stat contributions, with a separate cosmetic Preview notice. The existing host `/assets/wallet.js` module must be served from its established path and emit `axo:session`; account changes clear old views/requests immediately. There is no new wallet implementation. Unknown identity/equipment shows a blocking retry screen.

Verified fighter layers are fetched without credentials or redirects and checked against SHA-256 and 1,024 × 1,024 dimensions before canvas use. Failure keeps the existing animated lineage rig as a visual fallback; it never manufactures or removes stat evidence. Ordinary thumbnail images use the server-validated canonical URLs. Confirm hashes, CORS/same-origin delivery and the actual equipped fighter on the live asset host before release.

Equipped replay exports use additive `AXO_ARENA_PORTABLE_REPLAY_2`, retaining the frozen bounded six-stat `gearStats` in each build. Zero-gear exports remain `AXO_ARENA_PORTABLE_REPLAY_1`; the viewer/verifier accepts both with the unchanged V1 combat ruleset. Old viewers cannot read V2 exports, so publish the viewer and server exporter together. Replays include no wallet, Pet identity, NFT ownership proofs, equipment IDs, art or preview outfits. The fingerprint checks deterministic consistency, not a signature or ownership proof.

## Verification and source review

`npm run check` covers the shared adapter, HTTP authority rejection/failure behavior, exact XP, profile-key stability, entry freezing, replay V1/V2, image integrity, account races and source-preview isolation. Additional route regression checks: `node --test apps/arena-web/tests/repair-route-regressions.test.mjs`.

The ordinary `npm run dev` Arena stays a synthetic, memory-only review with disabled wallet signing. To inspect the shared pipeline with **invented** V1 NFT/equipment evidence, explicitly start a separate loopback server:

```js
import { createDevServer } from './scripts/dev-server.mjs';
createDevServer({ arenaReview: true }).listen(4325, '127.0.0.1');
```

It is labelled synthetic in the page and config and never enables private Hatchery/Pet APIs, wallet signing or live writes. Do not mount `tests/fixtures/arena-pipeline-review.mjs`, source preview routes or review credentials on the actual host.

## AXO acceptance and rollback

1. Acknowledge the exact AXO-010 source; report actual host revision and AXO-007/008/009 binding differences. Preserve host patches.
2. Privately snapshot the existing Arena store/config/assets and rehearse restoring them. Confirm single timer/store ownership and unchanged HMAC keys. No Pet ledger reset, XP recomputation or contract write is required.
3. Shadow-read the same real session through Pet API and Arena; compare genesis, exact XP, V1 level, revision, numeric items/stats and canonical layers. Check verified empty, unminted, RPC/indexer failure, wrong owner, expired session and stale revision.
4. Check account changes, stale UI responses, phone controls, all six lineage appearances, equipped fighter asset hashes and Preview separation. Try rejected browser XP/gear/outfit claims. Existing fight/tournament entries must keep their entry stats after equipment/XP changes; the next entry must use the new read.
5. Export/reopen an actual equipped replay and an older zero-gear V1 replay. Retain private evidence on the operator host and commit only sanitized totals/blockers.
6. Use the existing release gates for separately authorized promotion. On failure restore the paired browser/server revision and preserved store/config, stop the candidate's existing timer through its owner, and independently read back identity/XP/equipment and Arena entries. Do not delete newer battle history or change the Pet ledger during rollback; resolve post-cutover writes with the operator.

Published source/CI is not host integration, production deployment or AXO acknowledgment. All remain pending until AXO returns evidence.
