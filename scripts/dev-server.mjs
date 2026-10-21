import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewApp } from '../apps/arena-web/server.mjs';
import { ArenaService } from '../apps/arena-web/service.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'apps/hatchery-web/public');
const pages = new Map([
  ['/', 'pet-home.html'], ['/my-axo', 'pet-dashboard.html'],
  ['/hatchery/game', 'hatchery-game.html'], ['/marketplace', 'pet-marketplace.html'],
  ['/nft', 'nft.html'], ['/gear-studio', 'anatomy-studio.html'], ['/gear-concepts', 'gear-studio.html'], ['/arena/', '../arena-web/index.html'],
]);
const publicFiles = new Set([
    'pet-home', 'pet-dashboard', 'pet-marketplace', 'hatchery-game', 'nft', 'gear-studio', 'anatomy-studio', 'gear-progression',
].flatMap(name => [`${name}.css`, `${name}.js`]));
const inheritedStyles = new Set([
  '/axo-dark.css', '/styles.css', '/portal.css', '/pet-shell.css', '/nft-v5-runtime.css',
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const previewBanner = `<aside aria-label="Local development preview" style="position:fixed;bottom:0;left:0;right:0;z-index:2147483647;display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:10px 16px;background:#10261e;color:#e5ffae;border-top:1px solid #a7d558;font:12px/1.5 system-ui"><strong>AXO LOCAL SOURCE</strong><span>Hatchery: UI only · Arena: synthetic test Pets</span><a style="color:inherit" href="/">Home</a><a style="color:inherit" href="/my-axo">My AXO</a><a style="color:inherit" href="/hatchery/game">Hatchery</a><a style="color:inherit" href="/nft">NFT</a><a style="color:inherit" href="/marketplace">Bazaar</a><a style="color:inherit" href="/arena/">Arena</a><a style="color:inherit" href="https://axo.pet" target="_blank" rel="noreferrer">Live ↗</a></aside>`;
const walletStub = `const unavailable = async () => { throw new Error('Wallet connections are unavailable in the local source preview.'); };
window.AxoWallet = Object.freeze({ ready: Promise.resolve(), getSession: () => ({ connected: false }), connect: unavailable, request: unavailable, sendTransaction: unavailable, ensureRobinhoodChain: unavailable });
document.addEventListener('click', event => { if (event.target.closest('[data-wallet-connect]')) { event.preventDefault(); window.alert('Local UI preview: wallet connections are unavailable. Use axo.pet for your live Pet.'); } }, true);`;

export function isPublicAsset(path) {
  return inheritedStyles.has(path) || /^\/(?:brand|hatchery-assets|hatchery-nft-v5(?:\.1\.1)?)\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpe?g|woff2)$/.test(path)
    && !path.split('/').some(segment => segment === '..' || segment.startsWith('.'));
}

export function createDevServer({ liveAssets = true, fetchAsset = fetch, wardrobeReview = false } = {}) {
  // An omitted file/store keeps all review identities, rooms and builds in memory.
  const service = new ArenaService({ mode: 'preview', matchmaking: true, privacyMode: 'strict' });
  const arena = previewApp({ service });
  const cache = new Map();
  let cachedBytes = 0;
  let reviewReader;
  const send = (req, res, status, content, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(req.method === 'HEAD' ? undefined : content);
  };
  const json = (req, res, status, value) => send(req, res, status, JSON.stringify(value));

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-AXO-Preview', 'LOCAL_SOURCE');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const host = req.headers.host || '';
      if (!/^127\.0\.0\.1:\d+$/.test(host)) return json(req, res, 403, { error: 'Use the loopback preview URL.' });
      const url = new URL(req.url, `http://${host}`);
      const path = decodeURIComponent(url.pathname);
      // Do not remap an absent extracted dashboard to a different product page.
      if ((path === '/hatchery' || path === '/hatchery/') && url.searchParams.get('view') !== 'wardrobe') {
        return send(req, res, 200, `<!doctype html><title>Hatchery extraction boundary</title><main style="max-width:720px;margin:80px auto;font:18px/1.6 system-ui"><h1>Hatchery dashboard awaits extraction</h1><p>The full production dashboard is still owned by the existing AXO host. This checkout includes My AXO and the Hatchery game entrypoint.</p><a href="/my-axo">Preview My AXO</a> · <a href="/hatchery/game">Preview Hatchery game</a> · <a href="https://axo.pet/hatchery">Open live Hatchery</a></main>${previewBanner}`, types['.html']);
      }
      if (path === '/arena') { res.writeHead(302, { Location: '/arena/' }); return res.end(); }
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (path.startsWith('/api/arena/')) {
          if (req.headers.origin !== `http://${host}` || req.headers['sec-fetch-site'] === 'cross-site') {
            return json(req, res, 403, { error: 'Same-origin synthetic Arena requests required.' });
          }
          return arena(req, res);
        }
        return json(req, res, 405, { error: 'Hatchery writes and wallet operations are unavailable in the local preview.' });
      }
      if (path === '/__dev/health') return json(req, res, 200, {
        mode: 'LOCAL_SOURCE', hatcheryApi: 'UNAVAILABLE', arena: 'SYNTHETIC_MEMORY_ONLY',
        liveAssetFallback: liveAssets, liveOrigin: 'https://axo.pet',
      });
      if (path === '/hatchery' || path === '/hatchery/') {
        const html = await readFile(resolve(publicRoot, 'hatchery-wardrobe.html'), 'utf8');
        return send(req, res, 200, html.replace('</body>', `${previewBanner}</body>`), types['.html']);
      }
      if (wardrobeReview && path === '/hatchery/wardrobe-review') {
        // Only the synthetic document may appear in its same-origin mobile QA frame.
        res.setHeader('Content-Security-Policy', res.getHeader('Content-Security-Policy').replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
        const html = (await readFile(resolve(publicRoot, 'hatchery-wardrobe.html'), 'utf8'))
          .replace('src="/wardrobe/entry.mjs"', 'src="/__dev/wardrobe-review.mjs"')
          .replace('<main class="hatchery-dashboard">', '<aside style="padding:12px 24px;background:#4c3620;color:#fff3db;font:14px system-ui">SYNTHETIC WARDROBE REVIEW · invented Pet/equipment · no live wallet, ledger or chain access</aside><main class="hatchery-dashboard">');
        return send(req, res, 200, html, types['.html']);
      }
      if (wardrobeReview && path === '/__dev/wardrobe-review.mjs') return send(req, res, 200, await readFile(resolve(root, 'tests/fixtures/wardrobe-review.mjs')), types['.mjs']);
      if (wardrobeReview && path === '/hatchery/wardrobe-mobile-review') return send(req, res, 200, await readFile(resolve(root, 'tests/fixtures/wardrobe-mobile.html')), types['.html']);
      if (wardrobeReview && path === '/__dev/wardrobe-fixture') {
        if (!reviewReader) {
          const { createWardrobeReader } = await import('../apps/pet-api/src/wardrobe-read.mjs');
          const fixture = JSON.parse(await readFile(resolve(root, 'packages/shared-schemas/fixtures/synthetic-v1.json'), 'utf8'));
          const visualCatalog = JSON.parse(await readFile(resolve(root, 'packages/gear-catalog/catalogs/website-visual-catalog-v5.json'), 'utf8'));
          const identity = { ...fixture.identities.level10Minted, name: 'Review AXO · synthetic', xp: 2675 };
          reviewReader = createWardrobeReader({ authenticate: async () => ({ verified: true, address: identity.ownerAddress }), readVerifiedPetSnapshot: async () => ({ identity, equipment: fixture.projections.full }), visualCatalog });
        }
        return json(req, res, 200, { syntheticOnly: true, read: await reviewReader(req) });
      }
      if (pages.has(path)) {
        const target = path === '/arena/' ? resolve(root, 'apps/arena-web/index.html') : resolve(publicRoot, pages.get(path));
        const html = await readFile(target, 'utf8');
        return send(req, res, 200, html.replace('</body>', `${previewBanner}</body>`), types['.html']);
      }
      if (path.startsWith('/api/arena/') || path.startsWith('/arena/')) return arena(req, res);
      if (path.startsWith('/api/')) return json(req, res, 503, {
        error: 'Local UI preview: the AXO host API has not been extracted. No live state is inferred.',
        code: 'HOST_ADAPTER_UNAVAILABLE',
      });
      if (path === '/assets/wallet.js') return send(req, res, 200, walletStub, types['.js']);
      if (['/nav.js', '/pet-shell.js', '/analytics.js'].includes(path)) return send(req, res, 200, '// Host-only integration omitted from local preview.\n', types['.js']);
      if (path === `/${basename(path)}` && publicFiles.has(basename(path))) {
        return send(req, res, 200, await readFile(resolve(publicRoot, basename(path))), types[extname(path)]);
      }
      if (/^\/gear-style-studio\/(?:model\.mjs|v1\/(?:catalog\.json|[a-z0-9_.-]+\.webp))$/.test(path)) {
        return send(req, res, 200, await readFile(resolve(publicRoot, '.' + path)), types[extname(path)]);
      }
        if (/^\/gear-anatomy\/(?:model\.mjs|v3\/(?:catalog\.json|[a-z0-9_.-]+\.webp))$/.test(path)) {
          return send(req, res, 200, await readFile(resolve(publicRoot, '.' + path)), types[extname(path)]);
        }
      if (/^\/gear-bazaar\/(?:(?:progression|gear-sets)-v2\.mjs|wardrobe-filters\.mjs|v1\/(?:catalog\.json|[a-z0-9_.-]+\.webp|metadata\/[a-z0-9-]+\.json))$/.test(path)) {
        return send(req, res, 200, await readFile(resolve(publicRoot, '.' + path)), types[extname(path)]);
      }
      if (/^\/wardrobe\/(?:(?:entry|view|model|markup)\.mjs|wardrobe\.css)$/.test(path)) {
        return send(req, res, 200, await readFile(resolve(publicRoot, '.' + path)), types[extname(path)]);
      }
      if (liveAssets && isPublicAsset(path)) {
        if (!cache.has(path)) {
          // Fixed-origin, GET-only asset reads. Never forward cookies, headers or query strings.
          const upstream = await fetchAsset(`https://axo.pet${path}`, { method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000) });
          if (!upstream.ok) return json(req, res, 502, { error: 'Public asset unavailable on the existing host.' });
          const buffer = Buffer.from(await upstream.arrayBuffer());
          if (buffer.length > 8 * 1024 * 1024) return json(req, res, 502, { error: 'Public asset exceeds preview limit.' });
          while (cachedBytes + buffer.length > 32 * 1024 * 1024 && cache.size) {
            const key = cache.keys().next().value;
            cachedBytes -= cache.get(key).length; cache.delete(key);
          }
          cache.set(path, buffer); cachedBytes += buffer.length;
        }
        return send(req, res, 200, cache.get(path), types[extname(path)]);
      }
      return json(req, res, 404, { error: 'Not included in the local source preview.' });
    } catch (error) {
      return json(req, res, error instanceof URIError ? 400 : 502, { error: 'Preview resource unavailable. Check local dependencies or the public asset connection.' });
    }
  });
  server.on('close', () => clearInterval(arena.arenaTimer));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4320);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const server = createDevServer({ liveAssets: process.env.AXO_PREVIEW_LIVE_ASSETS !== '0' });
  server.on('error', error => { console.error(`Preview could not start: ${error.message}`); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(`AXO local source preview: http://127.0.0.1:${port}\nHatchery: UI only. Arena: synthetic memory-only profiles. Refresh after editing.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
