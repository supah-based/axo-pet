import { getAddress } from 'ethers';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ZERO_HASH = `0x${'0'.repeat(64)}`;
const CID_RE = /^(?:b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;
const PLACEHOLDER_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
]);

function address(value, label, errors, { zeroAllowed = false } = {}) {
  try {
    const resolved = getAddress(String(value || ''));
    if (!zeroAllowed && resolved === '0x0000000000000000000000000000000000000000') errors.push(`${label} cannot be zero`);
    if (PLACEHOLDER_ADDRESSES.has(resolved.toLowerCase())) errors.push(`${label} cannot be a placeholder`);
    return resolved;
  } catch {
    errors.push(`${label} must be an exact EVM address`);
    return null;
  }
}

export function validateDeploymentConfig(config) {
  const errors = [];
  if (config?.schema !== 'AXO_PET_NFT_DEPLOYMENT_REVIEW_V1') errors.push('schema mismatch');
  if (config?.mode !== 'REVIEW_ONLY') errors.push('mode must stay REVIEW_ONLY');
  if (config?.broadcastEnabled !== false) errors.push('broadcastEnabled must stay false in checked-in config');
  if (Number(config?.network?.chainId) !== 4663) errors.push('chainId must equal 4663');
  if (config?.network?.rpcUrlEnv !== 'ROBINHOOD_RPC_URL') errors.push('rpcUrlEnv must be ROBINHOOD_RPC_URL');
  if (!Number.isSafeInteger(Number(config?.network?.evidenceBlock)) || Number(config.network.evidenceBlock) < 1) errors.push('evidenceBlock invalid');
  if (!HASH_RE.test(String(config?.network?.evidenceBlockHash || '')) || String(config.network.evidenceBlockHash).toLowerCase() === ZERO_HASH) errors.push('evidenceBlockHash invalid');
  address(config?.deployer?.address, 'deployer.address', errors);
  address(config?.controller?.address, 'controller.address', errors);
  address(config?.stateSigner?.address, 'stateSigner.address', errors);
  if (!Number.isSafeInteger(Number(config?.deployer?.nonce)) || Number(config.deployer.nonce) < 0) errors.push('deployer.nonce invalid');
  if (config?.metadata?.catalogId !== 'AXO_PET_NFT_TRAITS_V4_3') errors.push('catalogId mismatch');
  if (config?.metadata?.visualRevision !== '4.3.0') errors.push('visualRevision mismatch');
  if (!HASH_RE.test(String(config?.metadata?.catalogSha256 || '')) || String(config.metadata.catalogSha256).toLowerCase() === ZERO_HASH) errors.push('catalogSha256 invalid');
  if (!HASH_RE.test(String(config?.metadata?.artReleaseManifestSha256 || '')) || String(config.metadata.artReleaseManifestSha256).toLowerCase() === ZERO_HASH) errors.push('artReleaseManifestSha256 invalid');
  const gearContractUri = String(config?.metadata?.gearContractUri || '');
  const gearCid = gearContractUri.match(/^ipfs:\/\/([^/]+)(?:\/[^\s]{1,160})?$/)?.[1] || '';
  if (!CID_RE.test(gearCid) || /replace|placeholder/i.test(gearContractUri)) errors.push('gearContractUri must use a real bounded IPFS CID');
  const pinningReceipt = config?.metadata?.pinningReceipt;
  if (!pinningReceipt || pinningReceipt.cid !== gearCid
    || !HASH_RE.test(String(pinningReceipt.sha256 || ''))
    || String(pinningReceipt.sha256 || '').toLowerCase() === ZERO_HASH
    || !String(pinningReceipt.primaryFileId || '').trim()
    || !String(pinningReceipt.secondaryFileId || '').trim()
    || pinningReceipt.primaryFileId === pinningReceipt.secondaryFileId) {
    errors.push('pinningReceipt must prove two distinct completed pins for the gear metadata CID');
  }
  const gatewayChecks = Array.isArray(config?.metadata?.independentGatewayChecks) ? config.metadata.independentGatewayChecks : [];
  const gatewayHosts = new Set();
  for (const check of gatewayChecks) {
    if (check?.cid !== gearCid || String(check?.sha256 || '').toLowerCase() !== String(pinningReceipt?.sha256 || '').toLowerCase()) continue;
    try {
      const url = new URL(String(check.url));
      if (url.protocol === 'https:' && url.pathname.includes(gearCid) && !Number.isNaN(Date.parse(check.verifiedAt))) gatewayHosts.add(url.hostname);
    } catch {}
  }
  if (gatewayHosts.size < 2) errors.push('independentGatewayChecks must prove the exact CID and hash through two HTTPS gateway hosts');
  const gates = config?.reviewGates || {};
  const requiredGateNames = [
    'authorizationRecorded', 'coreArtComplete', 'artQaPassed', 'ipfsPinnedRedundantly',
    'metadataSchemaReviewed', 'stateSignerCustodyReviewed', 'mintConsentReviewed',
    'accountDeletionBehaviorReviewed', 'gearSupplyPolicyReviewed', 'contractTestsPassed',
    'contractSecurityReviewPassed', 'applicationTestsPassed', 'deploymentSimulationPassed',
  ];
  for (const gate of requiredGateNames) if (typeof gates[gate] !== 'boolean') errors.push(`reviewGates.${gate} must be boolean`);
  const deploymentReady = errors.length === 0 && requiredGateNames.every((gate) => gates[gate] === true);
  return { ok: errors.length === 0, errors, deploymentReady, requiredGateNames };
}
