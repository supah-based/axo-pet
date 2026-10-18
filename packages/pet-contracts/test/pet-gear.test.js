import { expect } from 'chai';
import {
  defineGear,
  deploySystem,
  mintPet,
  updateVoucher,
  uriHash,
} from './helpers.js';

describe('AxoPetGear', function () {
  it('deploys as bounded tradable Level-10 ERC-1155 equipment', async function () {
    const env = await deploySystem();
    expect(await env.gear.owner()).to.equal(env.signers.owner.address);
    expect(await env.gear.petContract()).to.equal(await env.pet.getAddress());
    expect(await env.gear.contractURI()).to.equal('ipfs://bafy-contract-metadata/gear.json');
    expect(await env.gear.supportsInterface('0xd9b67a26')).to.equal(true);
    const code = await env.ethers.provider.getCode(await env.gear.getAddress());
    expect((code.length - 2) / 2).to.be.lessThan(24_576);
    await expect(env.gear.connect(env.signers.owner).renounceOwnership())
      .to.be.revertedWithCustomError(env.gear, 'RenounceDisabled');
  });

  it('defines exact-slot gear with capped supplies and content-addressed metadata', async function () {
    const env = await deploySystem();
    const item = await defineGear(env, { gearId: 1008n, slot: 1, maxSupply: 2n });
    const definition = await env.gear.gearDefinitions(item.gearId);
    expect(definition.slot).to.equal(1n);
    expect(definition.active).to.equal(true);
    expect(definition.maxSupply).to.equal(2n);
    expect(definition.metadataHash).to.equal(uriHash(item.metadataUri));
    expect(await env.gear.gearArenaStats(item.gearId)).to.deep.equal([1n, 0n, 0n, 0n, 0n, 0n]);
    expect(await env.gear.uri(item.gearId)).to.equal(item.metadataUri);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, item.gearId, 2, '0x');
    expect(await env.gear['totalSupply(uint256)'](item.gearId)).to.equal(2n);
    await expect(env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, item.gearId, 1, '0x'))
      .to.be.revertedWithCustomError(env.gear, 'MaxSupplyExceeded');
    await expect(env.gear.connect(env.signers.owner).defineGear(
      item.gearId,
      1,
      2,
      item.metadataUri,
      uriHash(item.metadataUri),
      item.arenaStats,
    )).to.be.revertedWithCustomError(env.gear, 'GearAlreadyDefined');
  });

  it('bounds Arena modifiers to six known stats and four total points', async function () {
    const env = await deploySystem();
    const uri = 'ipfs://bafy-axo-gear/1010.json';
    await expect(env.gear.connect(env.signers.owner).defineGear(1010, 1, 1, uri, uriHash(uri), [3, 0, 0, 0, 0, 0]))
      .to.be.revertedWithCustomError(env.gear, 'InvalidArenaStats');
    await expect(env.gear.connect(env.signers.owner).defineGear(1011, 1, 1, uri, uriHash(uri), [0, 0, 0, 0, 0, 0]))
      .to.be.revertedWithCustomError(env.gear, 'InvalidArenaStats');
  });

  it('keeps every gear slot locked until the soulbound pet reaches level ten', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 9 });
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    await expect(env.gear.connect(env.signers.player).equip(tokenId, 1, gearId))
      .to.be.revertedWithCustomError(env.gear, 'PetLevelLocked');
  });

  it('keeps unequipped gear freely tradable', async function () {
    const env = await deploySystem();
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 2, '0x');
    await env.gear.connect(env.signers.player).safeTransferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      gearId,
      1,
      '0x',
    );
    expect(await env.gear.balanceOf(env.signers.player.address, gearId)).to.equal(1n);
    expect(await env.gear.balanceOf(env.signers.secondPlayer.address, gearId)).to.equal(1n);
  });

  it('equips one owned item, locks only that balance, and signals the soulbound pet', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 10 });
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 2, '0x');
    await expect(env.gear.connect(env.signers.player).equip(tokenId, 1, gearId))
      .to.emit(env.gear, 'GearEquipped').withArgs(tokenId, env.signers.player.address, 1, gearId, 1)
      .and.to.emit(env.pet, 'PetGearLoadoutChanged').withArgs(tokenId, 1);
    expect(await env.gear.equippedGear(tokenId, 1)).to.equal(gearId);
    expect(await env.gear.equippedBalances(env.signers.player.address, gearId)).to.equal(1n);
    expect(await env.gear.availableBalanceOf(env.signers.player.address, gearId)).to.equal(1n);
    expect((await env.pet.petState(tokenId)).gearRevision).to.equal(1n);

    await env.gear.connect(env.signers.player).safeTransferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      gearId,
      1,
      '0x',
    );
    await expect(env.gear.connect(env.signers.player).safeTransferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      gearId,
      1,
      '0x',
    )).to.be.revertedWithCustomError(env.gear, 'EquippedBalanceLocked');
  });

  it('invalidates a prepared metadata update when the equipped gear revision changes', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 10 });
    const prepared = await updateVoucher(env, tokenId, { level: 2 });
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    await env.gear.connect(env.signers.player).equip(tokenId, 1, gearId);
    await expect(env.pet.connect(env.signers.player).updatePet(
      prepared.update,
      prepared.metadataUri,
      prepared.signature,
    )).to.be.revertedWithCustomError(env.pet, 'InvalidRevision');
  });

  it('requires unequip before the last copy can transfer', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 10 });
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    await env.gear.connect(env.signers.player).equip(tokenId, 1, gearId);
    await expect(env.gear.connect(env.signers.player).safeTransferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      gearId,
      1,
      '0x',
    )).to.be.revertedWithCustomError(env.gear, 'EquippedBalanceLocked');
    await expect(env.gear.connect(env.signers.player).unequip(tokenId, 1))
      .to.emit(env.gear, 'GearUnequipped').withArgs(tokenId, env.signers.player.address, 1, gearId, 2);
    await env.gear.connect(env.signers.player).safeTransferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      gearId,
      1,
      '0x',
    );
    expect(await env.gear.balanceOf(env.signers.secondPlayer.address, gearId)).to.equal(1n);
  });

  it('atomically replaces one slot and preserves exact lock accounting', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 10 });
    const first = await defineGear(env, { gearId: 1001n, slot: 1 });
    const second = await defineGear(env, { gearId: 1002n, slot: 1 });
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, first.gearId, 1, '0x');
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, second.gearId, 1, '0x');
    await env.gear.connect(env.signers.player).equip(tokenId, 1, first.gearId);
    await expect(env.gear.connect(env.signers.player).equip(tokenId, 1, second.gearId))
      .to.emit(env.gear, 'GearUnequipped')
      .and.to.emit(env.gear, 'GearEquipped');
    expect(await env.gear.equippedBalances(env.signers.player.address, first.gearId)).to.equal(0n);
    expect(await env.gear.equippedBalances(env.signers.player.address, second.gearId)).to.equal(1n);
    expect(await env.gear.equippedGear(tokenId, 1)).to.equal(second.gearId);
    expect(await env.gear.loadoutRevision(tokenId)).to.equal(2n);
  });

  it('rejects wrong slots, missing ownership, duplicate equip, and non-pet owners', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 10 });
    const { gearId } = await defineGear(env, { slot: 1 });
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    await expect(env.gear.connect(env.signers.player).equip(tokenId, 2, gearId))
      .to.be.revertedWithCustomError(env.gear, 'InvalidSlot');
    await expect(env.gear.connect(env.signers.outsider).equip(tokenId, 1, gearId))
      .to.be.revertedWithCustomError(env.gear, 'NotPetOwner');
    await env.gear.connect(env.signers.player).equip(tokenId, 1, gearId);
    await expect(env.gear.connect(env.signers.player).equip(tokenId, 1, gearId))
      .to.be.revertedWithCustomError(env.gear, 'GearAlreadyEquipped');
    await expect(env.gear.connect(env.signers.player).unequip(tokenId, 2))
      .to.be.revertedWithCustomError(env.gear, 'NothingEquipped');
  });

  it('rejects duplicate IDs in batch transfers so equipped locks cannot be bypassed', async function () {
    const env = await deploySystem();
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 3, '0x');
    await expect(env.gear.connect(env.signers.player).safeBatchTransferFrom(
      env.signers.player.address,
      env.signers.secondPlayer.address,
      [gearId, gearId],
      [1, 1],
      '0x',
    )).to.be.revertedWithCustomError(env.gear, 'DuplicateGearId');
  });

  it('supports controller metadata correction and reversible emergency pause', async function () {
    const env = await deploySystem();
    const { gearId } = await defineGear(env);
    const revisedUri = `ipfs://bafy-axo-gear/${gearId}-v2.json`;
    await expect(env.gear.connect(env.signers.owner).updateGearMetadata(gearId, revisedUri, uriHash(revisedUri)))
      .to.emit(env.gear, 'GearMetadataChanged').withArgs(gearId, uriHash(revisedUri));
    expect(await env.gear.uri(gearId)).to.equal(revisedUri);
    await env.gear.connect(env.signers.owner).pause();
    await expect(env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x'))
      .to.be.revertedWithCustomError(env.gear, 'EnforcedPause');
    await env.gear.connect(env.signers.owner).unpause();
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    expect(await env.gear.balanceOf(env.signers.player.address, gearId)).to.equal(1n);
  });

  it('does not let the gear contract or outsiders impersonate pet ownership', async function () {
    const env = await deploySystem();
    const { tokenId } = await mintPet(env, { level: 10 });
    await expect(env.pet.connect(env.signers.outsider).notifyGearUpdate(tokenId))
      .to.be.revertedWithCustomError(env.pet, 'GearContractOnly');
    await expect(env.gear.connect(env.signers.outsider).defineGear(
      9999,
      1,
      1,
      'ipfs://unauthorized/gear.json',
      uriHash('ipfs://unauthorized/gear.json'),
      [1, 0, 0, 0, 0, 0],
    )).to.be.revertedWithCustomError(env.gear, 'OwnableUnauthorizedAccount');
  });
});
