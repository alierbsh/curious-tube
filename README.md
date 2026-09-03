# CuriousTube

> Watch what you're curious about, not the algorithm's dictate.

YouTube'u bir arama motoruna indirgeyen Chrome eklentisi (Manifest V3).
Hesabinizdan cikis yapmadan, ana sayfa akisi / sol menu / oneriler / Shorts
gibi dikkat dagitici her seyi gizler; geriye **arama cubugu, arama butonu ve
arama sonuclari** kalir.

## Ne gizlenir, ne kalir

| Gizlenir | Kalir |
| --- | --- |
| Ana sayfa akisi, Abonelikler, Kesfet, Trendler | Arama cubugu + arama butonu |
| Sol menu (guide) ve mini menu | Arama sonuclari listesi |
| Ust bardaki logo, olustur, bildirim, avatar | Video oynatici (`/watch`) |
| Izleme sayfasinda "Siradaki" onerileri ve yorumlar | Video basligi ve aciklamasi |
| Shorts (her yerde; `/shorts/<id>` -> `/watch?v=<id>`) | |
| Arama gecmisi ve otomatik tamamlama onerileri (dropdown) | |
| Reklamlar, promosyon balonlari, bitis ekrani kartlari | |

Kutuya tiklandiginda YouTube'un mavi odak cercevesi ezilir ve yerine
**kirmizi** bir cerceve + yumusak hale gelir. Sadece renk ve golge degistigi
icin kutu ne buyur ne kayar.

Sayfanin tamamina secili duvar kagidi serilir (`cover` + `fixed`, yani
kaydirirken kaymaz). Tek bir dosya degil, bir **katalog** vardir: `content.js`
icindeki `WALLPAPERS` dizisi ile kullanicinin kendi yukledigi gorseller
(bkz. "Ayarlar paneli"). Gorsel `content.css` icinden degil, `content.js`'in
`--ymin-wallpaper` degiskenine yazdigi calisma zamani adresinden gelir:
eklenti ici bir dosyanin yolu CSS'ten dogrudan cozulemez. Bos sayfada gorsel
tam parlakligindadir; arama sonuclari ve izleme sayfasinda uzerine ince bir
karartma serilir, boylece yazilar gorselin acik bolgelerinde de okunur.

`logo.png` iki yerde kullanilir ve ikisi birbirini disler:

- **Bos sayfada** arama cubugunun hemen ustunde buyuk halde durur.
- **Icerik sayfalarinda** (arama sonuclari, izleme) ust barin sol ustunde,
  YouTube'un kendi logosunun yerinde kucuk halde durur ve **ana sayfa
  dugmesi** olarak calisir.

Sol ustteki logo, YouTube'un ana sayfa baglantisinin yerine gecmez; o
`<a href="/">` elemani DOM'da kalir, yalnizca icindeki YouTube isareti gizlenip
kendi gorselimiz ayni baglantinin icine eklenir. Boylece tiklama YouTube'un
kendi SPA yonlendirmesiyle calisir (tam sayfa yenilemesi olmaz) ve klavye
erisimi bozulmaz. Baglanti bulunamazsa yedek olarak kendi `<a href="/">`
baglantimiz kurulur.

### Sag ustteki hesap baglantisi

Ust bardaki avatar gizlenir, ama yerine kendi baglantimiz (`#ymin-account`)
sag ust koseye konur: yuvarlak avatar, tiklaninca **kendi kanaliniz**.

Adres ve avatar tahmin edilmez, YouTube'un kendi DOM'undan **ogrenilir** ve
`chrome.storage.local` icinde (`myChannelUrl`, `myAvatarUrl`) saklanir:

- Avatar, ust bardaki `img`'den okunur. Polymer bunu gec cizdigi icin okuma
  `settle()` tekrarlarina bindirilmistir; her mutation'da sorgu yapilmaz.
