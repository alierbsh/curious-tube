/**
 * Curious YouTube — content script
 *
 * The CSS does the static hiding; this file covers the five jobs CSS cannot
 * do on its own:
 *   1) Routing    — YouTube is an SPA, so navigation never reloads the
 *                   document; we refresh the markers on <html> on every
 *                   navigation instead.
 *   2) Redirects  — /shorts/<id> URLs are moved to the regular player.
 *   3) Cleanup    — shelf/ad/promo nodes injected later are removed as soon
 *                   as they appear.
 *   4) Safety     — if the search box is not visible, the extension's risky
 *                   rules disable themselves (see ensureSearchVisible).
 *   5) Assets     — the page background and the logos; their in-extension
 *                   URLs are only known at runtime, so they are written from
 *                   here (see applyWallpaperRef, renderLogo, renderNavLogo).
 */

(() => {
  "use strict";

  /** Routes whose content is emptied entirely (home, feeds, explore). */
  const BLOCKED_PATHS = new Set([
    "/",
    "/feed/subscriptions",
    "/feed/trending",
    "/feed/explore",
    "/feed/storefront",
    "/gaming",
  ]);

  /** Nodes injected later that are removed from the DOM outright. */
  const KILL_SELECTORS = [
    "ytd-reel-shelf-renderer",
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-sparkles-text-search-renderer",
    "ytd-search-pyv-renderer",
    "ytd-mealbar-promo-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
  ].join(",");

  /**
   * Wallpaper catalog. To add an image, drop the file into wallpapers/ and
   * add one line here; the manifest already uses the "wallpapers/*" wildcard
   * in web_accessible_resources.
   *
   * size / position are optional. The images differ in composition, so each
   * one may define its own framing; without them the CSS defaults (cover /
   * center) apply. Wallpaper 1 carries a white caption band across its
   * middle, so it is scaled up and shifted down — otherwise the band lands
   * right behind the search bar.
   */
  const WALLPAPERS = [
    {
      file: "wallpapers/wallpaper-1.png",
      label: "Wallpaper 1",
      size: "max(130%, 190vh)",
      position: "center 15%",
    },
    { file: "wallpapers/wallpaper-2.jpg", label: "Wallpaper 2" },
    { file: "wallpapers/wallpaper-3.jpg", label: "Wallpaper 3" },
    { file: "wallpapers/wallpaper-4.jpg", label: "Wallpaper 4" },
    { file: "wallpapers/wallpaper-5.jpg", label: "Wallpaper 5" },
    { file: "wallpapers/wallpaper-6.jpg", label: "Wallpaper 6" },
    { file: "wallpapers/wallpaper-7.jpg", label: "Wallpaper 7" },
    { file: "wallpapers/wallpaper-8.jpg", label: "Wallpaper 8" },
    { file: "wallpapers/wallpaper-9.jpg", label: "Wallpaper 9" },
    { file: "wallpapers/wallpaper-10.jpg", label: "Wallpaper 10" },
  ];

  /** Logo shown above the search bar in search mode. */
  const LOGO = "logo.png";

  /** chrome.storage.local keys. */
  const KEY_SELECTED = "selectedWallpaper";
  const KEY_SHUFFLE = "shuffleWallpaper";
  const KEY_CUSTOM = "customWallpapers";
  const KEY_ENABLED = "extensionEnabled";
  const KEY_COMMENTS = "commentsEnabled";
  const KEY_DESCRIPTION = "descriptionEnabled";
  const KEY_SHORTS = "shortsEnabled";
  const KEY_GRAYSCALE = "grayscaleEnabled";

  /**
   * Feature switches, in the order they appear in the settings panel.
   *
   * "hide" flips the polarity: for Comments/Description/Shorts the preference
   * means "show it", so the class is applied when the preference is false.
   * Grayscale is the other way round — the class follows the preference.
   */
  const FEATURE_CLASSES = [
    { key: KEY_COMMENTS, className: "ymin-hide-comments", hide: true },
    { key: KEY_DESCRIPTION, className: "ymin-hide-description", hide: true },
    { key: KEY_SHORTS, className: "ymin-hide-shorts", hide: true },
    { key: KEY_GRAYSCALE, className: "ymin-grayscale-thumbnails", hide: false },
  ];

  /**
   * The boolean preferences. All of them live in the synchronous cache too:
   * without that, a disabled extension would still apply everything at
   * document_start and only undo it once chrome.storage answered — a visible
   * flash of the very page the user switched off.
   */
  const BOOL_KEYS = [
    KEY_SHUFFLE,
    KEY_ENABLED,
    KEY_COMMENTS,
    KEY_DESCRIPTION,
    KEY_SHORTS,
    KEY_GRAYSCALE,
  ];

  /** Every key this content script reads from storage. */
  const ALL_KEYS = [
    KEY_SELECTED,
    KEY_SHUFFLE,
    KEY_CUSTOM,
    KEY_ENABLED,
    KEY_COMMENTS,
    KEY_DESCRIPTION,
    KEY_SHORTS,
    KEY_GRAYSCALE,
  ];

  /**
   * Wallpapers uploaded by the user.
   *
   * The storage layout is deliberately split in two:
   *   customWallpapers      -> metadata array only [{id, bytes, addedAt}]
   *   ymin:custom:<id>      -> that image's base64 payload (separate key)
   *
   * This way a page load does not pull EVERY image into memory; only the
   * selected one is read. Keeping them all in a single array would mean
   * parsing megabytes of base64 on every read.
   */
  const CUSTOM_PREFIX = "custom:";
  const CUSTOM_DATA_PREFIX = "ymin:custom:";

  /** Quota guards. The values are deliberately conservative. */
  const MAX_CUSTOM_COUNT = 12;
  const MAX_ITEM_BYTES = 3 * 1024 * 1024; // per-image ceiling
  const QUOTA_SAFETY_BYTES = 512 * 1024; // headroom that must always stay free

  function isCustomRef(ref) {
    return typeof ref === "string" && ref.startsWith(CUSTOM_PREFIX);
  }

  function customIdOf(ref) {
    return ref.slice(CUSTOM_PREFIX.length);
  }

  function customDataKey(ref) {
    return CUSTOM_DATA_PREFIX + (isCustomRef(ref) ? customIdOf(ref) : ref);
  }

  /**
   * Page-local copy of the preferences. chrome.storage is ASYNCHRONOUS, so
   * the value is not available during the first paint and the wallpaper
   * would flash wrong or blank. To avoid that, the last known preference is
   * mirrored in the page's localStorage: read synchronously at
   * document_start, then quietly reconciled once the real value arrives.
   */
  const CACHE_KEY = "ymin:prefs";

  const DEFAULT_PREFS = {
    [KEY_SELECTED]: WALLPAPERS[0].file,
    [KEY_SHUFFLE]: false,
    // The extension is on out of the box; the distraction blockers default to
    // hiding, which is the whole point of installing this.
    [KEY_ENABLED]: true,
    [KEY_COMMENTS]: false,
    [KEY_DESCRIPTION]: false,
    [KEY_SHORTS]: false,
    [KEY_GRAYSCALE]: false,
  };

  /** Search input: covers both the old and the new masthead components. */
  const SEARCH_INPUT =
    "input#search, input.ytSearchboxComponentInput, input[name='search_query']";

  const root = document.documentElement;

  /** Observer watching the input's placeholder attribute (stripPlaceholder). */
  let placeholderObserver = null;

  /** Current preferences and the wallpaper on screen right now. */
  let prefs = Object.assign({}, DEFAULT_PREFS);
  let appliedRef = null;

  /** Metadata for the user wallpapers (the base64 is NOT here). */
  let customIndex = [];

  /** Subscribers notified when preferences change (the settings UI). */
  const prefListeners = [];

  function notify() {
    const snapshot = Object.assign({}, prefs);
    prefListeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (_) {
        /* one listener throwing must not stop the others */
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Master switch and feature classes                                   */
  /* ------------------------------------------------------------------ */

  function isEnabled() {
    return prefs[KEY_ENABLED] !== false;
  }

  /**
   * Mirrors the preferences onto <html> as classes. Every rule in
   * content.css that touches YouTube hangs off .ymin-on, so dropping that one
   * class disables the entire stylesheet at once — no rule-by-rule teardown.
   *
   * The feature classes are gated on the master switch here as well, so a
   * disabled extension leaves comments, descriptions, Shorts and thumbnail
   * colours exactly as YouTube shipped them.
   */
  function syncFeatureClasses() {
    const on = isEnabled();
    root.classList.toggle("ymin-on", on);
    FEATURE_CLASSES.forEach(({ key, className, hide }) => {
      const active = hide ? !prefs[key] : Boolean(prefs[key]);
      root.classList.toggle(className, on && active);
    });
  }

  /**
   * Undoes what the extension added to the page, for the case where it is
   * switched off in another tab while this one is open. The tab that flips
   * the switch reloads itself (a clean slate is cheaper than unwinding a live
   * SPA), but other tabs should not be reloaded from under the user.
   *
   * Nodes YouTube itself owns are not restored here — sweep() removed some of
   * them for good, and they come back on the next navigation anyway.
   */
  function teardown() {
    ["ymin-blocked", "ymin-wallpaper"].forEach((c) => root.classList.remove(c));
    root.style.removeProperty("--ymin-wallpaper");
    delete root.dataset.yminPage;
    ["ymin-logo", "ymin-nav-logo", "ymin-home-link"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.remove();
    });
    appliedRef = null;
  }

  /* ------------------------------------------------------------------ */
  /* Routing                                                             */
  /* ------------------------------------------------------------------ */

  function currentPage() {
    const path = location.pathname;
    if (path.startsWith("/shorts/")) return "shorts";
    if (path === "/results") return "search";
    if (path === "/watch") return "watch";
    if (BLOCKED_PATHS.has(path)) return "blocked";
    if (path.startsWith("/feed/")) return "blocked";
    return "other";
  }

  /** /shorts/<id> -> /watch?v=<id>: the Shorts feed is never entered. */
  function redirectShorts() {
    const id = location.pathname.split("/")[2];
    if (!id) return false;
    location.replace(location.origin + "/watch?v=" + id);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Safety: the search box must stay on screen no matter what            */
  /* ------------------------------------------------------------------ */

  /**
   * Verifies that the search box is genuinely visible. If it is hidden or
   * pushed outside the viewport, .ymin-safe is added to <html>; that class
   * switches off both the suggestion-hiding and the centering blocks in the
   * CSS. So a faulty selector can at worst disable a feature — it can never
   * leave the user staring at an empty screen.
   */
  function ensureSearchVisible() {
    if (root.classList.contains("ymin-safe")) return;

    // Avoid false alarms: YouTube hides its own masthead in fullscreen,
    // and measurements are unreliable in a tab that is not visible.
    if (document.fullscreenElement) return;
    if (document.visibilityState !== "visible") return;

    const input = document.querySelector(SEARCH_INPUT);
    if (!input) return; // The masthead is not drawn yet; a later check will catch it.

    const box = input.getBoundingClientRect();
    const onScreen =
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < window.innerHeight &&
      box.left < window.innerWidth;

    if (onScreen) return;

    root.classList.add("ymin-safe");
    console.warn(
      "[Curious YouTube] The search box is not visible; suggestion hiding " +
        "and centering have been disabled in this tab."
    );
  }

  /* ------------------------------------------------------------------ */
  /* Search box                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Hands the page background image over to the CSS.
   *
   * url("wallpapers/...") cannot be written inside content.css: that path
   * resolves against the page, not the extension root. The real address is
   * only known through chrome.runtime.getURL (and is loadable thanks to
   * web_accessible_resources in the manifest). We write the address into the
   * --ymin-wallpaper variable and leave the framing (cover, fixed, ...) to
   * the CSS.
   */
  function setBackground(url, entry) {
    root.style.setProperty("--ymin-wallpaper", 'url("' + url + '")');
    root.style.setProperty("--ymin-wallpaper-size", entry.size || "cover");
    root.style.setProperty(
      "--ymin-wallpaper-position",
      entry.position || "center"
    );
    root.classList.add("ymin-wallpaper");
  }

  /**
   * Applies a wallpaper. ref comes in one of two shapes:
   *   "wallpapers/x.jpg" -> a built-in image inside the extension
   *   "custom:<id>"      -> a user upload, base64 in storage
   *
   * Custom images have to be read from storage, so that path is async;
   * built-ins are applied immediately as before.
   */
  function applyWallpaperRef(ref) {
    try {
      if (isCustomRef(ref)) {
        const key = customDataKey(ref);
        chrome.storage.local.get(key).then((res) => {
          const dataUrl = res && res[key];
          if (!dataUrl) {
            // The data is gone but the selection remained: fall back to a built-in.
            applyWallpaperRef(WALLPAPERS[0].file);
            return;
          }
          setBackground(dataUrl, {});
          appliedRef = ref;
        }, noop);
        return;
      }

      const entry = entryFor(ref);
      const url = chrome.runtime.getURL(entry.file);
      if (!url) return;
      setBackground(url, entry);
      appliedRef = entry.file;
    } catch (_) {
      // Reloading the extension invalidates the runtime context in old tabs;
      // in that case we apply nothing and leave the page in its stock state.
      root.classList.remove("ymin-wallpaper");
    }
  }

  function noop() {}

  /** An unknown file name falls back to the first image in the catalog. */
  function entryFor(file) {
    return WALLPAPERS.find((w) => w.file === file) || WALLPAPERS[0];
  }

  /** Shuffle pool: built-ins plus the user's own uploads. */
  function shufflePool() {
    return WALLPAPERS.map((w) => w.file).concat(
      customIndex.map((c) => CUSTOM_PREFIX + c.id)
    );
  }

  /** Shuffle: pick something other than what is on screen when possible. */
  function randomRef() {
    const all = shufflePool();
    const pool = all.filter((ref) => ref !== appliedRef);
    const list = pool.length ? pool : all;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Which image the current preferences resolve to. */
  function resolveRef() {
    return prefs[KEY_SHUFFLE] ? randomRef() : prefs[KEY_SELECTED];
  }

  /* ---- User wallpapers: add / remove / quota ------------------------- */

  function quotaLimit() {
    const local = chrome.storage.local;
    return (local && local.QUOTA_BYTES) || 10 * 1024 * 1024;
  }

  /**
   * Adds a base64 image to storage. If the quota would be exceeded it is
   * rejected BEFORE writing, so storage never fills up with a half-written
   * record. The error codes are turned into readable messages by the UI.
   */
  function addCustomWallpaper(dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return Promise.resolve({ ok: false, error: "invalid" });
    }
    if (customIndex.length >= MAX_CUSTOM_COUNT) {
      return Promise.resolve({ ok: false, error: "count", max: MAX_CUSTOM_COUNT });
    }

    const bytes = dataUrl.length;
    if (bytes > MAX_ITEM_BYTES) {
      return Promise.resolve({ ok: false, error: "size", bytes: bytes });
    }

    return chrome.storage.local
      .getBytesInUse(null)
      .then((used) => {
        if (used + bytes + QUOTA_SAFETY_BYTES > quotaLimit()) {
          return { ok: false, error: "quota", used: used, limit: quotaLimit() };
        }

        const id =
          Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const meta = { id: id, bytes: bytes, addedAt: Date.now() };
        const nextIndex = customIndex.concat([meta]);
        const patch = {};
        patch[CUSTOM_DATA_PREFIX + id] = dataUrl;
        patch[KEY_CUSTOM] = nextIndex;

        return chrome.storage.local.set(patch).then(
          () => {
            customIndex = nextIndex;
            writeCache();
            return { ok: true, id: id, ref: CUSTOM_PREFIX + id };
          },
          () => ({ ok: false, error: "quota" })
        );
      })
      .catch(() => ({ ok: false, error: "storage" }));
  }

  /** Removes the image and its metadata; a selected one falls back to a built-in. */
  function removeCustomWallpaper(id) {
    const nextIndex = customIndex.filter((c) => c.id !== id);
    const patch = {};
    patch[KEY_CUSTOM] = nextIndex;

    return chrome.storage.local
      .remove(CUSTOM_DATA_PREFIX + id)
      .then(() => chrome.storage.local.set(patch))
      .then(() => {
        customIndex = nextIndex;
        writeCache();
        if (prefs[KEY_SELECTED] === CUSTOM_PREFIX + id) {
          setPrefs({ [KEY_SELECTED]: WALLPAPERS[0].file });
          applyWallpaperRef(WALLPAPERS[0].file);
        }
        return { ok: true };
      })
      .catch(() => ({ ok: false, error: "storage" }));
  }

  /** Fetches the base64 payloads so the UI can draw thumbnails. */
  function getCustomData(ids) {
    const keys = ids.map((id) => CUSTOM_DATA_PREFIX + id);
    if (!keys.length) return Promise.resolve({});
    return chrome.storage.local.get(keys).then((res) => {
      const out = {};
      ids.forEach((id) => {
        out[id] = res[CUSTOM_DATA_PREFIX + id];
      });
      return out;
    }, () => ({}));
  }

  /** How much storage is in use (surfaced in the settings panel). */
  function storageUsage() {
    return chrome.storage.local.getBytesInUse(null).then(
      (used) => ({ used: used, limit: quotaLimit() }),
      () => ({ used: 0, limit: quotaLimit() })
    );
  }

  /**
   * Adds the logo to <body> once. Positioning and visibility live entirely
   * in the CSS: the element always stays in the DOM and is only shown while
   * .ymin-blocked is set, so it never has to be rebuilt on navigation.
   */
  function renderLogo() {
    if (!document.body || document.getElementById("ymin-logo")) return;
    try {
      const img = document.createElement("img");
      img.id = "ymin-logo";
      img.src = chrome.runtime.getURL(LOGO);
      img.alt = ""; // Decorative: the page is kept free of text.
      img.decoding = "async";
      document.body.appendChild(img);
    } catch (_) {
      // If the extension context is gone, the logo is simply not added.
    }
  }

  /**
   * Replaces YouTube's masthead logo with ours.
   *
   * What matters is how: we do NOT remove YouTube's home link. That
   * <a href="/"> element is wired into YouTube's own router; replacing it
   * would downgrade the click to a full page reload. Instead the YouTube
   * mark inside the link is hidden via CSS (section 1) and our <img> is
   * appended into the very same link. Click behaviour, SPA navigation and
   * keyboard access all stay intact.
   *
   * If the link cannot be found (YouTube changed its markup) we build our
   * own link inside #start; that also reaches the home page, just with a
   * full reload.
   */
  function renderNavLogo() {
    // Does not match a detached node: if YouTube dropped it, we re-add it.
    if (document.getElementById("ymin-nav-logo")) return;

    const masthead = document.querySelector("ytd-masthead, #masthead");
    if (!masthead) return;

    let host = masthead.querySelector("ytd-topbar-logo-renderer a[href]");

    if (!host) {
      const start = masthead.querySelector("#start");
      if (!start) return;
      host = document.getElementById("ymin-home-link");
      if (!host) {
        host = document.createElement("a");
        host.id = "ymin-home-link";
        host.href = "/";
        host.setAttribute("aria-label", "Home");
        start.insertBefore(host, start.firstChild);
      }
    }

    try {
      const img = document.createElement("img");
      img.id = "ymin-nav-logo";
      img.src = chrome.runtime.getURL(LOGO);
      img.alt = "Home"; // It sits in a link, so it carries an accessible name.
      img.decoding = "async";
      host.appendChild(img);
    } catch (_) {
      // If the extension context is gone, the masthead stays in YouTube's stock state.
    }
  }

  /* ---- Preferences: localStorage (sync cache) + chrome.storage -------- */

  /**
   * The cache holds small values only: the two preferences and the IDs of the
   * user's images. Base64 payloads are never written here — they would eat
   * the page's localStorage quota and share space with YouTube's own data.
   *
   * The IDs have to be here: shuffle must be able to build its pool before
   * chrome.storage answers (at document_start). Without them the first draw
   * would only ever consider the built-in wallpapers.
   */
  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.customIds)) {
        customIndex = parsed.customIds.map((id) => ({ id: id }));
      }

      const clean = {};
      if (typeof parsed[KEY_SELECTED] === "string") {
        clean[KEY_SELECTED] = parsed[KEY_SELECTED];
      }
      BOOL_KEYS.forEach((key) => {
        if (typeof parsed[key] === "boolean") clean[key] = parsed[key];
      });
      return Object.assign({}, DEFAULT_PREFS, clean);
    } catch (_) {
      return null;
    }
  }

  function writeCache() {
    try {
      const snapshot = { [KEY_SELECTED]: prefs[KEY_SELECTED] };
      BOOL_KEYS.forEach((key) => {
        snapshot[key] = key === KEY_ENABLED
          ? prefs[key] !== false
          : Boolean(prefs[key]);
      });
      snapshot.customIds = customIndex.map((c) => c.id);
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (_) {
      // In a private window, or with storage disabled, continue without a cache.
    }
  }

  /** For the UI to persist a preference: into the cache and chrome.storage. */
  function setPrefs(patch) {
    prefs = Object.assign({}, prefs, patch);
    writeCache();
    // Every write goes through here, so this is the one place that has to
    // re-apply the feature classes; toggles then take effect immediately.
    syncFeatureClasses();
    try {
      chrome.storage.local.set(patch);
    } catch (_) {
      /* if the context is gone this only applies to the current tab */
    }
    return Object.assign({}, prefs);
  }

  /**
   * First application: from the cache (synchronous, no flash), then
   * reconciled with the real value from chrome.storage.
   */
  function initWallpaper() {
    prefs = readCache() || Object.assign({}, DEFAULT_PREFS);
    syncFeatureClasses();

    // Nothing is painted while the extension is switched off.
    if (!isEnabled()) {
      reconcile();
      return;
    }

    // Custom images live only in storage and cannot be applied synchronously.
    // If the cache points at one, we wait rather than flashing a built-in
    // image first and swapping it a moment later.
    if (!isCustomRef(resolveRef())) applyWallpaperRef(resolveRef());
    reconcile();
  }

  /** Reads the authoritative values from chrome.storage and settles on them. */
  function reconcile() {
    try {
      chrome.storage.local.get(ALL_KEYS).then((stored) => {
        if (!stored) return;
        const wasShuffle = prefs[KEY_SHUFFLE];
        const wasEnabled = isEnabled();
        customIndex = Array.isArray(stored[KEY_CUSTOM]) ? stored[KEY_CUSTOM] : [];

        const incoming = {
          [KEY_SELECTED]: stored[KEY_SELECTED] || prefs[KEY_SELECTED],
          [KEY_ENABLED]: stored[KEY_ENABLED] !== false,
        };
        [KEY_SHUFFLE, KEY_COMMENTS, KEY_DESCRIPTION, KEY_SHORTS, KEY_GRAYSCALE]
          .forEach((key) => {
            incoming[key] = Boolean(stored[key]);
          });
        prefs = Object.assign({}, DEFAULT_PREFS, prefs, incoming);

        writeCache();
        syncFeatureClasses();

        if (!isEnabled()) {
          teardown();
          notify();
          return;
        }

        // Coming back from a cache that said "off": draw everything now.
        if (!wasEnabled) apply();

        // If shuffle stayed on we already applied a random image; drawing a
        // second time would produce a visible jump.
        const shuffleChanged = prefs[KEY_SHUFFLE] !== wasShuffle;
        const staleFixed =
          !prefs[KEY_SHUFFLE] && appliedRef !== prefs[KEY_SELECTED];
        if (shuffleChanged || staleFixed || appliedRef === null) {
          applyWallpaperRef(resolveRef());
        }
        notify();
      }, noop);

      // Keep this tab in sync when another one changes a value.
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        let touched = false;
        for (const key of ALL_KEYS) {
          if (key === KEY_CUSTOM || !(key in changes)) continue;
          prefs[key] = changes[key].newValue;
          touched = true;
        }
        if (KEY_CUSTOM in changes) {
          customIndex = changes[KEY_CUSTOM].newValue || [];
          touched = true;
        }
        if (!touched) return;

        writeCache();
        syncFeatureClasses();

        // The tab that flipped the master switch reloads itself; here we only
        // make sure this tab stops (or resumes) modifying the page.
        if (!isEnabled()) {
          teardown();
          notify();
          return;
        }
        apply();

        if (!prefs[KEY_SHUFFLE] && appliedRef !== prefs[KEY_SELECTED]) {
          applyWallpaperRef(prefs[KEY_SELECTED]);
        }
        notify();
      });
    } catch (_) {
      /* no storage permission, or the context is gone: continue from the cache */
    }
  }

  /**
   * Clears the stock "Search" text inside the box. YouTube can restore the
   * placeholder when it redraws the box or the language changes, so an
   * observer watching only that attribute is attached to the input and
   * clears it again the moment it comes back.
   */
  function stripPlaceholder() {
    const input = document.querySelector(SEARCH_INPUT);
    if (!input) return;

    if (input.getAttribute("placeholder")) input.setAttribute("placeholder", "");

    if (!placeholderObserver) {
      placeholderObserver = new MutationObserver((records) => {
        for (const record of records) {
          const el = record.target;
          // Writing the empty value back produces no new record: no loop.
          if (el.getAttribute("placeholder")) el.setAttribute("placeholder", "");
        }
      });
    }

    // Navigation can replace the input element; rebind to the current node.
    placeholderObserver.disconnect();
    placeholderObserver.observe(input, {
      attributes: true,
      attributeFilter: ["placeholder"],
    });
  }

  /** Put the caret in the search box on the blank page (without nagging). */
  function focusSearch() {
    const input = document.querySelector(SEARCH_INPUT);
    if (!input || input.value) return;

    const active = document.activeElement;
    if (active && active !== document.body && active !== root) return;

    input.focus();
  }

  /**
   * Polymer draws the masthead late, so the checks are repeated a few times
   * at widening intervals.
   */
  function settle() {
    [300, 900, 1800].forEach((delay) =>
      setTimeout(() => {
        ensureSearchVisible();
        renderLogo();
        renderNavLogo();
        stripPlaceholder();
        if (root.classList.contains("ymin-blocked")) focusSearch();
      }, delay)
    );
  }

  /* ------------------------------------------------------------------ */
  /* Application                                                         */
  /* ------------------------------------------------------------------ */

  let lastHref = "";
  let lastPage = null;

  function apply() {
    const page = currentPage();

    // The gear has to stay reachable even while the extension is off, so its
    // marker follows the route alone and never the enabled state.
    root.classList.toggle("ymin-home", page === "blocked");
    syncFeatureClasses();

    if (!isEnabled()) {
      teardown();
      lastPage = page;
      lastHref = location.href;
      return;
    }

    // Shorts URLs are only diverted while Shorts are being hidden.
    if (page === "shorts" && !prefs[KEY_SHORTS] && redirectShorts()) return;

    // Note: there is no "bail out if the URL did not change" early return.
    // At document_start <body> does not exist yet, so the first call cannot
    // do everything; the early return made later calls no-ops as well.
    const navigated = location.href !== lastHref;
    lastHref = location.href;

    root.dataset.yminPage = page;
    root.classList.toggle("ymin-blocked", page === "blocked");

    // Shuffle: a new image every time the home page is ENTERED. Navigating
    // around while already on the blank page leaves the wallpaper alone.
    if (prefs[KEY_SHUFFLE] && page === "blocked" && lastPage && lastPage !== "blocked") {
      applyWallpaperRef(randomRef());
    }
    lastPage = page;

    renderLogo();
    renderNavLogo();
    stripPlaceholder();
    settle();

    if (navigated) sweep(document);
  }

  /* ------------------------------------------------------------------ */
  /* DOM cleanup                                                         */
  /* ------------------------------------------------------------------ */

  function sweep(scope) {
    if (!isEnabled()) return;
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll(KILL_SELECTORS).forEach((node) => node.remove());
  }

  const observer = new MutationObserver((mutations) => {
    // Navigation does not create a new document, so re-check the URL here.
    if (location.href !== lastHref) apply();

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) sweep(node.parentNode || node);
      }
    }
  });

  function start() {
    apply();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // The wallpaper is applied before the route markers so the right image
  // is ready for the very first paint.
  initWallpaper();

  /**
   * The small surface exposed to the settings UI (settings-ui.js). Content
   * scripts share one isolated world, so it travels over window; the page's
   * own JavaScript cannot see this object.
   */
  window.__curiousYouTube = {
    WALLPAPERS,
    KEY_SELECTED,
    KEY_SHUFFLE,
    KEY_ENABLED,
    KEY_COMMENTS,
    KEY_DESCRIPTION,
    KEY_SHORTS,
    KEY_GRAYSCALE,
    isEnabled,
    getPrefs: () => Object.assign({}, prefs),
    setPrefs,
    applyWallpaperRef,
    randomRef,
    isCustomRef,
    customRefOf: (id) => CUSTOM_PREFIX + id,
    customIdOf,
    getCustomIndex: () => customIndex.slice(),
    getCustomData,
    addCustomWallpaper,
    removeCustomWallpaper,
    storageUsage,
    limits: {
      maxCount: MAX_CUSTOM_COUNT,
      maxItemBytes: MAX_ITEM_BYTES,
    },
    onPrefsChange: (fn) => prefListeners.push(fn),
  };

  // We run at document_start, so <body> may not exist yet.
  apply(); // Set the <html> markers early so the page never flickers.
  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  // YouTube's own navigation events plus browser back/forward.
  window.addEventListener("yt-navigate-start", apply, true);
  window.addEventListener("yt-navigate-finish", apply, true);
  window.addEventListener("yt-page-data-updated", apply, true);
  window.addEventListener("popstate", apply, true);
})();
