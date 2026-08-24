/**
 * Curious YouTube — settings interface
 *
 * The gear button in the top-right corner and the drawer it opens. The panel
 * has two sections: the wallpaper grid and the settings list.
 *
 * This file loads AFTER content.js and uses the API it exposes on
 * window.__curiousYouTube (catalog, preferences, custom wallpapers). Content
 * scripts share the same isolated world, so that object is invisible to
 * YouTube's own JavaScript.
 *
 * Styles for the panel and the button live in section 10 of content.css;
 * this file only defines structure and behaviour.
 */

(() => {
  "use strict";

  const api = window.__curiousYouTube;
  if (!api) return; // Without content.js there is no API to drive the interface.

  const root = document.documentElement;

  /**
   * Uploaded images are downscaled and re-encoded before they reach storage.
   * Base64 is ~33% larger than binary, so a raw photo can exhaust the
   * storage.local quota on its own. The attempts below run in order and the
   * first result that fits under the limit wins.
   */
  const ENCODE_ATTEMPTS = [
    [2560, 0.85],
    [1920, 0.8],
    [1440, 0.72],
  ];

  /** Images below this threshold are stored as-is, to avoid re-encoding loss. */
  const KEEP_ORIGINAL_BYTES = 700 * 1024;

  let gear = null;
  let scrim = null;
  let panel = null;
  let fileInput = null;
  let built = false;
  let open = false;
  let busy = false;

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const GEAR_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path fill="currentColor" d="M19.14 12.94a7.6 7.6 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>' +
    "</svg>";

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>' +
    "</svg>";

  const PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>' +
    "</svg>";

  const TRASH_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
    '<path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/>' +
    "</svg>";

  /* ------------------------------------------------------------------ */
  /* Image preparation (FileReader + canvas)                             */
  /* ------------------------------------------------------------------ */

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function encode(img, maxDim, quality) {
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, maxDim / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    // WebP is smaller and keeps transparency; fall back to JPEG if unsupported.
    let out = canvas.toDataURL("image/webp", quality);
    if (out.indexOf("data:image/webp") !== 0) {
      out = canvas.toDataURL("image/jpeg", quality);
    }
    return out;
  }

  async function prepare(file) {
    const original = await readAsDataURL(file);
    const img = await loadImage(original);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);

    if (original.length <= KEEP_ORIGINAL_BYTES && longest <= ENCODE_ATTEMPTS[0][0]) {
      return original;
    }

    let out = original;
    for (const [dim, quality] of ENCODE_ATTEMPTS) {
      out = encode(img, dim, quality);
      if (out.length <= api.limits.maxItemBytes) break;
    }
    return out;
  }

  const ERRORS = {
    invalid: "That file is not an image.",
    count: "You can store at most " + api.limits.maxCount +
      " custom wallpapers. Remove one first.",
    size: "The image is still over the limit after downscaling.",
    quota: "Storage is full. Remove a wallpaper first.",
    storage: "Could not save, please try again.",
    read: "The image could not be read.",
  };

  async function onFileChosen(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file || busy) return;

    busy = true;
    setStatus("Preparing image…", false);
    try {
      const dataUrl = await prepare(file);
      const result = await api.addCustomWallpaper(dataUrl);
      if (!result.ok) {
        setStatus(ERRORS[result.error] || ERRORS.storage, true);
        return;
      }
      api.setPrefs({ [api.KEY_SELECTED]: result.ref });
      api.applyWallpaperRef(result.ref);
      setStatus("", false);
      await renderGrid();
      render();
    } catch (_) {
      setStatus(ERRORS.read, true);
    } finally {
      busy = false;
      refreshUsage();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Panel                                                               */
  /* ------------------------------------------------------------------ */

  function buildPanel() {
    if (built) return;
    built = true;

    scrim = el("div", "ymin-scrim");
    scrim.addEventListener("click", closePanel);

    panel = el("aside", "ymin-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Curious YouTube settings");

    /* --- Header --- */
    const header = el("header", "ymin-panel-header");
    header.appendChild(el("div", "ymin-panel-title", "Curious YouTube"));

    const close = el("button", "ymin-icon-btn");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", closePanel);
    header.appendChild(close);
    panel.appendChild(header);

    /* --- Tabs --- */
    const tabs = el("nav", "ymin-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.append(tabButton("wallpapers", "Wallpapers"), tabButton("settings", "Settings"));
    panel.appendChild(tabs);

    /* --- Section: Wallpapers --- */
    const wallpapersPane = el("div", "ymin-pane");
    wallpapersPane.dataset.pane = "wallpapers";

    const status = el("p", "ymin-note");
    status.dataset.role = "status";
    status.hidden = true;
    wallpapersPane.appendChild(status);

    const shuffleNote = el(
      "p",
      "ymin-note",
      "Shuffle is on: your pick applies right now, but a random wallpaper " +
        "is shown every time you open the home page."
    );
    shuffleNote.dataset.role = "shuffle-note";
    wallpapersPane.appendChild(shuffleNote);

    const grid = el("div", "ymin-grid");
    grid.dataset.role = "grid";
    wallpapersPane.appendChild(grid);
    panel.appendChild(wallpapersPane);

    /* Hidden file picker, triggered by the "+" card. */
    fileInput = el("input", "ymin-file");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.addEventListener("change", onFileChosen);
    wallpapersPane.appendChild(fileInput);

    /* --- Section: Settings --- */
    const settingsPane = el("div", "ymin-pane");
    settingsPane.dataset.pane = "settings";
    settingsPane.hidden = true;

    const row = el("div", "ymin-row");
    const label = el("div", "ymin-row-label");
    label.appendChild(el("div", "ymin-row-title", "Shuffle Wallpaper"));
    label.appendChild(
      el(
        "div",
        "ymin-row-sub",
        "Shows a random wallpaper every time you open the home page. " +
          "Your own uploads are part of the pool too."
      )
    );

    const toggle = el("button", "ymin-switch");
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.dataset.role = "shuffle";
    toggle.appendChild(el("span", "ymin-knob"));
    toggle.addEventListener("click", () => {
      const next = !api.getPrefs()[api.KEY_SHUFFLE];
      api.setPrefs({ [api.KEY_SHUFFLE]: next });
      // Show the effect immediately; turning it off restores the fixed choice.
      api.applyWallpaperRef(
        next ? api.randomRef() : api.getPrefs()[api.KEY_SELECTED]
      );
      render();
    });

    row.append(label, toggle);
    settingsPane.appendChild(row);

    const usage = el("div", "ymin-usage");
    usage.dataset.role = "usage";
    settingsPane.appendChild(usage);
    panel.appendChild(settingsPane);

    document.body.append(scrim, panel);
    renderGrid();
    render();
    refreshUsage();
  }

  function tabButton(name, text) {
    const btn = el("button", "ymin-tab", text);
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.dataset.tab = name;
    btn.addEventListener("click", () => selectTab(name));
    return btn;
  }

  function selectTab(name) {
    panel.querySelectorAll(".ymin-tab").forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    panel.querySelectorAll(".ymin-pane").forEach((pane) => {
      pane.hidden = pane.dataset.pane !== name;
    });
  }

  function setStatus(message, isError) {
    if (!built) return;
    const node = panel.querySelector('[data-role="status"]');
    node.textContent = message;
    node.classList.toggle("is-error", Boolean(isError));
    node.hidden = !message;
  }

  function refreshUsage() {
    if (!built) return;
    api.storageUsage().then(({ used, limit }) => {
      panel.querySelector('[data-role="usage"]').textContent =
        "Storage: " + formatBytes(used) + " / " + formatBytes(limit) +
        " · " + api.getCustomIndex().length + "/" + api.limits.maxCount +
        " custom wallpapers";
    });
  }

  /* ------------------------------------------------------------------ */
  /* Grid                                                                */
  /* ------------------------------------------------------------------ */

  function addTile() {
    const btn = el("button", "ymin-tile ymin-tile-add");
    btn.type = "button";
    btn.setAttribute("aria-label", "Add a wallpaper from your computer");
    btn.title = "Add wallpaper";
    const icon = el("span", "ymin-add-icon");
    icon.innerHTML = PLUS_SVG;
    btn.append(icon, el("span", "ymin-add-text", "Add"));
    btn.addEventListener("click", () => {
      if (!busy) fileInput.click();
    });
    return btn;
  }

  function tile(ref, src, label, removable) {
    const btn = el("button", "ymin-tile");
    btn.type = "button";
    btn.dataset.ref = ref;
    btn.setAttribute("aria-label", label);
    btn.title = label;

    const img = el("img", "ymin-thumb");
    img.loading = "lazy"; // Thumbnails outside the viewport should not decode needlessly.
    img.decoding = "async";
    img.alt = "";
    if (src) img.src = src;

    const badge = el("span", "ymin-tile-check");
    badge.innerHTML = CHECK_SVG;
    btn.append(img, badge);

    if (removable) {
      const remove = el("span", "ymin-tile-remove");
      remove.setAttribute("role", "button");
      remove.setAttribute("tabindex", "0");
      remove.setAttribute("aria-label", label + " — remove");
      remove.title = "Remove";
      remove.innerHTML = TRASH_SVG;

      const doRemove = (event) => {
        // Do not let this bubble into the tile's select handler.
        event.stopPropagation();
        event.preventDefault();
        api.removeCustomWallpaper(api.customIdOf(ref))
          .then(() => {
            renderGrid();
            render();
            refreshUsage();
          });
      };
      remove.addEventListener("click", doRemove);
      remove.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") doRemove(event);
      });
      btn.appendChild(remove);
    }

    btn.addEventListener("click", () => {
      api.setPrefs({ [api.KEY_SELECTED]: ref });
      api.applyWallpaperRef(ref);
      render();
    });
    return btn;
  }

  /** Rebuilds the grid: "+" card, built-ins, then the user's own uploads. */
  function renderGrid() {
    if (!built) return Promise.resolve();
    const grid = panel.querySelector('[data-role="grid"]');
    grid.textContent = "";
    grid.appendChild(addTile());

    api.WALLPAPERS.forEach((entry) => {
      let src = "";
      try {
        src = chrome.runtime.getURL(entry.file);
      } catch (_) {
        /* leave an empty tile if the extension context is gone */
      }
      grid.appendChild(tile(entry.file, src, entry.label, false));
    });

    const index = api.getCustomIndex();
    if (!index.length) return Promise.resolve();

    return api.getCustomData(index.map((c) => c.id)).then((data) => {
      index.forEach((meta, i) => {
        const ref = api.customRefOf(meta.id);
        grid.appendChild(
          tile(ref, data[meta.id] || "", "Your wallpaper " + (i + 1), true)
        );
      });
      render();
    });
  }

  /** Refreshes the interface from the current preferences. */
  function render() {
    if (!built) return;
    const current = api.getPrefs();

    panel.querySelectorAll(".ymin-tile[data-ref]").forEach((btn) => {
      const selected = btn.dataset.ref === current[api.KEY_SELECTED];
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    const shuffleOn = Boolean(current[api.KEY_SHUFFLE]);
    const toggle = panel.querySelector('[data-role="shuffle"]');
    toggle.classList.toggle("is-on", shuffleOn);
    toggle.setAttribute("aria-checked", shuffleOn ? "true" : "false");

    panel.querySelector('[data-role="shuffle-note"]').hidden = !shuffleOn;
  }

  /* ------------------------------------------------------------------ */
  /* Open / close                                                        */
  /* ------------------------------------------------------------------ */

  function openPanel() {
    buildPanel();
    open = true;
    // Deferred one frame so the transition actually animates.
    requestAnimationFrame(() => {
      scrim.classList.add("is-open");
      panel.classList.add("is-open");
    });
    gear.setAttribute("aria-expanded", "true");
    selectTab("wallpapers");
    setStatus("", false);
    renderGrid();
    render();
    refreshUsage();
    document.addEventListener("keydown", onKeydown, true);
  }

  function closePanel() {
    if (!open) return;
    open = false;
    scrim.classList.remove("is-open");
    panel.classList.remove("is-open");
    gear.setAttribute("aria-expanded", "false");
    gear.focus();
    document.removeEventListener("keydown", onKeydown, true);
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePanel();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  function mount() {
    if (gear || !document.body) return;

    gear = el("button", "ymin-gear");
    gear.type = "button";
    gear.setAttribute("aria-label", "Settings");
    gear.setAttribute("aria-expanded", "false");
    gear.title = "Settings";
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener("click", () => (open ? closePanel() : openPanel()));
    document.body.appendChild(gear);

    // The gear is only visible on the blank page (CSS). If the user searches
    // and leaves that page, close the panel that was left open.
    new MutationObserver(() => {
      if (open && !root.classList.contains("ymin-blocked")) closePanel();
    }).observe(root, { attributes: true, attributeFilter: ["class"] });

    api.onPrefsChange(render);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();
