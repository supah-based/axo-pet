import { createServer } from 'node:http';
import { createPetReader, boundedRead } from './pet-read.mjs';
import { createReadHandler, readHeaders, sendJson } from './read-http.mjs';
import { wardrobeFromPetRead } from './wardrobe-read.mjs';

export function createPetApiHandler(options = {}) {
  const bound = options.authenticate !== undefined || options.readVerifiedPetSnapshot !== undefined || options.visualCatalog !== undefined;
  const read = bound ? createPetReader(options) : null;
  const unavailable = async () => { throw Error('Host adapter unavailable'); };
  const petHandler = createReadHandler(read || unavailable);
  const wardrobeHandler = createReadHandler(read ? async (request, context) => wardrobeFromPetRead(await read(request, context)) : unavailable,
    { unavailableCode: 'WARDROBE_READ_UNAVAILABLE' });
  return async (req, res) => {
    readHeaders(res);
    let url;
    try { url = new URL(req.url, 'http://host.invalid'); } catch { return sendJson(res, 400, { code: 'INVALID_REQUEST' }); }
    if (url.pathname === '/api/pet/v1/me') return petHandler(req, res);
    if (url.pathname === '/api/hatchery/wardrobe') return wardrobeHandler(req, res);
    if (!['/healthz', '/readyz'].includes(url.pathname)) return sendJson(res, 404, { code: 'NOT_FOUND' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return sendJson(res, 405, { code: 'READ_ONLY' }); }
    if (url.search) return sendJson(res, 400, { code: 'NO_CLIENT_IDENTITY_PARAMETERS' });
    if (url.pathname === '/healthz') return sendJson(res, 200, { service: 'axo-pet-api', status: 'RUNNING' });
    if (!read || typeof options.checkReadiness !== 'function') return sendJson(res, 503, { service: 'axo-pet-api', status: 'NOT_CONNECTED' });
    const controller = new AbortController(), abort = () => controller.abort();
    res.once('close', abort);
    try {
      const ready = await boundedRead(signal => options.checkReadiness({ signal }), { signal: controller.signal, timeoutMs: 2000 });
      return sendJson(res, ready?.ready === true ? 200 : 503, { service: 'axo-pet-api', status: ready?.ready === true ? 'READY' : 'UNAVAILABLE' });
    } catch { return sendJson(res, 503, { service: 'axo-pet-api', status: 'UNAVAILABLE' }); }
    finally { res.off('close', abort); }
  };
}

// No state store, signer, RPC credentials, cross-origin bridge or transaction routes.
export function createPetApiServer(options) {
  const server = createServer(createPetApiHandler(options));
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxRequestsPerSocket = 100;
  return server;
}
