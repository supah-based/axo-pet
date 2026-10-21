import { PetReadError } from './pet-read.mjs';

const safeCodes = new Set(['VERIFIED_SESSION_REQUIRED', 'PET_IDENTITY_UNAVAILABLE', 'PET_IDENTITY_INCONSISTENT',
  'PET_VISUAL_UNAVAILABLE', 'PET_PROJECTION_INCONSISTENT', 'PET_READ_TIMEOUT', 'PET_READ_ABORTED']);
export function readHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Cookie, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}
export function sendJson(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status); res.end(JSON.stringify(data));
}
export function createReadHandler(read, { unavailableCode = 'PET_READ_UNAVAILABLE' } = {}) {
  return async (req, res) => {
    readHeaders(res);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return sendJson(res, 405, { code: 'READ_ONLY' }); }
    let url;
    try { url = new URL(req.url, 'http://host.invalid'); } catch { return sendJson(res, 400, { code: 'INVALID_REQUEST' }); }
    if (url.search) return sendJson(res, 400, { code: 'NO_CLIENT_IDENTITY_PARAMETERS' });
    if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0')) return sendJson(res, 400, { code: 'NO_REQUEST_BODY' });
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort); res.once('close', abort);
    try { return sendJson(res, 200, await read(req, { signal: controller.signal })); }
    catch (error) {
      const known = error instanceof PetReadError && safeCodes.has(error.code);
      return sendJson(res, known ? error.httpStatus : 503, { code: known ? error.code : unavailableCode });
    } finally { req.off('aborted', abort); res.off('close', abort); }
  };
}
