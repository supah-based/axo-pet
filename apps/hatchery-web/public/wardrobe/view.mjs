import { wardrobeMarkup } from './markup.mjs';
import { assertPreview, emptyPreview, previewSelection, withPreviewItem, withPreviewOutfit, previewStorageKey, PreviewOutfits, createWardrobeSession, sameWallet } from './model.mjs';
import { drawFitted, validateProfile } from '/gear-anatomy/model.mjs';
import { GARMENT_FILTERS, matchesWardrobeFilter } from '/gear-bazaar/wardrobe-filters.mjs';

const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const button = (text, action) => { const node = element('button', text); node.type = 'button'; node.onclick = action; return node; };
const human = text => text.replaceAll('_', ' ').replaceAll('-', ' ');
const defaults = {
  getSession: () => window.AxoWallet?.getSession?.() || { connected: false },
  ready: () => window.AxoWallet?.ready || Promise.resolve(),
  connect: () => window.AxoWallet?.connect?.(),
  subscribe: callback => { const handler = () => callback(); window.addEventListener('axo:session', handler); return () => window.removeEventListener('axo:session', handler); },
};
async function privateRead({ signal }) {
  const request = new AbortController(), cancel = () => request.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 12000);
  try {
    const result = await fetch('/api/hatchery/wardrobe', { signal: request.signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!result.ok) throw Error('Verified Pet read unavailable.');
    return await result.json();
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
}

export async function mountWardrobe(root, { sessionBridge = defaults, read = privateRead, storage, syntheticReview = false } = {}) {
  root.dataset.axoWardrobe = ''; root.innerHTML = wardrobeMarkup;
  const $ = selector => root.querySelector(selector), $$ = selector => [...root.querySelectorAll(selector)];
  if (syntheticReview) { $('.aw-authority header small').textContent = 'SYNTHETIC REVIEW PET'; $('.aw-authority h3').textContent = 'Synthetic V1 equipment'; }
  const portrait = $('[data-portrait]'), authority = $('[data-authority-portrait]');
  let catalog, look, state = { status: 'DISCONNECTED', read: null }, tier = 10, store = null, draftScope = null;
  let generation = 0, paintGeneration = 0, painted = false, disposed = false, activeTab = 'pieces', exportUrl = null;
  const assetRecords = new Map(), imageCache = new Map();
  const notice = (message, error = false) => { $('[data-notice]').textContent = message; $('[data-notice]').dataset.tone = error ? 'error' : 'info'; };
  const options = (select, entries) => select.replaceChildren(...entries.map(([value, text]) => { const o = element('option', text); o.value = value; return o; }));
  function usable() {
    const value = controller.current(), session = sessionBridge.getSession();
    return value && session.connected === true && sameWallet(session.address, value.identity.ownerAddress) ? value : null;
  }
  function requirePet() { const value = usable(); if (!value) throw Error('Refresh your verified Pet before saving or sharing.'); return value; }
  function register(record) {
    if (!record?.asset || !/^[a-f0-9]{64}$/.test(record.sha256 || '') || !/^\/(?:gear-(?:anatomy|bazaar)\/v[13]\/|hatchery-nft-v5(?:\.1\.1)?\/)[a-z0-9_.-]+\.webp$/.test(record.asset)) throw Error('Unrecognized portrait asset.');
    assetRecords.set(record.asset, record.sha256);
  }
  async function image(url) {
    const hash = assetRecords.get(url); if (!hash) throw Error('Portrait asset has no pinned hash.');
    const key = url + ':' + hash;
    if (!imageCache.has(key)) imageCache.set(key, (async () => {
      const response = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
      if (!response.ok) throw Error('Portrait image unavailable.');
      const bytes = await response.arrayBuffer(); if (bytes.byteLength > 12 * 1024 * 1024) throw Error('Portrait image too large.');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== hash) throw Error('Portrait image changed. Refresh after the matching asset release.');
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })), img = new Image();
      try { img.src = objectUrl; await img.decode(); return img; } finally { URL.revokeObjectURL(objectUrl); }
    })().catch(error => { imageCache.delete(key); throw error; }));
    return imageCache.get(key);
  }
  function stamp(canvas, reference = false) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101b13'; ctx.fillRect(25, 26, syntheticReview ? 478 : reference ? 450 : 308, 62);
    ctx.fillStyle = '#d0ec9e'; ctx.font = 'bold 25px sans-serif';
    ctx.fillText(syntheticReview ? 'AXO / SYNTHETIC PREVIEW' : reference ? 'AXO / REFERENCE PREVIEW' : 'AXO / PREVIEW', 45, 67);
    ctx.fillStyle = '#101b13'; ctx.fillRect(0, 1434, 1024, 102);
    ctx.fillStyle = '#edf2e5'; ctx.font = 'bold 23px sans-serif'; ctx.fillText('PREVIEW · COSMETIC TRY-ON', 32, 1475);
    ctx.fillStyle = '#a7b99d'; ctx.font = '19px sans-serif'; ctx.fillText('Not proof of ownership. No equipment or stat changes.', 32, 1507);
  }
  function disableExports() { painted = false; $('[data-download]').disabled = true; $('[data-share]').disabled = true; }
  async function paint() {
    if (!catalog) return;
    const ticket = ++paintGeneration, value = usable(); disableExports();
    const next = document.createElement('canvas'); next.width = 1024; next.height = 1536;
    const ctx = next.getContext('2d'); ctx.fillStyle = '#16271a'; ctx.fillRect(0, 0, 1024, 1536);
    try {
      const selected = value ? previewSelection(look, catalog) : {}, lineage = value?.identity.lineageId || catalog.lineages[0].id;
      const fitted = document.createElement('canvas'); fitted.width = 1024; fitted.height = 1536;
      await drawFitted(fitted, catalog, lineage, selected, image, {}, value ? look.sceneId : catalog.defaultScene, value ? look.appearance : true);
      if (ticket !== paintGeneration || disposed) return;
      ctx.drawImage(fitted, 0, 0); stamp(next, !value);
      portrait.getContext('2d').clearRect(0, 0, 1024, 1536); portrait.getContext('2d').drawImage(next, 0, 0);
      portrait.setAttribute('aria-label', value ? `${value.identity.name}, cosmetic Preview with ${Object.keys(look.items).length} styles. Not owned or equipped.` : 'Reference AXO Preview. Connect to try your own lineage.');
      $('[data-portrait-copy]').textContent = value ? (syntheticReview ? 'Synthetic review · ' : '') + human(lineage) + ' · adult fit preview · 2:3' : 'Reference Pet · connect to use your own lineage · 2:3';
      painted = Boolean(value && usable()); $('[data-download]').disabled = !painted; $('[data-share]').disabled = !painted;
    } catch { if (ticket === paintGeneration) { portrait.getContext('2d').clearRect(0, 0, 1024, 1536); notice('The portrait is unavailable. Your Pet and equipment are unchanged. Retry after the matching assets are available.', true); } }
  }
  async function paintAuthority(value, ticket) {
    const layers = value.authoritativeVisual.layers;
    try {
      for (const layer of layers) register({ asset: layer.url, sha256: layer.sha256 });
      const images = await Promise.all(layers.map(l => image(l.url)));
      if (ticket !== generation || !usable()) return;
      const ctx = authority.getContext('2d'); ctx.clearRect(0, 0, 1024, 1024);
      for (const img of images) { if (img.naturalWidth !== 1024 || img.naturalHeight !== 1024) throw Error('Wrong canonical image size.'); ctx.drawImage(img, 0, 0); }
      authority.hidden = false;
      authority.setAttribute('aria-label', `${value.identity.name}, authoritative V1 ${value.authoritativeVisual.equipmentIncluded ? 'equipped' : 'base'} appearance`);
      $('[data-authority-image-status]').textContent = value.authoritativeVisual.equipmentIncluded ? 'Verified V1 equipped appearance · pinned asset hashes.' : 'Verified identity base. Equipment appearance is unavailable.';
    } catch { if (ticket === generation) { authority.hidden = true; $('[data-authority-image-status]').textContent = 'Canonical portrait assets are unavailable. Identity and equipment remain separate from the try-on.'; } }
  }
  function wardrobeActions() {
    const ready = Boolean(usable());
    $('[data-scene]').disabled = !ready; $('[data-appearance]').disabled = !ready; $('[data-clear]').disabled = !ready;
    $('[data-save-look]').disabled = !ready || !store; $('[data-outfit-name]').disabled = !ready || !store;
  }
  function showTab(tab) {
    activeTab = tab;
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
    $$('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  }
  function renderWorn() {
    const entries = usable() ? Object.entries(look.items) : [];
    $('[data-worn-count]').textContent = `${entries.length} PIECES`; $('[data-mobile-count]').textContent = entries.length;
    $('[data-empty-look]').hidden = entries.length > 0;
    $('[data-worn]').replaceChildren(...entries.map(([slot, entry]) => {
      const li = element('li'), item = catalog.items.find(i => i.id === entry.family);
      const remove = button(item.name + ' · ' + entry.itemLevel + ' ×', () => action(() => { delete look.items[slot]; changed(); }));
      remove.setAttribute('aria-label', 'Remove ' + item.name + ' from preview'); li.append(remove); return li;
    }));
  }
  function renderPieces() {
    if (!catalog) return;
    const query = $('[data-search]').value.trim().toLowerCase(), cut = $('[data-cut]').value, theme = $('[data-theme]').value, ready = Boolean(usable());
    const items = catalog.items.filter(i => matchesWardrobeFilter(i, cut) && (theme === 'all' || i.theme === theme) && (!query || [i.name, i.description, i.slot, i.theme, i.garmentType].join(' ').toLowerCase().includes(query)));
    $('[data-count]').textContent = `${items.length} of ${catalog.items.length} styles`;
    $('[data-tier-copy]').textContent = `Preview tier ${tier} · proposed future minimum Pet level ${tier}. Try-on is cosmetic at every tier; your verified XP, current level and stats stay unchanged.`;
    $('[data-pieces]').replaceChildren(...items.map(item => {
      const selected = ready && look.items[item.slot]?.family === item.id && look.items[item.slot].itemLevel === tier;
      const card = element('article', undefined, 'aw-piece'); card.dataset.selected = String(selected);
      const art = element('div', undefined, 'aw-piece-art'), img = element('img');
      img.src = item.thumbnail.asset; img.width = 240; img.height = 360; img.loading = 'lazy'; img.alt = item.name + ', complete unworn Gear design';
      art.append(img, element('span', 'PREVIEW / LVL ' + tier));
      const copy = element('div', undefined, 'aw-piece-copy'), tryOn = button(selected ? 'Trying on ✓' : 'Try on +', () => action(() => { look = withPreviewItem(look, catalog, item.id, tier); changed(); notice(item.name + ' added to your cosmetic preview.'); }));
      tryOn.disabled = !ready; tryOn.setAttribute('aria-pressed', String(selected)); tryOn.setAttribute('aria-label', `Try ${item.name} tier ${tier}`);
      copy.append(element('small', (item.garmentType || item.slot) + ' / ' + item.theme), element('h3', item.name), element('p', 'Future minimum LVL ' + tier + ' · not inventory'), tryOn);
      card.append(art, copy); return card;
    }));
    if (!items.length) $('[data-pieces]').append(element('p', 'No styles match. Try another filter.'));
  }
  function renderOutfits() {
    if (!catalog) return;
    $('[data-outfits]').replaceChildren(...catalog.presets.map(preset => {
      const card = element('article', undefined, 'aw-outfit'), item = catalog.items.find(i => i.id === preset.selection.body) || catalog.items.find(i => i.id === Object.values(preset.selection)[0]);
      const img = element('img'); img.src = catalog.showcases.find(s => s.preset === preset.id)?.asset || item.itemArt.asset;
      img.width = 360; img.height = 240; img.loading = 'lazy'; img.alt = preset.name.replace(' · 5-piece set', '') + ' style reference';
      const copy = element('div'), tryOn = button('Try complete look ↗', () => action(() => { look = withPreviewOutfit(look, catalog, preset.id, tier); changed(); notice('Complete cosmetic look applied. No equipment or set bonus changed.'); })); tryOn.disabled = !usable();
      copy.append(element('h3', preset.name.replace(' · 5-piece set', '')), element('p', Object.keys(preset.selection).length + ' preview pieces · tier ' + tier + ' · no stat bonus'), tryOn);
      card.append(img, copy); return card;
    }));
  }
  function renderSaved() {
    $('[data-saved]').replaceChildren();
    if (!store || !usable()) { $('[data-saved-message]').textContent = 'Connect your Pet to open its saved previews.'; return; }
    try {
      const entries = store.list(); $('[data-saved-message]').textContent = entries.length + ' / 12 previews saved in this browser.';
      $('[data-saved]').append(...entries.map(entry => {
        const row = element('article'), actions = element('div');
        actions.append(button('Try this look ↗', () => action(() => { assertPreview(entry.look, catalog); look = structuredClone(entry.look); changed(); notice('Saved cosmetic preview restored.'); })), button('Remove', () => action(() => { store.remove(entry.id); renderSaved(); })));
        row.append(element('h3', entry.name), element('p', Object.keys(entry.look.items).length + ' cosmetic pieces · Preview only'), actions); return row;
      }));
    } catch { $('[data-saved-message]').textContent = 'Saved previews are unavailable or incompatible. They have not been overwritten.'; }
  }
  function changed() {
    $('[data-scene]').value = look.sceneId || ''; $('[data-appearance]').value = look.appearance ? 'lineage' : 'original';
    renderWorn(); renderPieces(); renderOutfits(); wardrobeActions(); paint();
  }
  function action(task) { try { requirePet(); task(); } catch (error) { notice(error.message, true); } }
  async function onState(next) {
    if (!catalog || disposed) return;
    if (next.status === 'REFRESHING') { state = next; return; }
    if (next.status === 'READY' && state.read && ['READY', 'REFRESHING'].includes(state.status)
      && ['identity', 'equipment', 'authoritativeVisual'].every(key => JSON.stringify(state.read[key]) === JSON.stringify(next.read[key]))) { state = next; return; }
    const ticket = ++generation; ++paintGeneration; state = next; store = null; disableExports();
    closeExport();
    authority.hidden = true; authority.getContext('2d').clearRect(0, 0, 1024, 1024); portrait.getContext('2d').clearRect(0, 0, 1024, 1536);
    $('[data-v1-items]').replaceChildren(); $('[data-pet-name]').textContent = 'Waiting for your AXO.';
    for (const selector of ['[data-pet-xp]', '[data-pet-level]', '[data-pet-lineage]']) $(selector).textContent = '—';
    $('[data-v1-status]').textContent = 'No fresh equipment read.'; $('[data-authority-image-status]').textContent = 'Waiting for a fresh verified read.';
    if (!draftScope?.startsWith((sessionBridge.getSession().address || '').toLowerCase() + ':') || next.status === 'DISCONNECTED') $('[data-outfit-name]').value = '';
    $('[data-saved]').replaceChildren();
    $('[data-connect]').hidden = next.status === 'READY'; $('[data-refresh]').disabled = !sessionBridge.getSession().connected || next.status === 'LOADING';
    $('[data-state]').textContent = syntheticReview ? 'SYNTHETIC REVIEW PET' : ({ READY: 'VERIFIED PET READ', LOADING: 'CHECKING YOUR PET', EXPIRED: 'PET READ EXPIRED', UNAVAILABLE: 'PET READ UNAVAILABLE', DISCONNECTED: 'CONNECT YOUR PET' })[next.status];
    if (next.status !== 'READY') {
      notice(syntheticReview ? 'Synthetic review only. This is not a real wallet, Pet or equipment.' : next.status === 'LOADING' ? 'Reading this wallet’s authoritative Pet and equipment…' : next.status === 'DISCONNECTED' ? 'Connect to read your Pet. Browse styles while you wait.' : 'Your verified read is unavailable or expired. Refresh to try, save or share. Existing Gear is unchanged.');
      renderWorn(); renderPieces(); renderOutfits(); renderSaved(); wardrobeActions(); paint(); return;
    }
    const value = next.read, pet = value.identity, scope = pet.ownerAddress.toLowerCase() + ':' + pet.genesisId;
    if (draftScope !== scope) { look = emptyPreview(catalog); draftScope = scope; $('[data-outfit-name]').value = ''; }
    $('[data-pet-name]').textContent = pet.name; $('[data-pet-xp]').textContent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(pet.xp);
    $('[data-pet-level]').textContent = 'LVL ' + pet.level; $('[data-pet-lineage]').textContent = human(pet.lineageId);
    $('[data-session-copy]').textContent = syntheticReview ? 'Test fixture · no wallet connection or chain action.' : 'Fresh private read · no identity or XP saved in outfits.';
    const gear = value.equipment;
    $('[data-v1-status]').textContent = gear.status === 'VERIFIED_ONCHAIN' ? gear.items.length + ' equipped V1 items · block ' + gear.chain.blockNumber : 'Equipment unavailable · ' + human(gear.reason).toLowerCase() + '. No empty loadout inferred.';
    if (gear.status === 'VERIFIED_ONCHAIN') $('[data-v1-items]').append(...gear.items.map(item => { const li = element('li'); li.append(element('span', item.slot.toUpperCase()), element('strong', 'Gear #' + item.id)); return li; }));
    notice(syntheticReview ? 'Synthetic review Pet and invented V1 equipment. All outfit controls remain cosmetic.' : 'Your identity and exact XP are verified. The fitting room below is preview-only.');
    changed(); paintAuthority(value, ticket);
    try {
      const key = await previewStorageKey(pet.ownerAddress, pet.genesisId);
      if (ticket !== generation || !usable()) return;
      store = new PreviewOutfits(storage || window.localStorage, (syntheticReview ? 'synthetic-review:' : '') + key, catalog);
      wardrobeActions(); renderSaved();
    } catch { if (ticket === generation) { store = null; wardrobeActions(); $('[data-saved-message]').textContent = 'Browser storage is unavailable. You can still try on and export Preview portraits.'; } }
  }
  const controller = createWardrobeSession({ read, onState });
  $('[data-connect]').onclick = async () => { try { await sessionBridge.connect(); await controller.change(sessionBridge.getSession()); } catch { notice('Wallet access is unavailable here. Use the existing AXO wallet connection on the live host.', true); } };
  $('[data-refresh]').onclick = () => controller.change(sessionBridge.getSession());
  $$('[data-tab]').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
  $$('[data-mobile]').forEach(b => { b.onclick = () => { if (b.dataset.mobile === 'preview') $('[data-preview-panel]').scrollIntoView({ block: 'start', behavior: 'auto' }); else { showTab(b.dataset.mobile); $('.aw-tabs').scrollIntoView({ block: 'start', behavior: 'auto' }); } }; });
  $('[data-search]').oninput = renderPieces; $('[data-cut]').onchange = renderPieces; $('[data-theme]').onchange = renderPieces;
  $('[data-tier]').onchange = () => { tier = Number($('[data-tier]').value); renderPieces(); renderOutfits(); };
  $('[data-scene]').onchange = () => action(() => { look.sceneId = $('[data-scene]').value || null; changed(); });
  $('[data-appearance]').onchange = () => action(() => { look.appearance = $('[data-appearance]').value === 'lineage'; changed(); });
  $('[data-clear]').onclick = () => action(() => { look = { ...emptyPreview(catalog), sceneId: look.sceneId, appearance: look.appearance }; changed(); });
  $('[data-save-form]').onsubmit = event => { event.preventDefault(); action(() => { if (!store) throw Error('Saved previews are unavailable.'); store.save($('[data-outfit-name]').value, look); $('[data-outfit-name]').value = ''; renderSaved(); notice('Cosmetic outfit saved in this browser. Nothing was equipped.'); }); };
  async function portraitFile() {
    requirePet(); if (!painted) throw Error('Wait for your Preview portrait to finish rendering.');
    const ticket = paintGeneration, blob = await new Promise(resolve => portrait.toBlob(resolve, 'image/png'));
    requirePet(); if (!blob || ticket !== paintGeneration || !painted) throw Error('Your preview changed. Try exporting again.');
    return new File([blob], 'axo-pet-preview.png', { type: 'image/png' });
  }
  function closeExport() { $('[data-export-dialog]').close(); $('[data-export-image]').removeAttribute('src'); $('[data-export-link]').removeAttribute('href'); if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = null; }
  function openExport(file) { closeExport(); exportUrl = URL.createObjectURL(file); $('[data-export-image]').src = exportUrl; $('[data-export-link]').href = exportUrl; $('[data-export-dialog]').showModal(); }
  $('[data-export-close]').onclick = closeExport;
  $('[data-export-dialog]').addEventListener('cancel', closeExport);
  $('[data-download]').onclick = async () => { try { openExport(await portraitFile()); notice('Your Preview PNG is ready to download or share.'); } catch (error) { notice(error.message, true); } };
  $('[data-share]').onclick = async () => { try { const file = await portraitFile(); if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My AXO · Preview', text: 'A cosmetic AXO Pet try-on. Preview only.' }); else { openExport(file); notice('Your Preview PNG is ready to save and share.'); } } catch (error) { if (error.name !== 'AbortError') notice(error.message, true); } };

  let unsubscribe = () => {};
  const refreshVisible = () => { if (!disposed && !document.hidden && !$('[data-export-dialog]').open && !['LOADING', 'REFRESHING'].includes(state.status) && sessionBridge.getSession().connected) controller.refresh(sessionBridge.getSession()); };
  const refreshInterval = setInterval(refreshVisible, 40000);
  document.addEventListener('visibilitychange', refreshVisible);
  try {
    const response = await fetch('/gear-bazaar/v1/catalog.json', { credentials: 'omit', cache: 'no-cache' });
    if (!response.ok) throw Error('Collection unavailable.'); catalog = await response.json(); validateProfile(catalog);
    for (const base of catalog.lineages) for (const record of [base, base.closedFeet, base.arm, base.fingers, base.gills, base.head, base.hands, base.styled, base.styled.closedFeet, base.styled.arm, base.styled.fingers, base.styled.gills, base.styled.head, base.styled.hands]) register(record);
    for (const item of catalog.items) { register(item.wearable); if (item.wearable.rear) register(item.wearable.rear); for (const part of item.parts) { const texture = item.source.asset === part.texture ? item.source : null; if (texture) register(texture); } }
    for (const scene of catalog.scenes) register(scene);
    look = emptyPreview(catalog);
    options($('[data-scene]'), [['', 'Transparent'], ...catalog.scenes.map(s => [s.id, s.name])]); $('[data-scene]').value = look.sceneId || '';
    options($('[data-tier]'), Array.from({ length: 11 }, (_, i) => [i + 10, 'LVL ' + (i + 10) + ' · preview']));
    options($('[data-cut]'), [...GARMENT_FILTERS, ...catalog.slots.filter(s => s !== 'body').map(s => ['slot:' + s, human(s).toUpperCase()])]);
    options($('[data-theme]'), [['all', 'All styles'], ...[...new Set(catalog.items.map(i => i.theme))].sort().map(t => [t, human(t)])]);
    $('[data-tab="pieces"] span').textContent = catalog.items.length;
    await sessionBridge.ready().catch(() => {}); unsubscribe = sessionBridge.subscribe(() => controller.change(sessionBridge.getSession()));
    await controller.change(sessionBridge.getSession());
  } catch { notice('The wardrobe collection is unavailable. Your Pet and equipment are unchanged.', true); $$('button,input,select').forEach(n => { n.disabled = true; }); }
  return { dispose() { disposed = true; ++generation; ++paintGeneration; closeExport(); clearInterval(refreshInterval); document.removeEventListener('visibilitychange', refreshVisible); controller.dispose(); unsubscribe(); }, refresh: () => controller.change(sessionBridge.getSession()) };
}
