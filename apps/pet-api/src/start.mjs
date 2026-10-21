import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPetApiServer } from './server.mjs';

export async function startPetApi({ adapterPath, port = 4330 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Pet API port must be 1–65535.');
  let options;
  if (adapterPath) {
    // Trusted operator-selected local code, never a request parameter or remote URL.
    if (!isAbsolute(adapterPath)) throw Error('Host adapter must be an absolute local module path.');
    const module = await import(pathToFileURL(adapterPath).href);
    if (typeof module.createPetApiPorts !== 'function') throw Error('Host adapter must export createPetApiPorts().');
    options = await module.createPetApiPorts();
    if (!options || typeof options.authenticate !== 'function' || typeof options.readVerifiedPetSnapshot !== 'function'
      || !options.visualCatalog || typeof options.checkReadiness !== 'function') throw Error('Complete host ports and a readiness probe are required.');
  }
  const server = createPetApiServer(options);
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const server = await startPetApi({ adapterPath: process.env.AXO_PET_API_ADAPTER_MODULE, port: Number(process.env.AXO_PET_API_PORT || 4330) });
    console.log(`AXO read-only Pet API on http://127.0.0.1:${server.address().port}; host adapter ${process.env.AXO_PET_API_ADAPTER_MODULE ? 'bound' : 'NOT_CONNECTED'}`);
    let stopping = false;
    const close = () => { if (stopping) return; stopping = true; server.close(); const timer = setTimeout(() => server.closeAllConnections(), 11000); timer.unref(); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
  } catch { console.error('Pet API startup failed. Check the local host adapter and port configuration.'); process.exitCode = 1; }
}
