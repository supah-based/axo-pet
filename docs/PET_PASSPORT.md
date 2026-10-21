# Pet Passport

The redesigned wallet-private Passport lives at `/passport` and inside `/nft#passport`. Collection and layer browsing remain intact; the NFT page skips its legacy private read when the new component is present. The Passport uses the existing wallet/session bridge and GET `/api/pet/v1/passport`, without relabelling legacy payloads as verified DTOs.

## One identity and visual read

The strict `AXO_PET_PASSPORT_V1` envelope contains exactly `{schemaVersion,status,pet,history}`. Its `pet` is the unchanged `AXO_PET_READ_V1` from the AXO-008 reader, invoked once. Identity, exact XP, current V1 level, NFT identity, numeric equipment/revision and canonical visuals retain their validators and existing host authority. No database, XP recalculation, transaction or metadata update is introduced.

The identity card composites original 1024-square V5.1.1 layers after checking fetched bytes against supplied hashes. Missing/mismatched assets leave the portrait unavailable while retaining the valid identity read. MINTED describes the returned NFT identity; it does not assert tokenURI/metadata synchronization. An appearance seed is not represented as a DNA hash.

Growth uses preserved V1 thresholds. Excess XP above level 10 stays exact, separate from proposed level-20 rules. The ten authored chapter forms are public catalog references. Reached/current states follow XP without invented dates. Opening a reference does not change the Pet. Lineage lore, role, temperament and motifs come from reviewed V4.3/V5.1.1 catalogs via generated `/passport/reference.json`, clearly separate from dated personal events.

## Existing-host history port

The host may add `readPetHistory({identity,signal})` to its existing ports. It runs only after the shared Pet read passes authentication/identity validation, and receives a copy of that verified identity. It must read actual existing ledger/receipt services without creating a second ledger, reconstructed events, award criteria or guessed hatch dates.

An available `AXO_PET_HISTORY_V1` has exactly these fields:

```text
schemaVersion, status: AVAILABLE
ownerAddress, petGenesisId, throughXp
coverage: COMPLETE | RECENT
hatchedAt: ISO timestamp | null
xpEvents: [{id, occurredAt, xpBefore, xpAfter, label}]       maximum 100
achievements: [{id, label, description, earnedAt}]          maximum 50
```

Owner/genesis and `throughXp` must match the Pet read. XP events run oldest to newest with unique IDs, valid timestamps, continuous before/after totals and a final total equal to exact current XP. COMPLETE starts at zero; RECENT may omit older events and is labelled as a recent window. An empty recent window does not mean no historical XP. Explicit correction events may reduce totals; they are displayed without recalculating current XP. Never fabricate a bridging event or label truncated history COMPLETE.

Awards need distinct IDs, bounded text and actual earned-at timestamps. Records cannot predate a known hatch date or exceed the existing five-second future clock tolerance. Unknown hatch dates remain null. `validatePetHistory` is shared between the server and generated browser runtime; the JSON schemas and `validatePassportRead` validate the complete envelope. These checks establish consistency, not receipt authenticity: AXO must establish the source evidence.

Missing history returns `AXO_PET_HISTORY_FAILURE_V1`, UNAVAILABLE / HOST_NOT_CONNECTED, data null. Exceptions/timeouts return HISTORY_UNAVAILABLE; inconsistent records return INCONSISTENT / SNAPSHOT_MISMATCH. Neither becomes successful empty history or a claim of no achievements. The Pet/equipment read remains usable. The optional history port has a two-second enforced deadline/cancellation and does not extend the Pet read's original expiry. Private/no-store, no CORS, GET-only and query/body rejection apply. Current milestones derived from the fresh Pet read appear separately, without fabricated award dates, NFT grants or rewards.

## Equipped versus Preview

The equipment panel displays numeric V1 IDs only from VERIFIED_ONCHAIN equipment; empty slots appear only in a verified loadout. Failed equipment reads stay unavailable.

Saved looks are read from Wardrobe's existing hashed wallet/Pet browser scope. Passport never creates, overwrites, removes or uploads outfits, and reports corrupt storage explicitly. A selected look opens in a separate 1024×1536 fitted canvas with an opaque Preview badge and no-ownership footer. It cannot replace canonical appearance, grant stats/bonuses/ownership or unlock V2 transactions. Creating/editing/exporting looks remains in Wardrobe.

Account changes and expiry clear identity, events, awards, lists, dialogs and portraits; late reads/renders are fenced. Background refresh preserves unchanged controls/focus through the shared session controller. Passport persists no identity, XP, historical records or awards. Image caches contain only public art.

## AXO installation and acceptance

1. Reconcile AXO-007/008 and current host patches. Mount the updated `createPetApiHandler(ports)` or equivalent GET `/api/pet/v1/passport`; include this third path in a separate-process same-origin proxy. Retain legitimate session credentials and private/no-store behavior; preserve unrelated routes.
2. Identify actual hatch-date, XP receipt and achievement sources. Bind optional `readPetHistory` only to those trusted records with the documented consistency. Missing evidence remains unavailable. Dependency readiness is separate from a specific wallet/history read.
3. Publish `passport.html`, `/passport/{entry,view,markup,model,history}.mjs`, `passport.css`, `reference.json`, matching `/wardrobe/model.mjs`, and existing anatomy/Bazaar assets. Add the `/passport` document route. The API process does not serve these assets.
4. Apply reviewed NFT section/module/CSS changes plus the `nft.js` legacy-reader guard to the actual host page. Preserve collection browsing and host patches. Embedded integration requires one `[data-axo-passport]` root, `/passport/passport.css` and `/passport/entry.mjs`.
5. Shadow-read real identity/XP/equipment/history against existing paths. Verify signed-out/revoked sessions, wallets switching, expiry, missing/inconsistent history/equipment, image/hash failures, storage isolation, reference forms, Preview separation and mobile controls. Keep player records/receipts private; return sanitized totals only.
6. Follow existing release gates and scoped operator authorization for live rollout. Rollback restores previous document/static/API routing; no player-state migration or XP rollback is needed. Return exact deployed source/assets, rollback and independent readback in AXO-009.

## Review and checks

Ordinary `/passport` shows no synthetic Pet without a real verified session. Explicit `createDevServer({passportReview:true})` enables `/passport/review`, a 390×844 `/passport/mobile-review` frame and isolated `/__dev/passport-*` fixtures. Invented Pet/XP/award/equipment records and a separate synthetic saved-look scope are labelled throughout. Never install review routes on the host.

```sh
node scripts/sync-wardrobe-runtime.mjs
node scripts/sync-passport-runtime.mjs
npm run test:passport
npm run test:dev
npm run check
```

Tests cover source/runtime/catalog parity, strict history/equipment/preview boundaries, exact XP, continuity/partial windows, deadlines, account races/expiry and fixture isolation. Browser QA uses labelled synthetic data; live host binding and real-wallet parity remain pending. Arena consuming the same verified projection is the next milestone, with cosmetic clothing excluded from combat authority.
