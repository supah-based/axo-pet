# Arena combat feel and sound

AXO-018 adds a presentation pass over the existing fitted combat. Resolved contact beats now drive localized warm/cyan accents and an original PCM sound bank. Soft ground shadows help the fighters sit on the stage. Existing anticipation, travel, recoil, bounded impact hold and recovery keep their original timing.

## Authority and fitting

Identity, exact XP, current V1 level, numeric equipment, legal commands, damage, winners, server deadlines and frozen entries are unchanged. Neither the audio director nor the contact effects reads pending opponent choices, cosmetic loadouts or candidate item/set stats. There are no new database records, rewards, battle XP, transactions or contract changes.

The same registered fitted surfaces, rig weights, bounded joint poses, rigid tool/palm/finger binding and depth masks remain in use. New contact accents are painted outside that rig. No independent tool rotation, silhouette substitution, clothing rescale or legacy costume fallback was introduced. Preview clothing remains cosmetic and visibly marked. Unsupported bases and GPU/static/failure paths retain the existing behavior.

`combat-beats.mjs` shares contact timing with the renderer, including the existing delayed reversal contact. The audio schedule is built only from the newly accepted resolved exchange. Meaningful blocked/damaged/healed amounts retain their existing visual readouts; the new sound is supplemental.

## Sound assets and controls

The thirteen mono PCM WAVs in `assets/runtime/audio-v1/` total **729,988 bytes**, at 22,050 Hz/16-bit. They are original synthesized AXO compositions rendered offline, with no external recordings, borrowed game audio or runtime oscillator placeholders. [The manifest](../apps/arena-web/assets/runtime/audio-v1/manifest.json) pins provenance, sizes, duration, SHA-256 and signal measurements. [The build script](../scripts/build-arena-audio.mjs) deterministically reproduces them; `combat-audio-bank.mjs` pins the same published files.

| Cue | Purpose |
| --- | --- |
| lock / deny / ready | Confirmed own commitment, rejected own command, observed fresh FIGHT transition |
| attack / guard / hit | Release, blocked contact and damaging contact |
| heal / charge / epic | Resolved healing, recharge/reserve and epic contact |
| victory / defeat / draw | Participant-relative outcome following a final resolved exchange |
| underground | Quiet eight-second optional battle ambience loop |

Enable **Sound** in the header. Presentation settings offers Master, Combat & interface, Underground ambience, Mono audio and **Test combat mix**. Only bounded volume/mono preferences persist in `axo.arena.audio.v1`; enabling sound does not persist across page loads. Playback starts from an explicit user gesture. A rejected/unsupported audio context or corrupt/unavailable asset reports unavailable while the game remains playable.

Master compression bounds overlapping peaks. Ambience ducks during a resolved exchange, then returns; changing volume cancels any scheduled return ramp so muting music cannot undo itself. Stereo placement is modest and optional through Mono. At most eight scheduled/playing effects plus one ambience source are retained. Important result/contact cues take precedence if a receipt produces more possible cues than the limit.

## Timing and lifecycle

- PCM sources are scheduled on the Web Audio clock at the same relative offsets used by contact visuals. Actual device output latency still needs listening/hardware acceptance.
- The existing receipt tracker gates new live exchanges. Repeated polling, initial history, reconnect, missed historical rounds and hidden-tab receipts do not replay attacks. Candidate looks cannot change cue selection.
- Replay seeks remain silent; current replay speed does not drive a new audio timeline. Audio is not a claim that replay clothing was historically equipped.
- Starting a new exchange cancels scheduled effects from the old one. Terminal polling preserves the final scheduled result cue. Non-exchange outcomes such as a forfeit do not fabricate a combat receipt or replay the previous hit.
- Route/account changes, renderer disposal, connection resync, hidden tabs and page hiding stop sources/loops. Loading is fixed to thirteen checked URLs with four workers, bounded bytes and six-second request timeouts; muting aborts requests and fences late completion. Enabling after decoding never queues past impacts.
- Reduced motion removes contact movement/accents while retaining static visual readouts. Audio remains independently optional.

## Verification and limits

The source tests cover PCM hashes/MIME/signal bounds, cue offsets across all move pairs, counter timing, outcome priority, eight-voice limits, mute/mono/volume behavior, cancellation during loading, corrupt/unsupported audio, renderer receipt/reconnect/replay fences and actual public asset serving. Existing pose/mesh/grip and fitted-only suites continue to exercise registration and authority boundaries.

The full required `npm run check` passes **400 tests**, including 200 Arena tests and nine source-preview checks. Exact source/file hashes and scoped review evidence are recorded in [the verification record](reviews/arena-combat-feel-sound.json).

Browser review uses invented memory-only Pets and battles. The bank decodes, mix controls and mono respond, the game remains fitted through a practice match ending in an eight-exchange knockout, reload starts Sound off, and desktop/390px settings remain usable with no recorded console warnings/errors in the reviewed flow. Screenshots: [settings](reviews/arena-combat-sound-settings.png), [phone controls](reviews/arena-combat-sound-mobile.png), [dressed fight](reviews/arena-combat-sound-fight.png), [attack phase](reviews/arena-combat-sound-contact.png), [result](reviews/arena-combat-sound-result.png).

This is a source presentation milestone. It does not establish physical-speaker/headphone mix acceptance, output-latency calibration, measured device FPS, every outfit's formal visual acceptance, real-wallet parity or live deployment. Those remain on the [quality checklist](ARENA_QUALITY_CHECKLIST.md).

## Host integration and rollback

Publish client/render, `combat-beats.mjs`, `combat-audio.mjs`, generated `combat-audio-bank.mjs`, `combat-feel.css`, index cache revisions and the complete versioned audio directory together. The static allowlist in `http.mjs` adds these modules/styles; WAVs use the existing public runtime asset route. Preserve the existing fitted catalog/model/media and imagegen art directories. Do not deploy the generator, tests or synthetic review host as public routes.

AXO should verify WAV MIME/size/hash, gesture-only start, volume/mono/mute, headphones/phone speakers, delayed/repeated/terminal receipts, hidden/reconnect/route cleanup and unchanged verified identity/XP/numeric gear/frozen battle values. Follow the existing release gates and operator authorization for any rollout. Roll back client/modules/CSS/index/static routing together to AXO-017. No player-state migration is required; the unused browser preference key and versioned sound directory may remain inert.

See [AXO-018](handoffs/AXO-018.md) for exact source, verification and acknowledgment status.
