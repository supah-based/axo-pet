import { STUDIO_SLOTS, buildRenderPlan, selectionFromURL, selectionToURL, drawStudioLook } from '/gear-style-studio/model.mjs';

const $ = id => document.getElementById(id);
const canvas = $('pet-canvas'), grid = $('gear-grid'), status = $('render-status'), dialog = $('art-dialog');
const images = new Map();
let catalog, state, filterSlot = 'all', filterTheme = 'all', revision = 0, modalItem, previousFocus;
let inspectionRevision = 0;
for (const id of ['shuffle', 'clear', 'save-look', 'expand-look', 'lineage', 'theme']) $(id).disabled = true;
function loadImage(src) {
  if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => { images.delete(src); reject(new Error('Artwork unavailable. Please retry.')); }; image.src = src;
  }));
  return images.get(src);
}
function button(text, className, action) {
  const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = text; el.addEventListener('click', action); return el;
}
function image(src, alt, loading = 'lazy') { const el = document.createElement('img'); el.src = src; el.alt = alt; el.loading = loading; el.width = 1024; el.height = 1024; return el; }
function say(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
async function updateLook() {
  const current = ++revision;
  const selection = { ...state.selection }, lineage = state.lineage;
  $('save-look').disabled = true; $('expand-look').disabled = true;
  say('Fitting your look…');
  // Render offscreen so slower earlier requests cannot overwrite a newer selection.
  const next = document.createElement('canvas'); next.width = next.height = 1024;
  try {
    await drawStudioLook(next, catalog, lineage, selection, loadImage);
    if (current !== revision) return;
    canvas.getContext('2d').clearRect(0, 0, 1024, 1024); canvas.getContext('2d').drawImage(next, 0, 0);
    const count = Object.values(selection).filter(Boolean).length;
    say(`${count} / ${STUDIO_SLOTS.length} pieces · ${catalog.lineages.find(item => item.id === lineage).name} AXO`);
    canvas.setAttribute('aria-label', `${catalog.lineages.find(item => item.id === lineage).name} level-10 AXO wearing ${Object.values(selection).map(id => catalog.items.find(item => item.id === id)?.name).filter(Boolean).join(', ') || 'no gear'}`);
    $('save-look').disabled = false; $('expand-look').disabled = false;
    if ($('fit-inspector').open) updateFitInspection();
  } catch (error) {
    if (current === revision) { canvas.getContext('2d').clearRect(0, 0, 1024, 1024); say(error.message, true); }
  }
}
async function updateFitInspection() {
  if (!catalog || !$('fit-inspector').open) return;
  const current = ++inspectionRevision, lineage = state.lineage;
  const item = catalog.items.find(item => item.id === $('inspect-item').value);
  const showAnchor = $('inspect-anchor').checked;
  $('inspection-status').textContent = 'Opening the fitting layers…';
  try {
    const plan = buildRenderPlan(catalog, lineage, { [item.slot]: item.id });
    const loaded = await Promise.all(plan.map(async layer => ({ ...layer, image: await loadImage(layer.src) })));
    if (current !== inspectionRevision) return;
    const pet = loaded.find(layer => layer.kind === 'pet');
    for (const view of ['rear', 'front', 'worn']) {
      const ctx = $('inspect-' + view).getContext('2d'); ctx.clearRect(0, 0, 1024, 1024);
      if (view === 'worn') loaded.forEach(layer => ctx.drawImage(layer.image, 0, 0));
      else {
        ctx.globalAlpha = .20; ctx.drawImage(pet.image, 0, 0); ctx.globalAlpha = 1;
        loaded.filter(layer => view === 'front' ? layer.kind === 'gear' && layer.depth === 'front' : item.slot === 'tool' ? layer.kind === 'occluder' : layer.depth === 'rear').forEach(layer => ctx.drawImage(layer.image, 0, 0));
      }
      if (view === 'worn' && showAnchor && item.wearable.anchor) {
        const [x,y] = item.wearable.anchor.target;
        ctx.strokeStyle = '#e5ff7c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x,y,15,0,Math.PI*2); ctx.moveTo(x-23,y); ctx.lineTo(x+23,y); ctx.moveTo(x,y-23); ctx.lineTo(x,y+23); ctx.stroke();
      }
    }
    $('rear-caption').textContent = item.slot === 'tool' ? 'Fingers above the grip' : 'Behind the Pet';
    $('inspection-status').textContent = item.name + ' · ' + catalog.lineages.find(base => base.id === lineage).name + ' AXO';
  } catch (error) {
    if (current === inspectionRevision) {
      for (const view of ['rear','front','worn']) $('inspect-' + view).getContext('2d').clearRect(0,0,1024,1024);
      $('inspection-status').textContent = error.message;
    }
  }
}
$('fit-inspector').addEventListener('toggle', updateFitInspection);
$('inspect-item').addEventListener('change', updateFitInspection);
$('inspect-anchor').addEventListener('change', updateFitInspection);
function update() {
  history.replaceState(null, '', selectionToURL(state.lineage, state.selection));
  $('lineage').value = state.lineage;
  renderEquipped(); renderCards(); updateLook();
}
function tryItem(item) {
  if (state.selection[item.slot] === item.id) delete state.selection[item.slot]; else state.selection[item.slot] = item.id;
  update();
}
function renderEquipped() {
  $('equipped').replaceChildren(...STUDIO_SLOTS.map(slot => {
    const item = catalog.items.find(item => item.id === state.selection[slot]);
    const el = button('', '', () => { if (item) { delete state.selection[slot]; update(); } else { filterSlot = slot; renderFilters(); renderCards(); $('collection').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); } });
    el.title = item ? `Remove ${item.name}` : `Browse ${slot}`; el.setAttribute('aria-label', el.title);
    if (item) { el.append(image(item.thumbnail.asset, '')); const x = document.createElement('span'); x.className = 'remove-marker'; x.textContent = '×'; el.append(x); }
    else { const empty = document.createElement('span'); empty.className = 'slot-empty'; empty.textContent = slot; el.append(empty); }
    return el;
  }));
}
function renderFilters() {
  $('slots').replaceChildren(...['all', ...STUDIO_SLOTS].map(slot => {
    const el = button(slot === 'all' ? 'All pieces' : slot[0].toUpperCase() + slot.slice(1), '', () => { filterSlot = slot; renderFilters(); renderCards(); });
    el.setAttribute('aria-pressed', String(filterSlot === slot)); return el;
  }));
}
function renderCards() {
  const filtered = catalog.items.filter(item => (filterSlot === 'all' || item.slot === filterSlot) && (filterTheme === 'all' || item.theme === filterTheme));
  grid.replaceChildren(...filtered.map(item => {
    const selected = state.selection[item.slot] === item.id;
    const card = document.createElement('article'); card.className = 'gear-card' + (selected ? ' is-selected' : ''); card.style.setProperty('--accent', item.color);
    const art = button('', 'art-button', () => openArt(item)); art.setAttribute('aria-label', `View ${item.name} artwork full screen`);
    art.append(image(item.thumbnail.asset, item.name));
    const theme = document.createElement('small'); theme.className = 'theme-chip'; theme.textContent = item.theme;
    const expand = document.createElement('span'); expand.textContent = '⤢'; expand.setAttribute('aria-hidden', 'true'); art.append(theme, expand);
    const copy = document.createElement('div'); copy.className = 'card-copy';
    const slot = document.createElement('small'); slot.textContent = item.slot;
    const name = document.createElement('h3'); name.textContent = item.name;
    const tryButton = button('', 'try-button', () => tryItem(item)); tryButton.setAttribute('aria-pressed', String(selected)); tryButton.setAttribute('aria-label', `${selected ? 'Remove' : 'Try'} ${item.name}`);
    const text = document.createElement('span'); text.textContent = selected ? 'Wearing' : 'Try it on';
    const icon = document.createElement('span'); icon.textContent = selected ? '✓' : '+'; icon.setAttribute('aria-hidden', 'true'); tryButton.append(text, icon);
    copy.append(slot, name, tryButton); card.append(art, copy); return card;
  }));
  $('item-count').textContent = `${filtered.length} piece${filtered.length === 1 ? '' : 's'}`;
  $('empty-state').hidden = Boolean(filtered.length);
}
function openArt(item) {
  previousFocus = document.activeElement; modalItem = item;
  $('art-title').textContent = item ? item.name : 'Your AXO. Your signal.';
  $('art-kicker').textContent = item ? `${item.slot.toUpperCase()} / ${item.theme.toUpperCase()} / COLLECTION ARTWORK` : 'YOUR LEVEL-10 LOOK';
  $('art-description').textContent = item ? item.description : 'A look worth saving. Mix it up whenever the timeline changes.';
  $('dialog-art').replaceChildren(image(item ? item.itemArt.asset : canvas.toDataURL('image/png'), item ? `${item.name}, complete collectible artwork` : canvas.getAttribute('aria-label'), 'eager'));
  $('art-try').textContent = item && state.selection[item.slot] === item.id ? 'Remove this piece' : item ? 'Try this piece ↗' : 'Save look ↓';
  dialog.showModal(); document.body.style.overflow = 'hidden';
}
function saveLook() { const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `axo-${state.lineage}-look.png`; link.click(); }
dialog.addEventListener('close', () => { document.body.style.overflow = ''; (previousFocus?.isConnected ? previousFocus : $('expand-look')).focus(); });
$('close-art').addEventListener('click', () => dialog.close());
$('art-try').addEventListener('click', () => { if (modalItem) { tryItem(modalItem); dialog.close(); } else saveLook(); });
$('expand-look').addEventListener('click', () => openArt(null));
$('save-look').addEventListener('click', saveLook);
$('lineage').addEventListener('change', event => { state.lineage = event.target.value; update(); });
$('theme').addEventListener('change', event => { filterTheme = event.target.value; renderCards(); });
$('clear').addEventListener('click', () => { state.selection = {}; update(); });
$('shuffle').addEventListener('click', () => { state.selection = Object.fromEntries(STUDIO_SLOTS.map(slot => { const items = catalog.items.filter(item => item.slot === slot); return [slot, items[Math.floor(Math.random() * items.length)].id]; })); update(); });