- Kanal adresi, YouTube'un hesap basligindan
  (`ytd-active-account-header-renderer`) alinir. O eleman DOM'da yoksa ve
  sayfa `/feed/you` ise `findOwnChannelOnHub()` devreye girer: menu,
  raf ve video kartlari gibi **baskasina ait** kapsamlarin disinda kalan
  kanal baglantilarina bakar ve yalnizca **tek** bir aday varsa kabul eder.
  Belirsizlik basarisizlik sayilir; kullaniciyi yanlis kanala gondermek,
  baglantiyi oldugu yerde birakmaktan kotudur.
- Ogrenilene kadar baglanti `/feed/you` adresine gider (`ACCOUNT_FALLBACK`),
  yani hicbir zaman olu bir baglanti olmaz.
- Ogrenildikten sonra kanalin **`/videos`** sekmesine gider: kanalin ana
  sekmesi fragman ve one cikanlari gosterir, yuklemeleri degil.

Bos sayfalarda (ana sayfa, abonelikler, kesfet) arama cubugu **ekranin tam
ortasinda** durur ve ekranda ondan baska hicbir sey kalmaz: karsilama metni
yoktur, kutunun icindeki stok "Ara" / "Search" yazisi da `content.js`
tarafindan silinir. Bir arama yapildiginda ya da video acildiginda bar ust
bardaki standart yerine geri doner, sonuc ve izleme duzeni bozulmaz.

Oturumunuz cerezlerde durdugu icin **giris yapmis halde kalirsiniz**;
sadece hesap arayuzu gorunmez olur.

## Kurulum (gelistirici modu)

1. Chrome'da `chrome://extensions` adresini acin.
2. Sag ustten **Gelistirici modu**'nu (Developer mode) acin.
3. **Paketlenmemis ogeyi yukle** (Load unpacked) deyip bu klasoru secin.
4. YouTube acikken sayfayi bir kez yenileyin.

## Dosyalar

| Dosya | Isi |
| --- | --- |
| `manifest.json` | MV3 tanimi; yalnizca `www.youtube.com` ve `m.youtube.com` icin izin ister. Tek ek izin `storage` (duvar kagidi tercihi icin). |
| `content.css` | Asil gizleme katmani. `document_start` ile enjekte edildigi icin sayfa hic titremez. |
| `content.js` | SPA rota takibi, Shorts yonlendirmesi, placeholder temizligi ve sonradan yuklenen dugumlerin temizligi (`MutationObserver`). |
| `logo.png` | Arama modunda cubugun ustunde gosterilen logo. `web_accessible_resources` icinde tanimlidir. |
| `settings-ui.js` | Sag ust kosedeki disli butonu ve ayarlar paneli (duvar kagidi izgarasi + karisik mod anahtari). |
| `wallpapers/` | Yerlesik duvar kagitlari. Katalogda su an 11 tane var: `wallpaper-0.png`, `wallpaper-1..4.jpg`, `wallpaper-8..10.jpg`, `wallpaper-11.png` (duz siyah, 8x8 px), `wallpaper-12.jpg`, `wallpaper-14.jpg`. `manifest.json` icinde `web_accessible_resources: ["wallpapers/*"]` olarak tanimlidir; adresleri calisma aninda `chrome.runtime.getURL` ile alinir. |
| `small-logo.png` | Ikonlarin kaynak gorseli (yalnizca uretim zamani; eklenti calisirken kullanilmaz). |
| `icons/generate_icons.py` | `small-logo.png`'yi okuyup 16/48/128 px ikonlari uretir: `python3 icons/generate_icons.py` |

## Ozellestirme

**Avatari / hesap menusunu geri getirmek** icin `content.css` 1. bolumundeki
`#end.ytd-masthead` satirlarini iceren blogu silin ya da su kurali dosyanin
sonuna ekleyin:

```css
html.ymin-on ytd-masthead #end.ytd-masthead { display: flex !important; }
html.ymin-on ytd-masthead #avatar-btn { display: block !important; }
```

Bastaki `html.ymin-on` sart: gizleyen kural da ayni onekle yaziliyor ve iki
taraf da `!important` oldugu icin kazanani ozgulluk (specificity) belirliyor.
Oneksiz bir kural dosyanin sonunda bile kaybeder.

