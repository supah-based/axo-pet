# Arena Command Center and fitted Style Lab

AXO-012 adds a new Arena lobby, an isolated cosmetic animation lab and presentation/replay controls on top of AXO-010/011. The production host and its preserved records remain authoritative. This is a reviewable source release, not a completed AAA game or a live deployment.

## Player experience

- Command Center shows the current verified Pet, exact XP, numeric V1 equipment count, saved move build and active-entry resume action. Practice, private challenges and tournaments use the existing actions and locks.
- Style Lab (`/arena/#style-lab=1`) is a public reference preview with six lineage paintings, 43 fitted gear families, 473 proposed tiers, 13 complete outfits, six five-piece sets, slot/theme/search filters and three painted scenes plus the procedural deck.
- Each of the twelve move previews has anticipation, release and recovery, with distinct attack, shield, counter, support, recharge and epic effects. The fitted actor moves as a single registered surface: clothing, grip and foreground masks stay together. This is fixed-pose choreography, not newly authored skeletal animation.
- Tier 10–20 stats, minimum levels, XP thresholds and set bonuses are explicitly proposed design values. They never change the verified Pet's current V1 level, exact XP, saved combat build or equipped bonuses. At 17,950 exact XP the current verified V1 Pet remains level 10.
- Full-item artwork inspection is separate from the worn composition. Exported 2:3 PNGs include a burned-in Preview label. Cosmetic look links include only lineage, tier, scene and known family choices; they discard existing query strings, credentials and fragments. Empty looks round-trip explicitly.
- Replay exchange seeking and 0.5×/1×/1.5×/2× playback use the same checked completed replay. Speed changes preserve playback; automatic advancement preserves scroll and does not move focus to the heading.
- Local presentation settings support Auto/Low/High graphics, reduced motion, receipt readouts and higher text contrast. They contain no identity, XP or equipment fields. OS reduced motion always takes precedence. Existing sound remains optional and off by default.
- Guided lessons and existing spectator-consent/link controls live in a collapsed Match tools drawer in the fight's top bar. They no longer permanently obscure the fighters. Opening it explicitly warns that the server clock continues; disclosure and keyboard focus survive receipt refreshes. Consent/capability authority is unchanged.

## Authority and privacy

The Command Center consumes the existing private `/api/arena/me` projection. Lab entry does not require a wallet, invent a Pet session, poll private state, persist a new wardrobe, expose another player's equipment, or send candidate choices to an API. Leaving the lab requires the normal private read before an authenticated view. Existing account/view fences remain in place.

No combat formula, level cap, XP award, contract, item-ID mapping, replay format, service persistence, secret or timer changes. V2 Gear equip/mint/trading and candidate set bonuses remain locked. Lab tiers are not evidence of issued NFTs. This release requires no new host port, database, privileged identity or production process.

## Rendering and assets

`style-lab-model.mjs` pins the catalog SHA-256 to `45876f1faa4cd538ca4de3a70d0551cce392256cd2d610d62e3e52242e51069b`. Catalog changes require a reviewed pin update. Actor/scene bytes and dimensions are checked before decoding into the visible composition. A failed catalog or fitted layer disables portrait export and explains the failure. Final composites swap atomically; old selection loads cannot overwrite a newer look.

The HTTP router explicitly exposes:

- `command-center.mjs`, `command-center.css`, `presentation.mjs`, `style-lab.mjs`, `style-lab-model.mjs`;
- `/arena/atelier/catalog.json`, serving the exact committed Bazaar V1 catalog;
- `/arena/atelier/model.mjs`, serving the exact shared anatomy renderer model;
- `/arena/atelier/media/anatomy/<listed>.webp` and `/arena/atelier/media/bazaar/<listed>.webp`, only for catalog-listed runtime images.

The local `apps/arena-web/atelier/model.mjs` is a Node import shim, not the HTTP-served file. Publish the shared `apps/hatchery-web/public/gear-anatomy/model.mjs`, the catalog and all listed runtime WebPs alongside the Arena package. Preserve the exact fit/depth masks. Do not add a broad static mount for source masters, metadata folders, server files or private state.

Fitted layers use a twelve-entry 512×768 decoded-canvas LRU (about 18 MiB of pixel data), one 512×768 composite and a 600×900 output canvas. Live renderer targets are 60 FPS/1.8M pixels for High and 30 FPS/900k pixels for Low; Auto chooses Low on save-data/low-memory devices. These are caps/targets, not measured device FPS. Both renderers cancel RAF while hidden; returning to a live fight does not replay old hidden receipts. Disposing a lab aborts pending reads, cancels frames, removes listeners and revokes object URLs. Background-tab transitions freeze lab elapsed time; Pause freezes the actual pose and effects.

## Host integration and rollback

1. Confirm AXO-010 verified-reader and AXO-011 report integration against the real host revision. Preserve host-only differences and current store/secret/timer ownership.
2. Publish the Arena `app.mjs`, `render.mjs`, `index.html`, `http.mjs` and all five new browser/static files together. Include the shared catalog/model and manifest-listed image files at the paths above. Restart only the existing static-router host when necessary. No new configuration or migration is needed.
3. Check static routes and SHA/dimensions, canonical verified Pet/XP/V1 gear, current-entry resume and existing challenge/practice/tournament behavior.
4. Check public lab while signed out, private polling suppression, all six full sets, covered tops, hands/head masks, scenes, controls, share/export labels, failed assets and wallet switching. Verify preview stats never enter network writes or combat.
5. Check replay seek/speed/scroll, keyboard and 390-pixel controls, Low quality and OS/manual reduced motion. Real device profiling, assistive technology and live wallet parity remain required operator checks.
6. Roll back client modules, styles and static router together to the accepted prior source. Do not roll back or rewrite Arena/Pet records. Use existing release gates and return sanitized source/hash/readback evidence.

## Verification and next production work

Run `npm run check` with Node 22.23.1/npm 10.9.8. New tests cover all fitted family/lineage depth plans, all item/set tiers, continuous finite motion, strict selections/settings, integrity failures, public asset allowlists, private-state isolation, disposal, pause/visibility, reduced effects, cadence/pixel caps and replay controls. Browser screenshots are synthetic proof only: [Command Center](reviews/arena-command-center.png), [Style Lab](reviews/arena-style-lab.png).

See [the multi-domain review and next milestones](reviews/arena-command-center-review.md) and [AXO-012](handoffs/AXO-012.md). A passing source gate does not establish live-host parity, production reliability or AAA acceptance.
