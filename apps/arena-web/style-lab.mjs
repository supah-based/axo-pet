import {arenaLook,saveArenaLook} from './arena-look-store.mjs';
import { LINEAGES, catalog as moveCatalog } from './catalog.mjs';
import { fitPlan } from './atelier/model.mjs';
import { ATELIER_CATALOG_SHA256, LAB_MOVES, atelierManifest, atelierMediaUrl, labSelection, proposedLoadout, fittedActorMotion } from './style-lab-model.mjs';
import { activePresentation, presentationBudget } from './presentation.mjs';
import {sampleEquippedPose,RIG_SPACE,POSE_NAMES} from './equipped-rig.mjs';
import {createEquippedPuppet} from './equipped-puppet.mjs';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function styleLabMarkup() {
  return `<section class="style-lab" aria-labelledby="style-lab-title"><header class="sl-header"><div><span class="eyebrow">AXO ARENA / STYLE LAB</span><h1 id="style-lab-title" tabindex="-1">Your look. In motion.</h1><p>Fitted gear, six lineages and preview tiers 10–20.</p></div><span class="sl-preview-badge">COSMETIC PREVIEW</span></header><div class="sl-policy">Try a look. Preview styles grant no ownership, XP or combat bonuses. Battle clocks continue while you style.</div><div class="sl-layout"><aside class="sl-preview"><div class="sl-arena-apply"><button data-lab-use-arena disabled>Use in Arena · Preview</button><small data-lab-arena-notice role="status">Cosmetic only · applies when you return to Arena.</small></div><div class="sl-stage"><canvas width="600" height="900" tabindex="-1" data-lab-canvas aria-label="Animated fitted gear cosmetic preview"></canvas><span class="sl-watermark">PREVIEW / NOT EQUIPPED</span><span data-lab-loading role="status">Loading fitted wardrobe…</span></div><div class="sl-animation"><label>Motion<select data-lab-move>${LAB_MOVES.map(key => `<option value="${key}">${key === 'idle' ? 'Idle / breathing' : esc(moveCatalog('emerald_sprout')[key].name)}</option>`).join('')}</select></label><button data-lab-play>Play motion ↗</button><button data-lab-pause aria-pressed="false">Pause</button></div><div class="sl-pose-controls"><label>Pose study<select data-lab-pose><option value="motion">Follow motion clip</option>${POSE_NAMES.map(pose=>`<option value="${pose}">${pose[0].toUpperCase()+pose.slice(1)}</option>`).join('')}</select></label><label>Pose blend <output data-lab-pose-copy>100%</output><input data-lab-pose-mix type="range" min="0" max="100" step="1" value="100"></label></div><div class="sl-pose-note" data-lab-pose-status role="status">Loading registered equipment animation…</div><div class="sl-export"><button data-lab-export disabled>Export Preview PNG</button><button data-lab-share disabled>Copy look link</button></div><div data-lab-stats></div></aside><div class="sl-controls" tabindex="-1"><div class="sl-identity"><label>Reference lineage<select data-lab-lineage>${Object.entries(LINEAGES).map(([id, l]) => `<option value="${id}">${esc(l.name)}</option>`).join('')}</select></label><label>Preview tier <output data-lab-tier-copy>10</output><input data-lab-tier type="range" min="10" max="20" value="10" step="1"></label></div><label class="sl-scene">Preview setting<select data-lab-scene><option value="none">Protocol deck</option></select></label><div class="sl-outfits"><label>Complete outfit<select data-lab-outfit><option value="">Custom mix</option></select></label><button data-lab-clear>Clear gear</button></div><div class="sl-equipped" data-lab-equipped></div><button data-lab-compare aria-expanded="false" aria-controls="pose-comparison" disabled>Compare attack / block / hit / victory</button><section id="pose-comparison" data-lab-board class="sl-pose-board" aria-label="Equipped combat pose comparison" hidden></section><div class="sl-filters"><label>Find a style<input type="search" data-lab-search placeholder="Sweater, crown, banana…" maxlength="80"></label><label>Slot<select data-lab-slot><option value="all">All slots</option></select></label><label>Theme<select data-lab-theme><option value="all">All themes</option></select></label></div><p data-lab-count class="sl-count" aria-live="polite"></p><div class="sl-pieces" data-lab-pieces></div></div></div><nav class="sl-mobile-nav" aria-label="Wardrobe view"><button data-lab-jump="preview">View outfit ↑</button><button data-lab-jump="gear">Browse gear ↓</button></nav><p class="sl-notice" data-lab-notice role="status" aria-live="polite"></p></section>`;
}