**Yorumlari, aciklamayi ya da Shorts'u geri acmak** icin CSS'e dokunmayin:
panelin Settings sekmesindeki ilgili anahtari acin. Kurallar
`ymin-hide-comments` / `ymin-hide-description` / `ymin-hide-shorts`
siniflarina bagli ve bu siniflari anahtarlar yonetir. Asagidaki elle
duzenleme tarifleri yalnizca **panelde karsiligi olmayan** seyler icindir.

**Arama onerilerini geri acmak** icin 1. bolumdeki "Arama gecmisi ve otomatik
tamamlama onerileri" blogunu silin.

**Eklenti ikonunu degistirmek** icin kok dizindeki `small-logo.png` dosyasini
degistirip `python3 icons/generate_icons.py` calistirin. Script kare olmayan
kaynaklari once merkezden kare kirpar (sikistirip ezmez) ve alan agirlikli
ortalamayla kucultur. Bagimlilik gerekmez.

**Logoyu degistirmek** icin kok dizindeki `logo.png` dosyasini degistirin.
Boyutlar `content.css` 9.1 bolumunde: buyuk logo `max-height`, ust bardaki
kucuk logo `#ymin-nav-logo` icindeki `height`. Dikkat: mevcut
dosyanin yuksekliginin yalnizca %44'u dolu (ust/altta seffaf pay var), bu
yuzden 150px degeri ekranda ~66px'lik bir logoya denk geliyor. Kirpilmis bir
dosya koyarsaniz `max-height`'i ~70px'e cekip `margin-bottom`'u buyutun.

**Varsayilan arka plani degistirmek** icin en pratik yol paneldeki izgaradan
baska bir duvar kagidi secmektir; secim `chrome.storage.local` icinde
`selectedWallpaper` olarak kalir. Kod tarafindaki varsayilan
`WALLPAPERS[0]`, yani `wallpapers/wallpaper-0.png`: hem ilk kurulumda hem de
secili gorsel bulunamadiginda buna dusulur (`entryFor`).

Dosyayi degistirirken adi korursaniz baska hicbir yere dokunmak gerekmez.
Yeni dosya eklemek icin de `manifest.json`'a dokunulmaz (`wallpapers/*`
jokeri zaten tanimli); yalnizca `WALLPAPERS` dizisine bir satir eklenir.

Yerlesim `content.css` 8. bolumdeki `background-size / position / attachment`
degerlerinden gelir; varsayilan `cover` / `center`. Katalogdaki bir satir
kendi `size` / `position` degerini verebilir. `wallpaper-0` bunu yapar
(`max(130%, 190vh)` + `center 15%`): ortasindaki beyaz yazi bandi, ekranin
ortasindaki arama cubugunun arkasina denk gelmesin diye gorsel buyutulup
asagi kaydirildi. Dikey yuzde ne kadar kucukse gorsel o kadar asagi kayar.

**Icerik sayfalarindaki karartmayi kaldirmak** icin 8. bolumdeki
`html.ymin-on.ymin-wallpaper:not(.ymin-blocked)` kuralini silin. O zaman gorsel her
sayfada tam parlakliginda gorunur (sonuc yazilari acik zeminlerde okunmayabilir).

**Odak renginin tonunu degistirmek** icin `content.css` 1. bolumdeki
`--ymin-focus-red` (ve halesi icin `--ymin-focus-glow`) degiskenlerini
duzenleyin; ornegin `#ff0033` daha yumusak bir YouTube kirmizisidir.

**Odak cercevesini tamamen kaldirmak** icin ayni bolumdeki "Focused" kuralini
(`[has-focus]` / `:focus-within` seciciilerini tasiyan blok) silin. Boyutlar her iki durumda da degismez, cunku `border-width`,
`padding` ve `width/height` degerlerine hic dokunulmuyor.

**Placeholder'i geri getirmek** icin `content.js` icindeki
`stripPlaceholder()` cagrilarini kaldirin.

**Arama cubugunu her zaman ustte tutmak** icin 3. bolumdeki
`html.ymin-on.ymin-blocked:not(.ymin-safe) #masthead-container.ytd-app`
kuralindaki `transform` satirini silin.

