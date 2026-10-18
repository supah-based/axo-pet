'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const number = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
  const short = (value) => value ? `${String(value).slice(0, 8)}…${String(value).slice(-6)}` : 'CONNECT WALLET';
  const thresholds = [0, 40, 100, 180, 280, 400, 550, 730, 940, 1200];
  let session = { connected: false };
  let hatchery = null;
  let nftView = null;
  let board = null;
  let careTimer = null;
  let loading = false;
  let missionResetTarget = null;
  let missionRefreshQueued = false;
  const safePetLayer = /^(?:\/hatchery-nft-v5\/(?:pet|layer)_[a-z0-9_]+|\/hatchery-nft-v5\.1\.1\/pet_[a-z0-9_]+)\.webp$/;

  function renderPetVisual(pet) {
    const host = $('#game-pet');
    const layers = (nftView?.websiteVisual?.activeLayers || [])
      .filter((layer) => safePetLayer.test(String(layer.runtimeUrl || '')));
    const fallback = pet.visual?.asset || '/hatchery-nft-v5.1.1/pet_emerald_sprout_l01.webp';
    const selected = layers.length ? layers.map((layer) => layer.runtimeUrl) : [fallback];
    host.replaceChildren(...selected.map((url) => {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.decoding = 'async';
      return image;
    }));
    const gearCount = Number(nftView?.gear?.items?.length || 0);
    host.setAttribute('aria-label', `${pet.name}, your AXO companion${gearCount ? ` wearing ${gearCount} equipped gear item${gearCount === 1 ? '' : 's'}` : ''}`);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { Accept: 'application/json', 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({ error: 'invalid_response' }));
    if (!response.ok) {
      const error = new Error(String(body.error || body.message || 'request_failed').replaceAll('_', ' '));
      error.code = body.error;
      error.status = response.status;
      throw error;
    }
    return body;
  }

  const errorMessage = (error) => ({
    care_action_already_used: 'That ritual is complete today. Its timer shows the next reset.',
    hatchery_crew_passport_required: 'Complete your X + Telegram Crew Passport in the dashboard first.',
    hatchery_account_suspended: 'This Hatchery account is suspended. Existing XP and receipts remain preserved.',
  }[error?.code] || error?.message || 'The Hatchery could not record that action.');

  function setMessage(message, type = '') {
    const element = $('#game-care-message');
    element.textContent = message;
    element.dataset.type = type;
  }

  function countdown(target) {
    const remaining = Date.parse(target || 0) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return 'READY';
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor(remaining % 3_600_000 / 60_000);
    const seconds = Math.floor(remaining % 60_000 / 1_000);
    return hours ? `${hours}H ${String(minutes).padStart(2, '0')}M` : `${minutes}M ${String(seconds).padStart(2, '0')}S`;
  }

  function missionCountdown(target) {
    const remaining = Math.max(0, Date.parse(target || 0) - Date.now());
    if (!Number.isFinite(remaining)) return '—';
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor(remaining % 3_600_000 / 60_000);
    const seconds = Math.floor(remaining % 60_000 / 1_000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updateCareTimers() {
    const passportReady = hatchery?.player?.participation?.complete === true;
    $$('[data-care], [data-cuddle]').forEach((button) => {
      const target = button.dataset.nextAvailableAt;
      const timedReady = !target || Date.parse(target) <= Date.now();
      const ready = button.hasAttribute('data-cuddle') ? timedReady : timedReady && passportReady;
      button.disabled = !ready;
      button.classList.toggle('ready', ready);
      const timer = button.querySelector('[data-care-timer]');
      if (timer) timer.textContent = !passportReady && !button.hasAttribute('data-cuddle') && timedReady ? 'PASSPORT' : countdown(target);
      button.title = ready ? `${button.querySelector('b')?.textContent || 'Care'} is ready` : !passportReady && !button.hasAttribute('data-cuddle') && timedReady ? 'Complete your Crew Passport first' : `Available again in ${countdown(target)}`;
    });
    updateMissionReset();
  }

  function updateMissionReset() {
    const element = $('#game-mission-reset');
    const timers = $$('[data-game-mission-timer]');
    if (!missionResetTarget) {
      if (element) element.textContent = 'RESET IN —';
      timers.forEach((timer) => { timer.textContent = 'SYNCING'; });
      return;
    }
    const remaining = Date.parse(missionResetTarget) - Date.now();
    if (Number.isFinite(remaining) && remaining <= 0) {
      if (element) element.textContent = 'RESETTING…';
      timers.forEach((timer) => { timer.textContent = 'RESETTING…'; });
      if (!missionRefreshQueued) {
        missionRefreshQueued = true;
        window.setTimeout(() => { missionRefreshQueued = false; refresh({ quiet: true }); }, 1_000);
      }
      return;
    }
    const clock = missionCountdown(missionResetTarget);
    if (element) element.textContent = `RESET IN ${clock}`;
    timers.forEach((timer) => {
      const state = timer.closest('[data-game-mission]')?.dataset.missionState;
      timer.textContent = state === 'done' ? `NEXT ${clock}` : state === 'setup' ? `WINDOW ${clock}` : `ENDS ${clock}`;
      timer.setAttribute('datetime', missionResetTarget);
    });
  }

  function renderCare() {
    const care = hatchery?.player?.care || {};
    missionResetTarget = care.dailyRitual?.nextResetAt || null;
    if (missionResetTarget && Date.parse(missionResetTarget) > Date.now()) missionRefreshQueued = false;
    $$('[data-care]').forEach((button) => {
      const action = care.actions?.[button.dataset.care] || {};
      button.dataset.nextAvailableAt = action.completedToday ? (action.nextAvailableAt || care.dailyRitual?.nextResetAt || '') : '';
    });
    $('[data-cuddle]').dataset.nextAvailableAt = care.petting?.available === false ? (care.petting.nextHappinessAt || '') : '';
    $('#care-progress').textContent = `${number(care.dailyRitual?.completed || 0)} / ${number(care.dailyRitual?.goal || 3)} COMPLETE`;
    updateCareTimers();
    if (careTimer) window.clearInterval(careTimer);
    careTimer = window.setInterval(updateCareTimers, 1_000);
  }

  function renderVitals() {
    const vitals = hatchery.pet?.vitals || {};
    const values = ['happiness', 'energy', 'curiosity', 'bond'].map((name) => {
      const value = Math.max(0, Math.min(100, Number(vitals[name] || 0)));
      const bar = $(`#game-${name}`);
      bar.setAttribute('aria-valuenow', String(Math.round(value)));
      bar.querySelector('i').style.width = `${value}%`;
      $(`#game-${name}-value`).textContent = `${Math.round(value)}%`;
      return value;
    });
    const lowest = Math.min(...values);
    $('#game-mood').textContent = hatchery.pet?.happy ? 'THRIVING' : lowest < 35 ? 'NEEDS CARE' : lowest < 60 ? 'STEADY' : 'FEELING GOOD';
    const pass = $('#happy-pass');
    pass.classList.toggle('active', hatchery.pet?.toolPass?.active === true);
    pass.querySelector('strong').textContent = hatchery.pet?.toolPass?.active ? 'ACTIVE' : 'CARE REQUIRED';
  }

  function missionState(selector, complete, available) {
    const mission = $(selector);
    mission.classList.toggle('done', complete);
    mission.classList.toggle('locked', !complete && !available);
    mission.dataset.missionState = complete ? 'done' : available ? 'ready' : 'setup';
    mission.querySelector('[data-game-mission-status]').textContent = complete ? 'DONE' : available ? 'READY' : 'SETUP';
  }

  function renderMissions() {
    const passportComplete = hatchery.player?.participation?.complete === true;
    const axoAccessComplete = hatchery.canonicalAxoCorroboration?.questAccessComplete === true
      || hatchery.player?.onboarding?.canonicalAxoCorroboration?.complete === true
      || hatchery.canonicalAxoCorroboration?.complete === true;
    const unlocked = passportComplete && axoAccessComplete;
    const completed = hatchery.dailyContractQuest?.completedToday === true;
    missionState('[data-game-mission="contract"]', completed, hatchery.dailyContractQuest?.available !== false && unlocked);
    $('#game-mission-count').textContent = `${completed ? 1 : 0} / 1 DAILY`;
    $('#game-mission-progress').style.width = `${completed ? 100 : 0}%`;
    updateMissionReset();
  }

  function renderRank() {
    const standings = board?.currentEpoch?.standings || [];
    const row = standings.find((entry) => entry.genesisId === hatchery.pet?.genesisId || entry.ownerAddress === hatchery.player?.ownerAddress);
    $('#game-rank').textContent = row?.rank ? `#${row.rank}` : 'UNRANKED';
  }

  function render() {
    const connected = session.connected === true;
    const hatched = hatchery?.hatched === true;
    $('#game-wallet').textContent = connected ? short(session.address) : 'CONNECT WALLET';
    $('.game-toolbar-status').classList.toggle('connected', connected);
    $('#game-gate').hidden = connected && hatched;
    $('#game-world').hidden = !connected || !hatched;
    $('#care-console').hidden = !connected || !hatched;
    if (!connected) {
      $('#game-gate-copy').textContent = 'Connect your wallet in the menu to load the same pet, XP, missions, and receipts used by the Hatchery dashboard.';
      $('#game-gate-action').textContent = 'OPEN HATCHERY DASHBOARD →';
      return;
    }
    if (!hatched) {
      $('#game-gate-copy').textContent = 'This wallet does not have an AXO yet. Hatch your companion once in the dashboard, then return here for the full experience.';
      $('#game-gate-action').textContent = 'HATCH MY AXO →';
      return;
    }
    const pet = hatchery.pet;
    $('#game-pet-name').textContent = pet.name;
    $('#game-lineage').textContent = `${pet.lineage?.label || 'AXO'} · ${pet.stage}`.toUpperCase();
    $('#game-pet-reply').textContent = pet.lastReply || 'Your AXO is ready for today.';
    renderPetVisual(pet);
    $('#game-pet-xp').textContent = number(pet.xp);
    $('#game-level').textContent = `LEVEL ${pet.level}`;
    $('#game-epoch-xp').textContent = number(hatchery.ledger?.currentEpochXp || 0);
    $('#game-epoch').textContent = hatchery.ledger?.currentEpochId || board?.currentEpoch?.id || 'CURRENT EPOCH';
    const floor = thresholds[Math.max(0, Number(pet.level || 1) - 1)] || 0;
    const target = pet.nextLevel?.xp || thresholds[Math.min(9, Number(pet.level || 1))] || pet.xp;
    const progress = pet.level >= 10 ? 100 : Math.max(0, Math.min(100, (Number(pet.xp || 0) - floor) / Math.max(1, target - floor) * 100));
    $('#game-xp-progress').style.width = `${progress}%`;
    $('#game-next-level').textContent = pet.level >= 10 ? 'MAXIMUM EVOLUTION REACHED' : `${number(Math.max(0, target - Number(pet.xp || 0)))} XP TO LEVEL ${Number(pet.level || 1) + 1}`;
    renderVitals();
    renderCare();
    renderMissions();
    renderRank();
  }

  async function refresh({ quiet = false } = {}) {
    if (loading) return;
    loading = true;
    try {
      session = window.AxoWallet?.getSession?.() || session;
      if (!session.connected) {
        hatchery = null;
        nftView = null;
        board = null;
        render();
        return;
      }
      [hatchery, nftView] = await Promise.all([
        api('/api/hatchery'),
        api('/api/hatchery/nft').catch(() => null),
      ]);
      board = hatchery.hatched ? await api('/api/hatchery/dashboard?epochs=8').catch(() => null) : null;
      render();
    } catch (error) {
      if (error.status === 401) {
        session = { connected: false };
        hatchery = null;
        nftView = null;
        render();
      } else if (!quiet) setMessage(errorMessage(error), 'error');
    } finally { loading = false; }
  }

  async function care(action, button) {
    button.disabled = true;
    const portrait = $('#game-pet');
    portrait.dataset.careAction = action;
    setMessage(`${action[0].toUpperCase()}${action.slice(1)} in progress…`);
    try {
      hatchery = await api('/api/hatchery/care', { method: 'POST', body: JSON.stringify({ action }) });
      setMessage(`${action[0].toUpperCase()}${action.slice(1)} complete. +2 Pet XP.`, 'success');
      await refresh({ quiet: true });
    } catch (error) {
      setMessage(errorMessage(error), 'error');
      renderCare();
    } finally { delete portrait.dataset.careAction; }
  }

  $$('[data-care]').forEach((button) => button.addEventListener('click', () => care(button.dataset.care, button)));
  $('[data-cuddle]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setMessage('Sharing a quiet bonding moment…');
    try {
      const result = await api('/api/hatchery/pet', { method: 'POST', body: JSON.stringify({ durationMs: 120, interaction: 'QUICK_CUDDLE' }) });
      hatchery = result;
      setMessage(result.result?.accepted ? `Cuddle complete. +${number(result.result.happinessGained)} Happiness.` : `Cuddle is cooling down: ${countdown(new Date(Date.now() + Number(result.result?.cooldownRemainingMs || 0)).toISOString())}.`, result.result?.accepted ? 'success' : '');
      await refresh({ quiet: true });
    } catch (error) {
      setMessage(errorMessage(error), 'error');
      renderCare();
    }
  });

  $('#toggle-fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* browser may deny fullscreen without a trusted gesture */ }
  });
  document.addEventListener('fullscreenchange', () => { $('#toggle-fullscreen').textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN'; });
  window.addEventListener('axo:session', (event) => { session = event.detail || { connected: false }; refresh(); });
  window.addEventListener('pageshow', () => refresh({ quiet: true }));

  (async () => {
    if (window.AxoWallet?.ready) await window.AxoWallet.ready.catch(() => {});
    session = window.AxoWallet?.getSession?.() || session;
    await refresh();
  })();
})();
