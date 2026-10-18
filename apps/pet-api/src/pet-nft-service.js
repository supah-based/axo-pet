'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { readJson, writeJsonAtomic } = require('../lib/state-store');
const blockscoutPro = require('../services/blockscout-pro');
const {
  aggregateGearArenaStats,
  buildPetNftMetadata,
  canonicalJson,
  gearProfile,
  loadPetNftCatalog,
  petNftRuntimeAsset,
  petNftState,
  renderPetNftComposite,
} = require('./pet-nft');
const {
  EXPECTED_V4_MASTER_ASSET_COUNT,
  EXPECTED_V4_RELEASE_FILE_COUNT,
  verifyV4ReleaseManifest,
} = require('./pet-nft-v4-art-release');
const { createPinataPetNftPublisher } = require('./pet-nft-publisher');
const {
  loadV5WebsiteCatalog,
  renderV5GearComposite,
  v5LoadoutFromGearItems,
  v5WebsiteVisualState,
} = require('./pet-visual-v5');

const PET_ABI = [
  'function owner() view returns (address)',
  'function stateSigner() view returns (address)',
  'function gearContract() view returns (address)',
  'function mintingActive() view returns (bool)',
  'function paused() view returns (bool)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function petState(uint256 tokenId) view returns (tuple(bytes32 genesisHash,bytes32 dnaHash,bytes32 stateHash,uint64 revision,uint64 gearRevision,uint8 lineage,uint8 level,uint8 originEnvironment,uint8 activeEnvironment,uint8 aura,uint8 gill,uint8 eye,uint8 marking,uint8 sigil,uint8 constellation,uint8 specialization))',
  'function walletEverMinted(address wallet) view returns (bool)',
  'function petOfWallet(address wallet) view returns (uint256 tokenId)',
  'function mintWithVoucher((address recipient,uint256 tokenId,bytes32 genesisHash,bytes32 dnaHash,bytes32 stateHash,uint64 nonce,uint64 deadline,uint8 lineage,uint8 level,uint8 environment,uint8 aura,uint8 gill,uint8 eye,uint8 marking,uint8 sigil,uint8 constellation,uint8 specialization,bytes32 metadataHash) voucher,string metadataUri,bytes signature) returns (uint256 tokenId)',
  'function updatePet((uint256 tokenId,bytes32 stateHash,uint64 revision,uint64 gearRevision,uint64 deadline,uint8 level,uint8 activeEnvironment,uint8 specialization,bytes32 metadataHash) update,string metadataUri,bytes signature)',
];
const GEAR_ABI = [
  'function petContract() view returns (address)',
  'function loadout(uint256 petTokenId) view returns (uint256[8] items)',
  'function gearArenaStats(uint256 gearId) view returns (uint8[6] stats)',
];
const PET_INTERFACE = new ethers.Interface(PET_ABI);
const MINT_TYPES = {
  MintVoucher: [
    { name: 'recipient', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'genesisHash', type: 'bytes32' },
    { name: 'dnaHash', type: 'bytes32' },
    { name: 'stateHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'lineage', type: 'uint8' },
    { name: 'level', type: 'uint8' },
    { name: 'environment', type: 'uint8' },
    { name: 'aura', type: 'uint8' },
    { name: 'gill', type: 'uint8' },
    { name: 'eye', type: 'uint8' },
    { name: 'marking', type: 'uint8' },
    { name: 'sigil', type: 'uint8' },
    { name: 'constellation', type: 'uint8' },
    { name: 'specialization', type: 'uint8' },
    { name: 'metadataHash', type: 'bytes32' },
  ],
};
const UPDATE_TYPES = {
  PetUpdate: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'stateHash', type: 'bytes32' },
    { name: 'revision', type: 'uint64' },
    { name: 'gearRevision', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'level', type: 'uint8' },
    { name: 'activeEnvironment', type: 'uint8' },
    { name: 'specialization', type: 'uint8' },
    { name: 'metadataHash', type: 'bytes32' },
  ],
};

function normalizeAddress(value) {
  if (!ethers.isAddress(value)) throw new Error('pet_nft_address_invalid');
  return String(value).toLowerCase();
}

