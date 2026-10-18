import { expect } from 'chai';
import { defineGear, deployMarketplace, deploySystem, mintPet } from './helpers.js';

const AXO = 10n ** 18n;

async function listedMarket({ amount = 3n, unitPrice = 25n * AXO } = {}) {
  const env = await deploySystem();
  const { payment, marketplace } = await deployMarketplace(env);
  const { gearId } = await defineGear(env);
  await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, amount, '0x');
  await env.gear.connect(env.signers.player).setApprovalForAll(await marketplace.getAddress(), true);
  await marketplace.connect(env.signers.owner).unpause();
  const now = await env.networkHelpers.time.latest();
  await marketplace.connect(env.signers.player).createListing(gearId, amount, unitPrice, now + 86_400);
  return { ...env, payment, marketplace, gearId, amount, unitPrice };
}

describe('AxoPetGearMarketplace', function () {
  it('deploys paused with exact immutable gear/payment bindings and no fee or custody lane', async function () {
    const env = await deploySystem();
    const { payment, marketplace } = await deployMarketplace(env);
    expect(await marketplace.owner()).to.equal(env.signers.owner.address);
    expect(await marketplace.gearToken()).to.equal(await env.gear.getAddress());
    expect(await marketplace.paymentToken()).to.equal(await payment.getAddress());
    expect(await marketplace.paused()).to.equal(true);
    expect(await marketplace.nextListingId()).to.equal(1n);
    expect(await marketplace.activeListingCount()).to.equal(0n);
    expect((await env.ethers.provider.getCode(await marketplace.getAddress())).length / 2).to.be.lessThan(24_576);
    await expect(marketplace.connect(env.signers.owner).renounceOwnership())
      .to.be.revertedWithCustomError(marketplace, 'RenounceDisabled');
  });

  it('requires an explicit unpause, market approval, unequipped balance, bounded duration, and positive price', async function () {
    const env = await deploySystem();
    const { marketplace } = await deployMarketplace(env);
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    const now = await env.networkHelpers.time.latest();
    await expect(marketplace.connect(env.signers.player).createListing(gearId, 1, AXO, now + 3600))
      .to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
    await marketplace.connect(env.signers.owner).unpause();
    await expect(marketplace.connect(env.signers.player).createListing(gearId, 1, AXO, now + 3600))
      .to.be.revertedWithCustomError(marketplace, 'ApprovalRequired');
    await env.gear.connect(env.signers.player).setApprovalForAll(await marketplace.getAddress(), true);
    await expect(marketplace.connect(env.signers.player).createListing(gearId, 1, 0, now + 3600))
      .to.be.revertedWithCustomError(marketplace, 'InvalidPrice');
    await expect(marketplace.connect(env.signers.player).createListing(gearId, 1, AXO, now + 60))
      .to.be.revertedWithCustomError(marketplace, 'InvalidDuration');
    await expect(marketplace.connect(env.signers.player).createListing(gearId, 1, AXO, now + 31 * 86_400))
      .to.be.revertedWithCustomError(marketplace, 'InvalidDuration');
  });

  it('creates a fixed-price listing without transferring gear into escrow', async function () {
    const env = await listedMarket();
    const listing = await env.marketplace.listings(1);
    expect(listing.seller).to.equal(env.signers.player.address);
    expect(listing.gearId).to.equal(env.gearId);
    expect(listing.remaining).to.equal(env.amount);
    expect(listing.unitPrice).to.equal(env.unitPrice);
    expect(listing.active).to.equal(true);
    expect(await env.marketplace.activeListingCount()).to.equal(1n);
    expect(await env.gear.balanceOf(env.signers.player.address, env.gearId)).to.equal(env.amount);
    expect(await env.gear.balanceOf(await env.marketplace.getAddress(), env.gearId)).to.equal(0n);
    expect(await env.marketplace.listingExecutable(1)).to.equal(true);
  });

  it('fills partially and atomically pays exact AXO directly from buyer to seller', async function () {
    const env = await listedMarket();
    const total = env.unitPrice * 2n;
    await env.payment.mint(env.signers.secondPlayer.address, total);
    await env.payment.connect(env.signers.secondPlayer).approve(await env.marketplace.getAddress(), total);
    await expect(env.marketplace.connect(env.signers.secondPlayer).purchase(1, 2))
      .to.emit(env.marketplace, 'ListingFilled')
      .withArgs(1, env.signers.secondPlayer.address, 2, total, 1);
    expect(await env.payment.balanceOf(env.signers.player.address)).to.equal(total);
    expect(await env.payment.balanceOf(await env.marketplace.getAddress())).to.equal(0n);
    expect(await env.gear.balanceOf(env.signers.secondPlayer.address, env.gearId)).to.equal(2n);
    expect((await env.marketplace.listings(1)).remaining).to.equal(1n);
    expect(await env.marketplace.activeListingCount()).to.equal(1n);
  });

  it('closes a completely filled listing and blocks self-purchases or overfills', async function () {
    const env = await listedMarket({ amount: 1n });
    await expect(env.marketplace.connect(env.signers.player).purchase(1, 1))
      .to.be.revertedWithCustomError(env.marketplace, 'SelfPurchaseForbidden');
    await expect(env.marketplace.connect(env.signers.secondPlayer).purchase(1, 2))
      .to.be.revertedWithCustomError(env.marketplace, 'InvalidAmount');
    await env.payment.mint(env.signers.secondPlayer.address, env.unitPrice);
    await env.payment.connect(env.signers.secondPlayer).approve(await env.marketplace.getAddress(), env.unitPrice);
    await env.marketplace.connect(env.signers.secondPlayer).purchase(1, 1);
    expect((await env.marketplace.listings(1)).active).to.equal(false);
    expect(await env.marketplace.activeListingCount()).to.equal(0n);
    await expect(env.marketplace.connect(env.signers.secondPlayer).purchase(1, 1))
      .to.be.revertedWithCustomError(env.marketplace, 'ListingInactive');
  });

  it('never lists an equipped-only balance', async function () {
    const env = await deploySystem();
    const { marketplace } = await deployMarketplace(env);
    const { tokenId } = await mintPet(env, { level: 10 });
    const { gearId } = await defineGear(env);
    await env.gear.connect(env.signers.owner).mintGear(env.signers.player.address, gearId, 1, '0x');
    await env.gear.connect(env.signers.player).equip(tokenId, 1, gearId);
    await env.gear.connect(env.signers.player).setApprovalForAll(await marketplace.getAddress(), true);
    await marketplace.connect(env.signers.owner).unpause();
    const now = await env.networkHelpers.time.latest();
    await expect(marketplace.connect(env.signers.player).createListing(gearId, 1, AXO, now + 3600))
      .to.be.revertedWithCustomError(marketplace, 'UnequippedBalanceInsufficient');
  });

  it('lets only the seller cancel and lets anyone invalidate stale approval or inventory', async function () {
    const first = await listedMarket();
    await expect(first.marketplace.connect(first.signers.outsider).cancelListing(1))
      .to.be.revertedWithCustomError(first.marketplace, 'NotListingSeller');
    await expect(first.marketplace.connect(first.signers.player).cancelListing(1))
      .to.emit(first.marketplace, 'ListingCancelled');
    expect(await first.marketplace.activeListingCount()).to.equal(0n);

    const second = await listedMarket();
    await second.gear.connect(second.signers.player).setApprovalForAll(await second.marketplace.getAddress(), false);
    expect(await second.marketplace.listingExecutable(1)).to.equal(false);
    await expect(second.marketplace.connect(second.signers.outsider).invalidateListing(1))
      .to.emit(second.marketplace, 'ListingInvalidated');
    expect(await second.marketplace.activeListingCount()).to.equal(0n);
  });

  it('rejects partial fills when the seller has moved any inventory backing the offer', async function () {
    const env = await listedMarket({ amount: 3n });
    await env.gear.connect(env.signers.player).safeTransferFrom(
      env.signers.player.address,
      env.signers.outsider.address,
      env.gearId,
      1,
      '0x',
    );
    await env.payment.mint(env.signers.secondPlayer.address, env.unitPrice);
    await env.payment.connect(env.signers.secondPlayer).approve(await env.marketplace.getAddress(), env.unitPrice);
    await expect(env.marketplace.connect(env.signers.secondPlayer).purchase(1, 1))
      .to.be.revertedWithCustomError(env.marketplace, 'UnequippedBalanceInsufficient');
  });

  it('keeps cancellation available during an emergency pause while blocking listing and fills', async function () {
    const env = await listedMarket();
    await env.marketplace.connect(env.signers.owner).pause();
    await expect(env.marketplace.connect(env.signers.secondPlayer).purchase(1, 1))
      .to.be.revertedWithCustomError(env.marketplace, 'EnforcedPause');
    await expect(env.marketplace.connect(env.signers.player).cancelListing(1))
      .to.emit(env.marketplace, 'ListingCancelled');
  });
});
