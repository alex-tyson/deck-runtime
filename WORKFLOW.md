# Deck Runtime Deploy Workflow

## Every time you change `deck.js`

**Step 1.** Edit `deck.js` directly on GitHub:

- Go to [github.com/alex-tyson/deck-runtime/blob/main/deck.js](https://github.com/alex-tyson/deck-runtime/blob/main/deck.js)
- Click the pencil icon (top right of the file viewer) to edit
- Make your changes
- Scroll down, write a short commit message, click **Commit changes**

**Step 2.** Grab the new commit hash.

- Go to [github.com/alex-tyson/deck-runtime/commits/main](https://github.com/alex-tyson/deck-runtime/commits/main)
- The top commit is your most recent. Click the copy-icon next to its short hash (e.g. `4b9beb7`) — that copies the **full** 40-character hash to your clipboard.

**Step 3.** In Cargo admin → **Site Settings → Site Custom HTML**, paste your hash into this template, replacing `PASTE_HASH_HERE`:

```html
<script src="https://cdn.jsdelivr.net/gh/alex-tyson/deck-runtime@PASTE_HASH_HERE/deck.js"></script>
```

Save in Cargo.

**Step 4.** Hard-reload any deck page (`Cmd+Shift+R`). New behavior is live for everyone.

---

## Why this works

- The hash is a unique fingerprint of that exact version of your code.
- Every edit on GitHub creates a new hash.
- Browsers and CDNs treat each hash as a brand-new URL, so they always fetch fresh — no caching problems, no purge URLs, no version counter to maintain.

## Why we abandoned `?v=N` and `@main`

- `@main` is a moving reference. jsDelivr caches which commit `@main` points to for ~12 hours and can't be forced to refresh, even with the purge endpoint. This caused the version mismatch that took an hour to diagnose.
- `?v=N` only busted the browser's own cache, not jsDelivr's resolver.
- The commit hash bypasses both layers permanently.

---

## Diagnostics

### If something looks broken after a deploy

Paste this in the deck page's browser console (Brave: `Cmd+Option+I`):

```js
Array.from(document.scripts).find(s => s.src.includes('deck.js'))?.src
```

The hash in that URL should match the one you just pasted in Cargo. If it doesn't, Cargo didn't save the edit — re-paste and save again.

### Full diagnostic (use when nothing else makes sense)

```js
(async () => {
  const deckScripts = Array.from(document.scripts).filter(s => s.src.includes('deck.js'));
  const loaded = deckScripts[0]?.src;
  const ghApi = await fetch('https://api.github.com/repos/alex-tyson/deck-runtime/commits/main').then(r => r.json());
  const hash = ghApi.sha;
  
  const checkContent = async (url, label) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const t = await r.text();
      return { [label]: { size_kb: Math.round(t.length / 1024) }};
    } catch(e) { return { [label]: 'error: ' + e.message }; }
  };
  
  const current = loaded ? await checkContent(loaded, 'currently_loaded') : { currently_loaded: 'no script tag' };
  
  console.log({
    latest_commit_on_github: hash,
    loaded_url: loaded,
    ...current,
    fix_if_mismatched: `https://cdn.jsdelivr.net/gh/alex-tyson/deck-runtime@${hash}/deck.js`
  });
})();
```

The `fix_if_mismatched` URL is the exact `src` value to paste into Cargo's Custom HTML.

---

## Config keys for `_config` page on each deck

Each deck's `_config` page sets per-deck behavior. Required:

```
deck-config: true
deck-title: AMBOY
```

Optional:

```
video-url: https://vimeo.com/...
audio-url: https://...
bg-opacity: 0.3
bg-color: #FCF7F5
password-hash: <sha256-hex>
theme: white
hide-nav: true
```

Get the password hash via the deck's console: `deckHash('mypassword')`.
