'use strict';

const { ethers } = require('ethers');
const blockscoutPro = require('../services/blockscout-pro');
const { JsonRpcClient } = require('../lib/rpc');
const { v5GearVisual } = require('./pet-visual-v5');

const MARKET_ABI = Object.freeze([
  'function owner() view returns (address)',
  'function gearToken() view returns (address)',
  'function paymentToken() view returns (address)',
  'function paused() view returns (bool)',
  'function nextListingId() view returns (uint256)',
  'function activeListingCount() view returns (uint256)',
  'function listings(uint256) view returns (address seller,uint256 gearId,uint128 remaining,uint128 unitPrice,uint64 expiresAt,bool active)',
  'function listingExecutable(uint256) view returns (bool)',
  'function createListing(uint256 gearId,uint128 amount,uint128 unitPrice,uint64 expiresAt) returns (uint256 listingId)',
  'function purchase(uint256 listingId,uint128 amount)',
  'function cancelListing(uint256 listingId)',
]);
const GEAR_ABI = Object.freeze([
  'function isApprovedForAll(address account,address operator) view returns (bool)',
  'function availableBalanceOf(address account,uint256 gearId) view returns (uint256)',
  'function setApprovalForAll(address operator,bool approved)',
]);
const PAYMENT_ABI = Object.freeze([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const MARKET_INTERFACE = new ethers.Interface(MARKET_ABI);
const GEAR_INTERFACE = new ethers.Interface(GEAR_ABI);
const PAYMENT_INTERFACE = new ethers.Interface(PAYMENT_ABI);
const MIN_LISTING_DURATION_SECONDS = 5 * 60;
const MAX_LISTING_DURATION_SECONDS = 30 * 24 * 60 * 60;
const MAX_LISTINGS_READ = 200;
const MAX_NFT_PAGES = 2;

class PetGearMarketError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'PetGearMarketError';
    this.code = code;
    this.status = status;
  }
}

function normalizeAddress(value, code = 'pet_gear_market_wallet_invalid') {
  if (!ethers.isAddress(String(value || ''))) throw new PetGearMarketError(code, 400);
  return String(value).toLowerCase();
}

function decimalBigInt(value, code) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value || ''))) throw new PetGearMarketError(code, 400);
  return BigInt(value);
}

function deployedCode(code) {
  return /^0x[0-9a-f]+$/i.test(String(code || '')) && String(code).length > 2;
}

function publicSettings(settings) {
  return {
    chainId: Number(settings.chainId || 4663),
    contractAddress: settings.address || null,
    gearContractAddress: settings.gearContractAddress || null,
    paymentTokenAddress: settings.paymentTokenAddress || null,
    paymentSymbol: String(settings.paymentSymbol || 'AXO'),
    paymentDecimals: Number(settings.paymentDecimals || 18),
    zeroMarketplaceFee: settings.zeroMarketplaceFee === true,
    petTradingEnabled: false,
    selfCustody: true,
    serverBroadcasterEnabled: false,
  };
}

function transactionRow(from, to, data, gas = null) {
  return {
    chainId: 4663,
    from,
    to,
    data,
    value: '0x0',
    ...(gas ? { gas } : {}),
  };
}

function catalogIndex(catalog, websiteVisualCatalog = null) {
  const slots = new Map((catalog?.gearSlots || []).map((slot) => [String(slot.key), slot]));
  return new Map((catalog?.launchGear || []).map((item) => {
    const visual = websiteVisualCatalog ? v5GearVisual(item.slot, item.id, websiteVisualCatalog) : null;
    return [String(item.id), {
      id: String(item.id),
      key: String(item.key),
      label: String(item.label),
      slot: String(item.slot),
      slotLabel: String(slots.get(String(item.slot))?.label || item.slot),
      rarity: String(item.rarity),
      visualName: visual?.name || String(item.label),
      visualTier: visual?.tier || String(item.rarity),
      imageUrl: visual?.imageUrl || null,
      visualAssetId: visual?.assetId || null,
    }];
  }));
}

