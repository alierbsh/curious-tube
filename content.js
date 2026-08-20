/**
 * YouTube Minimalist Search — content script
 *
 * CSS statik gizlemeyi yapar; bu dosya CSS'in tek basina cozemedigi
 * uc isi ustlenir:
 *   1) Rota takibi  — YouTube bir SPA oldugu icin sayfa degisimi
 *                     yeniden yukleme uretmez; <html> uzerindeki
 *                     isaretleri her gezinmede guncelleriz.
 *   2) Yonlendirme  — /shorts/<id> adresleri normal oynaticiya tasinir.
 *   3) Temizlik     — sonradan DOM'a enjekte edilen raf/reklam/promosyon
 *                     dugumleri gorulur gorulmez kaldirilir.
 */

(() => {
  "use strict";

  /** Icerigi tamamen bosaltilacak rotalar (ana sayfa, akislar, kesfet). */
  const BLOCKED_PATHS = new Set([
    "/",
    "/feed/subscriptions",
    "/feed/trending",
    "/feed/explore",
    "/feed/storefront",
    "/gaming",
  ]);

  /** Sonradan enjekte edilen ve dogrudan DOM'dan silinen dugumler. */
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

  const root = document.documentElement;

  /* ------------------------------------------------------------------ */
  /* Rota                                                                */
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

  /** /shorts/<id> -> /watch?v=<id>: Shorts akisina hic girilmez. */
  function redirectShorts() {
    const id = location.pathname.split("/")[2];
    if (!id) return false;
    location.replace(location.origin + "/watch?v=" + id);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Bos sayfa karsilamasi                                               */
  /* ------------------------------------------------------------------ */

  function renderHero(show) {
    let hero = document.getElementById("ymin-hero");

    if (!show) {
      if (hero) hero.remove();
      return;
    }
    if (hero || !document.body) return;

    hero = document.createElement("div");
    hero.id = "ymin-hero";

    const title = document.createElement("div");
    title.className = "ymin-hero-title";
    title.textContent = "Arama modu";

    const sub = document.createElement("div");
    sub.className = "ymin-hero-sub";
    sub.textContent = "Aramak istediginizi yukaridaki cubuga yazin.";

    hero.append(title, sub);
    document.body.appendChild(hero);
  }

  /** Bos sayfada imleci dogrudan arama kutusuna koy. */
  function focusSearch() {
    const input = document.querySelector(
      "input#search, input.ytSearchboxComponentInput, input[name='search_query']"
    );
    if (input && document.activeElement !== input) input.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Uygulama                                                            */
  /* ------------------------------------------------------------------ */

  let lastHref = "";

  function apply() {
    const first = !root.dataset.yminPage;
    if (location.href === lastHref && !first) return;
    lastHref = location.href;

    const page = currentPage();

    if (page === "shorts" && redirectShorts()) return;

    root.dataset.yminPage = page;
    root.classList.toggle("ymin-blocked", page === "blocked");

    renderHero(page === "blocked");
    if (page === "blocked") {
      // Arama kutusu ust bar cizildikten sonra hazir oluyor.
      setTimeout(focusSearch, 300);
    }

    sweep(document);
  }

  /* ------------------------------------------------------------------ */
  /* DOM temizligi                                                       */
  /* ------------------------------------------------------------------ */

  function sweep(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll(KILL_SELECTORS).forEach((node) => node.remove());
  }

  const observer = new MutationObserver((mutations) => {
    // Gezinme yeni bir dokuman uretmedigi icin URL'i her turda dogrula.
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

  // document_start'ta calistigimiz icin <body> henuz olmayabilir.
  apply(); // <html> isaretlerini erken koy: sayfa hic titremesin.
  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  // YouTube'un kendi gezinme olaylari + tarayici geri/ileri.
  window.addEventListener("yt-navigate-start", apply, true);
  window.addEventListener("yt-navigate-finish", apply, true);
  window.addEventListener("yt-page-data-updated", apply, true);
  window.addEventListener("popstate", apply, true);
})();
