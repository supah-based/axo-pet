import { STATS } from './catalog.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function verifiedPetPanel(me, { synthetic = false } = {}) {
  const pet = me.pet, verified = pet.identitySource === 'AUTHENTICATED_PET_READ_V1', proof = me.verification;
  if (!verified) return '<p class="muted">Synthetic review Pet. No live identity or equipment is connected.</p>';
  const items = pet.gearLoadout || [], stats = pet.gearStats || {};
  return `<section class="verified-pet-panel" aria-label="Pet identity and equipped gear">
    <div class="verified-pet-heading"><span class="eyebrow">${synthetic ? 'SYNTHETIC PIPELINE REVIEW' : 'SHARED VERIFIED PET'}</span><h3>${esc(pet.name)}</h3><p>${esc(pet.genesisId)} · V1 level ${pet.level} · <strong>${pet.xp.toLocaleString('en-US')} exact XP</strong></p></div>
    <dl class="verified-pet-facts"><div><dt>Equipment</dt><dd>${proof?.equipmentStatus === 'NOT_MINTED' ? 'Not minted · gear unavailable by design' : items.length ? `${items.length} equipped V1 items` : 'Verified empty V1 loadout'}</dd></div><div><dt>Revision</dt><dd>${pet.gearRevision}</dd></div>${proof?.blockNumber ? `<div><dt>Equipment block</dt><dd>${proof.blockNumber}</dd></div>` : ''}</dl>
    <button data-action="equipped-poses">Preview fitted cosmetic poses ↗</button><h4>Equipped gear contribution</h4><div class="verified-gear-stats">${STATS.map(key => `<span><small>${key}</small><strong>+${Number(stats[key] || 0)}</strong></span>`).join('')}</div>
    ${items.length ? `<ul class="verified-gear-list">${items.map(item => `<li><span>${esc(item.slot)}</span><strong>#${item.id}</strong><small>${STATS.filter(key => item.arenaStats[key]).map(key => `+${item.arenaStats[key]} ${key}`).join(' · ')}</small></li>`).join('')}</ul>` : ''}
    <p class="verified-pet-policy"><strong>Frozen when you enter.</strong> Each battle keeps its entry XP, moves and equipped bonuses. Equipment or XP changes apply to your next entry.</p>
    <aside class="cosmetic-only"><span class="eyebrow">PREVIEW OUTFITS · COSMETIC ONLY</span><p>Arena Preview clothing and saved Wardrobe styles grant no ownership, equipment, combat stats or set bonuses. Level 11–20 gear transactions remain locked.</p><a href="/hatchery?view=wardrobe">Open My AXO Wardrobe ↗</a> <a href="/passport">Pet Passport ↗</a></aside>
    ${proof ? `<small class="verified-pet-time">Observed ${esc(proof.observedAt)} · refreshed by the server for each Arena request.</small>` : ''}
  </section>`;
}
