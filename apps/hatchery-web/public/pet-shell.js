'use strict';

(() => {
  const host = String(window.location.hostname || '').toLowerCase();
  const petHost = ['axo.pet', 'www.axo.pet'].includes(host);
  const localPreview = !!document.querySelector('[aria-label="Local development preview"]');
  if (!petHost && !localPreview) return;
  document.documentElement.dataset.axoPetHost = 'true';
  const query = new URLSearchParams(window.location.search);
  const legacyPanel = query.get('panel');
  const questHash = /^#(?:quest|daily|contracts|social|ledger|corroboration)/i.test(window.location.hash);
  const view = query.get('view') === 'wardrobe' && routeIsHatchery() ? 'wardrobe' : query.get('view') === 'quests' || legacyPanel === 'quests' || questHash ? 'quests' : 'pet';
  function routeIsHatchery() { return window.location.pathname.replace(/\/$/, '') === '/hatchery'; }
  document.documentElement.dataset.hatcheryView = view;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (petHost && canonical) canonical.href = `https://axo.pet${window.location.pathname}`;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (petHost && ogUrl) ogUrl.content = `https://axo.pet${window.location.pathname}`;

  const route = window.location.pathname;
  const active = (key) => {
    if (key === 'my') return route === '/my-axo';
    if (key === 'pet') return route === '/hatchery' && view === 'pet';
    if (key === 'quests') return route === '/hatchery' && view === 'quests';
    if (key === 'nft') return route === '/nft';
    if (key === 'epochs') return route === '/hatchery/leaderboard' || route === '/hatchery/claims';
    return false;
  };
  const header = document.createElement('header');
  header.className = 'pet-ecosystem-nav';
  header.dataset.petEcosystemNav = '';
  header.innerHTML = `<a class="pet-ecosystem-brand" href="/" aria-label="AXO.pet home"><img src="/brand/axo-square-logo-v2.webp" width="46" height="46" alt=""><span><b>AXO</b><em>.pet</em><small>HATCHERY ECOSYSTEM</small></span></a><button class="pet-ecosystem-menu" type="button" aria-expanded="false" aria-controls="pet-ecosystem-links"><span></span><span></span><span></span>MENU</button><nav class="pet-ecosystem-links" id="pet-ecosystem-links" aria-label="AXO Pet navigation"><a class="${active('my') ? 'active' : ''}" href="/my-axo">MY AXO</a><a class="${active('pet') ? 'active' : ''}" href="/hatchery?view=pet">MY PET</a><a class="${active('quests') ? 'active' : ''}" href="/hatchery?view=quests">QUESTS</a><a class="${active('nft') ? 'active' : ''}" href="/nft">NFT</a><a href="https://www.axo.vision/epoch">EPOCH</a><a href="/marketplace#my-gear">WARDROBE</a><a class="axo-arena-link" href="/arena/">AXO ARENA</a><a href="/marketplace">BAZAAR</a><button type="button" data-wallet-connect>CONNECT WALLET</button></nav>`;
  document.body.prepend(header);
  const menu = header.querySelector('.pet-ecosystem-menu');
  menu.addEventListener('click', () => {
    const open = header.dataset.open !== 'true';
    header.dataset.open = String(open);
    menu.setAttribute('aria-expanded', String(open));
  });
  header.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    header.dataset.open = 'false';
    menu.setAttribute('aria-expanded', 'false');
  }));

  const switcher = document.querySelector('.pet-view-switcher');
  switcher?.querySelector(`[data-pet-view="${view}"]`)?.classList.add('active');
  if (route === '/nft') switcher?.querySelector('a[href="/nft"]')?.classList.add('active');
  if (!document.body.classList.contains('game-page')) {
    const footer = document.createElement('footer');
    footer.className = 'pet-ecosystem-footer';
    footer.innerHTML = '<span>AXO PET · ROBINHOOD CHAIN 4663 · NFA / DYOR</span><nav><a href="/">ECOSYSTEM</a><a href="/hatchery/claims">REWARD STATUS</a><a href="https://www.axo.vision">AXO.VISION</a></nav>';
    document.body.append(footer);
  }
})();

