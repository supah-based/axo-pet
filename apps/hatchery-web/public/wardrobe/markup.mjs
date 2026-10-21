export const wardrobeMarkup = `
  <header class="aw-heading">
    <div><p class="aw-eyebrow">MY AXO WARDROBE <span>01 / PERSONAL STYLE</span></p><h1>A little more<br><em>you.</em></h1><p>Your Pet. Your look. Keep the gear you have separate from the styles you’re imagining.</p></div>
    <div class="aw-connection"><span class="aw-state" data-state>CONNECT YOUR PET</span><button type="button" data-connect>Connect wallet ↗</button><button type="button" data-refresh>Refresh Pet</button><small data-session-copy>Use the wallet that hatched your AXO.</small></div>
  </header>
  <p class="aw-notice" data-notice role="status" aria-live="polite">Connect to read your Pet. You can browse the collection while you wait.</p>
  <div class="aw-layout">
    <aside class="aw-aside">
      <section class="aw-preview" data-preview-panel aria-labelledby="aw-preview-title">
        <header><div><small>THE FITTING ROOM</small><h2 id="aw-preview-title">Your next look.</h2></div><strong class="aw-preview-badge">PREVIEW</strong></header>
        <canvas data-portrait width="1024" height="1536" role="img" aria-label="Reference AXO fitting canvas. Connect your Pet to try on clothing."></canvas>
        <p class="aw-caption" data-portrait-copy>Reference Pet · adult fitting model · 2:3</p>
        <div class="aw-scene-controls"><label>Backdrop<select data-scene aria-label="Preview backdrop"></select></label><label>Base painting<select data-appearance aria-label="Preview base painting"><option value="lineage">Lineage painting</option><option value="original">Original lineage</option></select></label></div>
        <div class="aw-share"><button type="button" data-download disabled>Create Preview PNG ↓</button><button type="button" data-share disabled>Share portrait ↗</button></div>
        <small class="aw-boundary">Cosmetic try-on. No ownership, equipment change or stat bonus. Every exported portrait is marked Preview.</small>
      </section>
      <section class="aw-authority" aria-labelledby="aw-authority-title">
        <header><small>YOUR ACTUAL PET</small><h2 id="aw-authority-title" data-pet-name>Waiting for your AXO.</h2></header>
        <dl class="aw-facts"><div><dt>Exact Pet XP</dt><dd data-pet-xp>—</dd></div><div><dt>Verified V1 level</dt><dd data-pet-level>—</dd></div><div><dt>Lineage</dt><dd data-pet-lineage>—</dd></div></dl>
        <div class="aw-v1-portrait"><canvas data-authority-portrait width="1024" height="1024" role="img" aria-label="Authoritative Pet appearance unavailable" hidden></canvas><p data-authority-image-status>Verified Pet appearance appears after a fresh read.</p></div>
        <h3>Authoritative V1 equipment</h3><p data-v1-status>No equipment read yet.</p><ul class="aw-v1-items" data-v1-items></ul>
        <small>Read from the wallet’s verified identity and V1 projection. Preview clothing never enters this list.</small>
      </section>
      <section class="aw-locks" aria-label="V2 Gear transaction locks"><strong>Real Gear comes later.</strong><p>V2 contracts and numeric item mappings need verification before equipment or trading can open.</p><div><button type="button" disabled>V2 equip locked</button><button type="button" disabled>Trading locked</button></div></section>
    </aside>
    <div class="aw-workspace">
      <section class="aw-current" aria-label="Current preview outfit"><div><small>TRYING ON <b data-worn-count>0 PIECES</b></small><button type="button" data-clear>Clear look</button></div><ul data-worn></ul><p data-empty-look>Start with one piece, or choose a complete look.</p></section>
      <nav class="aw-tabs" aria-label="Wardrobe sections"><button type="button" data-tab="pieces" aria-pressed="true">Pieces <span>43</span></button><button type="button" data-tab="outfits" aria-pressed="false">Complete looks</button><button type="button" data-tab="saved" aria-pressed="false">Saved previews</button></nav>
      <section data-panel="pieces" aria-label="Browse preview styles">
        <div class="aw-browse-heading"><div><p class="aw-eyebrow">A WARDROBE, NOT AN INVENTORY</p><h2>Find your thing.</h2></div><label class="aw-tier">Preview item tier<select data-tier aria-label="Preview item tier"></select></label></div>
        <p class="aw-tier-copy" data-tier-copy>Each tier is a cosmetic preview of a future item definition. Your real XP and level stay unchanged.</p>
        <div class="aw-filters"><label class="aw-search">Find a style<input data-search type="search" maxlength="80" placeholder="Sweater, moon, node…" aria-label="Find a preview style"></label><label>Clothing & slots<select data-cut aria-label="Clothing and slots filter"></select></label><label>Style<select data-theme aria-label="Style filter"></select></label></div>
        <div class="aw-results"><span data-count>Reading the collection…</span><small>ALL STYLES ARE PREVIEW ONLY</small></div>
        <div class="aw-cards" data-pieces></div>
      </section>
      <section data-panel="outfits" aria-label="Complete preview outfits" hidden><div class="aw-browse-heading"><div><p class="aw-eyebrow">START SOMEWHERE GOOD</p><h2>A whole mood.</h2></div></div><p>Try a complete look, then make it yours. Coordinated styles grant no set bonus here.</p><div class="aw-outfits" data-outfits></div></section>
      <section data-panel="saved" aria-label="Saved preview outfits" hidden><div class="aw-browse-heading"><div><p class="aw-eyebrow">YOUR PERSONAL LOOKBOOK</p><h2>Keep the good ones.</h2></div></div><p>Saved only in this browser, separately for each verified wallet and Pet. Outfits contain style choices, never identity, XP or owned Gear.</p><form data-save-form><label>Name this look<input data-outfit-name maxlength="40" autocomplete="off" placeholder="My off-chain era" required></label><button type="submit" data-save-look disabled>Save preview +</button></form><p data-saved-message>Connect your Pet to open its saved previews.</p><div class="aw-saved" data-saved></div></section>
    </div>
  </div>
  <nav class="aw-mobile" aria-label="Mobile Wardrobe controls"><button type="button" data-mobile="preview">View look <span data-mobile-count>0</span></button><button type="button" data-mobile="pieces">Browse</button><button type="button" data-mobile="saved">Save a look</button></nav>
  <dialog class="aw-export" data-export-dialog aria-labelledby="aw-export-title"><header><div><small>SHARE YOUR STYLE</small><h2 id="aw-export-title">Your Preview portrait.</h2></div><button type="button" data-export-close aria-label="Close Preview portrait">×</button></header><img data-export-image width="1024" height="1536" alt="Your cosmetic AXO portrait, permanently marked Preview"><p>This PNG contains the Preview label, cosmetic outfit and lineage painting. No wallet address, exact XP or ownership claim is included.</p><a data-export-link download="axo-pet-preview.png">Download Preview PNG ↓</a></dialog>
`;
