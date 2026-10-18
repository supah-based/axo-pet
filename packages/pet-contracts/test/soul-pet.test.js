import { expect } from 'chai';
import { ethers as baseEthers } from 'ethers';
import {
  deploySystem,
  UPDATE_TYPES,
  mintPet,
  mintVoucher,
  updateVoucher,
  uriHash,
} from './helpers.js';

describe('AxoSoulPet', function () {
  it('deploys as a bounded static soulbound ERC-721 with metadata-update discovery', async function () {
    const env = await deploySystem();
    expect(await env.pet.name()).to.equal('AXO Pets');
    expect(await env.pet.symbol()).to.equal('AXOPET');
    expect(await env.pet.owner()).to.equal(env.signers.owner.address);
    expect(await env.pet.stateSigner()).to.equal(env.signers.stateSigner.address);
    expect(await env.pet.mintingActive()).to.equal(true);
    expect(await env.pet.supportsInterface('0x80ac58cd')).to.equal(true);
    expect(await env.pet.supportsInterface('0x5b5e139f')).to.equal(true);
    expect(await env.pet.supportsInterface('0x49064906')).to.equal(true);
    expect(await env.pet.supportsInterface('0xb45a3c0e')).to.equal(true);
    const code = await env.ethers.provider.getCode(await env.pet.getAddress());
    expect((code.length - 2) / 2).to.be.lessThan(24_576);
    await expect(env.pet.connect(env.signers.owner).renounceOwnership())
      .to.be.revertedWithCustomError(env.pet, 'RenounceDisabled');
  });

  it('mints one signer-authorized pet only when submitted by its exact wallet', async function () {
    const env = await deploySystem();
    const authorization = await mintVoucher(env, {
      lineage: 5,
      environment: 7,
      aura: 6,
      gill: 5,
      eye: 5,
      marking: 7,
      sigil: 11,
      constellation: 7,
      specialization: 4,
    });
    await expect(env.pet.connect(env.signers.relayer).mintWithVoucher(
      authorization.voucher,
      authorization.metadataUri,
      authorization.signature,
    )).to.be.revertedWithCustomError(env.pet, 'RecipientOnly');
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(
      authorization.voucher,
      authorization.metadataUri,
      authorization.signature,
    )).to.emit(env.pet, 'PetMinted')
      .and.to.emit(env.pet, 'Locked');

    const tokenId = authorization.voucher.tokenId;
    expect(await env.pet.ownerOf(tokenId)).to.equal(env.signers.player.address);
    expect(await env.pet.locked(tokenId)).to.equal(true);
    expect(await env.pet.tokenURI(tokenId)).to.equal(authorization.metadataUri);
    expect(await env.pet.petOfWallet(env.signers.player.address)).to.equal(tokenId);
    expect(await env.pet.totalMinted()).to.equal(1n);
    const state = await env.pet.petState(tokenId);
    expect(state.genesisHash).to.equal(authorization.voucher.genesisHash);
    expect(state.dnaHash).to.equal(authorization.voucher.dnaHash);
    expect(state.stateHash).to.equal(authorization.voucher.stateHash);
    expect(state.revision).to.equal(1n);
    expect(state.gearRevision).to.equal(0n);
    expect(state.lineage).to.equal(5n);
    expect(state.level).to.equal(1n);
    expect(state.originEnvironment).to.equal(7n);
    expect(state.activeEnvironment).to.equal(7n);
    expect(state.specialization).to.equal(4n);
  });

  it('disables approvals and every ERC-721 transfer path', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env);
    await expect(env.pet.connect(env.signers.player).approve(env.signers.outsider.address, tokenId))
      .to.be.revertedWithCustomError(env.pet, 'ApprovalDisabled');
    await expect(env.pet.connect(env.signers.player).setApprovalForAll(env.signers.outsider.address, true))
      .to.be.revertedWithCustomError(env.pet, 'ApprovalDisabled');
    await expect(env.pet.connect(env.signers.player).transferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      tokenId,
    )).to.be.revertedWithCustomError(env.pet, 'Soulbound');
    await expect(env.pet.connect(env.signers.player)['safeTransferFrom(address,address,uint256)'](
      env.signers.player.address,
      env.signers.secondPlayer.address,
      tokenId,
    )).to.be.revertedWithCustomError(env.pet, 'Soulbound');
  });

  it('rejects unsigned, tampered, expired, replayed, duplicate, and malformed mint requests', async function () {
    const env = await deploySystem();
    const valid = await mintVoucher(env);
    const badSignature = await env.signers.outsider.signTypedData(env.domain, {
      MintVoucher: [
        { name: 'recipient', type: 'address' }, { name: 'tokenId', type: 'uint256' },
        { name: 'genesisHash', type: 'bytes32' }, { name: 'dnaHash', type: 'bytes32' },
        { name: 'stateHash', type: 'bytes32' }, { name: 'nonce', type: 'uint64' },
        { name: 'deadline', type: 'uint64' }, { name: 'lineage', type: 'uint8' },
        { name: 'level', type: 'uint8' }, { name: 'environment', type: 'uint8' },
        { name: 'aura', type: 'uint8' }, { name: 'gill', type: 'uint8' },
        { name: 'eye', type: 'uint8' }, { name: 'marking', type: 'uint8' },
        { name: 'sigil', type: 'uint8' }, { name: 'constellation', type: 'uint8' },
        { name: 'specialization', type: 'uint8' }, { name: 'metadataHash', type: 'bytes32' },
      ],
    }, valid.voucher);
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(valid.voucher, valid.metadataUri, badSignature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidSignature');
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(valid.voucher, 'ipfs://tampered/metadata.json', valid.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidMetadataUri');

    const latest = await env.networkHelpers.time.latest();
    const expired = await mintVoucher(env, { deadline: BigInt(latest - 1), nonce: 2n });
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(expired.voucher, expired.metadataUri, expired.signature))
      .to.be.revertedWithCustomError(env.pet, 'AuthorizationExpired');
    const invalidUri = await mintVoucher(env, { metadataUri: 'https://axo.vision/pet/metadata.json', nonce: 3n });
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(invalidUri.voucher, invalidUri.metadataUri, invalidUri.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidMetadataUri');
    const invalidBounds = await mintVoucher(env, { lineage: 6, nonce: 4n });
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(invalidBounds.voucher, invalidBounds.metadataUri, invalidBounds.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidPetState');
    const invalidTokenId = await mintVoucher(env, { tokenId: 123n, nonce: 5n });
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(invalidTokenId.voucher, invalidTokenId.metadataUri, invalidTokenId.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidTokenId');

    await env.pet.connect(env.signers.player).mintWithVoucher(valid.voucher, valid.metadataUri, valid.signature);
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(valid.voucher, valid.metadataUri, valid.signature))
      .to.be.revertedWithCustomError(env.pet, 'WalletAlreadyMinted');
    const secondDna = await mintVoucher(env, {
      recipient: env.signers.secondPlayer.address,
      genesisHash: valid.voucher.genesisHash,
      nonce: 6n,
    });
    await expect(env.pet.connect(env.signers.secondPlayer).mintWithVoucher(secondDna.voucher, secondDna.metadataUri, secondDna.signature))
      .to.be.revertedWithCustomError(env.pet, 'DnaAlreadyMinted');
  });

  it('keeps minting controller-gated and pauses every state mutation', async function () {
    const env = await deploySystem();
    const first = await mintVoucher(env);
    await env.pet.connect(env.signers.owner).setMintingActive(false);
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(first.voucher, first.metadataUri, first.signature))
      .to.be.revertedWithCustomError(env.pet, 'MintingDisabled');
    await env.pet.connect(env.signers.owner).setMintingActive(true);
    await env.pet.connect(env.signers.owner).pause();
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(first.voucher, first.metadataUri, first.signature))
      .to.be.revertedWithCustomError(env.pet, 'EnforcedPause');
    await env.pet.connect(env.signers.owner).unpause();
    await env.pet.connect(env.signers.player).mintWithVoucher(first.voucher, first.metadataUri, first.signature);
    const update = await updateVoucher(env, first.voucher.tokenId, { level: 2 });
    await env.pet.connect(env.signers.owner).pause();
    await expect(env.pet.connect(env.signers.player).updatePet(update.update, update.metadataUri, update.signature))
      .to.be.revertedWithCustomError(env.pet, 'EnforcedPause');
  });

  it('updates growth and selected visual traits monotonically with exact EIP-4906 refreshes', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env);
    const authorization = await updateVoucher(env, tokenId, {
      level: 4,
      activeEnvironment: 3,
      specialization: 2,
    });
    await expect(env.pet.connect(env.signers.relayer).updatePet(
      authorization.update,
      authorization.metadataUri,
      authorization.signature,
    )).to.be.revertedWithCustomError(env.pet, 'PetOwnerOnly');
    await expect(env.pet.connect(env.signers.player).updatePet(
      authorization.update,
      authorization.metadataUri,
      authorization.signature,
    )).to.emit(env.pet, 'PetGrowthUpdated').withArgs(
      tokenId,
      1,
      4,
      2,
      authorization.update.stateHash,
    ).and.to.emit(env.pet, 'PetTraitsUpdated')
      .and.to.emit(env.pet, 'MetadataUpdate').withArgs(tokenId);
    const state = await env.pet.petState(tokenId);
    expect(state.level).to.equal(4n);
    expect(state.activeEnvironment).to.equal(3n);
    expect(state.specialization).to.equal(2n);
    expect(state.revision).to.equal(2n);
    expect(await env.pet.tokenURI(tokenId)).to.equal(authorization.metadataUri);
  });

  it('rejects stale revisions, downgrades, tampered metadata and unauthorized updates', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env);
    const growth = await updateVoucher(env, tokenId, { level: 5 });
    await env.pet.connect(env.signers.player).updatePet(growth.update, growth.metadataUri, growth.signature);
    await expect(env.pet.connect(env.signers.player).updatePet(growth.update, growth.metadataUri, growth.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidRevision');

    const downgrade = await updateVoucher(env, tokenId, { level: 4 });
    await expect(env.pet.connect(env.signers.player).updatePet(downgrade.update, downgrade.metadataUri, downgrade.signature))
      .to.be.revertedWithCustomError(env.pet, 'LevelDowngrade');
    const invalidEnvironment = await updateVoucher(env, tokenId, { activeEnvironment: 8 });
    await expect(env.pet.connect(env.signers.player).updatePet(
      invalidEnvironment.update,
      invalidEnvironment.metadataUri,
      invalidEnvironment.signature,
    )).to.be.revertedWithCustomError(env.pet, 'InvalidPetState');
    const valid = await updateVoucher(env, tokenId, { level: 6 });
    await expect(env.pet.connect(env.signers.player).updatePet(valid.update, 'ipfs://different/uri.json', valid.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidMetadataUri');
    const unauthorized = await updateVoucher(env, tokenId, { signer: env.signers.outsider, level: 6 });
    await expect(env.pet.connect(env.signers.player).updatePet(
      unauthorized.update,
      unauthorized.metadataUri,
      unauthorized.signature,
    )).to.be.revertedWithCustomError(env.pet, 'InvalidSignature');
  });

  it('rotates signer and controller with explicit two-step ownership', async function () {
    const env = await deploySystem();
    await expect(env.pet.connect(env.signers.outsider).setStateSigner(env.signers.outsider.address))
      .to.be.revertedWithCustomError(env.pet, 'OwnableUnauthorizedAccount');
    await expect(env.pet.connect(env.signers.owner).setStateSigner(env.signers.outsider.address))
      .to.emit(env.pet, 'StateSignerChanged').withArgs(env.signers.stateSigner.address, env.signers.outsider.address);
    const oldSigner = await mintVoucher(env, { nonce: 55n });
    await expect(env.pet.connect(env.signers.player).mintWithVoucher(oldSigner.voucher, oldSigner.metadataUri, oldSigner.signature))
      .to.be.revertedWithCustomError(env.pet, 'InvalidSignature');

    await env.pet.connect(env.signers.owner).transferOwnership(env.signers.nextOwner.address);
    expect(await env.pet.owner()).to.equal(env.signers.owner.address);
    expect(await env.pet.pendingOwner()).to.equal(env.signers.nextOwner.address);
    await env.pet.connect(env.signers.nextOwner).acceptOwnership();
    expect(await env.pet.owner()).to.equal(env.signers.nextOwner.address);
  });

  it('binds metadata hashes exactly instead of trusting a mutable HTTP endpoint', async function () {
    const env = await deploySystem();
    const metadataUri = 'ipfs://bafybeifrozenmetadata/pet.json';
    const auth = await mintVoucher(env, { metadataUri });
    expect(auth.voucher.metadataHash).to.equal(uriHash(metadataUri));
    expect(auth.voucher.metadataHash).to.equal(baseEthers.keccak256(baseEthers.toUtf8Bytes(metadataUri)));
  });

  it('blocks metadata reentry from a contract-wallet safe-mint callback', async function () {
    const env = await deploySystem();
    const receiver = await env.ethers.deployContract('ReentrantPetReceiver');
    await receiver.waitForDeployment();
    const recipient = await receiver.getAddress();
    const mint = await mintVoucher(env, { recipient });
    const updateMetadataUri = 'ipfs://bafy-axo-pet-metadata/reentrant-update.json';
    const update = {
      tokenId: mint.voucher.tokenId,
      stateHash: baseEthers.id('AXO:STATE:REENTRANT:2'),
      revision: 2n,
      gearRevision: 0n,
      deadline: mint.voucher.deadline,
      level: 2,
      activeEnvironment: mint.voucher.environment,
      specialization: mint.voucher.specialization,
      metadataHash: uriHash(updateMetadataUri),
    };
    const updateSignature = await env.signers.stateSigner.signTypedData(env.domain, UPDATE_TYPES, update);
    const mintData = env.pet.interface.encodeFunctionData('mintWithVoucher', [mint.voucher, mint.metadataUri, mint.signature]);
    const reentryData = env.pet.interface.encodeFunctionData('updatePet', [update, updateMetadataUri, updateSignature]);
    await receiver.executeMint(await env.pet.getAddress(), mintData, reentryData);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    const state = await env.pet.petState(mint.voucher.tokenId);
    expect(state.revision).to.equal(1n);
    expect(state.stateHash).to.equal(mint.voucher.stateHash);
    expect(await env.pet.tokenURI(mint.voucher.tokenId)).to.equal(mint.metadataUri);
  });
});
