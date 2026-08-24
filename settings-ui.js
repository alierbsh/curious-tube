/**
 * Curious YouTube — ayarlar arayuzu
 *
 * Sag ust kosedeki disli butonu ve actigi cekmece (drawer) paneli. Panel iki
 * bolumden olusur: duvar kagidi izgarasi ve ayarlar.
 *
 * Bu dosya content.js'ten SONRA yuklenir ve onun window.__curiousYouTube
 * uzerinden actigi kucuk API'yi kullanir (katalog + tercih okuma/yazma).
 * Icerik betikleri izole dunyayi paylastigi icin bu nesne sayfanin kendi
 * JavaScript'ine gorunmez.
 *
 * Panel ve butonun stilleri content.css'in 10. bolumundedir; burada yalnizca
 * yapi ve davranis vardir.
 */

(() => {
  "use strict";

  const api = window.__curiousYouTube;
  if (!api) return; // content.js yuklenmediyse arayuz de acilmasin.

  const root = document.documentElement;

  let gear = null;
  let scrim = null;
  let panel = null;
  let built = false;
  let open = false;

  /* ------------------------------------------------------------------ */
  /* Kucuk yardimcilar                                                   */
  /* ------------------------------------------------------------------ */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const GEAR_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path fill="currentColor" d="M19.14 12.94a7.6 7.6 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>' +
    "</svg>";

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>' +
    "</svg>";

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
    panel.setAttribute("aria-label", "Curious YouTube ayarlari");

    /* --- Baslik --- */
    const header = el("header", "ymin-panel-header");
    header.appendChild(el("div", "ymin-panel-title", "Curious YouTube"));

    const close = el("button", "ymin-icon-btn");
    close.type = "button";
    close.setAttribute("aria-label", "Kapat");
    close.textContent = "×";
    close.addEventListener("click", closePanel);
    header.appendChild(close);
    panel.appendChild(header);

    /* --- Sekmeler --- */
    const tabs = el("nav", "ymin-tabs");
    tabs.setAttribute("role", "tablist");
    const wallpapersTab = tabButton("wallpapers", "Wallpapers");
    const settingsTab = tabButton("settings", "Settings");
    tabs.append(wallpapersTab, settingsTab);
    panel.appendChild(tabs);

    /* --- Bolum: Wallpapers --- */
    const wallpapersPane = el("div", "ymin-pane");
    wallpapersPane.dataset.pane = "wallpapers";

    const shuffleNote = el(
      "p",
      "ymin-note",
      "Karisik mod acik: sectiginiz gorsel simdi uygulanir, ancak ana sayfayi " +
        "her acisinizda rastgele biri gosterilir."
    );
    shuffleNote.dataset.role = "shuffle-note";
    wallpapersPane.appendChild(shuffleNote);

    const grid = el("div", "ymin-grid");
    api.WALLPAPERS.forEach((entry) => grid.appendChild(tile(entry)));
    wallpapersPane.appendChild(grid);
    panel.appendChild(wallpapersPane);

    /* --- Bolum: Settings --- */
    const settingsPane = el("div", "ymin-pane");
    settingsPane.dataset.pane = "settings";
    settingsPane.hidden = true;

    const row = el("div", "ymin-row");
    const label = el("div", "ymin-row-label");
    label.appendChild(el("div", "ymin-row-title", "Karışık Duvar Kağıdı"));
    label.appendChild(
      el(
        "div",
        "ymin-row-sub",
        "Ana sayfayı her açtığınızda rastgele bir duvar kağıdı gösterilir."
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
      // Acilir acilmaz etkisi gorulsun; kapatilinca sabit secime donulur.
      api.applyWallpaperFile(
        next ? api.randomFile() : api.getPrefs()[api.KEY_SELECTED]
      );
      render();
    });

    row.append(label, toggle);
    settingsPane.appendChild(row);
    panel.appendChild(settingsPane);

    document.body.append(scrim, panel);
    render();
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

  function tile(entry) {
    const btn = el("button", "ymin-tile");
    btn.type = "button";
    btn.dataset.file = entry.file;
    btn.setAttribute("aria-label", entry.label);
    btn.title = entry.label;

    const img = el("img", "ymin-thumb");
    img.loading = "lazy"; // Ekranda gorunmeyen kucuk resimler bosuna acilmasin.
    img.decoding = "async";
    img.alt = "";
    try {
      img.src = chrome.runtime.getURL(entry.file);
    } catch (_) {
      /* baglam dustuyse bos kutu kalir */
    }

    const badge = el("span", "ymin-tile-check");
    badge.innerHTML = CHECK_SVG;

    btn.append(img, badge);
    btn.addEventListener("click", () => {
      api.setPrefs({ [api.KEY_SELECTED]: entry.file });
      api.applyWallpaperFile(entry.file);
      render();
    });
    return btn;
  }

  /** Arayuzu yururlukteki tercihlere gore tazeler. */
  function render() {
    if (!built) return;
    const current = api.getPrefs();

    panel.querySelectorAll(".ymin-tile").forEach((btn) => {
      const selected = btn.dataset.file === current[api.KEY_SELECTED];
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
  /* Ac / kapa                                                           */
  /* ------------------------------------------------------------------ */

  function openPanel() {
    buildPanel();
    open = true;
    // Bir sonraki kareye birakiyoruz ki gecis animasyonu calissin.
    requestAnimationFrame(() => {
      scrim.classList.add("is-open");
      panel.classList.add("is-open");
    });
    gear.setAttribute("aria-expanded", "true");
    selectTab("wallpapers");
    render();
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
  /* Kurulum                                                             */
  /* ------------------------------------------------------------------ */

  function mount() {
    if (gear || !document.body) return;

    gear = el("button", "ymin-gear");
    gear.type = "button";
    gear.setAttribute("aria-label", "Ayarlar");
    gear.setAttribute("aria-expanded", "false");
    gear.title = "Ayarlar";
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener("click", () => (open ? closePanel() : openPanel()));
    document.body.appendChild(gear);

    // Disli yalnizca bos sayfada gorunur (CSS). Kullanici arama yapip
    // sayfadan cikarsa acik kalan panel de kapansin.
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
