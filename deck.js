/* ========================================================================
   DECK RUNTIME — generic Cargo film deck controller
   alextyson.net — hosted via GitHub + jsDelivr CDN
   ======================================================================== */
(function() {
  'use strict';
  
  const RUNTIME_STYLE_ID = 'deck-runtime-style';
  const BODY_ACTIVE_CLASS = 'deck-runtime-active';
  const CONFIG_HIDDEN_CLASS = 'deck-config-page';
  const SLIDE_SELECTOR = '.page.stacked-page';
  const CONFIG_MARKER_PATTERN = /\bdeck-config\s*:\s*true\b/i;
  const MAX_DOM_WAIT = 40;
  const DOM_WAIT_DELAY = 250;
  const MOUNT_FLAG = '__deckRuntimeMounted';
  const FADE_MS = 200;
  const ALLOWED_VIDEO_HOSTS = [
    'player.vimeo.com', 'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'
  ];
  
  /* Hash helper exposed before any short-circuit so it's always callable
     in the console. Usage: await deckHash('myPassword') */
  window.deckHash = async function(password) {
    if (typeof password !== 'string' || !password.length) {
      console.warn('Usage: await deckHash("yourpassword")');
      return null;
    }
    const hash = await sha256Hex(password);
    console.log('%c[Deck] password hash for "' + password + '":', 'color:#7cf;font-weight:bold');
    console.log('%c' + hash, 'font-family:monospace;font-size:13px;color:#fff');
    console.log('%cAdd this line to _config:', 'color:#7cf');
    console.log('%cpassword-hash: ' + hash, 'font-family:monospace;color:#fff');
    return hash;
  };
  
  if (window[MOUNT_FLAG]) return;
  window[MOUNT_FLAG] = true;
  
  /* Bail out inside iframes — Cargo's editor previews the site in an
     iframe, and we don't want the runtime hijacking the edit view. */
  if (window.self !== window.top) return;
  
  const state = {
    schema: null, activeIndex: 0,
    audio: null, audioUnlocked: false,
    picker: null, pickerLabel: null, pickerList: null, pickerTooltip: null,
    config: null
  };
  
  injectStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  
  function boot() {
    waitForSlides(function(slides) {
      const found = detectConfig(slides);
      if (!found) return;
      
      const deckParent = found.configPage.parentElement;
      const deckSlides = slides.filter(function(s) {
        return s !== found.configPage && s.parentElement === deckParent;
      });
      if (deckSlides.length === 0) return;
      
      state.config = found.config;
      mount(deckSlides, found.config);
      observeChanges();
    });
  }
  
  /* ---------- STYLES ---------- */
  function injectStyles() {
    if (document.getElementById(RUNTIME_STYLE_ID)) return;
    const css = '' +
      '.' + CONFIG_HIDDEN_CLASS + ' { display: none !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' {' +
        'background: var(--deck-fade-bg, #000) !important;' +
        'overflow: hidden !important; margin: 0 !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .page.stacked-page {' +
        'position: absolute !important; inset: 0 !important;' +
        'opacity: 0 !important; pointer-events: none;' +
        'transition: opacity 0.2s ease !important;' +
        'z-index: 1; overflow-y: auto;' +
        'justify-content: var(--deck-slide-justify, center);' +
        'align-items: var(--deck-slide-align, center);' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .page.stacked-page.deck-leaving {' +
        'z-index: 2 !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .page.stacked-page.deck-active {' +
        'opacity: 1 !important; pointer-events: auto !important; z-index: 2 !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .page.stacked-page .page-content {' +
        'background: transparent !important; border: 0 !important; box-shadow: none !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .page.stacked-page bodycopy {' +
        'color: var(--deck-text-color, rgba(255, 255, 255, 0.92));' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-bg-layer {' +
        'position: fixed !important; inset: 0 !important;' +
        'z-index: 0 !important; pointer-events: none !important;' +
        'overflow: hidden !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-bg-layer iframe {' +
        'position: absolute !important; top: 50% !important; left: 50% !important;' +
        'height: 100vh !important; width: 195.92vh !important;' +
        'transform: translate(-50%, -50%) !important;' +
        'border: 0 !important; pointer-events: none !important;' +
        'opacity: var(--deck-bg-opacity, 0.3);' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-ui {' +
        'position: fixed !important;' +
        'z-index: 9999 !important;' +
        'font-family: \'Favorit Variable\', sans-serif !important;' +
        'color: #fff !important;' +
        'margin: 0 !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-ui-picker { top: 20px !important; left: 20px !important; right: auto !important; bottom: auto !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-ui-radio { top: 20px !important; right: 20px !important; left: auto !important; bottom: auto !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker {' +
        'position: fixed !important;' +
        'display: flex !important; align-items: center !important; gap: 16px !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-btn {' +
        'background: transparent !important; border: none !important; color: #fff !important;' +
        'cursor: pointer !important; padding: 0 !important;' +
        'display: flex !important; align-items: center !important; gap: 6px !important;' +
        'font: inherit !important; font-size: 11px !important;' +
        'letter-spacing: 0.22em !important; text-transform: uppercase !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-arrow {' +
        'display: inline-block !important; font-size: 9px !important; transition: transform 0.2s ease;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker.open .deck-picker-arrow { transform: rotate(180deg); }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-tooltip {' +
        'display: inline-flex !important; align-items: center !important; gap: 6px !important;' +
        'font-size: 9px !important; letter-spacing: 0.2em !important; text-transform: uppercase !important;' +
        'color: rgba(255,255,255,0.4) !important; pointer-events: none !important;' +
        'transition: opacity 0.4s ease, visibility 0s linear 0s;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-tooltip.hidden {' +
        'opacity: 0 !important; visibility: hidden !important;' +
        'transition: opacity 0.4s ease, visibility 0s linear 0.4s;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-list {' +
        'position: absolute !important; top: 28px !important; left: 0 !important; min-width: 240px !important;' +
        'opacity: 0; visibility: hidden;' +
        'transition: opacity 0.25s ease, visibility 0s linear 0.25s;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker.open .deck-picker-list {' +
        'opacity: 1 !important; visibility: visible !important;' +
        'transition: opacity 0.25s ease, visibility 0s;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-list ul { list-style: none !important; padding: 16px 0 0 0 !important; margin: 0 !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-list li {' +
        'font-size: 11px !important; letter-spacing: 0.18em !important; text-transform: uppercase !important;' +
        'color: rgba(255,255,255,0.4) !important; padding: 5px 0 !important; cursor: pointer !important;' +
        'transition: color 0.2s ease; display: flex !important; gap: 14px !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-list li:hover,' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-list li.current { color: #fff !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-list li .num { opacity: 0.55 !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-picker-hint {' +
        'display: flex !important; align-items: center !important; gap: 7px !important;' +
        'margin-top: 14px !important; padding-top: 12px !important;' +
        'border-top: 1px solid rgba(255,255,255,0.15) !important;' +
        'font-size: 9px !important; letter-spacing: 0.2em !important;' +
        'text-transform: uppercase !important; color: rgba(255,255,255,0.4) !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-kbd {' +
        'display: inline-flex !important; align-items: center !important; justify-content: center !important;' +
        'min-width: 16px !important; height: 16px !important; padding: 0 3px !important;' +
        'border: 1px solid rgba(255,255,255,0.3) !important; border-radius: 3px !important;' +
        'font-size: 10px !important; line-height: 1 !important; color: rgba(255,255,255,0.7) !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-radio {' +
        'display: flex !important; align-items: center !important; gap: 8px !important;' +
        'cursor: pointer !important; user-select: none !important;' +
        '-webkit-tap-highlight-color: transparent !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-radio-label {' +
        'font-size: 11px !important; letter-spacing: 0.22em !important;' +
        'text-transform: uppercase !important; line-height: 1 !important;' +
        'text-decoration-line: line-through !important;' +
        'text-decoration-color: #ff6a1a !important;' +
        'text-decoration-thickness: 2px !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-radio.unlocked .deck-radio-label {' +
        'text-decoration-line: none !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-radio-arc { opacity: 0; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-radio.unlocked .deck-radio-arc-inner {' +
        'animation: deckArcPulse 2.6s ease-in-out infinite;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-radio.unlocked .deck-radio-arc-outer {' +
        'animation: deckArcPulse 2.6s ease-in-out infinite 0.5s;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-nav-next {' +
        'top: 50% !important; right: 24px !important; left: auto !important; bottom: auto !important;' +
        'width: 28px !important; height: 28px !important;' +
        'color: rgba(255,255,255,0.5) !important; cursor: pointer !important;' +
        'transform: translateY(-50%);' +
        'transition: color 0.2s ease, transform 0.2s ease;' +
        'display: flex !important; align-items: center !important; justify-content: center !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-nav-next:hover {' +
        'color: #fff !important; transform: translateY(-50%) translateX(3px);' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-overlay {' +
        'position: fixed !important; inset: 0 !important;' +
        'z-index: 99999 !important;' +
        'background: rgba(0, 0, 0, 0.85) !important;' +
        'display: flex !important; flex-direction: column !important;' +
        'align-items: center !important; justify-content: center !important;' +
        'gap: 36px !important;' +
        'font-family: \'Favorit Variable\', sans-serif !important;' +
        'opacity: 1; transition: opacity 0.4s ease;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-overlay.fade-out { opacity: 0 !important; }' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-title {' +
        'color: #fff !important; font-size: 22px !important;' +
        'letter-spacing: 0.3em !important; text-transform: uppercase !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-form {' +
        'display: flex !important; flex-direction: column !important;' +
        'align-items: center !important; gap: 14px !important; min-width: 280px !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-label {' +
        'color: rgba(255,255,255,0.5) !important;' +
        'font-size: 10px !important; letter-spacing: 0.25em !important; text-transform: uppercase !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-input {' +
        'background: transparent !important; border: none !important;' +
        'border-bottom: 1px solid rgba(255,255,255,0.3) !important;' +
        'color: #fff !important; font: inherit !important; font-size: 14px !important;' +
        'letter-spacing: 0.15em !important; padding: 10px 0 !important; width: 100% !important;' +
        'outline: none !important; text-align: center !important;' +
        'transition: border-color 0.2s ease;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-input:focus {' +
        'border-bottom-color: rgba(255,255,255,0.7) !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-submit {' +
        'background: transparent !important; border: 1px solid rgba(255,255,255,0.3) !important;' +
        'color: #fff !important; font: inherit !important;' +
        'font-size: 11px !important; letter-spacing: 0.25em !important; text-transform: uppercase !important;' +
        'padding: 12px 24px !important; cursor: pointer !important; margin-top: 12px !important;' +
        'transition: background 0.2s ease, border-color 0.2s ease;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-submit:hover {' +
        'background: rgba(255,255,255,0.05) !important;' +
        'border-color: rgba(255,255,255,0.7) !important;' +
      '}' +
      'body.' + BODY_ACTIVE_CLASS + ' .deck-pw-error {' +
        'color: #ff6a1a !important;' +
        'font-size: 10px !important; letter-spacing: 0.2em !important; text-transform: uppercase !important;' +
        'min-height: 14px !important; margin-top: 4px !important;' +
      '}' +
      '@keyframes deckArcPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }' +
      '@media (prefers-reduced-motion: reduce) {' +
        'body.' + BODY_ACTIVE_CLASS + ' * { transition-duration: 1ms !important; animation-duration: 1ms !important; }' +
      '}';
    const styleEl = document.createElement('style');
    styleEl.id = RUNTIME_STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
  
  /* ---------- DOM WAIT ---------- */
  function waitForSlides(callback) {
    let attempts = 0;
    (function tick() {
      const slides = document.querySelectorAll(SLIDE_SELECTOR);
      if (slides.length > 0) { callback(Array.from(slides)); return; }
      if (++attempts < MAX_DOM_WAIT) setTimeout(tick, DOM_WAIT_DELAY);
      else callback([]);
    })();
  }
  
  /* ---------- CONFIG DETECTION ---------- */
  function detectConfig(slides) {
    for (let i = 0; i < slides.length; i++) {
      const text = slides[i].textContent || '';
      if (CONFIG_MARKER_PATTERN.test(text)) {
        slides[i].classList.add(CONFIG_HIDDEN_CLASS);
        return {
          config: parseConfigText(text),
          configPage: slides[i]
        };
      }
    }
    return null;
  }
  
  function parseConfigText(text) {
    const keyPattern = /(?:^|\s)([a-z][a-z0-9-]+)\s*:\s*/g;
    const matches = [];
    let m;
    while ((m = keyPattern.exec(text)) !== null) {
      matches.push({
        key: m[1].toLowerCase(),
        matchStart: m.index,
        valueStart: m.index + m[0].length
      });
    }
    const config = {};
    for (let i = 0; i < matches.length; i++) {
      const valueEnd = (i + 1 < matches.length) ? matches[i + 1].matchStart : text.length;
      config[matches[i].key] = text.slice(matches[i].valueStart, valueEnd).trim();
    }
    return config;
  }
  
  /* Per-deck CSS variables.
       bg-opacity  — background video opacity (0–1)
       bg-color    — solid color shown beneath the deck and during slide
                     fade gaps (any CSS color, e.g. #FCF7F5) */
  function applyConfigVars(config) {
    const op = config['bg-opacity'];
    if (op != null && op !== '') {
      const num = parseFloat(op);
      if (!isNaN(num) && num >= 0 && num <= 1) {
        document.body.style.setProperty('--deck-bg-opacity', String(num));
      }
    }
    const bgColor = config['bg-color'];
    if (bgColor && bgColor.trim()) {
      document.body.style.setProperty('--deck-fade-bg', bgColor.trim());
    }
  }
  
  /* ---------- SCHEMA ---------- */
  function buildSchema(slides, config) {
    return {
      deckTitle: (config['deck-title'] || 'DECK').toUpperCase(),
      slides: slides.map(function(el, i) {
        const title = readSlideTitle(el, i);
        return { index: i, element: el, title: title, slug: slugify(title) };
      })
    };
  }
  
  function readSlideTitle(el, index) {
    const explicit = el.getAttribute('data-slide-title');
    if (explicit) return explicit.trim().toUpperCase();
    
    const pageUrl = el.getAttribute('page-url');
    if (pageUrl) {
      const t = deslugify(pageUrl);
      if (t) return t;
    }
    
    const heading = el.querySelector('h1, h2, h3');
    if (heading && heading.textContent.trim()) {
      return heading.textContent.trim().toUpperCase();
    }
    
    return 'SLIDE ' + String(index + 1).padStart(2, '0');
  }
  
  function deslugify(slug) {
    return slug
      .replace(/-\d+$/, '')
      .replace(/^\d+[-_]/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .toUpperCase();
  }
  
  function slugify(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  
  /* ---------- HASH ---------- */
  async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(function(b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }
  
  /* ---------- URL VALIDATION ---------- */
  function safeVideoUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:') return null;
      if (!ALLOWED_VIDEO_HOSTS.includes(u.hostname.toLowerCase())) return null;
      return u.toString();
    } catch (e) { return null; }
  }
  
  function safeAudioUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:') return null;
      return u.toString();
    } catch (e) { return null; }
  }
  
  /* ---------- MOUNT ---------- */
  function mount(slides, config) {
    state.schema = buildSchema(slides, config);
    if (state.schema.slides.length === 0) return;
    document.body.classList.add(BODY_ACTIVE_CLASS);
    applyConfigVars(config);
    if (config['video-url']) mountBgVideo(config['video-url']);
    
    const finishMount = function() {
      if (config['audio-url']) mountAudio(config['audio-url']);
      mountPicker();
      mountNavNext();
      activate(0);
      bindKeyboard();
    };
    
    const rawHash = config['password-hash'];
    if (rawHash && rawHash.trim()) {
      const targetHash = rawHash.trim().toLowerCase();
      const unlockKey = 'deck-unlock-' + targetHash;
      let unlocked = false;
      try { unlocked = sessionStorage.getItem(unlockKey) === '1'; } catch (e) {}
      
      if (unlocked) {
        finishMount();
      } else {
        showPasswordOverlay(targetHash, function() {
          try { sessionStorage.setItem(unlockKey, '1'); } catch (e) {}
          finishMount();
        });
      }
    } else {
      finishMount();
    }
  }
  
  /* ---------- PASSWORD OVERLAY ---------- */
  function showPasswordOverlay(targetHash, onUnlock) {
    const overlay = document.createElement('div');
    overlay.className = 'deck-pw-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    
    const titleEl = document.createElement('div');
    titleEl.className = 'deck-pw-title';
    titleEl.id = 'deck-pw-title-id';
    titleEl.textContent = state.schema.deckTitle;
    overlay.setAttribute('aria-labelledby', 'deck-pw-title-id');
    
    const form = document.createElement('div');
    form.className = 'deck-pw-form';
    
    const label = document.createElement('label');
    label.className = 'deck-pw-label';
    label.textContent = 'ENTER PASSWORD';
    
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'deck-pw-input';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    
    const errorEl = document.createElement('div');
    errorEl.className = 'deck-pw-error';
    errorEl.setAttribute('role', 'alert');
    
    const submit = document.createElement('button');
    submit.className = 'deck-pw-submit';
    submit.type = 'button';
    submit.textContent = 'ENTER →';
    
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(submit);
    form.appendChild(errorEl);
    overlay.appendChild(titleEl);
    overlay.appendChild(form);
    document.body.appendChild(overlay);
    
    setTimeout(function() { input.focus(); }, 100);
    
    async function tryUnlock() {
      const value = input.value;
      if (!value) return;
      submit.disabled = true;
      errorEl.textContent = '';
      
      try {
        const computed = await sha256Hex(value);
        if (computed === targetHash) {
          overlay.classList.add('fade-out');
          setTimeout(function() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          }, 450);
          onUnlock();
        } else {
          errorEl.textContent = 'INCORRECT';
          input.value = '';
          submit.disabled = false;
          input.focus();
        }
      } catch (e) {
        console.warn('[Deck] hash error:', e);
        errorEl.textContent = 'ERROR';
        submit.disabled = false;
      }
    }
    
    submit.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
  }
  
  function mountBgVideo(rawUrl) {
    const url = safeVideoUrl(rawUrl);
    if (!url) { console.warn('[Deck] invalid video-url:', rawUrl); return; }
    const layer = document.createElement('div');
    layer.className = 'deck-bg-layer';
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    layer.appendChild(iframe);
    document.body.appendChild(layer);
  }
  
  function mountAudio(rawUrl) {
    const url = safeAudioUrl(rawUrl);
    if (!url) { console.warn('[Deck] invalid audio-url:', rawUrl); return; }
    const audio = document.createElement('audio');
    audio.loop = true; audio.preload = 'auto'; audio.muted = true;
    audio.volume = 0.6; audio.src = url;
    document.body.appendChild(audio);
    state.audio = audio;
    
    const radio = document.createElement('div');
    radio.className = 'deck-ui deck-ui-radio deck-radio';
    radio.setAttribute('role', 'region');
    radio.setAttribute('aria-label', 'Radio');
    radio.innerHTML = RADIO_SVG_HTML + '<div class="deck-radio-label">RADIO</div>';
    document.body.appendChild(radio);
    
    radio.addEventListener('click', function() {
      if (!state.audioUnlocked) {
        audio.muted = false;
        audio.play().then(function() {
          state.audioUnlocked = true;
          radio.classList.add('unlocked');
        }).catch(function(err) {
          console.warn('[Deck] audio blocked:', err);
          audio.muted = true;
        });
      } else {
        audio.muted = !audio.muted;
        radio.classList.toggle('unlocked', !audio.muted);
      }
    });
  }
  
  const RADIO_SVG_HTML =
    '<svg class="deck-radio-icon" width="28" height="28" viewBox="0 0 22 22" aria-hidden="true">' +
    '<g fill="none" stroke="#fff" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="5.5" y1="21" x2="10.4" y2="9"/>' +
    '<line x1="16.5" y1="21" x2="11.6" y2="9"/>' +
    '<line x1="5.5" y1="21" x2="16.5" y2="21"/>' +
    '<line x1="6.6" y1="18.2" x2="15.4" y2="18.2"/>' +
    '<line x1="7.7" y1="15.4" x2="14.3" y2="15.4"/>' +
    '<line x1="8.8" y1="12.6" x2="13.2" y2="12.6"/>' +
    '<line x1="9.7" y1="10.4" x2="12.3" y2="10.4"/>' +
    '<line x1="5.5" y1="21" x2="15.4" y2="18.2"/>' +
    '<line x1="16.5" y1="21" x2="6.6" y2="18.2"/>' +
    '<line x1="6.6" y1="18.2" x2="14.3" y2="15.4"/>' +
    '<line x1="15.4" y1="18.2" x2="7.7" y2="15.4"/>' +
    '<line x1="7.7" y1="15.4" x2="13.2" y2="12.6"/>' +
    '<line x1="14.3" y1="15.4" x2="8.8" y2="12.6"/>' +
    '<line x1="8.8" y1="12.6" x2="12.3" y2="10.4"/>' +
    '<line x1="13.2" y1="12.6" x2="9.7" y2="10.4"/>' +
    '<line x1="9.7" y1="10.4" x2="11.6" y2="9"/>' +
    '<line x1="12.3" y1="10.4" x2="10.4" y2="9"/>' +
    '<path class="deck-radio-arc deck-radio-arc-inner" d="M 8 9 A 3 3 0 0 1 14 9"/>' +
    '<path class="deck-radio-arc deck-radio-arc-outer" d="M 6 9 A 5 5 0 0 1 16 9"/>' +
    '<polyline points="10,8.5 7,5.5 8.5,4.5 5,1.5"/>' +
    '<polyline points="12,8.5 15,5.5 13.5,4.5 17,1.5"/>' +
    '<polyline points="10,8.5 7,7 7.5,6 4,5"/>' +
    '<polyline points="12,8.5 15,7 14.5,6 18,5"/>' +
    '</g></svg>';
  
  function mountPicker() {
    const picker = document.createElement('div');
    picker.className = 'deck-ui deck-ui-picker deck-picker';
    
    const btn = document.createElement('button');
    btn.className = 'deck-picker-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const labelSpan = document.createElement('span');
    labelSpan.className = 'deck-picker-label';
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'deck-picker-arrow';
    arrowSpan.textContent = '▾';
    btn.appendChild(labelSpan);
    btn.appendChild(arrowSpan);
    
    const tooltip = document.createElement('span');
    tooltip.className = 'deck-picker-tooltip';
    const tipLeft = document.createElement('span');
    tipLeft.className = 'deck-kbd';
    tipLeft.textContent = '←';
    const tipRight = document.createElement('span');
    tipRight.className = 'deck-kbd';
    tipRight.textContent = '→';
    const tipText = document.createElement('span');
    tipText.textContent = 'NAVIGATE SECTIONS';
    tooltip.appendChild(tipLeft);
    tooltip.appendChild(tipRight);
    tooltip.appendChild(tipText);
    
    const listDiv = document.createElement('div');
    listDiv.className = 'deck-picker-list';
    const listUl = document.createElement('ul');
    listUl.setAttribute('role', 'listbox');
    listDiv.appendChild(listUl);
    
    const hint = document.createElement('div');
    hint.className = 'deck-picker-hint';
    const kbdLeft = document.createElement('span');
    kbdLeft.className = 'deck-kbd';
    kbdLeft.textContent = '←';
    const kbdRight = document.createElement('span');
    kbdRight.className = 'deck-kbd';
    kbdRight.textContent = '→';
    const hintLabel = document.createElement('span');
    hintLabel.textContent = 'NAVIGATE';
    hint.appendChild(kbdLeft);
    hint.appendChild(kbdRight);
    hint.appendChild(hintLabel);
    listDiv.appendChild(hint);
    
    picker.appendChild(btn);
    picker.appendChild(tooltip);
    picker.appendChild(listDiv);
    document.body.appendChild(picker);
    
    state.picker = picker;
    state.pickerLabel = labelSpan;
    state.pickerList = listUl;
    state.pickerTooltip = tooltip;
    
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const open = picker.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function(e) {
      if (picker.classList.contains('open') && !picker.contains(e.target)) {
        picker.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    
    renderPickerList();
    updatePickerLabel();
  }
  
  function mountNavNext() {
    const nav = document.createElement('div');
    nav.className = 'deck-ui deck-nav-next';
    nav.setAttribute('role', 'button');
    nav.setAttribute('aria-label', 'Next section');
    nav.setAttribute('tabindex', '0');
    nav.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 22 22" aria-hidden="true">' +
      '<polyline points="8,4 15,11 8,18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    nav.addEventListener('click', advanceNext);
    nav.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceNext(); }
    });
    document.body.appendChild(nav);
  }
  
  function advanceNext() {
    if (!state.schema) return;
    const total = state.schema.slides.length;
    activate((state.activeIndex + 1) % total);
  }
  
  function renderPickerList() {
    const ul = state.pickerList;
    if (!ul) return;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    state.schema.slides.forEach(function(s) {
      const li = document.createElement('li');
      if (s.index === state.activeIndex) li.classList.add('current');
      const numSpan = document.createElement('span');
      numSpan.className = 'num';
      numSpan.textContent = String(s.index + 1).padStart(2, '0');
      const titleSpan = document.createElement('span');
      titleSpan.textContent = s.title;
      li.appendChild(numSpan);
      li.appendChild(titleSpan);
      li.addEventListener('click', function(e) {
        e.stopPropagation();
        activate(s.index);
        state.picker.classList.remove('open');
      });
      ul.appendChild(li);
    });
  }
  
  function updatePickerLabel() {
    const cur = state.schema.slides[state.activeIndex];
    if (!cur || !state.pickerLabel) return;
    state.pickerLabel.textContent = String(cur.index + 1).padStart(2, '0') + ' / ' + cur.title;
  }
  
  /* ---------- ACTIVATION ---------- */
  function activate(idx) {
    if (!state.schema || idx < 0 || idx >= state.schema.slides.length) return;
    
    const prevIdx = state.activeIndex;
    const isChange = prevIdx !== idx;
    
    state.activeIndex = idx;
    updatePickerLabel();
    renderPickerList();
    
    state.schema.slides.forEach(function(s, i) {
      s.element.setAttribute('aria-current', i === idx ? 'true' : 'false');
    });
    
    if (state.pickerTooltip) {
      state.pickerTooltip.classList.toggle('hidden', idx !== 0);
    }
    
    if (isChange) {
      const oldEl = state.schema.slides[prevIdx].element;
      const newEl = state.schema.slides[idx].element;
      
      newEl.classList.remove('deck-leaving');
      
      oldEl.classList.add('deck-leaving');
      oldEl.classList.remove('deck-active');
      
      setTimeout(function() {
        if (state.activeIndex === idx) {
          newEl.classList.add('deck-active');
        }
        oldEl.classList.remove('deck-leaving');
      }, FADE_MS);
    } else {
      state.schema.slides[idx].element.classList.add('deck-active');
    }
  }
  
  /* ---------- KEYBOARD ---------- */
  function bindKeyboard() {
    window.addEventListener('keydown', function(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      const k = e.key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== ' ' && k !== 'Escape') return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const total = state.schema.slides.length;
      if (k === 'ArrowRight' || k === ' ') activate((state.activeIndex + 1) % total);
      else if (k === 'ArrowLeft') activate((state.activeIndex - 1 + total) % total);
      else if (k === 'Escape' && state.picker) {
        state.picker.classList.remove('open');
      }
    }, true);
  }
  
  /* ---------- MUTATION OBSERVATION ---------- */
  function observeChanges() {
    let timer = null;
    const observer = new MutationObserver(function() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(rebuildIfChanged, 500);
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }
  
  function rebuildIfChanged() {
    if (!state.schema || !state.config) return;
    const allStackPages = Array.from(document.querySelectorAll(SLIDE_SELECTOR));
    const found = detectConfig(allStackPages);
    if (!found) return;
    const deckParent = found.configPage.parentElement;
    const visible = allStackPages.filter(function(s) {
      return s !== found.configPage && s.parentElement === deckParent;
    });
    if (visible.length === state.schema.slides.length) {
      let same = true;
      for (let i = 0; i < visible.length; i++) {
        if (state.schema.slides[i].element !== visible[i]) { same = false; break; }
      }
      if (same) return;
    }
    state.config = found.config;
    applyConfigVars(found.config);
    state.schema = buildSchema(visible, found.config);
    if (state.activeIndex >= state.schema.slides.length) state.activeIndex = 0;
    renderPickerList();
    updatePickerLabel();
    activate(state.activeIndex);
  }
})();
