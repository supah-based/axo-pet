// Public, fixed-origin GET diagnostics only. No wallet, cookies, credentials or database connection.
const endpoints = ['/api/axo-pet/overview', '/api/axo-pet/marketplace'];
const checks = [];
for (const endpoint of endpoints) {
  try {
    const response = await fetch(`https://axo.pet${endpoint}`, { credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    checks.push({ endpoint, httpStatus: response.status, schema: data.schema ?? null,
      ...(endpoint.endsWith('/marketplace') ? { status: data.status ?? 'UNKNOWN', tradingEnabled: data.tradingEnabled === true } : {}) });
    if (!response.ok) process.exitCode = 1;
  } catch { checks.push({ endpoint, status: 'UNAVAILABLE' }); process.exitCode = 1; }
}
console.log(JSON.stringify({ origin: 'https://axo.pet', checkedAt: new Date().toISOString(), access: 'PUBLIC_READ_ONLY',
  checks, questProgressAccess: 'REQUIRES_EXISTING_VERIFIED_SESSION_OR_AXO_HOST_DIAGNOSTICS' }, null, 2));
