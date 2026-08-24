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
 *   5) Varlik       — sayfanin arka plan gorseli ve logolar; eklenti ici
 *                     adresler ancak calisma aninda bilindigi icin buradan
 *                     yazilir (bkz. applyWallpaperRef, renderLogo,
 *                     renderNavLogo).
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
    { file: "wallpapers/wallpaper-10.jpg", label: "Duvar kagidi 10" },
  ];

  /** Arama modunda cubugun ustunde gosterilen logo. */
  const LOGO = "logo.png";

  /** chrome.storage.local anahtarlari. */
  const KEY_SELECTED = "selectedWallpaper";
  const KEY_SHUFFLE = "shuffleWallpaper";
  const KEY_CUSTOM = "customWallpapers";

  /**
   * Kullanicinin yukledigi duvar kagitlari.
   *
   * Depolama duzeni bilerek ikiye ayrildi:
   *   customWallpapers      -> yalnizca ust veri dizisi [{id, bytes, addedAt}]
   *   ymin:custom:<id>      -> o gorselin base64 verisi (ayri anahtar)
   *
   * Boylece sayfa acilirken TUM gorseller belleğe alinmiyor; sadece secili
   * olanin anahtari okunuyor. Hepsi tek bir dizide dursaydi her okuma
   * megabaytlarca base64'u cozmek zorunda kalirdi.
   */
  const CUSTOM_PREFIX = "custom:";
  const CUSTOM_DATA_PREFIX = "ymin:custom:";

  /** Kota korumasi (7. madde). Degerler muhafazakar secildi. */
  const MAX_CUSTOM_COUNT = 12;
  const MAX_ITEM_BYTES = 3 * 1024 * 1024; // tek gorsel icin tavan
  const QUOTA_SAFETY_BYTES = 512 * 1024; // depoda daima bos kalacak pay

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
  let appliedRef = null;

  /** Kullanici duvar kagitlarinin ust verisi (base64 burada DEGIL). */
  let customIndex = [];

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
   * Duvar kagidini uygular. ref iki bicimden biri olabilir:
   *   "wallpapers/x.jpg" -> eklenti icindeki yerlesik gorsel
   *   "custom:<id>"      -> kullanicinin yukledigi, storage'daki base64
   *
   * Ozel gorseller storage'dan okunmak zorunda oldugu icin bu yol asenkron;
   * yerlesikler eskisi gibi aninda uygulanir.
   */
  function applyWallpaperRef(ref) {
    try {
      if (isCustomRef(ref)) {
        const key = customDataKey(ref);
        chrome.storage.local.get(key).then((res) => {
          const dataUrl = res && res[key];
          if (!dataUrl) {
            // Veri silinmis ama secim kalmis: yerlesike don.
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
      // Eklenti yeniden yuklendiginde eski sekmelerde runtime baglami duser;
      // bu durumda gorseli hic uygulamayip stok gorunumde kaliriz.
      root.classList.remove("ymin-wallpaper");
    }
  }

  function noop() {}

  /** Katalogda olmayan bir dosya adi gelirse ilk gorsele duseriz. */
  function entryFor(file) {
    return WALLPAPERS.find((w) => w.file === file) || WALLPAPERS[0];
  }

  /** Karisik havuz: yerlesikler + kullanicinin yukledikleri (6. madde). */
  function shufflePool() {
    return WALLPAPERS.map((w) => w.file).concat(
      customIndex.map((c) => CUSTOM_PREFIX + c.id)
    );
  }

  /** Karisik mod: mumkunse su an ekranda olandan farkli birini sec. */
  function randomRef() {
    const all = shufflePool();
    const pool = all.filter((ref) => ref !== appliedRef);
    const list = pool.length ? pool : all;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Tercihlere gore hangi gorselin gosterilecegi. */
  function resolveRef() {
    return prefs[KEY_SHUFFLE] ? randomRef() : prefs[KEY_SELECTED];
  }

  /* ---- Kullanici duvar kagitlari: ekleme / silme / kota --------------- */

  function quotaLimit() {
    const local = chrome.storage.local;
    return (local && local.QUOTA_BYTES) || 10 * 1024 * 1024;
  }

  /**
   * Base64 gorseli depoya ekler. Kota asilirsa YAZMADAN once reddeder;
   * boylece storage yarim kalmis bir kayitla dolmaz. Hata kodlari arayuzde
   * kullaniciya anlasilir bir mesaja cevrilir.
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

  /** Gorseli ve ust verisini siler; secili olan silinirse yerlesike doner. */
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

  /** Arayuzun kucuk resimleri cizebilmesi icin base64 verilerini getirir. */
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

  /** Depoda ne kadar yer kullanildigi (arayuzde gosterilir). */
  function storageUsage() {
    return chrome.storage.local.getBytesInUse(null).then(
      (used) => ({ used: used, limit: quotaLimit() }),
      () => ({ used: 0, limit: quotaLimit() })
    );
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

  /**
   * Ust bardaki YouTube logosunu kendi logomuzla degistirir.
   *
   * Onemli olan nasil yaptigi: YouTube'un ana sayfa baglantisini SILMIYORUZ.
   * O <a href="/"> elemani YouTube'un kendi router'ina baglidir; kaldirip
   * yerine yenisini koysaydik tiklama tam sayfa yenilemeye duserdi. Bunun
   * yerine baglantinin icindeki YouTube isaretini CSS ile gizleyip (1. bolum)
   * kendi <img>'imizi ayni baglantinin icine ekliyoruz. Boylece tiklama
   * davranisi, SPA gezinmesi ve klavye erisimi oldugu gibi kaliyor.
   *
   * Baglanti bulunamazsa (YouTube isaretlemesi degisirse) #start icine kendi
   * baglantimizi kuruyoruz; o da ana sayfaya goturur, sadece tam sayfa
   * yenilemesiyle.
   */
  function renderNavLogo() {
    // Attached olmayan dugumu bulmaz: YouTube silmisse yeniden ekleriz.
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
        host.setAttribute("aria-label", "Ana sayfa");
        start.insertBefore(host, start.firstChild);
      }
    }

    try {
      const img = document.createElement("img");
      img.id = "ymin-nav-logo";
      img.src = chrome.runtime.getURL(LOGO);
      img.alt = "Ana sayfa"; // Baglanti oldugu icin erisilebilir bir ad tasir.
      img.decoding = "async";
      host.appendChild(img);
    } catch (_) {
      // Eklenti baglami dustuyse ust bar YouTube'un stok halinde kalir.
    }
  }

  /* ---- Tercihler: localStorage (senkron onbellek) + chrome.storage ---- */

  /**
   * Onbellek yalnizca kucuk degerleri tutar: iki tercih ve kullanici
   * gorsellerinin KIMLIKLERI. Base64 verisi buraya asla yazilmaz — hem
   * sayfanin localStorage kotasini yerdi hem de YouTube'un kendi verisiyle
   * ayni alani paylasiyor.
   *
   * Kimliklerin burada olmasi sart: karisik mod, daha chrome.storage
   * cevaplamadan (document_start) havuzu kurabilsin diye. Aksi halde ilk
   * cekiliste yalnizca yerlesik gorseller yarisirdi.
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
      if (typeof parsed[KEY_SHUFFLE] === "boolean") {
        clean[KEY_SHUFFLE] = parsed[KEY_SHUFFLE];
      }
      return Object.assign({}, DEFAULT_PREFS, clean);
    } catch (_) {
      return null;
    }
  }

  function writeCache() {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          [KEY_SELECTED]: prefs[KEY_SELECTED],
          [KEY_SHUFFLE]: Boolean(prefs[KEY_SHUFFLE]),
          customIds: customIndex.map((c) => c.id),
        })
      );
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

    // Ozel gorseller yalnizca storage'da; senkron uygulanamazlar. Onbellek
    // ozel bir secim gosteriyorsa yerlesik bir gorseli bir anligina gosterip
    // sonra degistirmek yerine bekleriz (goz alici bir takla olmasin).
    if (!isCustomRef(resolveRef())) applyWallpaperRef(resolveRef());

    try {
      chrome.storage.local.get([KEY_SELECTED, KEY_SHUFFLE, KEY_CUSTOM]).then((stored) => {
        if (!stored) return;
        const wasShuffle = prefs[KEY_SHUFFLE];
        customIndex = Array.isArray(stored[KEY_CUSTOM]) ? stored[KEY_CUSTOM] : [];
        prefs = Object.assign({}, DEFAULT_PREFS, prefs, {
          [KEY_SELECTED]: stored[KEY_SELECTED] || prefs[KEY_SELECTED],
          [KEY_SHUFFLE]: Boolean(stored[KEY_SHUFFLE]),
        });
        writeCache();

        // Karisik mod acik kaldiysa zaten rastgele bir gorsel uyguladik;
        // ikinci kez cekmek gozle gorulur bir sicrama yaratirdi.
        const shuffleChanged = prefs[KEY_SHUFFLE] !== wasShuffle;
        const staleFixed =
          !prefs[KEY_SHUFFLE] && appliedRef !== prefs[KEY_SELECTED];
        if (shuffleChanged || staleFixed || appliedRef === null) {
          applyWallpaperRef(resolveRef());
        }
        notify();
      }, noop);

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
        if (KEY_CUSTOM in changes) {
          customIndex = changes[KEY_CUSTOM].newValue || [];
          touched = true;
        }
        if (!touched) return;
        writeCache();
        if (!prefs[KEY_SHUFFLE] && appliedRef !== prefs[KEY_SELECTED]) {
          applyWallpaperRef(prefs[KEY_SELECTED]);
        }
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
        renderNavLogo();
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
