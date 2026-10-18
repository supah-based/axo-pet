'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { session: { connected: false }, overview: null, me: null, countdown: null };
  const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));

  async function json(path) {
    const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
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
  }

  function renderOverview() {
    const overview = state.overview;
    if (!overview) return;
    $$('[data-public-stat]').forEach((element) => {
      const value = overview.stats?.[element.dataset.publicStat];
      element.textContent = value === null || value === undefined ? '—' : number(value);
    });
    $('[data-public-epoch]').textContent = overview.epoch?.id || 'EPOCH PENDING';
    const market = $('[data-public-market]');
    const live = overview.nft?.gearTradingEnabled === true;
    market.textContent = live ? 'LIVE' : overview.nft?.marketplaceStatus === 'RELEASE_GATED' ? 'BUILD READY' : 'GATED';
    market.style.color = live ? 'var(--green)' : 'var(--orange)';
    $('[data-public-market-note]').textContent = live ? `${number(overview.nft?.activeListings)} listings` : 'deployment + activation gated';
  }

  function setConnectedState() {
    const connected = state.session.connected === true;
    $('[data-session-light]').classList.toggle('live', connected);
    $('[data-command-connect]').hidden = connected;
    if (!connected) $('[data-command-private]').hidden = true;
  }

  function setVital(name, value) {
    const clean = Math.max(0, Math.min(100, Number(value || 0)));
    $(`[data-vital="${name}"]`).textContent = String(clean);
    $(`[data-vital-bar="${name}"]`).style.width = `${clean}%`;
  }

  function countdown(endsAt) {
    const remaining = Date.parse(endsAt || '') - Date.now();
    if (!Number.isFinite(remaining)) return '—';
    if (remaining <= 0) return 'CLOSED';
    const days = Math.floor(remaining / 86_400_000);
    const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    return `${days}D ${hours}H ${minutes}M`;
  }

  function renderTasks(today) {
    const tasks = [
      { label: `Care ritual · ${Number(today.careCompleted || 0)}/${Number(today.careGoal || 3)}`, complete: Number(today.careCompleted || 0) >= Number(today.careGoal || 3), route: '/hatchery?view=pet' },
      { label: 'Daily contract scout', complete: today.contractScoutCompleted === true, route: '/hatchery?view=quests' },
      { label: 'Crew Passport', complete: today.passportComplete === true, route: '/hatchery?view=pet#pet-passport' },
    ];
    const cuddleReady = today.cuddleAvailable === true;
    tasks.push({ label: cuddleReady ? 'Cuddle available' : 'Cuddle cooldown active', complete: !cuddleReady, route: '/hatchery?view=pet' });
    const done = tasks.filter((task) => task.complete).length;
    $('[data-today-done]').textContent = String(done);
    $('[data-today-total]').textContent = `/ ${tasks.length} ACTIONS`;
    const host = $('[data-task-list]');
    host.replaceChildren();
    tasks.forEach((task) => {
      const row = document.createElement('span');
      row.classList.toggle('complete', task.complete);
      const label = document.createElement('a');
      label.href = task.route;
      label.textContent = task.label;
      label.style.color = 'inherit';
      label.style.textDecoration = 'none';
      const status = document.createElement('b');
      status.textContent = task.complete ? 'DONE ✓' : 'OPEN →';
      row.append(label, status);
      host.append(row);
    });
  }

  function renderUnhatched() {
    $('[data-command-private]').hidden = false;
    $('[data-private-heading]').textContent = 'Your wallet is ready to hatch.';
    $('[data-private-generated]').textContent = 'NO PET BOUND YET';
    const grid = $('.private-grid');
    grid.hidden = true;
    $('[data-unhatched-overview]').hidden = false;
  }

  function renderMe() {
    const me = state.me;
    if (!me) return;
    if (!me.hatched) return renderUnhatched();
    $('.private-grid').hidden = false;
    $('[data-unhatched-overview]').hidden = true;
    $('[data-command-private]').hidden = false;
    $('[data-private-heading]').textContent = `${me.pet.name}, clearly organized.`;
    $('[data-private-generated]').textContent = 'LIVE WALLET RECEIPTS';
    $('[data-command-pet]').src = me.pet.visual;
    $('[data-command-name]').textContent = me.pet.name;
    $('[data-command-lineage]').textContent = me.pet.lineage;
    $('[data-command-level]').textContent = `LEVEL ${me.pet.level}`;
    $('[data-command-xp]').textContent = `${number(me.pet.xp)} XP`;
    $('[data-command-reply]').textContent = me.pet.lastReply || 'Your AXO is ready for today.';
    for (const [name, value] of Object.entries(me.pet.vitals || {})) setVital(name, value);
    renderTasks(me.today || {});
    $('[data-epoch-rank]').textContent = me.epoch?.rank ? `#${me.epoch.rank}` : '—';
    $('[data-epoch-id]').textContent = me.epoch?.id || 'EPOCH PENDING';
    $('[data-epoch-xp]').textContent = number(me.epoch?.verifiedXp || 0);
    $('[data-epoch-share]').textContent = me.epoch?.rank ? `${number(me.epoch?.projectedSharePct || 0)}%` : '—';
    const updateTime = () => { $('[data-epoch-time]').textContent = countdown(me.epoch?.endsAt); };
    updateTime();
    if (state.countdown) clearInterval(state.countdown);
    state.countdown = setInterval(updateTime, 30_000);
    $('[data-inventory-count]').textContent = number(me.wardrobe?.ledgerInventoryCount || 0);
    $('[data-equipped-count]').textContent = number(me.wardrobe?.equippedCount || 0);
    $('[data-listings-count]').textContent = number(me.marketplace?.activeListings || 0);
    $('[data-gear-status]').textContent = me.wardrobe?.onchainGearStatus === 'GEAR_CONTRACT_NOT_DEPLOYED'
      ? 'Ledger items stay preserved. Onchain cosmetic gear and trading remain release-gated.'
      : 'Open the Wardrobe for a fresh onchain inventory read.';
    $('[data-passport-state]').textContent = me.passport?.complete ? 'CREW PASSPORT READY' : 'SETUP REQUIRED';
    $('[data-passport-copy]').textContent = me.passport?.complete
      ? `${number(me.passport.referralsActivated)} verified referral${Number(me.passport.referralsActivated) === 1 ? '' : 's'}. Share cards expose no wallet address.`
      : 'Connect X and Telegram, then verify official AXO channel membership.';
    const referral = $('[data-referral-link]');
    if (me.passport?.referralPath) {
      referral.href = me.passport.referralPath;
      referral.hidden = false;
    } else referral.hidden = true;
  }

  async function loadPrivate() {
    setConnectedState();
    if (!state.session.connected) return;
    try {
      state.me = await json('/api/axo-pet/me');
      renderMe();
    } catch (error) {
      $('[data-command-private]').hidden = false;
      $('[data-private-heading]').textContent = 'Private overview unavailable.';
      $('[data-private-generated]').textContent = String(error.message || 'RETRY REQUIRED').toUpperCase();
    }
  }

  setupNavigation();
  window.addEventListener('axo:session', (event) => {
    state.session = event.detail || { connected: false };
    state.me = null;
    loadPrivate();
  });
  (async () => {
    state.overview = await json('/api/axo-pet/overview').catch(() => null);
    renderOverview();
    if (window.AxoWallet?.ready) await window.AxoWallet.ready.catch(() => {});
    state.session = window.AxoWallet?.getSession?.() || state.session;
    await loadPrivate();
  })();
})();
