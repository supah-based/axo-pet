// Only canonical, hash-bound V1 layers may enter the verified fighter renderer.
export function createVerifiedImageCache({ fetchImage = (...args) => fetch(...args), digest = bytes => crypto.subtle.digest('SHA-256', bytes), decode = decodeImage, limit = 64 } = {}) {
  const entries = new Map();
  function image(layer) {
    if (!/^\/hatchery-nft-v5(?:\.1\.1)?\/(?:pet|layer)_[a-z0-9_]+\.webp$/.test(layer?.url || '') || !/^[a-f0-9]{64}$/.test(layer?.sha256 || '')) return null;
    const key = layer.url + ':' + layer.sha256;
    if (!entries.has(key)) {
      if (entries.size >= limit) entries.delete(entries.keys().next().value);
      const entry = { image: null, ready: null, status:'pending' }; entries.set(key, entry);
      entry.ready = (async () => {
        const response = await fetchImage(layer.url, { credentials: 'omit', redirect: 'error', cache: 'no-cache', signal: AbortSignal.timeout(10000) });
        if (!response.ok || Number(response.headers.get('content-length')) > 8 * 1024 * 1024) throw Error('Unavailable canonical layer');
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw Error('Invalid canonical layer size');
        const hash = Array.from(new Uint8Array(await digest(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== layer.sha256) throw Error('Canonical layer hash mismatch');
        const decoded = await decode(bytes);
        if (decoded.naturalWidth !== 1024 || decoded.naturalHeight !== 1024) throw Error('Invalid canonical layer dimensions');
        entry.image = decoded;entry.status='ready';
      })().catch(() => {entry.status='failed';}); // Cached failure; never claim fallback art is verified gear.
    }
    return entries.get(key).image;
  }
  return { image, state:layer=>entries.get(layer?.url+':'+layer?.sha256)?.status||'unloaded', settled: () => Promise.all([...entries.values()].map(entry => entry.ready)) };
}
async function decodeImage(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  try { const image = new Image(); image.src = url; await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}