try {
  const response = await fetch('/gear-style-studio/v1/catalog.json', { credentials: 'omit' });
  if (!response.ok) throw new Error('The collection is unavailable. Please refresh shortly.');
  catalog = await response.json();
  $('inspect-item').replaceChildren(...catalog.items.filter(item => ['body','pants','tool'].includes(item.slot)).map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option; }));
  $('inspect-item').disabled = false;
  try { state = selectionFromURL(catalog, location.search); } catch { state = { lineage: catalog.lineages[0].id, selection: {} }; say('This saved look is unavailable. Starting with a fresh AXO.'); }
  if (!location.search) state.selection = { ...catalog.presets[0].selection };
  $('lineage').replaceChildren(...catalog.lineages.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option; }));
  $('presets').replaceChildren(...catalog.presets.map(preset => button(preset.name + ' ↗', '', () => { state.selection = { ...preset.selection }; update(); })));
  for (const id of ['shuffle', 'clear', 'lineage', 'theme']) $(id).disabled = false;
  const requestedArt = new URLSearchParams(location.search).get('art');
  renderFilters(); update();
  if (requestedArt) { const item = catalog.items.find(item => item.id === requestedArt); if (item) openArt(item); }
} catch (error) {
  say(error.message, true);
  for (const id of ['shuffle', 'clear', 'save-look', 'expand-look', 'lineage', 'theme']) $(id).disabled = true;
}
