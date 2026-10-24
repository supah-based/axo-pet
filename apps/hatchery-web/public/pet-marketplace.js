'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const rarityOrder = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
  const state = {
    catalog: [],
    slots: [],
    market: null,
    listings: [],
    gear: [],
    myListings: [],
    privateReadUnavailable: false,
    session: { connected: false },
    view: 'listings',
    buyListing: null,
    busy: false,
  };
  let marketRefreshId = 0;

  function sessionAddress() {
    return state.session.connected ? String(state.session.address || '').toLowerCase() : '';
  }

  function clearPrivateInventory() {
    state.gear = [];
    state.myListings = [];
    state.privateReadUnavailable = false;
    refreshSellOptions();
  }

  function setupNavigation() {
    const nav = $('[data-pet-nav]');
    const button = $('[data-pet-menu]');
    if (!nav || !button) return;
    button.addEventListener('click', () => {
      const open = nav.dataset.open !== 'true';
      nav.dataset.open = String(open);
      button.setAttribute('aria-expanded', String(open));
    });
    $$('a', $('[data-pet-navigation]')).forEach((link) => link.addEventListener('click', () => {
      nav.dataset.open = 'false';
      button.setAttribute('aria-expanded', 'false');
    }));
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      nav.dataset.open = 'false';
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function applyHashView() {
    if (window.location.hash === '#my-gear') state.view = 'gear';
    else if (window.location.hash === '#my-listings') state.view = 'mine';
    else if (window.location.hash === '#market') state.view = 'listings';
    $$('[data-market-tab]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.marketTab === state.view)));
  }

  function codeFor(slot) {
    return ({ head: 'HD', face: 'VR', body: 'ST', back: 'BK', tool: 'TL', charm: 'CH', companion: 'CP', habitat: 'HB' })[slot] || 'AX';
  }

  function renderGearArt(host, item) {
    // Numeric V1 identity is not a mapping to candidate clothing. Retire the old
    // character/layer thumbnails and keep the existing slot-code placeholder.
    host.dataset.image = 'false';
    host.setAttribute('aria-label', (item?.visualName || item?.label || 'V1 Gear') + ' · legacy artwork retired; verified item details below');
  }

  function shortAddress(address) {
    return ADDRESS.test(String(address || '')) ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'UNKNOWN';
  }

  function parseUnits(value, decimals = 18) {
    const clean = String(value || '').trim();
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(clean)) throw new Error('Enter a valid AXO amount.');
    const [whole, fraction = ''] = clean.split('.');
    if (fraction.length > decimals) throw new Error(`AXO supports at most ${decimals} decimal places.`);
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals));
  }

  function optionalUnits(value) {
    const clean = String(value || '').trim();
    return clean ? parseUnits(clean) : null;
  }

  function formatUnits(value, decimals = 18, maximumFraction = 4) {
    const raw = BigInt(String(value || '0'));
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const fraction = String(raw % base).padStart(decimals, '0').slice(0, maximumFraction).replace(/0+$/, '');
    return `${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
  }

  function readableError(error) {
    const source = String(error?.message || error || 'Marketplace request failed.');
    const known = {
      pet_gear_market_trading_not_activated: 'Trading has not been activated yet.',
      pet_gear_market_contract_paused: 'The marketplace contract is paused.',
      pet_gear_market_unequipped_balance_insufficient: 'That quantity is not available while your gear is equipped or otherwise committed.',
      pet_gear_market_listing_unavailable: 'That listing is no longer executable. Refresh the market.',
      pet_gear_market_axo_balance_insufficient: 'Your wallet does not hold enough AXO for this purchase.',
      pet_gear_market_self_purchase_forbidden: 'You cannot buy your own listing.',
      pet_gear_market_simulation_failed: 'The exact transaction did not pass simulation, so it was blocked.',
    };
    if (known[source]) return known[source];
    if (source.startsWith('pet_gear_market_not_ready:')) return 'Marketplace deployment and verification are still gated.';
    return source.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Marketplace request failed (${response.status}).`);
    return payload;
  }

  function renderCatalog() {
    const search = String($('[data-gear-search]')?.value || '').trim().toLowerCase();
    const slot = $('[data-gear-slot]')?.value || 'all';
    const rarity = $('[data-gear-rarity]')?.value || 'all';
    const sort = $('[data-gear-sort]')?.value || 'id';
    const slotLabels = new Map(state.slots.map((item) => [item.key, item.label]));
    const filtered = state.catalog.filter((item) => {
      const searchMatch = !search || `${item.label} ${item.visualName || ''} ${item.key} ${item.slot} ${item.id}`.toLowerCase().includes(search);
      return searchMatch && (slot === 'all' || item.slot === slot) && (rarity === 'all' || item.rarity === rarity);
    }).sort((a, b) => sort === 'name'
      ? a.label.localeCompare(b.label)
      : sort === 'rarity'
        ? (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0) || a.id - b.id
        : a.id - b.id);
    $('[data-visible-items]').textContent = String(filtered.length);
    $('[data-total-items]').textContent = String(state.catalog.length);
    const grid = $('[data-gear-grid]');
    grid.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('article');
      empty.className = 'gear-loading';
      empty.textContent = 'No catalog designs match those filters.';
      grid.append(empty);
      return;
    }
    filtered.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'gear-item';
      card.dataset.rarity = item.rarity;
      const header = document.createElement('header');
      const rarityLabel = document.createElement('span');
      rarityLabel.textContent = item.rarity;
      const id = document.createElement('span');
      id.textContent = `#${item.id}`;
      header.append(rarityLabel, id);
      const emblem = document.createElement('div');
      emblem.className = 'gear-emblem';
      emblem.dataset.code = codeFor(item.slot);
      renderGearArt(emblem, item);
      const name = document.createElement('h3');
      name.textContent = item.visualName || item.label;
      const detail = document.createElement('p');
      detail.textContent = `${slotLabels.get(item.slot) || item.slot} · ${item.label}`;
      const footer = document.createElement('footer');
      const status = document.createElement('span');
      status.textContent = 'SUPPLY NOT DEFINED';
      const action = document.createElement('b');
      action.textContent = 'CATALOG PREVIEW';
      footer.append(status, action);
      card.append(header, emblem, name, detail, footer);
      grid.append(card);
    });
  }

  function itemFor(row) {
    return row?.item || state.catalog.find((item) => String(item.id) === String(row?.gearId)) || null;
  }

  function currentRows() {
    if (state.view === 'gear') return state.gear;
    if (state.view === 'mine') return state.myListings;
    return state.listings;
  }

  function filterRows(rows) {
    const search = String($('[data-market-search]')?.value || '').trim().toLowerCase();
    const slot = $('[data-market-slot]')?.value || 'all';
    const rarity = $('[data-market-rarity]')?.value || 'all';
    const sort = $('[data-market-sort]')?.value || 'newest';
    let minimum = null;
    let maximum = null;
    try { minimum = optionalUnits($('[data-market-min]')?.value); } catch { minimum = null; }
    try { maximum = optionalUnits($('[data-market-max]')?.value); } catch { maximum = null; }
    return rows.filter((row) => {
      const item = itemFor(row);
      if (!item) return false;
      const text = `${item.label} ${item.key} ${item.slot} ${item.id}`.toLowerCase();
      const price = row.unitPriceRaw === undefined ? null : BigInt(row.unitPriceRaw);
      return (!search || text.includes(search))
        && (slot === 'all' || item.slot === slot)
        && (rarity === 'all' || item.rarity === rarity)
        && (minimum === null || price === null || price >= minimum)
        && (maximum === null || price === null || price <= maximum);
    }).sort((a, b) => {
      const itemA = itemFor(a);
      const itemB = itemFor(b);
      if (sort === 'price-low' && a.unitPriceRaw !== undefined && b.unitPriceRaw !== undefined) return BigInt(a.unitPriceRaw) < BigInt(b.unitPriceRaw) ? -1 : 1;
      if (sort === 'price-high' && a.unitPriceRaw !== undefined && b.unitPriceRaw !== undefined) return BigInt(a.unitPriceRaw) > BigInt(b.unitPriceRaw) ? -1 : 1;
      if (sort === 'rarity') return (rarityOrder[itemB.rarity] || 0) - (rarityOrder[itemA.rarity] || 0);
      return Number(b.listingId || itemB.id) - Number(a.listingId || itemA.id);
    });
  }

  function marketCard(row) {
    const item = itemFor(row);
    const card = document.createElement('article');
    card.className = 'listing-card';
    card.dataset.rarity = item.rarity;
    const top = document.createElement('header');
    const rarity = document.createElement('span');
    rarity.textContent = item.rarity;
    const id = document.createElement('span');
    id.textContent = row.listingId ? `LISTING #${row.listingId}` : `GEAR #${item.id}`;
    top.append(rarity, id);
    const art = document.createElement('div');
    art.className = 'listing-art';
    art.dataset.code = codeFor(item.slot);
    renderGearArt(art, item);
    const name = document.createElement('h3');
    name.textContent = item.visualName || item.label;
    const sub = document.createElement('p');
    sub.textContent = `${item.slotLabel || item.slot} · ${row.listingId ? `Seller ${shortAddress(row.seller)}` : `${row.availableBalance} unequipped / ${row.balance} owned`}`;
    const facts = document.createElement('div');
    facts.className = 'listing-facts';
    if (row.listingId) {
      const priceLabel = document.createElement('span');
      priceLabel.textContent = 'UNIT PRICE';
      const price = document.createElement('b');
      price.textContent = `${formatUnits(row.unitPriceRaw)} AXO`;
      const qtyLabel = document.createElement('span');
      qtyLabel.textContent = 'AVAILABLE';
      const qty = document.createElement('b');
      qty.textContent = String(row.remaining);
      facts.append(priceLabel, price, qtyLabel, qty);
    } else {
      const ownedLabel = document.createElement('span');
      ownedLabel.textContent = 'OWNED';
      const owned = document.createElement('b');
      owned.textContent = String(row.balance);
      const availableLabel = document.createElement('span');
      availableLabel.textContent = 'CAN LIST';
      const available = document.createElement('b');
      available.textContent = String(row.availableBalance);
      facts.append(ownedLabel, owned, availableLabel, available);
    }
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'listing-action';
    if (state.view === 'gear') {
      action.textContent = 'SELL GEAR';
      action.disabled = !state.market?.tradingEnabled || BigInt(row.availableBalance || 0) === 0n || state.busy;
      action.addEventListener('click', () => openSell(String(item.id)));
    } else if (state.view === 'mine') {
      action.textContent = 'CANCEL LISTING';
      action.disabled = state.busy;
      action.addEventListener('click', () => cancelListing(row));
    } else {
      const own = String(row.seller || '').toLowerCase() === String(state.session.address || '').toLowerCase();
      action.textContent = own ? 'YOUR LISTING' : state.market?.tradingEnabled ? 'BUY WITH AXO' : 'TRADING GATED';
      action.disabled = own || !state.market?.tradingEnabled || !state.session.connected || state.busy;
      action.addEventListener('click', () => openBuy(row));
    }
    card.append(top, art, name, sub, facts, action);
    return card;
  }

  function renderMarketRows() {
    const rows = filterRows(currentRows());
    const privateUnavailable = state.privateReadUnavailable && state.view !== 'listings';
    $('[data-market-result-count]').textContent = privateUnavailable ? '—' : String(rows.length);
    $('[data-tab-listing-count]').textContent = String(state.listings.length);
    $('[data-tab-gear-count]').textContent = state.privateReadUnavailable ? '—' : String(state.gear.length);
    $('[data-tab-mine-count]').textContent = state.privateReadUnavailable ? '—' : String(state.myListings.length);
    const grid = $('[data-listing-grid]');
    grid.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('article');
      empty.className = 'market-empty';
      const messages = {
        listings: state.market?.tradingEnabled ? 'No verified live listings match these filters.' : 'No listings are shown while market deployment and trading remain gated.',
        gear: privateUnavailable ? 'Wallet gear read unavailable. No inventory inferred; reconnect or refresh to retry.' : state.session.connected ? 'No transferable AXO Pet gear was found for this wallet.' : 'Connect and verify your wallet to see gear you can list.',
        mine: privateUnavailable ? 'Wallet listings read unavailable. No listings inferred; reconnect or refresh to retry.' : state.session.connected ? 'This wallet has no active listings.' : 'Connect and verify your wallet to manage listings.',
      };
      empty.textContent = messages[state.view];
      grid.append(empty);
      return;
    }
    rows.forEach((row) => grid.append(marketCard(row)));
  }

  function renderMarketStatus() {
    const market = state.market || {};
    const active = Number(market.activeListings || 0);
    const tradingEnabled = market.tradingEnabled === true;
    $('[data-active-listings]').textContent = String(active);
    $('[data-floor-price]').textContent = market.floorPriceRaw === null || market.floorPriceRaw === undefined ? '—' : `${formatUnits(market.floorPriceRaw)} AXO`;
    const stateLabel = $('[data-marketplace-state]');
    const stateNote = $('[data-marketplace-note]');
    const gate = $('[data-market-gate]');
    if (tradingEnabled) {
      document.title = 'AXO Pet Bazaar — Buy and Sell Cosmetic Gear';
      stateLabel.textContent = 'GEAR TRADING LIVE';
      stateLabel.style.color = 'var(--green)';
      stateNote.textContent = `VERIFIED AT BLOCK ${market.blockNumber}`;
      $('[data-market-gate-title]').textContent = 'VERIFIED MARKET ACTIVE';
      $('[data-market-gate-copy]').textContent = 'Live contract bindings, executable listings, wallet inventory, and exact AXO settlement are enabled.';
      gate.dataset.live = 'true';
    } else {
      document.title = 'AXO Pet Bazaar — Preview Cosmetic Gear and Loadouts';
      stateLabel.textContent = 'BUILD READY';
      stateLabel.style.color = 'var(--orange)';
      stateNote.textContent = 'DEPLOYMENT + ACTIVATION GATED';
      $('[data-market-gate-title]').textContent = 'MARKETPLACE BUILT · TRADING LOCKED';
      const blockers = Array.isArray(market.blockers) ? market.blockers : [];
      $('[data-market-gate-copy]').textContent = blockers.includes('MARKETPLACE_NOT_DEPLOYED')
        ? 'The settlement contract and wallet interface are ready, but no marketplace contract is deployed or authorized for value movement.'
        : 'Exact deployment verification and explicit trading activation remain required.';
      gate.dataset.live = 'false';
    }
    $$('[data-sell-gear]').forEach((button) => {
      button.classList.toggle('market-action-gated', !tradingEnabled);
      button.title = tradingEnabled ? 'Create a fixed-price AXO listing' : 'Preview sell flow; trading activation is gated';
    });
    $$('[data-sell-label]').forEach((label, index) => {
      label.textContent = tradingEnabled ? (index === 0 ? 'SELL MY GEAR' : 'CREATE LISTING') : (index === 0 ? 'PREVIEW SELL FLOW' : 'PREVIEW LISTING FLOW');
    });
    $('[data-sell-kicker]').textContent = tradingEnabled ? 'CREATE FIXED-PRICE LISTING' : 'FIXED-PRICE LISTING PREVIEW';
    $('[data-sell-title]').textContent = tradingEnabled ? 'Sell AXO Pet gear' : 'Preview a gear listing';
    $('[data-sell-copy]').textContent = tradingEnabled
      ? 'Only unequipped gear can move. Your item stays in your wallet until a buyer fills the listing.'
      : 'Review the future self-custody flow. No listing can be created until verified deployment and explicit trading activation.';
    $('[data-sell-submit]').textContent = tradingEnabled ? 'CREATE LISTING' : 'TRADING LOCKED';
    renderMarketRows();
  }

  function configureFilters() {
    for (const selector of ['[data-gear-slot]', '[data-market-slot]']) {
      const select = $(selector);
      state.slots.forEach((slot) => {
        const option = document.createElement('option');
        option.value = slot.key;
        option.textContent = String(slot.label || slot.key).toUpperCase();
        select.append(option);
      });
    }
    for (const selector of ['[data-gear-search]', '[data-gear-slot]', '[data-gear-rarity]', '[data-gear-sort]']) {
      $(selector)?.addEventListener(selector.includes('search') ? 'input' : 'change', renderCatalog);
    }
    for (const selector of ['[data-market-search]', '[data-market-slot]', '[data-market-rarity]', '[data-market-min]', '[data-market-max]', '[data-market-sort]']) {
      $(selector)?.addEventListener(['search', 'min', 'max'].some((key) => selector.includes(key)) ? 'input' : 'change', renderMarketRows);
    }
    $('[data-clear-market-filters]')?.addEventListener('click', () => {
      for (const selector of ['[data-market-search]', '[data-market-min]', '[data-market-max]']) $(selector).value = '';
      $('[data-market-slot]').value = 'all';
      $('[data-market-rarity]').value = 'all';
      $('[data-market-sort]').value = 'newest';
      renderMarketRows();
    });
    $$('[data-market-tab]').forEach((button) => button.addEventListener('click', () => {
      state.view = button.dataset.marketTab;
      $$('[data-market-tab]').forEach((tab) => tab.setAttribute('aria-selected', String(tab === button)));
      renderMarketRows();
      if (state.view !== 'listings' && !state.session.connected) window.AxoWallet?.connect?.().catch(() => {});
    }));
  }

  function refreshSellOptions(selected = '') {
    const select = $('[data-sell-item]');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = state.session.connected ? 'SELECT UNEQUIPPED GEAR' : 'CONNECT WALLET FIRST';
    select.append(placeholder);
    state.gear.filter((row) => BigInt(row.availableBalance || 0) > 0n).forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.item.id);
      option.textContent = `${row.item.label} · ${row.availableBalance} AVAILABLE`;
      select.append(option);
    });
    if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  function sellTotal() {
    try {
      const amount = BigInt($('[data-sell-amount]').value || '0');
      const price = parseUnits($('[data-sell-price]').value);
      $('[data-sell-total]').textContent = `${formatUnits(amount * price)} AXO`;
    } catch { $('[data-sell-total]').textContent = '— AXO'; }
  }

  function buyTotal() {
    const listing = state.buyListing;
    if (!listing) return;
    try {
      const amount = BigInt($('[data-buy-amount]').value || '0');
      $('[data-buy-total]').textContent = `${formatUnits(amount * BigInt(listing.unitPriceRaw))} AXO`;
    } catch { $('[data-buy-total]').textContent = '— AXO'; }
  }

  async function openSell(selected = '') {
    if (!state.session.connected) {
      await window.AxoWallet?.connect?.().catch(() => {});
      state.session = window.AxoWallet?.getSession?.() || state.session;
    }
    refreshSellOptions(selected);
    $('[data-sell-submit]').disabled = !state.market?.tradingEnabled || !state.session.connected || state.busy;
    $('[data-sell-status]').textContent = state.market?.tradingEnabled
      ? 'Wallet approval may require one transaction before listing.'
      : 'Preview only: deployment and trading activation are still gated.';
    $('[data-sell-dialog]').showModal();
  }

  function openBuy(listing) {
    state.buyListing = listing;
    $('[data-buy-name]').textContent = `Buy ${listing.item.label}`;
    $('[data-buy-unit]').textContent = `${formatUnits(listing.unitPriceRaw)} AXO`;
    $('[data-buy-available]').textContent = String(listing.remaining);
    $('[data-buy-amount]').max = String(listing.remaining);
    $('[data-buy-amount]').value = '1';
    $('[data-buy-submit]').disabled = !state.market?.tradingEnabled || state.busy;
    buyTotal();
    $('[data-buy-dialog]').showModal();
  }

  async function waitForReceipt(hash, timeoutMs = 180_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const receipt = await window.AxoWallet.request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (receipt) {
        if (['0x0', 0, false].includes(receipt.status)) throw new Error('The transaction reverted onchain.');
        return receipt;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    throw new Error('Confirmation is still pending. Check your wallet before retrying.');
  }

  async function waitForSubmission(submission) {
    if (window.AxoWallet.isTransactionHash(submission?.hash || submission?.id)) {
      const hash = submission.hash || submission.id;
      await waitForReceipt(hash);
      return hash;
    }
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      const status = window.AxoWallet.normalizeCallsStatus(await window.AxoWallet.getCallsStatus(submission?.id));
      if (status.state === 'success') {
        if (!window.AxoWallet.isTransactionHash(status.hash)) throw new Error('Wallet confirmed without a verifiable transaction hash.');
        await waitForReceipt(status.hash);
        return status.hash;
      }
      if (status.state === 'failure') throw new Error('The wallet transaction failed onchain.');
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    throw new Error('Confirmation is still pending. Check your wallet before retrying.');
  }

  function validatePreparedTransaction(transaction) {
    const allowed = [state.market?.contractAddress, state.market?.gearContractAddress, state.market?.paymentTokenAddress]
      .filter(Boolean).map((address) => String(address).toLowerCase());
    if (Number(transaction?.chainId) !== 4663
      || String(transaction?.from || '').toLowerCase() !== String(state.session.address || '').toLowerCase()
      || !allowed.includes(String(transaction?.to || '').toLowerCase())
      || !/^0x(?:[0-9a-f]{2})+$/i.test(String(transaction?.data || ''))
      || String(transaction?.value || '') !== '0x0') throw new Error('Blocked a transaction outside the verified AXO Pet market boundary.');
    return transaction;
  }

  async function executePrepared(endpoint, body, finalStage, statusElement) {
    await window.AxoWallet.ensureRobinhoodChain();
    for (let step = 0; step < 2; step += 1) {
      const prepared = await jsonFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      statusElement.textContent = prepared.stage.endsWith('APPROVAL_REQUIRED') ? 'Approve in your wallet…' : 'Confirm the marketplace transaction…';
      const transaction = validatePreparedTransaction(prepared.transaction);
      const submission = await window.AxoWallet.sendTransaction(transaction, { chainId: 4663 });
      statusElement.textContent = 'Confirming on Robinhood Chain…';
      const hash = await waitForSubmission(submission);
      if (prepared.stage === finalStage) return hash;
      statusElement.textContent = 'Approval confirmed. Preparing the final transaction…';
    }
    throw new Error('The approval sequence did not reach the final transaction.');
  }

  async function submitSell(event) {
    event.preventDefault();
    if (state.busy) return;
    const status = $('[data-sell-status]');
    try {
      if (!state.market?.tradingEnabled) throw new Error('Trading has not been activated yet.');
      const gearId = $('[data-sell-item]').value;
      const amount = String(BigInt($('[data-sell-amount]').value));
      const unitPriceRaw = String(parseUnits($('[data-sell-price]').value));
      const duration = Number($('[data-sell-duration]').value);
      const expiresAt = String(Math.floor(Date.now() / 1000) + duration);
      state.busy = true;
      $('[data-sell-submit]').disabled = true;
      const hash = await executePrepared('/api/axo-pet/marketplace/list/prepare', { gearId, amount, unitPriceRaw, expiresAt }, 'LISTING_READY', status);
      status.textContent = `Listing confirmed · ${hash.slice(0, 8)}…${hash.slice(-6)}`;
      await reloadMarket();
      window.setTimeout(() => $('[data-sell-dialog]').close(), 900);
    } catch (error) { status.textContent = readableError(error); }
    finally { state.busy = false; $('[data-sell-submit]').disabled = !state.market?.tradingEnabled; renderMarketRows(); }
  }

  async function submitBuy(event) {
    event.preventDefault();
    if (state.busy || !state.buyListing) return;
    const status = $('[data-buy-status]');
    try {
      if (!state.market?.tradingEnabled) throw new Error('Trading has not been activated yet.');
      const amount = String(BigInt($('[data-buy-amount]').value));
      state.busy = true;
      $('[data-buy-submit]').disabled = true;
      const hash = await executePrepared('/api/axo-pet/marketplace/purchase/prepare', { listingId: state.buyListing.listingId, amount }, 'PURCHASE_READY', status);
      status.textContent = `Purchase confirmed · ${hash.slice(0, 8)}…${hash.slice(-6)}`;
      await reloadMarket();
      window.setTimeout(() => $('[data-buy-dialog]').close(), 900);
    } catch (error) { status.textContent = readableError(error); }
    finally { state.busy = false; $('[data-buy-submit]').disabled = !state.market?.tradingEnabled; renderMarketRows(); }
  }

  async function cancelListing(listing) {
    if (state.busy || !window.confirm(`Cancel ${listing.item.label} listing #${listing.listingId}?`)) return;
    try {
      state.busy = true;
      renderMarketRows();
      await executePrepared('/api/axo-pet/marketplace/cancel/prepare', { listingId: listing.listingId }, 'CANCELLATION_READY', $('[data-market-gate-copy]'));
      await reloadMarket();
    } catch (error) { $('[data-market-gate-copy]').textContent = readableError(error); }
    finally { state.busy = false; renderMarketRows(); }
  }

  async function reloadMarket() {
    const refreshId = ++marketRefreshId;
    const address = sessionAddress();
    const market = await jsonFetch('/api/axo-pet/marketplace');
    if (refreshId !== marketRefreshId || address !== sessionAddress()) return;
    state.market = market;
    state.listings = Array.isArray(market.listings) ? market.listings : [];
    if (address) {
      try {
        const mine = await jsonFetch('/api/axo-pet/marketplace/me');
        if (refreshId !== marketRefreshId || address !== sessionAddress()) return;
        if (!Array.isArray(mine?.gear) || !Array.isArray(mine?.myListings)) throw new Error('Invalid wallet inventory response.');
        state.gear = mine.gear;
        state.myListings = mine.myListings;
        state.privateReadUnavailable = false;
      } catch {
        if (refreshId !== marketRefreshId || address !== sessionAddress()) return;
        clearPrivateInventory();
        state.privateReadUnavailable = true;
      }
    } else {
      clearPrivateInventory();
    }
    refreshSellOptions();
    renderMarketStatus();
  }

  function setupDialogs() {
    $$('[data-sell-gear]').forEach((button) => button.addEventListener('click', () => openSell()));
    $('[data-sell-price]').addEventListener('input', sellTotal);
    $('[data-sell-amount]').addEventListener('input', sellTotal);
    $('[data-buy-amount]').addEventListener('input', buyTotal);
    $('[data-sell-form]').addEventListener('submit', submitSell);
    $('[data-buy-form]').addEventListener('submit', submitBuy);
  }

  async function load() {
    try {
      applyHashView();
      const [overview, market] = await Promise.all([
        jsonFetch('/api/axo-pet/overview'),
        jsonFetch('/api/axo-pet/marketplace'),
      ]);
      state.catalog = Array.isArray(overview.collection?.launchGear) ? overview.collection.launchGear : [];
      state.slots = Array.isArray(overview.collection?.gearSlots) ? overview.collection.gearSlots : [];
      state.market = market;
      state.listings = Array.isArray(market.listings) ? market.listings : [];
      configureFilters();
      setupDialogs();
      renderCatalog();
      renderMarketStatus();
      if (window.AxoWallet?.ready) await window.AxoWallet.ready.catch(() => {});
      state.session = window.AxoWallet?.getSession?.() || state.session;
      if (state.session.connected) await reloadMarket();
      else renderMarketRows();
    } catch (error) {
      $('[data-marketplace-state]').textContent = 'READ UNAVAILABLE';
      $('[data-marketplace-note]').textContent = 'NO MARKET STATE INFERRED';
      $('[data-market-gate-title]').textContent = 'MARKET READ UNAVAILABLE';
      $('[data-market-gate-copy]').textContent = 'No listings, inventory, prices, or floor were inferred.';
      const grid = $('[data-listing-grid]');
      grid.replaceChildren();
      const failure = document.createElement('article');
      failure.className = 'market-empty';
      failure.textContent = readableError(error);
      grid.append(failure);
    }
  }

  window.addEventListener('axo:session', (event) => {
    const previous = sessionAddress();
    state.session = event.detail || { connected: false };
    if (previous !== sessionAddress()) {
      ++marketRefreshId;
      clearPrivateInventory();
      renderMarketRows();
    }
    if (previous !== sessionAddress() || state.session.connected) reloadMarket().catch(() => renderMarketRows());
  });
  window.addEventListener('hashchange', () => {
    applyHashView();
    renderMarketRows();
  });
  setupNavigation();
  load();
})();
