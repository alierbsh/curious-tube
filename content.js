/**
 * Curious YouTube — content script
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
 *   5) Varlik       — sayfanin arka plan gorseli, eklenti ici adresi ancak
 *                     calisma aninda bilindigi icin CSS degiskenine buradan
 *                     yazilir (bkz. applyWallpaper).
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

  /**
   * Duvar kagidi katalogu. Yeni gorsel eklemek icin wallpapers/ klasorune
   * dosyayi atip buraya bir satir eklemek yeterli; manifest'teki
   * web_accessible_resources zaten "wallpapers/*" jokerini kullaniyor.
   *
   * size / position istege baglidir. Gorsellerin kompozisyonu farkli oldugu
   * icin her biri icin ayri kirpma verilebilir; verilmezse CSS'teki
   * varsayilan (cover / center) gecerli olur. 1 numarali gorselin tam
   * ortasinda beyaz bir yazi bandi var, bu yuzden buyutulup asagi kaydirilir
   * (yoksa bant arama cubugunun arkasina denk geliyor).
   */
  const WALLPAPERS = [
    {
      file: "wallpapers/wallpaper-1.png",
      label: "Duvar kagidi 1",
      size: "max(130%, 190vh)",
      position: "center 15%",
    },
    { file: "wallpapers/wallpaper-2.jpg", label: "Duvar kagidi 2" },
    { file: "wallpapers/wallpaper-3.jpg", label: "Duvar kagidi 3" },
    { file: "wallpapers/wallpaper-4.jpg", label: "Duvar kagidi 4" },
    { file: "wallpapers/wallpaper-5.jpg", label: "Duvar kagidi 5" },
    { file: "wallpapers/wallpaper-6.jpg", label: "Duvar kagidi 6" },
    { file: "wallpapers/wallpaper-7.jpg", label: "Duvar kagidi 7" },
    { file: "wallpapers/wallpaper-8.jpg", label: "Duvar kagidi 8" },
    { file: "wallpapers/wallpaper-9.jpg", label: "Duvar kagidi 9" },
  ];

  /** Arama modunda cubugun ustunde gosterilen logo. */
  const LOGO = "logo.png";

  /** chrome.storage.local anahtarlari. */
  const KEY_SELECTED = "selectedWallpaper";
  const KEY_SHUFFLE = "shuffleWallpaper";

  /**
   * Tercihlerin sayfa yerel kopyasi. chrome.storage ASENKRON oldugu icin
   * ilk boyama sirasinda deger elimizde olmaz ve duvar kagidi bir an
   * yanlis/bos gorunur. Bunu onlemek icin son bilinen tercihi sayfanin
   * localStorage'inda da tutuyoruz: document_start'ta senkron okunur,
   * gercek deger gelince sessizce guncellenir.
   */
  const CACHE_KEY = "ymin:prefs";

  const DEFAULT_PREFS = {
    [KEY_SELECTED]: WALLPAPERS[0].file,
    [KEY_SHUFFLE]: false,
  };

  /** Arama girdisi: eski ve yeni ust bar bilesenlerinin ikisini de kapsar. */
  const SEARCH_INPUT =
    "input#search, input.ytSearchboxComponentInput, input[name='search_query']";

  const root = document.documentElement;

  /** Girdinin placeholder niteligini izleyen gozlemci (stripPlaceholder). */
  let placeholderObserver = null;

  /** Yururlukteki tercihler ve o an ekranda olan duvar kagidi. */
  let prefs = Object.assign({}, DEFAULT_PREFS);
  let appliedFile = null;

  /** Tercih degisince haberdar olacaklar (ayarlar arayuzu). */
  const prefListeners = [];

  function notify() {
    const snapshot = Object.assign({}, prefs);
    prefListeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (_) {
        /* bir dinleyicinin hatasi digerlerini durdurmasin */
      }
    });
  }

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
      "[Curious YouTube] Arama kutusu gorunmuyor; oneri gizleme ve " +
        "ortalama kurallari bu sekmede devre disi birakildi."
    );
  }

  /* ------------------------------------------------------------------ */
  /* Arama kutusu                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Sayfanin arka plan gorselini CSS'e aktarir.
   *
   * content.css icinden dogrudan url("wallpapers/...") yazilamaz: o yol
   * eklenti koku yerine sayfaya gore cozulur. Dosyanin gercek adresi
   * yalnizca chrome.runtime.getURL ile bilinir (ve manifest'teki
   * web_accessible_resources sayesinde sayfadan yuklenebilir). Adresi
   * --ymin-wallpaper degiskenine yazip bicimlendirmeyi (cover, fixed, ...)
   * CSS'e birakiyoruz.
   */
  function applyWallpaperFile(file) {
    const entry = entryFor(file);
    try {
      const url = chrome.runtime.getURL(entry.file);
      if (!url) return;
      root.style.setProperty("--ymin-wallpaper", 'url("' + url + '")');
      root.style.setProperty("--ymin-wallpaper-size", entry.size || "cover");
      root.style.setProperty(
        "--ymin-wallpaper-position",
        entry.position || "center"
      );
      root.classList.add("ymin-wallpaper");
      appliedFile = entry.file;
    } catch (_) {
      // Eklenti yeniden yuklendiginde eski sekmelerde runtime baglami duser;
      // bu durumda gorseli hic uygulamayip stok gorunumde kaliriz.
      root.classList.remove("ymin-wallpaper");
    }
  }

  /** Katalogda olmayan bir dosya adi gelirse ilk gorsele duseriz. */
  function entryFor(file) {
    return WALLPAPERS.find((w) => w.file === file) || WALLPAPERS[0];
  }

  /** Karisik mod: mumkunse su an ekranda olandan farkli birini sec. */
  function randomFile() {
    const pool = WALLPAPERS.filter((w) => w.file !== appliedFile);
    const list = pool.length ? pool : WALLPAPERS;
    return list[Math.floor(Math.random() * list.length)].file;
  }

  /** Tercihlere gore hangi dosyanin gosterilecegi. */
  function resolveFile() {
    return prefs[KEY_SHUFFLE] ? randomFile() : prefs[KEY_SELECTED];
  }

  /**
   * Logoyu bir kez <body>'ye ekler. Konumlandirma ve gizleme tamamen CSS'te:
   * eleman her zaman DOM'da durur, yalnizca .ymin-blocked varken gorunur.
   * Boylece her gezinmede yeniden olusturmak gerekmez.
   */
  function renderLogo() {
    if (!document.body || document.getElementById("ymin-logo")) return;
    try {
      const img = document.createElement("img");
      img.id = "ymin-logo";
      img.src = chrome.runtime.getURL(LOGO);
      img.alt = ""; // Dekoratif: sayfada metin birakmiyoruz.
      img.decoding = "async";
      document.body.appendChild(img);
    } catch (_) {
      // Eklenti baglami dustuyse logo hic eklenmez.
    }
  }

  /* ---- Tercihler: localStorage (senkron onbellek) + chrome.storage ---- */

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? Object.assign({}, DEFAULT_PREFS, JSON.parse(raw)) : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
    } catch (_) {
      // Ozel pencerede veya depolama kapaliysa onbellek olmadan devam.
    }
  }

  /** UI'in tercih yazmasi icin: hem onbellege hem chrome.storage'a. */
  function setPrefs(patch) {
    prefs = Object.assign({}, prefs, patch);
    writeCache();
    try {
      chrome.storage.local.set(patch);
    } catch (_) {
      /* baglam dustuyse yalnizca bu sekmede gecerli olur */
    }
    return Object.assign({}, prefs);
  }

  /**
   * Ilk uygulama: once onbellekten (senkron, titremesiz), sonra
   * chrome.storage'daki gercek degerle uzlastirma.
   */
  function initWallpaper() {
    prefs = readCache() || Object.assign({}, DEFAULT_PREFS);
    applyWallpaperFile(resolveFile());

    try {
      chrome.storage.local.get([KEY_SELECTED, KEY_SHUFFLE], (stored) => {
        if (chrome.runtime.lastError || !stored) return;
        const wasShuffle = prefs[KEY_SHUFFLE];
        prefs = Object.assign({}, DEFAULT_PREFS, prefs, stored);
        writeCache();

        // Karisik mod acik kaldiysa zaten rastgele bir gorsel uyguladik;
        // ikinci kez cekmek gozle gorulur bir sicrama yaratirdi.
        const shuffleChanged = prefs[KEY_SHUFFLE] !== wasShuffle;
        const staleFixed =
          !prefs[KEY_SHUFFLE] && appliedFile !== prefs[KEY_SELECTED];
        if (shuffleChanged || staleFixed) applyWallpaperFile(resolveFile());
        notify();
      });

      // Baska bir sekmede degistirilirse burasi da guncellensin.
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        let touched = false;
        for (const key of [KEY_SELECTED, KEY_SHUFFLE]) {
          if (key in changes) {
            prefs[key] = changes[key].newValue;
            touched = true;
          }
        }
        if (!touched) return;
        writeCache();
        if (!prefs[KEY_SHUFFLE]) applyWallpaperFile(prefs[KEY_SELECTED]);
        notify();
      });
    } catch (_) {
      /* storage izni yoksa veya baglam dustuyse onbellekle devam */
    }
  }

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
        renderLogo();
        stripPlaceholder();
        if (root.classList.contains("ymin-blocked")) focusSearch();
      }, delay)
    );
  }

  /* ------------------------------------------------------------------ */
  /* Uygulama                                                            */
  /* ------------------------------------------------------------------ */

  let lastHref = "";
  let lastPage = null;

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

    // Karisik mod: her ana sayfaya GIRISTE yeni bir gorsel. Zaten bos
    // sayfadayken yapilan gezinmeler gorseli degistirmez.
    if (prefs[KEY_SHUFFLE] && page === "blocked" && lastPage && lastPage !== "blocked") {
      applyWallpaperFile(randomFile());
    }
    lastPage = page;

    renderLogo();
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

  // Duvar kagidi, rota isaretlerinden once uygulanir ki ilk boyamada
  // dogru gorsel hazir olsun.
  initWallpaper();

  /**
   * Ayarlar arayuzune (settings-ui.js) acilan kucuk yuzey. Icerik betikleri
   * ayni izole dunyayi paylastigi icin window uzerinden erisilir; sayfanin
   * kendi JavaScript'i bu nesneyi goremez.
   */
  window.__curiousYouTube = {
    WALLPAPERS,
    KEY_SELECTED,
    KEY_SHUFFLE,
    getPrefs: () => Object.assign({}, prefs),
    setPrefs,
    applyWallpaperFile,
    randomFile,
    onPrefsChange: (fn) => prefListeners.push(fn),
  };

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