function normalizeHash(value, code = 'pet_nft_hash_invalid') {
  const hash = String(value || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error(code);
  return hash;
}

function metadataUriHash(uri) {
  const value = String(uri || '');
  if (!/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(value)) throw new Error('pet_nft_metadata_uri_invalid');
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function authorizationNonce() {
  return BigInt(`0x${crypto.randomBytes(8).toString('hex')}`).toString();
}

function domain(contractAddress) {
  return { name: 'AXO Pets', version: '1', chainId: 4663, verifyingContract: contractAddress };
}

function mintVoucherFor({ recipient, state, metadataUri, deadline, nonce = authorizationNonce() }) {
  return {
    recipient,
    tokenId: state.tokenId,
    genesisHash: state.genesisHash,
    dnaHash: state.dnaHash,
    stateHash: state.stateHash,
    nonce,
    deadline,
    lineage: Number(state.lineage.id),
    level: Number(state.growth.level),
    environment: Number(state.originEnvironment.id),
    aura: Number(state.aura.id),
    gill: Number(state.gillCrest.id),
    eye: Number(state.eyeLens.id),
    marking: Number(state.bodyMarking.id),
    sigil: Number(state.birthSigil.id),
    constellation: Number(state.constellation.id),
    specialization: Number(state.specialization.id),
    metadataHash: metadataUriHash(metadataUri),
  };
}

function updateVoucherFor({ state, metadataUri, deadline }) {
  return {
    tokenId: state.tokenId,
    stateHash: state.stateHash,
    revision: Number(state.metadataRevision),
    gearRevision: Number(state.gearRevision),
    deadline,
    level: Number(state.growth.level),
    activeEnvironment: Number(state.activeEnvironment.id),
    specialization: Number(state.specialization.id),
    metadataHash: metadataUriHash(metadataUri),
  };
}

function transactionAddress(record) {
  return String(record?.hash || record || '').toLowerCase();
}

function verifyIndexedSubmission(transaction, expected) {
  if (!transaction) throw new Error('pet_nft_confirmation_pending');
  if (String(transaction.status || '').toLowerCase() !== 'ok' || String(transaction.result || '').toLowerCase() !== 'success') {
    throw new Error('pet_nft_transaction_failed');
  }
  if (normalizeHash(transaction.hash, 'pet_nft_indexed_transaction_hash_invalid') !== normalizeHash(expected.hash, 'pet_nft_expected_transaction_hash_invalid')) {
    throw new Error('pet_nft_transaction_hash_mismatch');
  }
  if (transactionAddress(transaction.to) !== normalizeAddress(expected.to)) throw new Error('pet_nft_transaction_contract_mismatch');
  if (transactionAddress(transaction.from) !== normalizeAddress(expected.from)) throw new Error('pet_nft_transaction_sender_mismatch');
  if (String(transaction.raw_input || '').toLowerCase() !== String(expected.data || '').toLowerCase()) {
    throw new Error('pet_nft_transaction_calldata_mismatch');
  }
  const blockNumber = Number(transaction.block_number);
  if (!Number.isSafeInteger(blockNumber) || blockNumber < Number(expected.minimumBlock || 1)) {
    throw new Error('pet_nft_transaction_block_invalid');
  }
  const confirmedAt = new Date(transaction.timestamp);
  if (!Number.isFinite(confirmedAt.getTime())) throw new Error('pet_nft_transaction_timestamp_invalid');
  if (Math.floor(confirmedAt.getTime() / 1_000) > Number(expected.deadline)) throw new Error('pet_nft_transaction_after_authorization_expiry');
  const blockHash = transactionAddress(transaction.block_hash);
  if (!/^0x[0-9a-f]{64}$/.test(blockHash)) throw new Error('pet_nft_transaction_block_hash_invalid');
  return { blockNumber, blockHash, confirmedAt: confirmedAt.toISOString() };
}

function createPetNftService({
  settings,
  hatchery,
  provider = null,
  indexedProvider = blockscoutPro,
  publisher = null,
  receiptRoot,
  now = () => Date.now(),
  catalog = loadPetNftCatalog(),
  websiteVisualCatalog = loadV5WebsiteCatalog(),
} = {}) {
  if (!settings || !hatchery) throw new Error('pet_nft_service_configuration_required');
  const rpc = provider || new ethers.JsonRpcProvider(settings.rpcUrl, 4663, { staticNetwork: true });
  const ipfs = publisher || createPinataPetNftPublisher({
    primaryJwt: settings.pinataPrimaryJwt,
    secondaryJwt: settings.pinataSecondaryJwt,
    groupId: settings.pinataGroupId,
  });
  const root = receiptRoot || path.join(process.cwd(), 'state', 'pet-nft');
  const releaseFlights = new Map();
  const walletLocks = new Map();
  let artReleaseCache = null;

  async function withWalletLock(address, task) {
    const key = normalizeAddress(address);
    const previous = walletLocks.get(key) || Promise.resolve();
    let release;
    const currentGate = new Promise((resolve) => { release = resolve; });
    const queued = previous.catch(() => {}).then(() => currentGate);
    walletLocks.set(key, queued);
    await previous.catch(() => {});
    try {
      return await task();
    } finally {
      release();
      if (walletLocks.get(key) === queued) walletLocks.delete(key);
    }
  }

  function verifiedArtRelease() {
    const manifestFile = settings.artReleaseManifestFile;
    if (!settings.artReleaseReady || !manifestFile || !fs.existsSync(manifestFile)) throw new Error('pet_nft_art_release_manifest_required');
    const stat = fs.statSync(manifestFile);
    const cacheKey = `${stat.size}:${stat.mtimeMs}:${settings.artReleaseManifestSha256}`;
    if (artReleaseCache?.cacheKey === cacheKey) return artReleaseCache;
    const raw = fs.readFileSync(manifestFile);
    const actualHash = `0x${crypto.createHash('sha256').update(raw).digest('hex')}`;
    if (actualHash.toLowerCase() !== normalizeHash(settings.artReleaseManifestSha256, 'pet_nft_art_release_hash_invalid')) {
      throw new Error('pet_nft_art_release_hash_mismatch');
    }
    const manifest = JSON.parse(raw.toString('utf8'));
    const verifiedAssets = verifyV4ReleaseManifest({ catalog, manifest, artRoot: settings.artRoot });
    const assetHashes = new Map();
    for (const [key, asset] of verifiedAssets) {
      if (!key.startsWith('MASTER:')) continue;
      assetHashes.set(asset.file.slice(`${path.resolve(settings.artRoot)}${path.sep}`.length).split(path.sep).join('/'), asset.sha256);
    }
    if (assetHashes.size !== EXPECTED_V4_MASTER_ASSET_COUNT) {
      throw new Error('pet_nft_art_release_manifest_incomplete');
    }
    artReleaseCache = { cacheKey, manifest, manifestHash: actualHash, assetHashes, verifiedAssets };
    return artReleaseCache;
  }

  function signer() {
    if (!settings.stateSignerPrivateKey) return null;
    try {
      const wallet = new ethers.Wallet(settings.stateSignerPrivateKey);
      return wallet.address.toLowerCase() === String(settings.expectedStateSigner || '').toLowerCase() ? wallet : null;
    } catch {
      return null;
    }
  }

  function localStatus() {
    const signingWallet = signer();
    const blockers = [];
    let artRelease = null;
    if (settings.status !== 'CONFIGURED') blockers.push(String(settings.status || 'NOT_CONFIGURED'));
    if (!settings.artReleaseReady) blockers.push('ART_RELEASE_REQUIRED');
    if (!fs.existsSync(settings.artRoot)) blockers.push('ART_FILES_REQUIRED');
    if (settings.artReleaseReady && fs.existsSync(settings.artRoot)) {
      try { artRelease = verifiedArtRelease(); }
      catch { blockers.push('ART_RELEASE_ATTESTATION_REQUIRED'); }
    }
    const archiveReady = artRelease?.manifest?.publishing?.ipfsPublished === true
      && artRelease.manifest.publishing.redundantPinsConfirmed === true
      && /^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(artRelease.manifest.publishing.layerArchiveUri || ''));
    if (artRelease && !archiveReady) blockers.push('IMMUTABLE_ART_ARCHIVE_REQUIRED');
    if (!ipfs.status().configured) blockers.push('REDUNDANT_IPFS_PINNING_REQUIRED');
    if (!signingWallet) blockers.push('STATE_SIGNER_REQUIRED');
    if (typeof indexedProvider.isEnabled === 'function' && !indexedProvider.isEnabled()) blockers.push('BLOCKSCOUT_CONFIRMATION_REQUIRED');
    const mintBlockers = [...blockers];
    if (!settings.mintingRequested) mintBlockers.push('MINTING_ACTIVATION_REQUIRED');
    return {
      status: blockers.length ? 'BLOCKED' : 'READY_FOR_LIVE_READBACK',
      mintingStatus: mintBlockers.length ? 'BLOCKED' : 'READY_FOR_LIVE_READBACK',
      chainId: 4663,
      contractAddress: settings.contractAddress || null,
      gearContractAddress: settings.gearContractAddress || null,
      soulbound: true,
      updateableMetadata: true,
      tradableGearOnly: true,
      serverBroadcasterEnabled: false,
      art: {
        catalogId: catalog.catalogId,
        visualRevision: catalog.visualRevision,
        releaseReady: Boolean(artRelease),
        manifestHash: artRelease?.manifestHash || null,
        validatedAssets: artRelease?.verifiedAssets?.size || 0,
        expectedAssets: EXPECTED_V4_RELEASE_FILE_COUNT,
        immutableArchiveReady: archiveReady,
        immutableArchiveUri: archiveReady ? artRelease.manifest.publishing.layerArchiveUri : null,
      },
      pinning: ipfs.status(),
      signerConfigured: Boolean(signingWallet),
      mintingRequested: settings.mintingRequested === true,
      blockers,
      mintBlockers,
    };
  }

  async function liveReadiness({ requireMinting = false } = {}) {
    const local = localStatus();
    const blockers = requireMinting ? local.mintBlockers : local.blockers;
    if (blockers.length) throw new Error(`pet_nft_not_ready:${blockers.join(',')}`);
    const [network, petCode, gearCode] = await Promise.all([
      rpc.getNetwork(),
      rpc.getCode(settings.contractAddress),
      rpc.getCode(settings.gearContractAddress),
    ]);
    if (Number(network.chainId) !== 4663) throw new Error('pet_nft_chain_mismatch');
    if (ethers.keccak256(petCode).toLowerCase() !== String(settings.expectedRuntimeCodeHash).toLowerCase()) throw new Error('pet_nft_runtime_mismatch');
    if (ethers.keccak256(gearCode).toLowerCase() !== String(settings.expectedGearRuntimeCodeHash).toLowerCase()) throw new Error('pet_nft_gear_runtime_mismatch');
    const pet = new ethers.Contract(settings.contractAddress, PET_ABI, rpc);
    const gear = new ethers.Contract(settings.gearContractAddress, GEAR_ABI, rpc);
    const [owner, stateSigner, gearContract, paused, mintingActive, gearPetContract] = await Promise.all([
      pet.owner(), pet.stateSigner(), pet.gearContract(), pet.paused(), pet.mintingActive(), gear.petContract(),
    ]);
    if (normalizeAddress(owner) !== normalizeAddress(settings.expectedController)) throw new Error('pet_nft_controller_mismatch');
    if (normalizeAddress(stateSigner) !== normalizeAddress(settings.expectedStateSigner)) throw new Error('pet_nft_state_signer_mismatch');
    if (normalizeAddress(gearContract) !== normalizeAddress(settings.gearContractAddress)) throw new Error('pet_nft_gear_binding_mismatch');
    if (normalizeAddress(gearPetContract) !== normalizeAddress(settings.contractAddress)) throw new Error('pet_nft_pet_binding_mismatch');
    if (paused) throw new Error('pet_nft_contract_paused');
    if (requireMinting && !mintingActive) throw new Error('pet_nft_contract_minting_inactive');
    return { pet, gear, mintingActive };
  }

  function releaseFile(stateHash) {
    return path.join(root, 'releases', `${normalizeHash(stateHash).slice(2)}.json`);
  }

  async function createPetRelease(pet, state) {
    const file = releaseFile(state.stateHash);
    const prior = readJson(file, null);
    if (prior?.stateHash === state.stateHash && prior?.metadata?.uri && prior?.image?.uri) return prior;
    const artRelease = verifiedArtRelease();
    const gearById = new Map(catalog.launchGear.map((item) => [Number(item.id), item]));
    const slotByKey = new Map(catalog.gearSlots.map((item) => [item.key, item]));
    const gear = Object.entries(state.loadout).filter(([, id]) => Number(id) > 0).map(([slot, id]) => gearProfile({
      ...gearById.get(Number(id)),
      slot,
      slotLabel: slotByKey.get(slot)?.label || slot,
    }));
    let imageVisual = null;
    let imageBuffer;
    if (gear.length) {
      const rendered = await renderV5GearComposite({ ...pet, level: state.growth.level }, {
        catalog: websiteVisualCatalog,
        loadout: state.loadout,
        outputFormat: 'png',
      });
      imageVisual = rendered.visual;
      imageBuffer = rendered.buffer;
    } else {
      imageBuffer = await renderPetNftComposite(state, {
        catalog,
        artRoot: settings.artRoot,
        outputFormat: 'png',
        assetHashes: artRelease.assetHashes,
      });
    }
    const image = await ipfs.uploadPublic(imageBuffer, {
      name: `axo-pet-${state.tokenId}-r${state.metadataRevision}.png`,
      mimeType: 'image/png',
      keyvalues: {
        catalogId: imageVisual?.catalogId || state.catalogId,
        visualRevision: imageVisual?.visualRevision || state.visual.visualRevision,
        stateHash: state.stateHash,
        tokenId: state.tokenId,
        kind: 'AXO_PET_IMAGE',
      },
    });
    const previousMetadataUri = state.metadataRevision > 1 && /^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(pet?.nft?.metadataUri || ''))
      ? String(pet.nft.metadataUri)
      : null;
    const metadataDocument = buildPetNftMetadata({
      pet,
      state,
      imageUri: image.uri,
      previousMetadataUri,
      artReleaseManifestSha256: settings.artReleaseManifestSha256,
      gear,
      imageVisual,
    });
    const metadataBuffer = Buffer.from(canonicalJson(metadataDocument));
    const metadata = await ipfs.uploadPublic(metadataBuffer, {
      name: `axo-pet-${state.tokenId}-r${state.metadataRevision}.json`,
      mimeType: 'application/json',
      keyvalues: { catalogId: state.catalogId, stateHash: state.stateHash, tokenId: state.tokenId, kind: 'AXO_PET_METADATA' },
    });
    const receipt = {
      schema: 'AXO_PET_NFT_IPFS_RELEASE_V1',
      releasedAt: new Date(now()).toISOString(),
      catalogId: state.catalogId,
      visualRevision: state.visual.visualRevision,
      artReleaseManifestSha256: settings.artReleaseManifestSha256,
      tokenId: state.tokenId,
      genesisHash: state.genesisHash,
      dnaHash: state.dnaHash,
      stateHash: state.stateHash,
      metadataRevision: state.metadataRevision,
      gearRevision: state.gearRevision,
      previousMetadataUri,
      layerAssetIds: state.visual.layers.map((layer) => layer.assetId),
      image,
      metadata,
    };
    writeJsonAtomic(file, receipt);
    return receipt;
  }

  async function releasePet(pet, state) {
    const key = normalizeHash(state.stateHash);
    const priorFlight = releaseFlights.get(key);
    if (priorFlight) return priorFlight;
    const flight = createPetRelease(pet, state).finally(() => {
      if (releaseFlights.get(key) === flight) releaseFlights.delete(key);
    });
    releaseFlights.set(key, flight);
    return flight;
  }

  function authorizationIdFor(action, recipient) {
    const hex = crypto.createHash('sha256').update(`AXO_PET_NFT_AUTH:${action}:${normalizeAddress(recipient)}`).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function authorizationFile(id) {
    return path.join(root, 'authorizations', `${String(id).toLowerCase()}.json`);
  }

  function activeAuthorization(action, recipient) {
    const id = authorizationIdFor(action, recipient);
    const plan = readJson(authorizationFile(id), null);
    return plan ? { id, plan } : null;
  }

  function writeAuthorization(plan) {
    const id = authorizationIdFor(plan.action, plan.recipient);
    const stored = { ...plan, id, createdAt: new Date(now()).toISOString(), confirmed: false };
    writeJsonAtomic(authorizationFile(id), stored);
    return stored;
  }

  function readAuthorization(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new Error('pet_nft_authorization_invalid');
    const file = authorizationFile(id);
    const plan = readJson(file, null);
    if (!plan) throw new Error('pet_nft_authorization_not_found');
    return { file, plan };
  }

  function unexpiredActiveAuthorization(action, recipient) {
    const active = activeAuthorization(action, recipient);
    if (!active?.plan || active.plan.confirmed || Number(active.plan.deadline) < Math.floor(now() / 1_000)) return null;
    return active.plan;
  }

  function mintPreparationResponse(authorization, state) {
    return {
      status: 'WALLET_CONFIRMATION_REQUIRED',
      authorizationId: authorization.id,
      expiresAt: new Date(authorization.deadline * 1_000).toISOString(),
      transaction: authorization.transaction,
      preview: { tokenId: state.tokenId, imageUri: authorization.imageUri, traits: state, soulbound: true },
      consent: {
        permanent: true,
        transferable: false,
        publicWalletBinding: true,
        metadataUpdates: 'AXO_SIGNED_USER_SUBMITTED',
        accountDeletionDoesNotDeleteNft: true,
      },
    };
  }

  function updatePreparationResponse(authorization, state) {
    return {
      status: 'WALLET_CONFIRMATION_REQUIRED',
      authorizationId: authorization.id,
      expiresAt: new Date(authorization.deadline * 1_000).toISOString(),
      transaction: authorization.transaction,
      preview: { tokenId: state.tokenId, imageUri: authorization.imageUri, traits: state, soulbound: true },
    };
  }

  async function prepareMintUnlocked(address) {
    const recipient = normalizeAddress(address);
    const { pet } = await liveReadiness({ requireMinting: true });
    const snapshot = hatchery.snapshot(recipient);
    if (!snapshot.hatched) throw new Error('pet_not_hatched');
    if (snapshot.pet.nft?.status === 'MINTED_SOULBOUND') throw new Error('pet_nft_already_minted');
    if (await pet.walletEverMinted(recipient)) throw new Error('pet_nft_onchain_reconciliation_required');
    const state = petNftState(snapshot.pet, { catalog, metadataRevision: 1, gearRevision: 0, loadout: {} });
    const active = unexpiredActiveAuthorization('MINT', recipient);
    if (active) {
      if (String(active.stateHash).toLowerCase() !== state.stateHash.toLowerCase()) throw new Error('pet_nft_authorization_pending');
      return mintPreparationResponse(active, state);
    }
    const release = await releasePet(snapshot.pet, state);
    const deadline = Math.floor(now() / 1_000) + 15 * 60;
    const voucher = mintVoucherFor({ recipient, state, metadataUri: release.metadata.uri, deadline });
    const signature = await signer().signTypedData(domain(settings.contractAddress), MINT_TYPES, voucher);
    const data = PET_INTERFACE.encodeFunctionData('mintWithVoucher', [voucher, release.metadata.uri, signature]);
    const authorization = writeAuthorization({
      action: 'MINT', recipient, deadline, tokenId: state.tokenId, genesisHash: state.genesisHash,
      dnaHash: state.dnaHash, stateHash: state.stateHash, metadataRevision: 1,
      visualRevision: state.visual.visualRevision,
      layerAssetIds: state.visual.layers.map((layer) => layer.assetId),
      metadataUri: release.metadata.uri, imageUri: release.image.uri, voucher, signature,
      transaction: { from: recipient, to: settings.contractAddress, data, value: '0x0' },
    });
    return mintPreparationResponse(authorization, state);
  }

  async function prepareMint(address) {
    return withWalletLock(address, () => prepareMintUnlocked(address));
  }

  async function prepareUpdateUnlocked(address) {
    const recipient = normalizeAddress(address);
    const { pet, gear } = await liveReadiness();
    const snapshot = hatchery.snapshot(recipient);
    if (!snapshot.hatched || snapshot.pet.nft?.status !== 'MINTED_SOULBOUND') throw new Error('pet_nft_not_minted');
    const tokenId = String(snapshot.pet.nft.tokenId);
    const blockTag = await rpc.getBlockNumber();
    const callAtBlock = { blockTag };
    const [owner, current, rawLoadout] = await Promise.all([
      pet.ownerOf(tokenId, callAtBlock),
      pet.petState(tokenId, callAtBlock),
      gear.loadout(tokenId, callAtBlock),
    ]);
    if (normalizeAddress(owner) !== recipient) throw new Error('pet_nft_owner_mismatch');
    const currentLevel = Number(current.level);
    const hatcheryLevel = Number(snapshot.pet.level || 1);
    const targetLevel = Math.min(hatcheryLevel, currentLevel + 1);
    const loadout = Object.fromEntries(catalog.gearSlots.map((slot, index) => [slot.key, Number(rawLoadout[index])]));
    const state = petNftState({ ...snapshot.pet, level: targetLevel }, {
      catalog,
      activeEnvironment: Number(current.activeEnvironment),
      metadataRevision: Number(current.revision) + 1,
      gearRevision: Number(current.gearRevision),
      loadout,
    });
    if (state.genesisHash.toLowerCase() !== String(current.genesisHash).toLowerCase() || state.dnaHash.toLowerCase() !== String(current.dnaHash).toLowerCase()) {
      throw new Error('pet_nft_immutable_dna_mismatch');
    }
    const recordedLayers = Array.isArray(snapshot.pet.nft.layerAssetIds) ? snapshot.pet.nft.layerAssetIds.map(String) : [];
    const desiredLayers = state.visual.layers.map((layer) => layer.assetId);
    const updateRequired = hatcheryLevel > currentLevel
      || Number(current.gearRevision) > Number(snapshot.pet.nft.gearRevision || 0)
      || String(snapshot.pet.nft.visualRevision || '') !== String(state.visual.visualRevision)
      || recordedLayers.join(',') !== desiredLayers.join(',');
    if (!updateRequired) throw new Error('pet_nft_no_update_required');
    const active = unexpiredActiveAuthorization('UPDATE', recipient);
    if (active) {
      if (String(active.stateHash).toLowerCase() === state.stateHash.toLowerCase()) return updatePreparationResponse(active, state);
      const priorStillExecutable = Number(active.voucher?.revision) === Number(current.revision) + 1
        && Number(active.voucher?.gearRevision) === Number(current.gearRevision);
      if (priorStillExecutable) throw new Error('pet_nft_authorization_pending');
    }
    const release = await releasePet(snapshot.pet, state);
    const deadline = Math.floor(now() / 1_000) + 15 * 60;
    const voucher = updateVoucherFor({ state, metadataUri: release.metadata.uri, deadline });
    const signature = await signer().signTypedData(domain(settings.contractAddress), UPDATE_TYPES, voucher);
    const data = PET_INTERFACE.encodeFunctionData('updatePet', [voucher, release.metadata.uri, signature]);
    const authorization = writeAuthorization({
      action: 'UPDATE', recipient, deadline, tokenId: state.tokenId, genesisHash: state.genesisHash,
      dnaHash: state.dnaHash, stateHash: state.stateHash, metadataRevision: state.metadataRevision,
      gearRevision: state.gearRevision, visualRevision: state.visual.visualRevision,
      layerAssetIds: state.visual.layers.map((layer) => layer.assetId),
      metadataUri: release.metadata.uri, imageUri: release.image.uri,
      voucher, signature, transaction: { from: recipient, to: settings.contractAddress, data, value: '0x0' },
    });
    return updatePreparationResponse(authorization, state);
  }

  async function prepareUpdate(address, options = {}) {
    return withWalletLock(address, () => prepareUpdateUnlocked(address, options));
  }

  async function confirmUnlocked(address, { authorizationId, transactionHash } = {}) {
    const recipient = normalizeAddress(address);
    const hash = normalizeHash(transactionHash, 'pet_nft_transaction_hash_invalid');
    const { file, plan } = readAuthorization(authorizationId);
    if (plan.recipient !== recipient) throw new Error('pet_nft_authorization_wallet_mismatch');
    if (plan.confirmed) {
      if (plan.transactionHash !== hash) throw new Error('pet_nft_authorization_already_confirmed');
      return plan.confirmation;
    }
    const transaction = await indexedProvider.getTransaction(hash, { cacheTtlMs: 0 });
    const verified = verifyIndexedSubmission(transaction, {
      ...plan.transaction,
      hash,
      deadline: plan.deadline,
      minimumBlock: settings.deploymentBlock,
    });
    const { pet } = await liveReadiness();
    const [canonicalBlock, latestBlock] = await Promise.all([
      rpc.getBlock(verified.blockNumber),
      rpc.getBlockNumber(),
    ]);
    if (!canonicalBlock || String(canonicalBlock.hash || '').toLowerCase() !== verified.blockHash) {
      throw new Error('pet_nft_transaction_reorged');
    }
    if (latestBlock < verified.blockNumber + 5) throw new Error('pet_nft_confirmation_pending_finality');
    const callAtBlock = { blockTag: verified.blockNumber };
    const [owner, current, uri] = await Promise.all([
      pet.ownerOf(plan.tokenId, callAtBlock),
      pet.petState(plan.tokenId, callAtBlock),
      pet.tokenURI(plan.tokenId, callAtBlock),
    ]);
    if (normalizeAddress(owner) !== recipient) throw new Error('pet_nft_confirmed_owner_mismatch');
    if (String(uri) !== plan.metadataUri || String(current.stateHash).toLowerCase() !== plan.stateHash.toLowerCase()) {
      throw new Error('pet_nft_confirmed_state_mismatch');
    }
    const expected = {
      revision: Number(plan.metadataRevision),
      gearRevision: Number(plan.gearRevision || plan.voucher?.gearRevision || 0),
      level: Number(plan.voucher?.level),
      activeEnvironment: Number(plan.action === 'MINT' ? plan.voucher?.environment : plan.voucher?.activeEnvironment),
      specialization: Number(plan.voucher?.specialization),
    };
    if (Number(current.revision) !== expected.revision
      || Number(current.gearRevision) !== expected.gearRevision
      || Number(current.level) !== expected.level
      || Number(current.activeEnvironment) !== expected.activeEnvironment
      || Number(current.specialization) !== expected.specialization) {
      throw new Error('pet_nft_confirmed_traits_mismatch');
    }
    const receipt = {
      action: plan.action,
      contractAddress: settings.contractAddress,
      gearContractAddress: settings.gearContractAddress,
      tokenId: plan.tokenId,
      genesisHash: plan.genesisHash,
      dnaHash: plan.dnaHash,
      stateHash: plan.stateHash,
      metadataRevision: plan.metadataRevision,
      gearRevision: expected.gearRevision,
      visualRevision: plan.visualRevision || catalog.visualRevision,
      layerAssetIds: Array.isArray(plan.layerAssetIds) ? [...plan.layerAssetIds] : [],
      level: expected.level,
      activeEnvironment: expected.activeEnvironment,
      specialization: expected.specialization,
      metadataUri: plan.metadataUri,
      imageUri: plan.imageUri,
      transactionHash: hash,
      blockNumber: verified.blockNumber,
      confirmedAt: verified.confirmedAt,
      explorerUrl: `https://robinhoodchain.blockscout.com/tx/${hash}`,
    };
    if (plan.action === 'MINT') hatchery.recordPetNftMint(recipient, receipt);
    else hatchery.recordPetNftUpdate(recipient, receipt);
    const confirmation = { status: 'CONFIRMED', receipt };
    writeJsonAtomic(file, { ...plan, confirmed: true, transactionHash: hash, confirmation });
    writeJsonAtomic(path.join(root, 'confirmations', `${hash.slice(2)}.json`), {
      schema: 'AXO_PET_NFT_CONFIRMATION_V1',
      authorizationId: plan.id,
      recipient,
      ...confirmation,
    });
    return confirmation;
  }

  async function confirm(address, input = {}) {
    return withWalletLock(address, () => confirmUnlocked(address, input));
  }

  async function onchainWalletMint(recipient) {
    if (!settings.contractAddress || !settings.expectedRuntimeCodeHash) return { configured: false, minted: false, tokenId: null };
    const [network, code] = await Promise.all([rpc.getNetwork(), rpc.getCode(settings.contractAddress)]);
    if (Number(network.chainId) !== 4663) throw new Error('pet_nft_chain_mismatch');
    if (ethers.keccak256(code).toLowerCase() !== String(settings.expectedRuntimeCodeHash).toLowerCase()) {
      throw new Error('pet_nft_runtime_mismatch');
    }
    const pet = new ethers.Contract(settings.contractAddress, PET_ABI, rpc);
    const [minted, tokenId] = await Promise.all([pet.walletEverMinted(recipient), pet.petOfWallet(recipient)]);
    return { configured: true, minted: Boolean(minted), tokenId: String(tokenId) };
  }

  async function deletionStatusUnlocked(address) {
    const recipient = normalizeAddress(address);
    const snapshot = hatchery.snapshot(recipient);
    if (!snapshot.hatched) throw new Error('pet_not_hatched');
    if (snapshot.pet.nft?.status === 'MINTED_SOULBOUND') {
      return { safe: true, soulboundNftPersists: true, pendingMintAuthorization: false };
    }
    const active = unexpiredActiveAuthorization('MINT', recipient);
    if (active) throw new Error('pet_nft_mint_authorization_pending');
    const onchain = await onchainWalletMint(recipient);
    if (onchain.minted) throw new Error('pet_nft_onchain_reconciliation_required');
    return { safe: true, soulboundNftPersists: false, pendingMintAuthorization: false };
  }

  async function deletionStatus(address) {
    return withWalletLock(address, () => deletionStatusUnlocked(address));
  }

  async function deleteAccountSafe(address, options = {}) {
    return withWalletLock(address, async () => {
      await deletionStatusUnlocked(address);
      const result = hatchery.deleteAccount(address, options);
      for (const action of ['MINT', 'UPDATE']) {
        const file = authorizationFile(authorizationIdFor(action, address));
        try { fs.unlinkSync(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      }
      return result;
    });
  }

  function holderTraits(state, websiteVisual) {
    const sceneLabels = {
      environment_back: 'Environment',
      landmark_mid: 'Landmark',
      platform_mid: 'Platform',
      pet: 'Role',
      weather_grade: 'Weather',
      machine_foreground: 'Machine',
      small_tool: 'Tool',
      hud_front: 'HUD',
    };
    return {
      schema: 'AXO_PET_TRAIT_READOUT_V1',
      onchainMetadataVisualRevision: state.visual.visualRevision,
      websiteVisualRevision: websiteVisual.visualRevision,
      immutable: [
        { traitType: 'Lineage', value: state.lineage.label },
        { traitType: 'Origin Environment', value: state.originEnvironment.label },
        { traitType: 'Aura', value: state.aura.label },
        { traitType: 'Gill Crest', value: state.gillCrest.label },
        { traitType: 'Eye Lens', value: state.eyeLens.label },
        { traitType: 'Body Marking', value: state.bodyMarking.label },
        { traitType: 'Birth Sigil', value: state.birthSigil.label },
        { traitType: 'Constellation', value: state.constellation.label },
      ],
      growth: [
        { traitType: 'Level', value: Number(state.growth.level), displayType: 'number' },
        { traitType: 'Growth Stage', value: state.growth.label },
        { traitType: 'Specialization', value: state.specialization.label },
      ],
      onchainScene: state.visual.layers.map((layer) => ({
        traitType: sceneLabels[layer.slot] || layer.slot,
        value: layer.name,
        rarityClass: layer.rarityClass,
        rarityWeightBps: Number(layer.rarityWeightBps),
      })),
      websiteScene: websiteVisual.activeLayers.map((layer) => ({
        traitType: layer.slot === 'pet' ? 'Authored Scene' : String(layer.slot).replaceAll('_', ' '),
        value: layer.name,
        tier: layer.tier || null,
        source: layer.source,
      })),
      boundaries: {
        immutableDnaPreserved: true,
        websiteTraitsCosmeticOnly: true,
        websiteTraitsAffectXpRewardsTrustOrTrading: false,
      },
    };
  }

  async function holderView(address) {
    const recipient = normalizeAddress(address);
    const snapshot = hatchery.snapshot(recipient);
    if (!snapshot.hatched) return { system: localStatus(), hatched: false, pet: null, customization: null };
    const nft = snapshot.pet.nft || {};
    const minted = nft.status === 'MINTED_SOULBOUND';
    const gear = await arenaLoadout(recipient);
    const loadout = gear.status === 'VERIFIED_ONCHAIN' ? v5LoadoutFromGearItems(gear.items) : {};
    const hatcheryLevel = Number(snapshot.pet.level || 1);
    const recordedLevel = Number(nft.level || 1);
    const targetLevel = minted ? Math.min(hatcheryLevel, recordedLevel + 1) : hatcheryLevel;
    const state = petNftState({ ...snapshot.pet, level: targetLevel }, {
      catalog,
      activeEnvironment: Number.isInteger(Number(nft.activeEnvironment)) ? Number(nft.activeEnvironment) : null,
      metadataRevision: Number(nft.metadataRevision || 1),
      gearRevision: gear.status === 'VERIFIED_ONCHAIN' ? Number(gear.revision) : Number(nft.gearRevision || 0),
      loadout,
    });
    const websiteVisual = v5WebsiteVisualState({ ...snapshot.pet, level: hatcheryLevel }, {
      catalog: websiteVisualCatalog,
      loadout,
    });
    const visualLayers = state.visual.layers.map((layer) => ({
      ...layer,
      runtimeUrl: `${catalog.visualSystem.runtimeAssetBasePath}/${layer.assetId}.webp`,
      opacity: layer.slot === 'weather_grade' ? Number(catalog.visualSystem.weatherDefaultOpacity) : 1,
    }));
    const expectedLayerIds = state.visual.layers.map((layer) => layer.assetId);
    const recordedLayerIds = Array.isArray(nft.layerAssetIds) ? nft.layerAssetIds.map(String) : [];
    const syncRequired = minted && (
      recordedLevel < hatcheryLevel
      || Number(nft.gearRevision || 0) !== Number(state.gearRevision || 0)
      || String(nft.visualRevision || '') !== String(state.visual.visualRevision)
      || recordedLayerIds.join(',') !== expectedLayerIds.join(',')
    );
    return {
      system: localStatus(),
      hatched: true,
      nft: {
        ...nft,
        syncRequired,
        hatcheryLevel,
        syncTargetLevel: syncRequired ? targetLevel : recordedLevel,
        pendingLevelCount: Math.max(0, hatcheryLevel - recordedLevel),
      },
      identity: {
        tokenId: state.tokenId,
        genesisId: state.genesisId,
        dnaHash: state.dnaHash,
        lineage: state.lineage,
        growth: state.growth,
        originEnvironment: state.originEnvironment,
        activeEnvironment: state.activeEnvironment,
        aura: state.aura,
        gillCrest: state.gillCrest,
        eyeLens: state.eyeLens,
        bodyMarking: state.bodyMarking,
        birthSigil: state.birthSigil,
        constellation: state.constellation,
        specialization: state.specialization,
        visual: {
          ...state.visual,
          layers: visualLayers,
        },
      },
      websiteVisual,
      gear,
      traits: holderTraits(state, websiteVisual),
      customization: {
        dynamicSceneLayers: true,
        sceneChangesEveryLevel: true,
        manualSceneRerolls: false,
        websiteVisualRevision: websiteVisual.visualRevision,
        websiteLayerFamilies: websiteVisualCatalog.counts.layerFamilies,
        websiteLayerOptions: websiteVisualCatalog.counts.layerOptions,
        level10UniversalGearGeometry: true,
        sceneTraitCount: websiteVisualCatalog.counts.layerOptions,
        gearSlots: catalog.gearSlots.map(({ id, key, label }) => ({ id, key, label })),
        launchGearCount: catalog.launchGear.length,
        gearLaunchStatus: 'LEVEL_10_CONTRACT_RESERVED_SUPPLY_AND_SALES_NOT_ACTIVATED',
      },
    };
  }

  async function arenaLoadout(address) {
    const recipient = normalizeAddress(address);
    const snapshot = hatchery.snapshot(recipient);
    const emptyStats = aggregateGearArenaStats([]);
    if (!snapshot.hatched || Number(snapshot.pet?.level || 0) < 10) {
      return { status: 'LEVEL_10_REQUIRED', revision: 0, items: [], stats: emptyStats };
    }
    if (snapshot.pet.nft?.status !== 'MINTED_SOULBOUND') {
      return { status: 'PET_NFT_NOT_MINTED', revision: 0, items: [], stats: emptyStats };
    }
    const { pet, gear } = await liveReadiness();
    const tokenId = String(snapshot.pet.nft.tokenId);
    const blockTag = await rpc.getBlockNumber();
    const callAtBlock = { blockTag };
    const [owner, petState, rawLoadout] = await Promise.all([
      pet.ownerOf(tokenId, callAtBlock),
      pet.petState(tokenId, callAtBlock),
      gear.loadout(tokenId, callAtBlock),
    ]);
    if (normalizeAddress(owner) !== recipient) throw new Error('pet_nft_owner_mismatch');
    if (Number(petState.level) !== 10 || Number(snapshot.pet.level) !== 10) throw new Error('pet_nft_arena_level_mismatch');
    const catalogById = new Map(catalog.launchGear.map((item) => [Number(item.id), item]));
    const items = [];
    for (let index = 0; index < rawLoadout.length; index += 1) {
      const gearId = Number(rawLoadout[index]);
      if (!gearId) continue;
      const catalogItem = catalogById.get(gearId);
      const expectedSlot = catalog.gearSlots[index];
      if (!catalogItem || catalogItem.slot !== expectedSlot?.key) throw new Error('pet_nft_gear_catalog_mismatch');
      const profile = gearProfile({ ...catalogItem, slotLabel: expectedSlot.label });
      const rawStats = await gear.gearArenaStats(gearId, callAtBlock);
      const onchainStats = Object.fromEntries(Object.keys(profile.arenaStats).map((key, statIndex) => [key, Number(rawStats[statIndex])]));
      if (canonicalJson(onchainStats) !== canonicalJson(profile.arenaStats)) throw new Error('pet_nft_gear_stats_mismatch');
      items.push({ ...profile, id: gearId, slotId: Number(expectedSlot.id), arenaStats: onchainStats });
    }
    return {
      status: 'VERIFIED_ONCHAIN',
      blockNumber: blockTag,
      revision: Number(petState.gearRevision),
      items,
      stats: aggregateGearArenaStats(items),
    };
  }

  function runtimeAsset(assetId) {
    return petNftRuntimeAsset(assetId, { catalog, artRoot: settings.artRoot });
  }

  return {
    localStatus,
    liveReadiness,
    arenaLoadout,
    holderView,
    runtimeAsset,
    prepareMint,
    prepareUpdate,
    confirm,
    deletionStatus,
    deleteAccountSafe,
  };
}

module.exports = {
  GEAR_ABI,
  MINT_TYPES,
  PET_ABI,
  PET_INTERFACE,
  UPDATE_TYPES,
  createPetNftService,
  metadataUriHash,
  mintVoucherFor,
  updateVoucherFor,
  verifyIndexedSubmission,
};