function createPetGearMarketplace({
  settings,
  catalog,
  websiteVisualCatalog = null,
  rpc = null,
  indexedProvider = blockscoutPro,
} = {}) {
  if (!settings || !catalog) throw new TypeError('Marketplace settings and catalog are required');
  const itemsById = catalogIndex(catalog, websiteVisualCatalog);
  const client = rpc || new JsonRpcClient(settings.rpcUrl, {
    timeoutMs: 12_000,
    retries: 1,
    headers: settings.rpcHeaders || {},
  });

  function localStatus() {
    const blockers = [];
    if (settings.status === 'NOT_DEPLOYED') blockers.push('MARKETPLACE_NOT_DEPLOYED');
    else if (settings.status !== 'CONFIGURED') blockers.push('MARKETPLACE_VERIFICATION_REQUIRED');
    if (!settings.blockscoutProEnabled) blockers.push('BLOCKSCOUT_PRO_REQUIRED');
    if (!settings.tradingRequested) blockers.push('TRADING_ACTIVATION_REQUIRED');
    return {
      schema: 'AXO_PET_GEAR_MARKET_STATUS_V1',
      status: blockers.length ? 'RELEASE_GATED' : 'READY_FOR_LIVE_READBACK',
      tradingEnabled: false,
      activeListings: 0,
      floorPriceRaw: null,
      blockers,
      ...publicSettings(settings),
    };
  }

  function requireConfigured() {
    const local = localStatus();
    const hard = local.blockers.filter((item) => item !== 'TRADING_ACTIVATION_REQUIRED');
    if (hard.length) throw new PetGearMarketError(`pet_gear_market_not_ready:${hard.join(',')}`, 503);
  }

  async function pinnedBlockTag() {
    const tag = await client.request('eth_blockNumber');
    if (!/^0x[0-9a-f]+$/i.test(String(tag || ''))) throw new PetGearMarketError('pet_gear_market_block_unavailable', 503);
    return tag;
  }

  async function call(to, iface, method, args, blockTag) {
    const raw = await client.request('eth_call', [{ to, data: iface.encodeFunctionData(method, args) }, blockTag]);
    return iface.decodeFunctionResult(method, raw);
  }

  async function assertLive({ requireTrading = false } = {}) {
    requireConfigured();
    const blockTag = await pinnedBlockTag();
    const [marketCode, gearCode, paymentCode] = await client.batch([
      { method: 'eth_getCode', params: [settings.address, blockTag] },
      { method: 'eth_getCode', params: [settings.gearContractAddress, blockTag] },
      { method: 'eth_getCode', params: [settings.paymentTokenAddress, blockTag] },
    ]);
    if (!deployedCode(marketCode) || ethers.keccak256(marketCode).toLowerCase() !== String(settings.expectedRuntimeCodeHash).toLowerCase()) {
      throw new PetGearMarketError('pet_gear_market_runtime_mismatch', 503);
    }
    if (!deployedCode(gearCode) || ethers.keccak256(gearCode).toLowerCase() !== String(settings.expectedGearRuntimeCodeHash).toLowerCase()) {
      throw new PetGearMarketError('pet_gear_market_gear_runtime_mismatch', 503);
    }
    if (!deployedCode(paymentCode) || ethers.keccak256(paymentCode).toLowerCase() !== String(settings.expectedPaymentRuntimeCodeHash).toLowerCase()) {
      throw new PetGearMarketError('pet_gear_market_payment_runtime_mismatch', 503);
    }
    const rows = await client.batch([
      ['owner', []],
      ['gearToken', []],
      ['paymentToken', []],
      ['paused', []],
      ['nextListingId', []],
      ['activeListingCount', []],
    ].map(([method, args]) => ({
      method: 'eth_call',
      params: [{ to: settings.address, data: MARKET_INTERFACE.encodeFunctionData(method, args) }, blockTag],
    })));
    const owner = MARKET_INTERFACE.decodeFunctionResult('owner', rows[0])[0].toLowerCase();
    const gearToken = MARKET_INTERFACE.decodeFunctionResult('gearToken', rows[1])[0].toLowerCase();
    const paymentToken = MARKET_INTERFACE.decodeFunctionResult('paymentToken', rows[2])[0].toLowerCase();
    const paused = MARKET_INTERFACE.decodeFunctionResult('paused', rows[3])[0];
    const nextListingId = MARKET_INTERFACE.decodeFunctionResult('nextListingId', rows[4])[0];
    const activeListingCount = MARKET_INTERFACE.decodeFunctionResult('activeListingCount', rows[5])[0];
    if (owner !== String(settings.expectedController).toLowerCase()) throw new PetGearMarketError('pet_gear_market_controller_mismatch', 503);
    if (gearToken !== String(settings.gearContractAddress).toLowerCase()) throw new PetGearMarketError('pet_gear_market_gear_binding_mismatch', 503);
    if (paymentToken !== String(settings.paymentTokenAddress).toLowerCase()) throw new PetGearMarketError('pet_gear_market_payment_binding_mismatch', 503);
    if (requireTrading && (!settings.tradingRequested || paused)) {
      throw new PetGearMarketError(paused ? 'pet_gear_market_contract_paused' : 'pet_gear_market_trading_not_activated', 503);
    }
    return {
      blockTag,
      blockNumber: Number.parseInt(blockTag, 16),
      owner,
      gearToken,
      paymentToken,
      paused,
      nextListingId,
      activeListingCount,
      tradingEnabled: settings.tradingRequested === true && paused === false,
    };
  }

  function listingJson(listingId, decoded, executable) {
    const [seller, gearId, remaining, unitPrice, expiresAt, active] = decoded;
    const item = itemsById.get(String(gearId));
    return {
      listingId: String(listingId),
      seller: String(seller).toLowerCase(),
      gearId: String(gearId),
      remaining: String(remaining),
      unitPriceRaw: String(unitPrice),
      totalPriceRaw: String(BigInt(remaining) * BigInt(unitPrice)),
      expiresAt: new Date(Number(expiresAt) * 1000).toISOString(),
      expiresAtUnix: String(expiresAt),
      active: Boolean(active),
      executable: Boolean(executable),
      item: item || null,
    };
  }

  async function listingAt(listingId, blockTag) {
    const id = decimalBigInt(listingId, 'pet_gear_market_listing_id_invalid');
    if (id <= 0n) throw new PetGearMarketError('pet_gear_market_listing_id_invalid', 400);
    const [listingRaw, executableRaw] = await client.batch([
      { method: 'eth_call', params: [{ to: settings.address, data: MARKET_INTERFACE.encodeFunctionData('listings', [id]) }, blockTag] },
      { method: 'eth_call', params: [{ to: settings.address, data: MARKET_INTERFACE.encodeFunctionData('listingExecutable', [id]) }, blockTag] },
    ]);
    return listingJson(
      id,
      MARKET_INTERFACE.decodeFunctionResult('listings', listingRaw),
      MARKET_INTERFACE.decodeFunctionResult('listingExecutable', executableRaw)[0],
    );
  }

  async function activeListings(live) {
    const last = live.nextListingId > 1n ? live.nextListingId - 1n : 0n;
    if (last === 0n) return [];
    const first = last > BigInt(MAX_LISTINGS_READ) ? last - BigInt(MAX_LISTINGS_READ) + 1n : 1n;
    const ids = [];
    for (let id = last; id >= first; id -= 1n) ids.push(id);
    const calls = ids.flatMap((id) => [
      { method: 'eth_call', params: [{ to: settings.address, data: MARKET_INTERFACE.encodeFunctionData('listings', [id]) }, live.blockTag] },
      { method: 'eth_call', params: [{ to: settings.address, data: MARKET_INTERFACE.encodeFunctionData('listingExecutable', [id]) }, live.blockTag] },
    ]);
    const rows = await client.batch(calls);
    return ids.map((id, index) => listingJson(
      id,
      MARKET_INTERFACE.decodeFunctionResult('listings', rows[index * 2]),
      MARKET_INTERFACE.decodeFunctionResult('listingExecutable', rows[index * 2 + 1])[0],
    )).filter((listing) => listing.active && listing.executable && listing.item);
  }

  async function publicView() {
    const local = localStatus();
    if (local.status !== 'READY_FOR_LIVE_READBACK' && settings.status !== 'CONFIGURED') {
      return {
        ...local,
        generatedAt: new Date().toISOString(),
        listings: [],
        indexedListingWindow: MAX_LISTINGS_READ,
      };
    }
    const live = await assertLive();
    const listings = await activeListings(live);
    const floor = listings.reduce((lowest, listing) => {
      const value = BigInt(listing.unitPriceRaw);
      return lowest === null || value < lowest ? value : lowest;
    }, null);
    return {
      schema: 'AXO_PET_GEAR_MARKET_V1',
      generatedAt: new Date().toISOString(),
      status: live.tradingEnabled ? 'TRADING_ACTIVE' : 'CONTRACT_PAUSED',
      tradingEnabled: live.tradingEnabled,
      blockers: live.tradingEnabled ? [] : [settings.tradingRequested ? 'ONCHAIN_PAUSE_ACTIVE' : 'TRADING_ACTIVATION_REQUIRED'],
      activeListings: Number(live.activeListingCount),
      visibleListings: listings.length,
      floorPriceRaw: floor === null ? null : String(floor),
      blockNumber: live.blockNumber,
      indexedListingWindow: MAX_LISTINGS_READ,
      ...publicSettings(settings),
      listings,
    };
  }

  async function indexedGear(address) {
    const holdings = new Map();
    let cursor = {};
    for (let page = 0; page < MAX_NFT_PAGES; page += 1) {
      const response = await indexedProvider.getAddressNfts(address, {
        type: 'ERC-1155',
        itemsCount: 50,
        tokenContractAddressHash: settings.gearContractAddress,
        query: cursor,
      });
      for (const row of response?.items || []) {
        const contract = String(row?.token?.address_hash || row?.token?.address || '').toLowerCase();
        const id = String(row?.id ?? row?.token_id ?? '');
        const value = String(row?.value ?? row?.balance ?? '0');
        if (contract !== String(settings.gearContractAddress).toLowerCase() || !itemsById.has(id) || !/^\d+$/.test(value) || BigInt(value) <= 0n) continue;
        holdings.set(id, (holdings.get(id) || 0n) + BigInt(value));
      }
      cursor = response?.next_page_params || null;
      if (!cursor || typeof cursor !== 'object') break;
    }
    return holdings;
  }

  async function walletView(address) {
    const wallet = normalizeAddress(address);
    const market = await publicView();
    if (settings.status !== 'CONFIGURED') return { ...market, wallet, gear: [], myListings: [] };
    const indexed = await indexedGear(wallet);
    const ids = [...indexed.keys()];
    const live = await assertLive();
    const availableRows = ids.length ? await client.batch(ids.map((id) => ({
      method: 'eth_call',
      params: [{ to: settings.gearContractAddress, data: GEAR_INTERFACE.encodeFunctionData('availableBalanceOf', [wallet, id]) }, live.blockTag],
    }))) : [];
    const gear = ids.map((id, index) => ({
      item: itemsById.get(id),
      balance: String(indexed.get(id)),
      availableBalance: String(GEAR_INTERFACE.decodeFunctionResult('availableBalanceOf', availableRows[index])[0]),
    })).sort((a, b) => Number(a.item.id) - Number(b.item.id));
    return {
      ...market,
      wallet,
      gear,
      myListings: market.listings.filter((listing) => listing.seller === wallet),
    };
  }

  async function preparedTransaction(from, to, data) {
    try {
      await client.request('eth_call', [{ from, to, data, value: '0x0' }, 'latest']);
      const gas = await client.request('eth_estimateGas', [{ from, to, data, value: '0x0' }, 'latest']);
      return transactionRow(from, to, data, gas);
    } catch (error) {
      throw new PetGearMarketError('pet_gear_market_simulation_failed', 409);
    }
  }

  async function prepareList(address, input) {
    const wallet = normalizeAddress(address);
    const gearId = decimalBigInt(input.gearId, 'pet_gear_market_gear_id_invalid');
    const amount = decimalBigInt(input.amount, 'pet_gear_market_amount_invalid');
    const unitPrice = decimalBigInt(input.unitPriceRaw, 'pet_gear_market_price_invalid');
    const expiresAt = decimalBigInt(input.expiresAt, 'pet_gear_market_expiration_invalid');
    if (!itemsById.has(String(gearId))) throw new PetGearMarketError('pet_gear_market_catalog_item_invalid', 400);
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (amount <= 0n || amount > (1n << 128n) - 1n || unitPrice <= 0n || unitPrice > (1n << 128n) - 1n) {
      throw new PetGearMarketError('pet_gear_market_input_out_of_range', 400);
    }
    if (expiresAt < now + BigInt(MIN_LISTING_DURATION_SECONDS) || expiresAt > now + BigInt(MAX_LISTING_DURATION_SECONDS)) {
      throw new PetGearMarketError('pet_gear_market_expiration_invalid', 400);
    }
    const live = await assertLive({ requireTrading: true });
    const [approval] = await call(settings.gearContractAddress, GEAR_INTERFACE, 'isApprovedForAll', [wallet, settings.address], live.blockTag);
    if (!approval) {
      const data = GEAR_INTERFACE.encodeFunctionData('setApprovalForAll', [settings.address, true]);
      return {
        stage: 'GEAR_APPROVAL_REQUIRED',
        approvalScope: 'ALL_AXO_PET_GEAR',
        transaction: await preparedTransaction(wallet, settings.gearContractAddress, data),
      };
    }
    const [available] = await call(settings.gearContractAddress, GEAR_INTERFACE, 'availableBalanceOf', [wallet, gearId], live.blockTag);
    if (available < amount) throw new PetGearMarketError('pet_gear_market_unequipped_balance_insufficient', 409);
    const data = MARKET_INTERFACE.encodeFunctionData('createListing', [gearId, amount, unitPrice, expiresAt]);
    return {
      stage: 'LISTING_READY',
      item: itemsById.get(String(gearId)),
      totalPriceRaw: String(amount * unitPrice),
      transaction: await preparedTransaction(wallet, settings.address, data),
    };
  }

  async function preparePurchase(address, input) {
    const wallet = normalizeAddress(address);
    const listingId = decimalBigInt(input.listingId, 'pet_gear_market_listing_id_invalid');
    const amount = decimalBigInt(input.amount, 'pet_gear_market_amount_invalid');
    const live = await assertLive({ requireTrading: true });
    const listing = await listingAt(listingId, live.blockTag);
    if (!listing.active || !listing.executable) throw new PetGearMarketError('pet_gear_market_listing_unavailable', 409);
    if (listing.seller === wallet) throw new PetGearMarketError('pet_gear_market_self_purchase_forbidden', 409);
    if (amount <= 0n || amount > BigInt(listing.remaining)) throw new PetGearMarketError('pet_gear_market_amount_invalid', 400);
    const totalPrice = amount * BigInt(listing.unitPriceRaw);
    const [balance, allowance] = await client.batch([
      { method: 'eth_call', params: [{ to: settings.paymentTokenAddress, data: PAYMENT_INTERFACE.encodeFunctionData('balanceOf', [wallet]) }, live.blockTag] },
      { method: 'eth_call', params: [{ to: settings.paymentTokenAddress, data: PAYMENT_INTERFACE.encodeFunctionData('allowance', [wallet, settings.address]) }, live.blockTag] },
    ]).then(([balanceRaw, allowanceRaw]) => [
      PAYMENT_INTERFACE.decodeFunctionResult('balanceOf', balanceRaw)[0],
      PAYMENT_INTERFACE.decodeFunctionResult('allowance', allowanceRaw)[0],
    ]);
    if (balance < totalPrice) throw new PetGearMarketError('pet_gear_market_axo_balance_insufficient', 409);
    if (allowance < totalPrice) {
      const data = PAYMENT_INTERFACE.encodeFunctionData('approve', [settings.address, totalPrice]);
      return {
        stage: 'PAYMENT_APPROVAL_REQUIRED',
        listing,
        totalPriceRaw: String(totalPrice),
        transaction: await preparedTransaction(wallet, settings.paymentTokenAddress, data),
      };
    }
    const data = MARKET_INTERFACE.encodeFunctionData('purchase', [listingId, amount]);
    return {
      stage: 'PURCHASE_READY',
      listing,
      totalPriceRaw: String(totalPrice),
      transaction: await preparedTransaction(wallet, settings.address, data),
    };
  }

  async function prepareCancel(address, input) {
    const wallet = normalizeAddress(address);
    const listingId = decimalBigInt(input.listingId, 'pet_gear_market_listing_id_invalid');
    const live = await assertLive();
    const listing = await listingAt(listingId, live.blockTag);
    if (!listing.active) throw new PetGearMarketError('pet_gear_market_listing_unavailable', 409);
    if (listing.seller !== wallet) throw new PetGearMarketError('pet_gear_market_not_listing_seller', 403);
    const data = MARKET_INTERFACE.encodeFunctionData('cancelListing', [listingId]);
    return {
      stage: 'CANCELLATION_READY',
      listing,
      transaction: await preparedTransaction(wallet, settings.address, data),
    };
  }

  return Object.freeze({
    localStatus,
    assertLive,
    publicView,
    walletView,
    prepareList,
    preparePurchase,
    prepareCancel,
  });
}

module.exports = {
  MARKET_ABI,
  GEAR_ABI,
  PAYMENT_ABI,
  PetGearMarketError,
  createPetGearMarketplace,
  MIN_LISTING_DURATION_SECONDS,
  MAX_LISTING_DURATION_SECONDS,
  MAX_LISTINGS_READ,
};
