// Include this module in the existing Hatchery document. It mounts only the Wardrobe view.
if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
const requested = location.pathname.replace(/\/$/, '') === '/hatchery' && new URLSearchParams(location.search).get('view') === 'wardrobe';
const switcher = document.querySelector('.pet-view-switcher');
if (switcher && !switcher.querySelector('[data-pet-view="wardrobe"]')) {
  const link = document.createElement('a'); link.href = '/hatchery?view=wardrobe'; link.dataset.petView = 'wardrobe';
  const title = document.createElement('span'); title.textContent = 'WARDROBE'; const subtitle = document.createElement('small'); subtitle.textContent = 'Equipped + preview'; link.append(title, subtitle); switcher.append(link);
}
for (const nav of document.querySelectorAll('.pet-ecosystem-nav,.pet-view-switcher')) {
  for (const link of nav.querySelectorAll('a[href="/marketplace#my-gear"]')) link.href = '/hatchery?view=wardrobe';
}
if (requested) {
  document.documentElement.dataset.hatcheryView = 'wardrobe';
  document.querySelectorAll('.pet-ecosystem-nav a').forEach(link => { const current = link.getAttribute('href') === '/hatchery?view=wardrobe'; if (current || link.getAttribute('href') === '/hatchery?view=pet') link.classList.toggle('active', current); if (current) link.setAttribute('aria-current', 'page'); });
  switcher?.querySelectorAll('[data-pet-view]').forEach(link => { const current = link.dataset.petView === 'wardrobe'; link.classList.toggle('active', current); if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  let root = document.querySelector('[data-axo-wardrobe]');
  if (!root) { const host = document.querySelector('main.hatchery-dashboard'); if (!host) throw Error('Existing Hatchery mount point unavailable.'); root = document.createElement('section'); root.dataset.axoWardrobe = ''; host.append(root); }
  if (!document.querySelector('link[href="/wardrobe/wardrobe.css"]')) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/wardrobe/wardrobe.css'; document.head.append(css); }
  document.title = 'My AXO Wardrobe — Hatchery';
  const { mountWardrobe } = await import('./view.mjs');
  const mounted = await mountWardrobe(root); window.addEventListener('pagehide', () => mounted.dispose(), { once: true });
}
