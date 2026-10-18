'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  let countdownTimer = null;

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
      button.focus();
    });
  }

  function formatUnits(raw, decimals = 18) {
    if (!/^\d+$/.test(String(raw || ''))) return null;
    const value = BigInt(raw);
    const scale = 10n ** BigInt(decimals);
    const whole = value / scale;
    const fraction = String(value % scale).padStart(decimals, '0').slice(0, 3).replace(/0+$/, '');
    return `${new Intl.NumberFormat('en-US').format(whole)}${fraction ? `.${fraction}` : ''}`;
  }

  function setStats(stats) {
    $$('[data-stat]').forEach((element) => {
      const key = element.dataset.stat;
      if (stats?.[key] !== null && stats?.[key] !== undefined) element.textContent = number(stats[key]);
    });
  }

  function renderContracts(contracts) {
    const host = $('[data-contract-feed]');
    if (!host) return;
    host.replaceChildren();
    if (!contracts?.length) {
      const empty = document.createElement('article');
      empty.className = 'contract-loading';
      empty.innerHTML = '<span></span><div><b>No public Contract Crystals yet.</b><small>The first scout opens the feed.</small></div>';
      host.append(empty);
      return;
    }
    contracts.slice(0, 5).forEach((contract) => {
      const row = document.createElement('article');
      row.className = 'contract-row';
      const crystal = document.createElement('i');
      const copy = document.createElement('div');
      const title = document.createElement('b');
      const link = document.createElement('a');
      link.href = contract.axoUrl || `/token/${contract.address}`;
      link.textContent = `${contract.symbol || 'TOKEN'} · ${contract.name || 'Community contract'}`;
      title.append(link);
      const address = document.createElement('small');
      address.textContent = `${String(contract.address).slice(0, 8)}…${String(contract.address).slice(-6)} · ${String(contract.status || 'PENDING').replaceAll('_', ' ')}`;
      copy.append(title, address);
      const support = document.createElement('span');
      support.textContent = `${number(contract.supporters)} CREW`;
      row.append(crystal, copy, support);
      host.append(row);
    });
  }

  function renderLeaders(leaders) {
    const host = $('[data-epoch-leaders]');
    if (!host) return;
    host.replaceChildren();
    const rows = Array.from({ length: 5 }, (_, index) => leaders?.find((entry) => Number(entry.rank) === index + 1) || null);
    rows.forEach((leader, index) => {
      const row = document.createElement('article');
      row.className = 'epoch-leader';
      const rank = document.createElement('span');
      rank.textContent = `#${index + 1}`;
      const image = document.createElement('img');
      image.src = leader?.visual || '/hatchery-assets/hacker-v3/states/axo-pet-egg-v3.webp';
      image.alt = '';
      image.loading = 'lazy';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = leader?.name || 'OPEN RANK';
      const detail = document.createElement('small');
      detail.textContent = leader ? `${leader.lineage} · LEVEL ${leader.level}` : 'WAITING FOR A SCOUT';
      copy.append(name, detail);
      const xp = document.createElement('b');
      xp.textContent = `${number(leader?.verifiedXp || 0)} XP`;
      row.append(rank, image, copy, xp);
      host.append(row);
    });
  }

  function setupCountdown(endsAt) {
    if (countdownTimer) clearInterval(countdownTimer);
    const element = $('[data-epoch-countdown]');
    const update = () => {
      const remaining = Date.parse(endsAt || '') - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        element.textContent = remaining <= 0 ? 'EPOCH CLOSED' : 'SCHEDULE PENDING';
        return;
      }
      const days = Math.floor(remaining / 86_400_000);
      const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      element.textContent = `${days}D ${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M`;
    };
    update();
    countdownTimer = setInterval(update, 30_000);
  }

  function renderEpoch(epoch) {
    if (!epoch) return;
    $('[data-epoch-id]').textContent = epoch.id || 'CURRENT EPOCH';
    const amount = formatUnits(epoch.projectedPoolRaw || epoch.fundedPoolRaw, epoch.rewardDecimals || 18);
    $('[data-epoch-pool]').textContent = amount ? `${amount} ${epoch.rewardSymbol || 'AXO'}` : 'NOT FUNDED';
    const status = $('[data-epoch-pool-status]');
    if (epoch.poolStatus === 'FUNDED') {
      status.textContent = 'VERIFIED FUNDED POOL';
      status.style.color = 'var(--green)';
    } else if (epoch.poolStatus === 'PROJECTED_NOT_FUNDED') {
      status.textContent = 'LIVE POSITION ESTIMATE · NOT FUNDED';
      status.style.color = 'var(--orange)';
    } else {
      status.textContent = 'NO FUNDED REWARD POOL';
      status.style.color = 'var(--orange)';
    }
    $('[data-claims-status]').textContent = epoch.claimsEnabled ? 'LIVE' : 'DISABLED';
    setupCountdown(epoch.endsAt);
    renderLeaders(epoch.topFive || []);
  }

  function renderNft(nft) {
    const market = $('[data-market-status]');
    const nftStatus = $('[data-nft-status]');
    const ready = nft?.status === 'READY_FOR_LIVE_READBACK';
    const trading = nft?.gearTradingEnabled === true;
    market.textContent = trading ? 'GEAR LIVE' : ready ? 'CONTRACT READY' : 'PREVIEW';
    market.style.color = trading ? 'var(--green)' : ready ? 'var(--cyan)' : 'var(--pink)';
    nftStatus.textContent = nft?.mintingStatus === 'READY_FOR_LIVE_READBACK'
      ? 'MINT READBACK READY · ACTIVATION REVIEW'
      : 'RELEASE GATES IN PROGRESS';
    $('[data-live-status]').textContent = 'LEDGER LIVE';
  }

  async function loadOverview() {
    try {
      const response = await fetch('/api/axo-pet/overview', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('overview_unavailable');
      const overview = await response.json();
      setStats(overview.stats);
      renderContracts(overview.contracts);
      renderEpoch(overview.epoch);
      renderNft(overview.nft);
    } catch {
      $('[data-live-status]').textContent = 'LEDGER READ RETRYING';
      const market = $('[data-market-status]');
      if (market) market.textContent = 'READ UNAVAILABLE';
      const feed = $('[data-contract-feed]');
      if (feed) feed.innerHTML = '<article class="contract-loading"><span></span><div><b>Live ledger read unavailable.</b><small>No figures were inferred.</small></div></article>';
      const leaders = $('[data-epoch-leaders]');
      if (leaders) leaders.innerHTML = '<div class="leader-loading">Live board unavailable. No standings were inferred.</div>';
    }
  }

  setupNavigation();
  loadOverview();
})();
