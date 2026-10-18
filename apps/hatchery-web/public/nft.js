'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    session: { connected: false },
    overview: null,
    selectedLineage: 'emerald_sprout',
    selectedLevel: 1,
    selectedLayerSlot: 'body',
    selectedLayerOption: 1,
  };
  const safeV5Image = /^(?:\/hatchery-nft-v5\.1\.1\/pet_[a-z0-9_]+_l0[1-9]|\/hatchery-nft-v5\/(?:pet_[a-z0-9_]+_l(?:0[1-9]|10)|layer_[a-z0-9_]+))\.webp$/;
  const humanize = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const compact = (value, left = 9, right = 7) => {
    const text = String(value || '');
    return text.length > left + right + 1 ? `${text.slice(0, left)}…${text.slice(-right)}` : text || '—';
  };

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
    $('[data-catalog-version]').textContent = `V${overview.collection?.visualRevision || '—'}`;
    $('[data-layer-count]').textContent = String(overview.collection?.sceneTraitCount ?? '—');
    $('[data-scene-count]').textContent = String(overview.collection?.authoredSceneCount ?? '—');
    const blocked = overview.nft?.mintingStatus !== 'READY_FOR_LIVE_READBACK';
    $('[data-system-state]').textContent = overview.nft?.status === 'READY_FOR_LIVE_READBACK' ? 'READ READY' : 'RELEASE GATED';
    $('[data-onchain-revision]').textContent = `V${overview.collection?.onchainMetadataVisualRevision || '—'}`;
    $('[data-onchain-note]').textContent = blocked ? 'V5 URI MIGRATION GATED' : 'LIVE STATE STILL REQUIRED';
    $('[data-onchain-state-card]').dataset.blocked = String(blocked);
    renderLineageExplorer(overview.collection || {});
    renderTraitSystem(overview.collection || {});
    renderLayerLab(overview.collection || {});
  }

  function renderLineageExplorer(collection = {}) {
    const lineages = Array.isArray(collection.lineages) ? collection.lineages : [];
    const stages = Array.isArray(collection.stages) ? collection.stages : [];
    const bases = Array.isArray(collection.bases) ? collection.bases : [];
    const lineage = lineages.find((item) => item.key === state.selectedLineage) || lineages[0];
    const stage = stages.find((item) => Number(item.level) === Number(state.selectedLevel)) || stages[0];
    if (!lineage || !stage) return;
    state.selectedLineage = lineage.key;
    state.selectedLevel = Number(stage.level);

    const tabs = $('[data-lineage-tabs]');
    tabs.replaceChildren();
    for (const item of lineages) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.dataset.active = String(item.key === lineage.key);
      button.setAttribute('aria-pressed', String(item.key === lineage.key));
      button.addEventListener('click', () => {
        state.selectedLineage = item.key;
        state.selectedLevel = 1;
        renderLineageExplorer(collection);
      });
      tabs.append(button);
    }

    const selectedBase = bases.find((item) => item.lineageKey === lineage.key && Number(item.level) === Number(stage.level));
    const hero = $('[data-lineage-hero]');
    if (selectedBase && safeV5Image.test(String(selectedBase.imageUrl || ''))) {
      hero.src = selectedBase.imageUrl;
      hero.alt = `Level ${stage.level} ${lineage.label}`;
    }
    $('[data-lineage-kicker]').textContent = `${lineage.label.toUpperCase()} · LEVEL ${String(stage.level).padStart(2, '0')}`;
    $('[data-lineage-stage]').textContent = stage.label;
    $('[data-lineage-role]').textContent = lineage.role;
    $('[data-lineage-archetype]').textContent = lineage.accents;
    $('[data-lineage-motifs]').textContent = lineage.motifs;
    $('[data-lineage-rule]').textContent = Number(stage.level) === 10
      ? 'Grown underwear anchor · explicit wardrobe only'
      : 'Authored scene · platform removed';

    const levels = $('[data-lineage-levels]');
    levels.replaceChildren();
    for (const item of stages) {
      const base = bases.find((candidate) => candidate.lineageKey === lineage.key && Number(candidate.level) === Number(item.level));
      if (!base || !safeV5Image.test(String(base.imageUrl || ''))) continue;
      const button = document.createElement('button');
      const image = document.createElement('img');
      const level = document.createElement('b');
      const label = document.createElement('span');
      button.type = 'button';
      button.dataset.active = String(Number(item.level) === Number(stage.level));
      button.setAttribute('aria-pressed', String(Number(item.level) === Number(stage.level)));
      button.setAttribute('aria-label', `Show level ${item.level}, ${item.label}`);
      image.src = base.imageUrl;
      image.alt = '';
      image.loading = Number(item.level) > 4 ? 'lazy' : 'eager';
      image.decoding = 'async';
      level.textContent = `LVL ${String(item.level).padStart(2, '0')}`;
      label.textContent = item.label;
      button.append(image, level, label);
      button.addEventListener('click', () => {
        state.selectedLevel = Number(item.level);
        renderLineageExplorer(collection);
      });
      levels.append(button);
    }
    $$('[data-lineage-select]').forEach((button) => {
      button.onclick = () => {
        state.selectedLineage = String(button.dataset.lineageSelect || 'emerald_sprout');
        state.selectedLevel = 1;
        renderLineageExplorer(collection);
        $('[data-lineage-explorer]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }

  function renderTraitSystem(collection = {}) {
    const groups = $('[data-trait-groups]');
    const stages = $('[data-growth-traits]');
    groups.replaceChildren();
    for (const item of collection.traitGroups || []) {
      const card = document.createElement('article');
      const source = document.createElement('span');
      const title = document.createElement('h3');
      const list = document.createElement('ul');
      source.textContent = item.source;
      title.textContent = item.label;
      for (const trait of item.traits || []) {
        const row = document.createElement('li');
        row.textContent = trait;
        list.append(row);
      }
      card.append(source, title, list);
      groups.append(card);
    }
    stages.replaceChildren();
    for (const item of collection.stages || []) {
      const card = document.createElement('article');
      const level = document.createElement('b');
      const title = document.createElement('h3');
      const xp = document.createElement('span');
      const note = document.createElement('p');
      level.textContent = `LVL ${String(item.level).padStart(2, '0')}`;
      title.textContent = item.label;
      xp.textContent = `${Number(item.minimumXp || 0).toLocaleString()} XP`;
      note.textContent = item.maturity || item.pose || 'Verified Hatchery growth stage';
      card.append(level, title, xp, note);
      stages.append(card);
    }
  }

  function renderLayerPreview(collection, layer, option) {
    const stack = $('[data-layer-lab-stack]');
    const backgroundLayer = (collection.visualLayers || []).find((item) => item.slot === 'background');
    const fallbackBackground = backgroundLayer?.options?.[0];
    const lineage = (collection.lineages || []).find((item) => item.key === 'emerald_sprout') || collection.lineages?.[0];
    const layers = [];
    const background = layer.slot === 'background' ? option : fallbackBackground;
    if (background && safeV5Image.test(String(background.imageUrl || ''))) layers.push({ z: 0, url: background.imageUrl });
    if (layer.slot !== 'background' && safeV5Image.test(String(option.imageUrl || ''))) layers.push({ z: Number(layer.z || 0), url: option.imageUrl });
    if (safeV5Image.test(String(lineage?.level10Asset || ''))) layers.push({ z: 50, url: lineage.level10Asset });
    if (safeV5Image.test(String(lineage?.hudAsset || ''))) layers.push({ z: 105, url: lineage.hudAsset });
    stack.replaceChildren();
    for (const item of layers.sort((a, b) => a.z - b.z)) {
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = '';
      image.decoding = 'async';
      stack.append(image);
    }
    stack.setAttribute('aria-label', `${option.name} ${humanize(layer.slot)} shown on the shared Level 10 AXO Pet body`);
    $('[data-layer-preview-slot]').textContent = `${humanize(layer.slot).toUpperCase()} · OPTION ${String(option.id).padStart(2, '0')}`;
    $('[data-layer-preview-name]').textContent = option.name;
    $('[data-layer-preview-tier]').textContent = option.tier || 'COSMETIC';
  }

  function renderLayerLab(collection = {}) {
    const layers = (collection.visualLayers || []).filter((layer) => Array.isArray(layer.options) && layer.options.length > 0);
    const layer = layers.find((item) => item.slot === state.selectedLayerSlot) || layers[0];
    if (!layer) return;
    state.selectedLayerSlot = layer.slot;
    const option = layer.options.find((item) => Number(item.id) === Number(state.selectedLayerOption)) || layer.options[0];
    state.selectedLayerOption = Number(option.id);

    const families = $('[data-layer-family-tabs]');
    families.replaceChildren();
    for (const item of layers) {
      const button = document.createElement('button');
      const name = document.createElement('b');
      const count = document.createElement('span');
      button.type = 'button';
      button.dataset.active = String(item.slot === layer.slot);
      button.setAttribute('aria-pressed', String(item.slot === layer.slot));
      name.textContent = humanize(item.slot);
      count.textContent = `${item.options.length}`;
      button.append(name, count);
      button.addEventListener('click', () => {
        state.selectedLayerSlot = item.slot;
        state.selectedLayerOption = 1;
        renderLayerLab(collection);
      });
      families.append(button);
    }

    const options = $('[data-layer-options]');
    options.replaceChildren();
    for (const item of layer.options) {
      if (!safeV5Image.test(String(item.imageUrl || ''))) continue;
      const button = document.createElement('button');
      const image = document.createElement('img');
      const copy = document.createElement('span');
      const name = document.createElement('b');
      const tier = document.createElement('small');
      button.type = 'button';
      button.dataset.active = String(Number(item.id) === Number(option.id));
      button.setAttribute('aria-pressed', String(Number(item.id) === Number(option.id)));
      button.setAttribute('aria-label', `Preview ${item.name}, ${item.tier || 'cosmetic'}`);
      image.src = item.imageUrl;
      image.alt = '';
      image.loading = Number(item.id) > 4 ? 'lazy' : 'eager';
      image.decoding = 'async';
      name.textContent = item.name;
      tier.textContent = item.tier || 'COSMETIC';
      copy.append(name, tier);
      button.append(image, copy);
      button.addEventListener('click', () => {
        state.selectedLayerOption = Number(item.id);
        renderLayerLab(collection);
      });
      options.append(button);
    }
    renderLayerPreview(collection, layer, option);
  }

  function renderLayers(layers = []) {
    const stack = $('[data-layer-stack]');
    stack.replaceChildren();
    const safeLayers = layers.filter((layer) => layer.active !== false && /^(?:\/hatchery-nft-v5\/(?:pet|layer)_[a-z0-9_]+\.webp|\/hatchery-nft-v4\.3\/[a-z0-9_]+\.webp)$/.test(String(layer.runtimeUrl || '')));
    for (const layer of safeLayers) {
      const image = document.createElement('img');
      image.src = layer.runtimeUrl;
      image.alt = '';
      image.decoding = 'async';
      image.style.opacity = String(Math.max(0, Math.min(1, Number(layer.opacity ?? 1))));
      stack.append(image);
    }
    $('[data-passport-fallback]').hidden = safeLayers.length > 0;
  }

  function renderTraitCards(host, traits = []) {
    host.replaceChildren();
    for (const trait of traits) {
      const card = document.createElement('article');
      const label = document.createElement('span');
      const value = document.createElement('b');
      label.textContent = trait.traitType || 'Trait';
      value.textContent = String(trait.value ?? '—');
      card.append(label, value);
      if (trait.rarityClass || trait.tier) {
        const rarity = document.createElement('small');
        const weight = Number(trait.rarityWeightBps);
        rarity.textContent = `${String(trait.rarityClass || trait.tier)}${Number.isFinite(weight) ? ` · ${(weight / 100).toLocaleString()}%` : ''}`;
        card.append(rarity);
      }
      host.append(card);
    }
  }

  function renderHolder(holder) {
    $('[data-passport-gate]').hidden = true;
    $('[data-passport-live]').hidden = false;
    if (!holder.hatched) {
      $('[data-passport-traits]').hidden = true;
      $('[data-passport-status]').textContent = 'NOT HATCHED';
      $('[data-passport-name]').textContent = 'YOUR WALLET IS READY';
      $('[data-passport-message]').textContent = 'Hatch one preserved AXO Pet before an NFT identity can be derived.';
      return;
    }
    const identity = holder.identity || {};
    const nft = holder.nft || {};
    const websiteVisual = holder.websiteVisual || identity.visual || {};
    $('[data-passport-lineage]').textContent = identity.lineage?.label || 'AXO PET';
    $('[data-passport-name]').textContent = identity.genesisId || 'YOUR SOULBOUND SCOUT';
    $('[data-passport-growth]').textContent = `${identity.growth?.label || 'LEVEL'} · LVL ${identity.growth?.level || nft.hatcheryLevel || '—'}`;
    $('[data-passport-token]').textContent = compact(identity.tokenId, 10, 8);
    $('[data-passport-dna]').textContent = compact(identity.dnaHash, 10, 8);
    $('[data-passport-revision]').textContent = websiteVisual.visualRevision || state.overview?.collection?.visualRevision || '—';
    const minted = nft.status === 'MINTED_SOULBOUND';
    $('[data-passport-status]').textContent = minted ? (nft.syncRequired ? 'SYNC REQUIRED' : 'MINTED · CURRENT') : 'OFFCHAIN · WALLET BOUND';
    $('[data-passport-message]').textContent = minted
      ? nft.syncRequired ? `Your onchain Pet is preserved. ${Number(nft.pendingLevelCount || 0)} verified level update${Number(nft.pendingLevelCount || 0) === 1 ? '' : 's'} remain to sync. Platformless website art is active without rewriting that identity.` : 'Platformless website art is active. Your current onchain identity and V4.3 metadata remain preserved.'
      : 'Your deterministic platformless website identity is ready to inspect. Onchain minting and any tokenURI migration remain separately receipt-gated.';
    renderLayers(websiteVisual.activeLayers || websiteVisual.layers || []);
    const traits = holder.traits || {};
    renderTraitCards($('[data-passport-dna-traits]'), [...(traits.immutable || []), ...(traits.growth || [])]);
    renderTraitCards($('[data-passport-scene-traits]'), [...(traits.onchainScene || []), ...(traits.websiteScene || [])]);
    $('[data-passport-traits]').hidden = false;
  }

  async function loadHolder() {
    const connected = state.session.connected === true;
    $$('[data-wallet-connect]').forEach((button) => button.classList.toggle('connected', connected));
    if (!connected) {
      $('[data-passport-gate]').hidden = false;
      $('[data-passport-live]').hidden = true;
      $('[data-passport-traits]').hidden = true;
      return;
    }
    try {
      renderHolder(await json('/api/hatchery/nft'));
    } catch (error) {
      $('[data-passport-gate]').hidden = true;
      $('[data-passport-live]').hidden = false;
      $('[data-passport-status]').textContent = 'UNAVAILABLE';
      $('[data-passport-message]').textContent = `NFT status failed closed: ${String(error.message || 'retry required')}.`;
    }
  }

  setupNavigation();
  window.addEventListener('axo:session', (event) => {
    state.session = event.detail || { connected: false };
    loadHolder();
  });
  (async () => {
    state.overview = await json('/api/axo-pet/overview').catch(() => null);
    renderOverview();
    if (window.AxoWallet?.ready) await window.AxoWallet.ready.catch(() => {});
    state.session = window.AxoWallet?.getSession?.() || state.session;
    await loadHolder();
  })();
})();
