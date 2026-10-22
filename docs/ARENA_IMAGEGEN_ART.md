# Arena imagegen artwork

AXO-017 replaces AXO-016's decorative SVG graffiti and CSS paper-sticker stand-ins with artwork created through the built-in `image_gen` tool. The five selected paintings are the AXO tag, axolotl hoodie mascot, No Rug Zone sticker, Stay Weird sticker and violet diamond. The wordmark also has a small header derivative. The Pet itself, fitted clothing, masks and combat are unchanged.

## Saved assets and prompts

The complete published set is **347,610 bytes**, with transparent alpha preserved:

| Artwork | Runtime file | Dimensions |
| --- | --- | --- |
| AXO graffiti | `apps/arena-web/assets/runtime/degen-v2/axo-tag.webp` | 1024×512 |
| Header wordmark | `apps/arena-web/assets/runtime/degen-v2/axo-tag-small.webp` | 256×128 |
| Mascot sticker | `apps/arena-web/assets/runtime/degen-v2/axo-mascot.webp` | 256×256 |
| No Rug Zone | `apps/arena-web/assets/runtime/degen-v2/no-rug.webp` | 384×256 |
| Stay Weird | `apps/arena-web/assets/runtime/degen-v2/stay-weird.webp` | 384×256 |
| Diamond | `apps/arena-web/assets/runtime/degen-v2/diamond.webp` | 256×256 |

The exact final prompt set is [arena-imagegen-prompts.json](art/arena-imagegen-prompts.json). [The runtime manifest](../apps/arena-web/assets/runtime/degen-v2/manifest.json) records source/output hashes, dimensions, byte sizes and prompt keys. The selected generated PNGs are retained in the local task's `work/arena-imagegen/source/`; only the optimized WebPs are published. Original files in the imagegen library are preserved. Derivation is resizing and WebP encoding only, with no vector tracing, redraw or synthetic SVG texture. Built-in generation was used, not the CLI/API-key fallback.

## Presentation

`arenaDecal` now returns fixed-URL decorative images with intrinsic dimensions, empty alt text and no pointer input. The old decorative path data, orbit and CSS-painted paper stickers are retired. Ordinary functional control symbols remain separate from the painted illustration system. The new header image preserves its existing accessible home-link name.

Artwork remains behind the fitted actor or in dedicated sticker regions. Phone captions stay clear of the outfit; small corner stickers are omitted where a narrow name region needs space. The wardrobe card uses `overflow: clip`: oversized decorative images must not create a hidden scroll container that shifts its copy when a child receives keyboard focus. Native filters, pose disclosure, Preview labels, verified equipment and all authority/transaction locks remain.

## Publish and rollback

Publish the entire `degen-v2` directory with `interface-kit.mjs`, command-center, `degen.css?v=2` and index/client cache revision. The existing runtime-assets static route serves these files; no host API or router change is needed. Revalidate the client and CSS cache as a group. Do not publish generation masters or the synthetic review host.

The public serving test checks each committed WebP's status, MIME type, hash, size, dimensions and alpha, plus the total byte budget. Source PNG requests remain unavailable. AXO should verify all images on the actual host, phone header wrapping, keyboard focus, decoration clearance and unchanged identity/XP/numeric V1 gear/frozen combat. Follow existing release gates and separately authorized rollout. Roll back client/CSS/index together to AXO-016, leaving player/battle state and fitted assets intact. The unused new art folder needs no data migration.

See [AXO-017](handoffs/AXO-017.md) and [verification record](reviews/arena-imagegen-art.json). Source browser evidence is synthetic and does not establish live parity, formal art acceptance or target-device performance.
