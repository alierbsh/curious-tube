/**
 * YouTube Minimalist Search — content script
 *
 * CSS statik gizlemeyi yapar; bu dosya CSS'in tek basina cozemedigi
 * dort isi ustlenir:
 *   1) Rota takibi  — YouTube bir SPA oldugu icin sayfa degisimi
 *                     yeniden yukleme uretmez; <html> uzerindeki
 *                     isaretleri her gezinmede guncelleriz.
 *   2) Yonlendirme  — /shorts/<id> adresleri normal oynaticiya tasinir.
 *   3) Temizlik     — sonradan DOM'a enjekte edilen raf/reklam/promosyon
 *                     dugumleri gorulur gorulmez kaldirilir.
 *   4) Emniyet      — arama kutusu gorunmuyorsa eklentinin riskli kurallari
 *                     otomatik devre disi birakilir (bkz. ensureSearchVisible).
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

  /** Arama girdisi: eski ve yeni ust bar bilesenlerinin ikisini de kapsar. */
  const SEARCH_INPUT =
    "input#search, input.ytSearchboxComponentInput, input[name='search_query']";

  const root = document.documentElement;

  /** Girdinin placeholder niteligini izleyen gozlemci (stripPlaceholder). */
  let placeholderObserver = null;

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
  /* Emniyet: arama kutusu her kosulda ekranda kalmali                    */
  /* ------------------------------------------------------------------ */

  /**
   * Arama kutusunun gercekten gorunur oldugunu dogrular. Gizlenmisse ya da
   * gorunur alanin disina tasmissa <html> uzerine .ymin-safe eklenir; bu
   * sinif CSS tarafinda oneri gizleme ve ortalama bloklarini komple kapatir.
   * Boylece hatali bir secici en kotu ihtimalle ozelligi devre disi birakir,
   * kullaniciyi bos ekranda birakmaz.
   */
  function ensureSearchVisible() {
    if (root.classList.contains("ymin-safe")) return;

    // Yanlis alarmi onle: tam ekranda YouTube ust bari kendisi gizler,
    // gorunmeyen sekmede ise olcum guvenilir degildir.
    if (document.fullscreenElement) return;
    if (document.visibilityState !== "visible") return;

    const input = document.querySelector(SEARCH_INPUT);
    if (!input) return; // Ust bar henuz cizilmedi; sonraki kontrolde bakilir.

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
      "[YouTube Minimalist Search] Arama kutusu gorunmuyor; oneri gizleme ve " +
        "ortalama kurallari bu sekmede devre disi birakildi."
    );
  }

  /* ------------------------------------------------------------------ */
  /* Arama kutusu                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Kutunun icindeki stok "Ara" / "Search" metnini siler. YouTube kutuyu
   * yeniden cizdiginde ya da dil degistiginde placeholder geri gelebildigi
   * icin, girdinin uzerine sadece bu nitelige bakan bir gozlemci baglanir;
   * geri yazildigi anda tekrar bosaltilir.
   */
  function stripPlaceholder() {
    const input = document.querySelector(SEARCH_INPUT);
    if (!input) return;

    if (input.getAttribute("placeholder")) input.setAttribute("placeholder", "");

    if (!placeholderObserver) {
      placeholderObserver = new MutationObserver((records) => {
        for (const record of records) {
          const el = record.target;
          // Bos degere geri donus yeni bir kayit uretmez: dongu olusmaz.
          if (el.getAttribute("placeholder")) el.setAttribute("placeholder", "");
        }
      });
    }

    // Gezinmede girdi elemani yenilenebilir; her seferinde guncel dugume bagla.
    placeholderObserver.disconnect();
    placeholderObserver.observe(input, {
      attributes: true,
      attributeFilter: ["placeholder"],
    });
  }

  /** Bos sayfada imleci arama kutusuna koy (kullaniciyi rahatsiz etmeden). */
  function focusSearch() {
    const input = document.querySelector(SEARCH_INPUT);
    if (!input || input.value) return;

    const active = document.activeElement;
    if (active && active !== document.body && active !== root) return;

    input.focus();
  }

  /**
   * Ust bar Polymer tarafindan gec cizildigi icin kontrolleri birkac kez,
   * artan araliklarla tekrarlariz.
   */
  function settle() {
    [300, 900, 1800].forEach((delay) =>
      setTimeout(() => {
        ensureSearchVisible();
        stripPlaceholder();
        if (root.classList.contains("ymin-blocked")) focusSearch();
      }, delay)
    );
  }

  /* ------------------------------------------------------------------ */
  /* Uygulama                                                            */
  /* ------------------------------------------------------------------ */

  let lastHref = "";

  function apply() {
    const page = currentPage();
    if (page === "shorts" && redirectShorts()) return;

    // Not: burada "URL degismediyse cik" seklinde bir erken donus yok.
    // document_start'ta <body> henuz olmadigi icin ilk cagri her isi
    // yapamaz; erken donus, sonraki cagrilarin da bos gecmesine yol aciyordu.
    const navigated = location.href !== lastHref;
    lastHref = location.href;

    root.dataset.yminPage = page;
    root.classList.toggle("ymin-blocked", page === "blocked");

    stripPlaceholder();
    settle();

    if (navigated) sweep(document);
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