**Baska bir sayfayi da bosaltmak** icin `content.js` icindeki
`BLOCKED_PATHS` kumesine yolu ekleyin (ornek: `"/feed/history"`).

## Ayarlar paneli

Ekranin **sag kenarinin dikey ortasinda** kucuk bir dock durur. Her sayfada
gorunur (yalnizca bos sayfada degil) ve **eklenti kapaliyken bile** yerinde
kalir: `content.css` 10. bolumu bilerek `.ymin-on`'a baglanmamistir, cunku
eklentiyi geri acmanin tek yolu bu disli. Tam ekranda dock gizlenir
(11. bolum) -- tam ekranda video sayfanin kendisidir.

Neden kose degil de dikey orta: YouTube kendi arayuzunu izleme sayfasinin ALT
seridine yiginiyor (oynatici kontrol satiri, yuzen kuyruk dugmesi, videonun
altindaki Paylas/Kaydet satiri). Denenen her alt ofset bunlardan birinin
ustune denk gelip tiklamalari yutuyordu; sag kenarin ortasi YouTube'un her
rotada bos biraktigi tek serit.

Dislinin **ustunde bir `Subscriptions` kisayolu** durur (`settings-ui.js`
icindeki `DOCK_LINKS`); gercek bir `<a href="/feed/subscriptions">` oldugu
icin orta tikla yeni sekmede acilir. Yigin yukari dogru buyudugu icin yeni
bir kisayol eklemek dislinin yerini oynatmaz.

Disli paneli acar; panel iki sekmeden olusur:

- **Wallpapers** — izgaranin ilk kutusu "+" kartidir: bilgisayarinizdan gorsel
  yukler. Ardindan `wallpapers/` klasorundeki yerlesik gorseller, en sonda da
  yukledikleriniz listelenir (uzerlerine gelince kucuk bir silme dugmesi
  cikar). Birine tiklandiginda arka plan aninda degisir ve secim
  `chrome.storage.local` icinde `selectedWallpaper` olarak saklanir.
- **Settings** — alti anahtar, altinda da depolama kullanimi ozeti:

| Anahtar | Ne yapar | Varsayilan |
| --- | --- | --- |
| Extension Enabled | Ana anahtar. Kapatilinca sayfa yeniden yuklenir ve eklenti hicbir seye dokunmaz. | Acik |
| Comments | Video altindaki yorum bolumunu **gosterir**. | Kapali (yorumlar gizli) |
| Description | Video aciklamasini ve acilan panellerini **gosterir**. | Kapali |
| Shorts | Shorts raflarini, Shorts sonuclarini ve menudeki Shorts girisini **gosterir**. | Kapali |
| Grayscale Thumbnails | Kucuk resimlerin rengini alir; uzerine gelince renk geri gelir. | Kapali |
| Shuffle Wallpaper | Ana sayfa her acildiginda rastgele bir duvar kagidi; havuza kendi yukledikleriniz de dahildir (`shuffleWallpaper`). | Kapali |

Comments / Description / Shorts anahtarlari "bunu goster" diye okunur; bu
yuzden varsayilanlari `false` ve kapali halleri gizleyen haldir. Grayscale
ters yonde calisir: sinif acikken eklenir.

**Ana anahtar** iki sey yapar: `<html>` uzerindeki `ymin-on` sinifi kalkar
(content.css'teki her kural bu sinifa bagli oldugu icin stil katmani tek
hamlede devre disi kalir) ve ozellik siniflari da ana anahtara bagli oldugu
icin yorumlar, aciklama, Shorts ve kucuk resim renkleri YouTube'un gonderdigi
haliyle kalir. Anahtari ceviren sekme kendini yeniler (canli bir SPA'yi elle
geri sarmak yerine temiz sayfadan acmak daha guvenli); ayni anda acik diger
sekmeler yenilenmez, `storage.onChanged` uzerinden sessizce toparlanir.

**Shorts yonlendirmesi bu anahtara baglidir:** Shorts kapaliyken (varsayilan)
`/shorts/<id>` adresi `/watch?v=<id>` adresine cevrilir; anahtar aciksa
yonlendirme yapilmaz.

