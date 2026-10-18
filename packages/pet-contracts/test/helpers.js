import { network } from 'hardhat';
import { ethers as baseEthers } from 'ethers';

export const MINT_TYPES = {
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

export const UPDATE_TYPES = {
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

export function uriHash(uri) {
  return baseEthers.keccak256(baseEthers.toUtf8Bytes(uri));
}

export async function deploySystem() {
  const connection = await network.create();
  const { ethers, networkHelpers } = connection;
  const [owner, stateSigner, player, secondPlayer, relayer, outsider, nextOwner] = await ethers.getSigners();
  const pet = await ethers.deployContract('AxoSoulPet', [owner.address, stateSigner.address]);
  await pet.waitForDeployment();
  const gear = await ethers.deployContract('AxoPetGear', [
    owner.address,
    await pet.getAddress(),
    'ipfs://bafy-contract-metadata/gear.json',
  ]);
  await gear.waitForDeployment();
  await pet.connect(owner).setGearContract(await gear.getAddress());
  await pet.connect(owner).setMintingActive(true);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = {
    name: 'AXO Pets',
    version: '1',
    chainId,
    verifyingContract: await pet.getAddress(),
  };
  return {
    connection,
    ethers,
    networkHelpers,
    pet,
    gear,
    domain,
    signers: { owner, stateSigner, player, secondPlayer, relayer, outsider, nextOwner },
  };
}

export async function mintVoucher(env, overrides = {}) {
  const latest = await env.networkHelpers.time.latest();
  const recipient = overrides.recipient ?? env.signers.player.address;
  const genesisHash = overrides.genesisHash ?? baseEthers.id(`AXO:GENESIS:${recipient}`);
  const metadataUri = overrides.metadataUri ?? 'ipfs://bafy-axo-pet-metadata/1.json';
  const voucher = {
    recipient,
    tokenId: overrides.tokenId ?? BigInt(genesisHash),
    genesisHash,
    dnaHash: overrides.dnaHash ?? baseEthers.id(`AXO:DNA:${recipient}`),
    stateHash: overrides.stateHash ?? baseEthers.id(`AXO:STATE:${recipient}:1`),
    nonce: overrides.nonce ?? 1n,
    deadline: overrides.deadline ?? BigInt(latest + 3600),
    lineage: overrides.lineage ?? 0,
    level: overrides.level ?? 1,
    environment: overrides.environment ?? 0,
    aura: overrides.aura ?? 0,
    gill: overrides.gill ?? 0,
    eye: overrides.eye ?? 0,
    marking: overrides.marking ?? 0,
    sigil: overrides.sigil ?? 0,
    constellation: overrides.constellation ?? 0,
    specialization: overrides.specialization ?? 0,
    metadataHash: overrides.metadataHash ?? uriHash(metadataUri),
  };
  const signer = overrides.signer ?? env.signers.stateSigner;
  const signature = await signer.signTypedData(env.domain, MINT_TYPES, voucher);
  return { voucher, metadataUri, signature };
}

export async function mintPet(env, overrides = {}, submitter = env.signers.player) {
  const authorization = await mintVoucher(env, overrides);
  await env.pet.connect(submitter).mintWithVoucher(
    authorization.voucher,
    authorization.metadataUri,
    authorization.signature,
  );
  return { ...authorization, tokenId: authorization.voucher.tokenId };
}

export async function updateVoucher(env, tokenId, overrides = {}) {
  const latest = await env.networkHelpers.time.latest();
  const state = await env.pet.petState(tokenId);
  const metadataUri = overrides.metadataUri ?? `ipfs://bafy-axo-pet-metadata/${Number(state.revision) + 1}.json`;
  const update = {
    tokenId,
    stateHash: overrides.stateHash ?? baseEthers.id(`AXO:STATE:${tokenId}:${Number(state.revision) + 1}`),
    revision: overrides.revision ?? state.revision + 1n,
    gearRevision: overrides.gearRevision ?? state.gearRevision,
    deadline: overrides.deadline ?? BigInt(latest + 3600),
    level: overrides.level ?? state.level,
    activeEnvironment: overrides.activeEnvironment ?? state.activeEnvironment,
    specialization: overrides.specialization ?? state.specialization,
    metadataHash: overrides.metadataHash ?? uriHash(metadataUri),
  };
  const signer = overrides.signer ?? env.signers.stateSigner;
  const signature = await signer.signTypedData(env.domain, UPDATE_TYPES, update);
  return { update, metadataUri, signature };
}

export async function defineGear(env, overrides = {}) {
  const gearId = overrides.gearId ?? 1001n;
  const slot = overrides.slot ?? 1;
  const maxSupply = overrides.maxSupply ?? 10n;
  const metadataUri = overrides.metadataUri ?? `ipfs://bafy-axo-gear/${gearId}.json`;
  const arenaStats = overrides.arenaStats ?? [1, 0, 0, 0, 0, 0];
  await env.gear.connect(env.signers.owner).defineGear(
    gearId,
    slot,
    maxSupply,
    metadataUri,
    uriHash(metadataUri),
    arenaStats,
  );
  return { gearId, slot, maxSupply, metadataUri, arenaStats };
}

export async function deployMarketplace(env) {
  const payment = await env.ethers.deployContract('MockAxoPayment');
  await payment.waitForDeployment();
  const marketplace = await env.ethers.deployContract('AxoPetGearMarketplace', [
    env.signers.owner.address,
    await env.gear.getAddress(),
    await payment.getAddress(),
  ]);
  await marketplace.waitForDeployment();
  return { payment, marketplace };
}