export function mountStyleLab(root, { initialLineage = 'emerald_sprout', params = new URLSearchParams(), fetcher = fetch } = {}) {
  const $ = selector => root.querySelector(selector), canvas = $('[data-lab-canvas]'), ctx = canvas.getContext('2d'), abort = new AbortController();
  let disposed = false, generation = 0, catalog, manifest, composite, puppet, background, scene = 'none', lineage = Object.hasOwn(LINEAGES, initialLineage) ? initialLineage : 'emerald_sprout', tier = 10, selection = {}, move = 'idle', study = 'motion', poseMix = 1, actionAt = -Infinity, paused = false, lastFrame = -Infinity, raf, elapsedTime = 0, lastTime = 0;
  const poseSample={};let animationStatus='',boardOpen=false;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let preferences, reduced, budget;
  const gradient = ctx.createRadialGradient(300, 390, 20, 300, 430, 500); gradient.addColorStop(0, '#25484d'); gradient.addColorStop(1, '#07141d');
  const cache = new Map(), urls = new Set();
  const notice = text => { if (!disposed) $('[data-lab-notice]').textContent = text; };
  const signal = () => AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]);
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  async function image(path) {
    if (cache.has(path)) { const value = cache.get(path); cache.delete(path); cache.set(path, value); return value; }
    const entry = manifest.get(path); if (!entry) throw Error('Unlisted fitted layer.');
    const response = await fetcher(atelierMediaUrl(path), { credentials: 'omit', redirect: 'error', signal: signal() });
    if (!response.ok || Number(response.headers.get('content-length')) > 8 * 1024 * 1024) throw Error('Fitted asset unavailable.');
    const bytes = await response.arrayBuffer(); if (bytes.byteLength > 8 * 1024 * 1024 || await hash(bytes) !== entry.sha256) throw Error('Fitted asset integrity mismatch.');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })); urls.add(url);
    try {
      const img = new Image(); img.src = url; await img.decode(); if (disposed) throw Error('Preview closed.');
      if (img.naturalWidth !== entry.width || img.naturalHeight !== entry.height) throw Error('Fitted asset dimensions mismatch.');
      const small = document.createElement('canvas'); small.width = 512; small.height = 768; small.getContext('2d').drawImage(img, 0, 0, 512, 768);
      if (cache.size >= 12) cache.delete(cache.keys().next().value); cache.set(path, small); return small;
    } finally { URL.revokeObjectURL(url); urls.delete(url); }
  }
  async function paint() {
    const token = ++generation; composite = null; $('[data-lab-board]').hidden=true;$('[data-lab-pose]').disabled=true;$('[data-lab-pose-mix]').disabled=true;$('[data-lab-compare]').disabled=true; $('[data-lab-loading]').hidden = false; $('[data-lab-loading]').textContent = 'Fitting layers…'; $('[data-lab-export]').disabled = true;$('[data-lab-use-arena]').disabled=true;
    try {
      const plan = fitPlan(catalog, lineage, selection, {}, null, true), next = document.createElement('canvas'); next.width = 512; next.height = 768;
      const stage = catalog.scenes.find(entry => entry.id === scene), nextBackground = stage ? await image(stage.asset) : null;
      const surfaces=[];for (const layer of plan) { const img = await image(layer.src); if (disposed || token !== generation) return; next.getContext('2d').drawImage(img, 0, 0);surfaces.push({...layer,image:img}); }
      if (disposed || token !== generation) return;
      const nextPuppet=createEquippedPuppet(surfaces);puppet?.destroy();puppet=nextPuppet;animationStatus='';
      composite = next; background = nextBackground; $('[data-lab-loading]').hidden = true; $('[data-lab-export]').disabled = false; $('[data-lab-share]').disabled = false;$('[data-lab-use-arena]').disabled=false; lastFrame = -Infinity;
      $('[data-lab-compare]').disabled=!puppet.available;if(boardOpen)poseBoard();
    } catch (error) { if (!disposed && token === generation) {boardOpen=false;$('[data-lab-compare]').setAttribute('aria-expanded','false'); $('[data-lab-loading]').textContent = 'Preview unavailable'; notice(error.name === 'AbortError' ? 'Preview loading cancelled.' : 'A fitted layer could not be checked. Retry by choosing an outfit.'); } }
  }
  function stats() {
    const p = proposedLoadout(catalog, selection, tier), active = p.sets.filter(s => s.count > 0);
    $('[data-lab-stats]').innerHTML = `<details class="sl-proposal"><summary>Design stats &amp; set matches <span>Preview only</span></summary><span class="eyebrow">FUTURE RULES / PREVIEW ONLY</span><h3>Tier ${tier} · proposed minimum LVL ${tier}</h3><p>Candidate growth threshold: ${p.proposedXpThreshold.toLocaleString('en-US')} XP. Your verified Pet level and exact XP are unchanged.</p><div class="sl-stat-grid">${Object.entries(p.stats).map(([key, n]) => `<span><small>${key}</small><strong>+${n}</strong></span>`).join('')}</div>${active.map(set => `<div class="sl-set"><strong>${esc(set.name)}</strong><span>${set.count}/5 pieces · ${esc(set.role)}</span>${set.active ? `<small>Proposed 5-piece bonus: +${set.bonus.attackFlat} attack · +${set.bonus.damagePercent}% damage · +${set.bonus.defenseFlat} defence</small>` : '<small>Match five pieces to inspect the proposed set bonus.</small>'}</div>`).join('')}<small>These numbers are design previews. They are never sent to Arena builds or transactions.</small></details>`;
  }
  function equipped() { $('[data-lab-equipped]').innerHTML = Object.entries(selection).map(([slot, id]) => `<button data-lab-remove="${slot}" aria-label="Remove ${esc(catalog.items.find(item => item.id === id).name)}">${esc(catalog.items.find(item => item.id === id).name)} <span>×</span></button>`).join('') || '<span>No candidate gear selected.</span>'; }
  function pieces() {
    const query = $('[data-lab-search]').value.toLowerCase().trim(), slot = $('[data-lab-slot]').value, theme = $('[data-lab-theme]').value;
    const items = catalog.items.filter(item => (slot === 'all' || item.slot === slot) && (theme === 'all' || item.theme === theme) && (!query || `${item.name} ${item.description} ${item.garmentType || ''}`.toLowerCase().includes(query)));
    $('[data-lab-count]').textContent = `${items.length} / ${catalog.items.length} fitted styles · 473 candidate tier variants`;
    $('[data-lab-pieces]').innerHTML = items.map(item => `<article class="sl-piece" data-selected="${selection[item.slot] === item.id}"><button data-lab-family="${item.id}" aria-pressed="${selection[item.slot] === item.id}" aria-label="Try ${esc(item.name)}"><img src="${atelierMediaUrl(item.thumbnail.asset)}" width="240" height="360" loading="lazy" alt="${esc(item.name)}, full unworn candidate artwork"><span>${esc(item.garmentType || item.slot)} / ${esc(item.theme)}</span><strong>${esc(item.name)}</strong><small>Preview tier ${tier} · ${selection[item.slot] === item.id ? 'Selected ✓' : 'Try on +'}</small></button><button data-lab-art="${item.id}" class="sl-art-button">Inspect full artwork ↗</button></article>`).join('');
  }
  function changed() { selection = labSelection(catalog, selection); equipped(); stats(); pieces(); void paint(); }
  function poseBoard(){
    const board=$('[data-lab-board]');board.hidden=!boardOpen;if(!boardOpen)return;
    board.innerHTML='<p>Same outfit · four articulated still poses · Preview only.</p><div class="sl-pose-board-grid"></div>';
    const grid=board.querySelector('.sl-pose-board-grid');
    for(const name of ['attack','block','hit','victory']){const figure=document.createElement('figure'),view=document.createElement('canvas');view.width=320;view.height=480;view.setAttribute('aria-label',name+' equipped cosmetic pose');const c=view.getContext('2d');c.fillStyle='#101e2d';c.fillRect(0,0,320,480);if(background)c.drawImage(background,0,0,320,480);
      const frame=puppet?.render(sampleEquippedPose({study:name}));if(!frame){board.innerHTML='<p>Pose comparison unavailable. The fitted still portrait is preserved.</p>';return;}
      const unit=320/1024*.88;c.drawImage(frame,160+(-512-RIG_SPACE.padding)*unit,377+(-1207-RIG_SPACE.padding)*unit,(1024+RIG_SPACE.padding*2)*unit,(1536+RIG_SPACE.padding*2)*unit);
      c.fillStyle='#07141df0';c.fillRect(0,438,320,42);c.fillStyle='#e9eddd';c.font='bold 12px system-ui';c.textAlign='center';c.fillText(name.toUpperCase()+' / PREVIEW',160,464);figure.append(view);grid.append(figure);
    }
  }
  function moveLabels() { const moves = moveCatalog(lineage); $('[data-lab-move]').querySelectorAll('option').forEach(option => { if (option.value !== 'idle') option.textContent = moves[option.value].name; }); }
  function onChange(event) {
    if (!catalog || disposed) return;
    if (event.type === 'input' && !event.target.matches('[data-lab-search],[data-lab-tier],[data-lab-pose-mix]')) return;
    if (event.type === 'change' && event.target.matches('[data-lab-search],[data-lab-tier],[data-lab-pose-mix]')) return;
    if (event.target.matches('[data-lab-lineage]')) { lineage = event.target.value; moveLabels(); changed(); }
    if (event.target.matches('[data-lab-scene]')) { scene = event.target.value; void paint(); }
    if (event.target.matches('[data-lab-tier]')) { tier = Number(event.target.value); $('[data-lab-tier-copy]').textContent = tier; stats(); pieces(); }
    if (event.target.matches('[data-lab-move]')) { move = event.target.value; study='motion';$('[data-lab-pose]').value=study; actionAt = elapsedTime; lastFrame = -Infinity; }
    if (event.target.matches('[data-lab-pose]')&&(event.target.value==='motion'||POSE_NAMES.includes(event.target.value))) { study=event.target.value;lastFrame=-Infinity; }
    if (event.target.matches('[data-lab-pose-mix]')) { const value=Number(event.target.value);if(Number.isInteger(value)&&value>=0&&value<=100){poseMix=value/100;$('[data-lab-pose-copy]').textContent=value+'%';lastFrame=-Infinity;} }
    if (event.target.matches('[data-lab-outfit]')) { const outfit = catalog.presets.find(p => p.id === event.target.value); if (outfit) { selection = { ...outfit.selection }; changed(); } }
    if (event.target.matches('[data-lab-search],[data-lab-slot],[data-lab-theme]')) pieces();
  }
  function art(id) {
    const item = catalog.items.find(item => item.id === id); if (!item) return;
    root.querySelector('dialog')?.remove(); const dialog = document.createElement('dialog'); dialog.className = 'sl-art-dialog'; dialog.setAttribute('aria-label', item.name + ' candidate artwork'); dialog.innerHTML = `<button data-lab-art-close aria-label="Close artwork">×</button><span class="sl-preview-badge">PREVIEW / NOT ISSUED</span><h2>${esc(item.name)}</h2><img src="${atelierMediaUrl(item.itemArt.asset)}" width="1024" height="1536" alt="${esc(item.name)}, complete candidate Gear artwork">`;
    dialog.addEventListener('close', () => { dialog.remove(); root.querySelector(`[data-lab-art="${item.id}"]`)?.focus(); }); root.append(dialog); dialog.showModal();
  }
  async function onClick(event) {
    if (!catalog || disposed) return; const button = event.target.closest('button'); if (!button) return;
    if(button.dataset.labJump){const target=$(button.dataset.labJump==='preview'?'[data-lab-canvas]':'.sl-controls');refreshBudget();target.scrollIntoView?.({behavior:budget.reduced?'auto':'smooth',block:'start'});target.focus?.({preventScroll:true});return;}
    if (button.dataset.labFamily) { const item = catalog.items.find(item => item.id === button.dataset.labFamily); if (item) { selection[item.slot] = item.id; $('[data-lab-outfit]').value = ''; changed(); } }
    if (button.dataset.labRemove) { delete selection[button.dataset.labRemove]; $('[data-lab-outfit]').value = ''; changed(); }
    if (button.hasAttribute('data-lab-clear')) { selection = {}; $('[data-lab-outfit]').value = ''; changed(); }
    if (button.hasAttribute('data-lab-play')) { actionAt = elapsedTime;study='motion';$('[data-lab-pose]').value=study; paused = false; $('[data-lab-pause]').textContent = 'Pause'; $('[data-lab-pause]').setAttribute('aria-pressed', 'false'); }
    if (button.hasAttribute('data-lab-pause')) { paused = !paused; button.setAttribute('aria-pressed', String(paused)); button.textContent = paused ? 'Resume' : 'Pause'; lastFrame = -Infinity; }
    if(button.hasAttribute('data-lab-compare')){boardOpen=!boardOpen;button.setAttribute('aria-expanded',String(boardOpen));poseBoard();}
    if (button.dataset.labArt) art(button.dataset.labArt); if (button.hasAttribute('data-lab-art-close')) button.closest('dialog').close();
    if(button.hasAttribute('data-lab-use-arena')&&composite){saveArenaLook(catalog,lineage,selection);$('[data-lab-arena-notice]').textContent='Look saved · return to Arena to see it.';notice('Saved this browser’s cosmetic Arena look. Equipment, XP and combat stats are unchanged. Habitats stay in Style Lab.');}
    if (button.hasAttribute('data-lab-share')) {
      const fragment = new URLSearchParams({ 'style-lab': '1', lineage, tier: String(tier), scene, empty: Object.keys(selection).length ? '0' : '1', ...selection }), url = new URL(location.href); url.search = ''; url.username = ''; url.password = ''; url.hash = fragment.toString();
      try { await navigator.clipboard.writeText(url.href); notice('Cosmetic look link copied. No wallet, Pet ID or XP is included.'); } catch { notice('Clipboard unavailable. Your preview is still here.'); }
    }
    if (button.hasAttribute('data-lab-export') && composite) {renderPortrait();const filename=`axo-arena-preview-${lineage}-t${tier}-${study}.png`;canvas.toBlob(blob => { if (!blob || disposed) return; const url = URL.createObjectURL(blob), link = document.createElement('a'); urls.add(url); link.href = url; link.download = filename; link.click(); setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 1000); notice('Exported portrait is visibly marked Preview.'); });}
  }
  function draw(time) {
    if (disposed || !root.isConnected || document.hidden) return; raf = requestAnimationFrame(draw);
    refreshBudget();
    if (time - lastFrame < 1000 / budget.fps) return; const delta = lastTime ? Math.min(50, time - lastTime) : 0; lastTime = time; if (!paused) elapsedTime += delta; lastFrame = time;
    renderPortrait();
  }
  function refreshBudget(){if(preferences!==activePresentation()||reduced!==media.matches){preferences=activePresentation();reduced=media.matches;budget=presentationBudget(preferences,{reducedMotion:reduced,memory:navigator.deviceMemory||8,saveData:navigator.connection?.saveData===true});}}
  function renderPortrait(){
    refreshBudget();
    const m = fittedActorMotion(elapsedTime, Number.isFinite(actionAt) ? elapsedTime - actionAt : -1, { move, reduced: budget.reduced, tier }), color = LINEAGES[lineage].color;
    ctx.clearRect(0, 0, 600, 900); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 600, 900); if (background) ctx.drawImage(background, 0, 0, 600, 900);
    if (!background) { ctx.save(); ctx.translate(300, 710); ctx.scale(1, .22); ctx.beginPath(); ctx.arc(0, 0, 190, 0, Math.PI * 2); ctx.fillStyle = '#08151b'; ctx.fill(); ctx.strokeStyle = color; ctx.globalAlpha = .55; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
    if (composite) {
      const articulated=puppet?.render(sampleEquippedPose({time:elapsedTime,elapsed:move==='idle'?-1:Number.isFinite(actionAt)?elapsedTime-actionAt:-1,key:move==='idle'?'market_order':move,reduced:budget.reduced,study,mix:poseMix},poseSample));
      const status=articulated?'Articulated equipment · shared grip and foreground masks.':'Fitted still pose · animation unavailable on this device.';
      if(status!==animationStatus){animationStatus=status;$('[data-lab-pose-status]').textContent=status;$('[data-lab-pose]').disabled=!articulated;$('[data-lab-pose-mix]').disabled=!articulated;$('[data-lab-compare]').disabled=!articulated;if(!articulated){boardOpen=false;$('[data-lab-board]').hidden=true;$('[data-lab-compare]').setAttribute('aria-expanded','false');}}
      ctx.save();ctx.translate(300+m.x,707+m.y);ctx.rotate(m.rotation);ctx.globalAlpha=1;
      const zoom=.88,unit=600/1024*zoom;
      if(articulated)ctx.drawImage(articulated,(-512-RIG_SPACE.padding)*unit,(-1207-RIG_SPACE.padding)*unit,(1024+RIG_SPACE.padding*2)*unit,(1536+RIG_SPACE.padding*2)*unit);
      else ctx.drawImage(composite,-512*unit,-1207*unit,1024*unit,1536*unit);ctx.restore();
    }
    if (m.trail > .01 && !budget.reduced) {
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.globalAlpha = m.trail * .65; ctx.lineWidth = 3;
      if (['shield','counter'].includes(m.effect)) { ctx.beginPath(); ctx.ellipse(400, 470, 105, 150, -.12, -1.5, 1.5); ctx.stroke(); ctx.globalAlpha *= .2; ctx.fill(); }
      else if (['garden','support','energy','question'].includes(m.effect)) { for (let i = 0; i < budget.particles; i++) { const a = i * 2.4 + elapsedTime / 800, radius = 70 + i * 8; ctx.beginPath(); ctx.arc(300 + Math.cos(a) * radius, 540 - Math.sin(a) * 75 - m.impact * 70, 2 + i % 3, 0, Math.PI * 2); ctx.fill(); } }
      else { ctx.beginPath(); ctx.moveTo(405, 410); ctx.bezierCurveTo(510, 380 - m.impact * 80, 580, 470, 590, 370); ctx.stroke(); if (m.effect === 'epic') { ctx.globalAlpha *= .5; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(300, 460, 160 + m.impact * 30, 0, Math.PI * 2); ctx.stroke(); } }
      ctx.restore();
    }
    ctx.fillStyle = '#07141de8'; ctx.fillRect(0, 823, 600, 77); ctx.fillStyle = '#d9eaff'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PREVIEW / COSMETIC ONLY', 300, 850); ctx.font = '12px system-ui'; ctx.fillStyle = '#91afc2'; ctx.fillText(`REFERENCE ${LINEAGES[lineage].short.toUpperCase()} · TIER ${tier} · ${study==='motion'?(move==='idle'?'Idle':moveCatalog(lineage)[move].name):study.toUpperCase()}`, 300, 875);
  }
  function visibility() { cancelAnimationFrame(raf); lastTime = 0; lastFrame = -Infinity; if (!document.hidden && !disposed) raf = requestAnimationFrame(draw); }
  document.addEventListener('visibilitychange', visibility);
  root.addEventListener('change', onChange); root.addEventListener('input', onChange); root.addEventListener('click', onClick); raf = requestAnimationFrame(draw);
  const ready = (async () => {
    const response = await fetcher('/arena/atelier/catalog.json', { credentials: 'omit', redirect: 'error', signal: signal() }); if (!response.ok) throw Error('Wardrobe catalog unavailable.');
    const bytes = await response.arrayBuffer(); if (bytes.byteLength > 4 * 1024 * 1024 || await hash(bytes) !== ATELIER_CATALOG_SHA256) throw Error('Wardrobe catalog integrity mismatch.');
    if (disposed) return; catalog = JSON.parse(new TextDecoder().decode(bytes)); manifest = atelierManifest(catalog);
    $('[data-lab-outfit]').innerHTML += catalog.presets.map(outfit => `<option value="${outfit.id}">${esc(outfit.name)}</option>`).join('');
    $('[data-lab-scene]').innerHTML += catalog.scenes.map(stage => `<option value="${stage.id}">${esc(stage.name)}</option>`).join('');
    $('[data-lab-slot]').innerHTML += catalog.slots.map(slot => `<option value="${slot}">${slot}</option>`).join(''); $('[data-lab-theme]').innerHTML += [...new Set(catalog.items.map(item => item.theme))].sort().map(theme => `<option value="${theme}">${esc(theme)}</option>`).join('');
    selection = {}; $('[data-lab-outfit]').value = '';
    try { if (params.get('lineage') && Object.hasOwn(LINEAGES, params.get('lineage'))) lineage = params.get('lineage'); if (params.has('tier')) { const n = Number(params.get('tier')); if (!Number.isInteger(n) || n < 10 || n > 20) throw Error('Invalid tier.'); tier = n; } const picks = Object.fromEntries(catalog.slots.filter(slot => params.has(slot)).map(slot => [slot, params.get(slot)])); if (Object.keys(picks).length) selection = labSelection(catalog, picks); } catch { notice('Unavailable look parameters were ignored. This is a cosmetic reference preview.'); }
    if (params.get('empty') === '1') selection = {};
    else if(!catalog.slots.some(slot=>params.has(slot))) selection=arenaLook(catalog,lineage);
    if (params.has('empty') || catalog.slots.some(slot => params.has(slot))) $('[data-lab-outfit]').value = '';
    if (catalog.scenes.some(stage => stage.id === params.get('scene'))) scene = params.get('scene');
    $('[data-lab-scene]').value = scene;
    $('[data-lab-lineage]').value = lineage; moveLabels(); $('[data-lab-tier]').value = tier; $('[data-lab-tier-copy]').textContent = tier; equipped(); stats(); pieces(); await paint();
  })().catch(() => { if (!disposed) { $('[data-lab-loading]').textContent = 'Wardrobe unavailable'; notice('The pinned wardrobe could not be loaded. Combat and verified equipment are unchanged.'); } });
  return { ready, destroy() { disposed = true; generation++; abort.abort(); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); root.removeEventListener('change', onChange); root.removeEventListener('input', onChange); root.removeEventListener('click', onClick); root.querySelector('dialog')?.remove(); cache.clear(); puppet?.destroy();puppet=null;composite = null; background = null; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); } };
}