### Yuklenen gorseller ve depolama

Secilen dosya `FileReader` ile base64'e cevrilir, ancak depoya konmadan once
bir canvas uzerinde **kucultulup yeniden kodlanir** (en uzun kenar 2560 px,
WebP; gerekirse daha dusuk kalitede ikinci ve ucuncu deneme). Base64 ikili
veriden ~%33 buyuk oldugu icin ham bir fotograf tek basina kotayi doldurabilir;
700 KB altindaki kucuk gorseller ise bozulmasin diye oldugu gibi saklanir.

Depolama duzeni bilerek ikiye ayrildi:

| Anahtar | Icerik |
| --- | --- |
| `customWallpapers` | Yalnizca ust veri dizisi: `{id, bytes, addedAt}` |
| `ymin:custom:<id>` | O gorselin base64 verisi (ayri anahtar) |

Boylece sayfa acilirken tum gorseller okunmaz; sadece secili olanin anahtari
getirilir. Kota korumalari: gorsel basina 3 MB tavan, en fazla 12 gorsel ve
`getBytesInUse` ile yapilan kontrolde 512 KB'lik emniyet payi. Sinir asilirsa
kayit **hic yazilmaz** ve panelde anlasilir bir uyari gosterilir.

Tercih iki yerde tutulur: dogrusu `chrome.storage.local`, yani sekmeler ve
oturumlar arasinda ortaktir. Ayrica sayfanin `localStorage`'inda
(`ymin:prefs`) senkron okunabilen bir kopyasi vardir; `chrome.storage`
asenkron oldugu icin ilk boyamada duvar kagidinin bir an yanlis gorunmesini
bu onbellek engeller. Onbellekte yalnizca iki tercih ve yuklenen gorsellerin
**kimlikleri** durur (base64 verisi asla) — kimlikler orada olmasa karisik mod
ilk cekilisi henuz storage cevaplamadan yapamaz, kendi gorselleriniz havuza
giremezdi.

**Yeni duvar kagidi eklemek:** dosyayi `wallpapers/` klasorune atin ve
`content.js` icindeki `WALLPAPERS` dizisine bir satir ekleyin. Manifest'e
dokunmaya gerek yoktur (`wallpapers/*` jokeri zaten tanimli). Gorselin
kompozisyonu ozel bir kirpma istiyorsa satira `size` ve `position`
ekleyebilirsiniz; verilmezse `cover` / `center` kullanilir.

Numaralarda bosluk olmasi normaldir (su an 5, 6, 7, 13 ve 15 yok): **dosya
adi saklanan tercihin ta kendisi**. Silinen bir gorselin numarasini baskasina
vermek, o gorseli secmis kullanicilari sessizce baska bir arka plana baglar.
Bu yuzden silinen numaralar bos birakilir, yeni gorsel siradaki numarayi alir.

## Sorun giderme

Eklenti kendini korur: `content.js` her gezinmede arama kutusunun gercekten
ekranda olup olmadigini olcer. Kutu gizlenmis ya da gorunur alanin disina
tasmissa `<html>` uzerine `ymin-safe` sinifini ekler; bu sinif CSS'teki
**oneri gizleme** ve **ortalama** bloklarini komple kapatir. Yani hatali bir
secici en kotu ihtimalle bu iki ozelligi devre disi birakir, sizi bos ekranda
birakmaz. Boyle bir durumda DevTools konsolunda su uyari gorunur:

```
[CuriousTube] The search box is not visible; suggestion hiding and
centering have been disabled in this tab.
```

Bir sey hala ters gorunuyorsa `chrome://extensions` -> eklentiyi **yenile**
ve YouTube sekmesini bir kez tazeleyin.

## Notlar

- YouTube arayuzunu sik degistirir; bir bolum yeniden gorunmeye baslarsa
  ilgili ozel elemanin adi (`ytd-*`) degismis demektir. DevTools ile yeni adi
  bulup `content.css` icindeki uygun bolume eklemek yeterlidir.
- CSS'te `:has()` kullanilir; Chrome 105 ve uzeri gerekir.
