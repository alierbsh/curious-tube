# Curious YouTube

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

Sayfanin tamamina `wallpaper.png` serilir (`cover` + `fixed`, yani kaydirirken
kaymaz). Gorsel `content.css` icinden degil, `content.js`'in
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
| `wallpapers/` | Duvar kagitlari (`wallpaper-1..9`). `manifest.json` icinde `web_accessible_resources: ["wallpapers/*"]` olarak tanimlidir; adresleri calisma aninda `chrome.runtime.getURL` ile alinir. |
| `icons/generate_icons.py` | Ikonlari yeniden uretir: `python3 icons/generate_icons.py` |

## Ozellestirme

**Avatari / hesap menusunu geri getirmek** icin `content.css` icindeki
`#end.ytd-masthead` satirlarini iceren blogu silin ya da su kurali dosyanin
sonuna ekleyin:

```css
ytd-masthead #end.ytd-masthead { display: flex !important; }
ytd-masthead #avatar-btn { display: block !important; }
```

**Yorumlari geri acmak** icin `ytd-comments#comments` secicisini
5. bolumdeki listeden cikarin.

**Arama onerilerini geri acmak** icin 1. bolumdeki "Arama gecmisi ve otomatik
tamamlama onerileri" blogunu silin.

**Logoyu degistirmek** icin kok dizindeki `logo.png` dosyasini degistirin.
Boyutlar `content.css` 9.1 bolumunde: buyuk logo `max-height`, ust bardaki
kucuk logo `#ymin-nav-logo` icindeki `height`. Dikkat: mevcut
dosyanin yuksekliginin yalnizca %44'u dolu (ust/altta seffaf pay var), bu
yuzden 150px degeri ekranda ~66px'lik bir logoya denk geliyor. Kirpilmis bir
dosya koyarsaniz `max-height`'i ~70px'e cekip `margin-bottom`'u buyutun.

**Arka plan gorselini degistirmek** icin `wallpapers/wallpaper-1.png`
dosyasini degistirin (ayni ad korunursa baska hicbir yere dokunmak gerekmez).
Yeni bir dosya eklerseniz `manifest.json` icindeki `web_accessible_resources`
listesine de eklenmesi gerekir.
Yerlesim `content.css` 8. bolumdeki `background-size / position / attachment`
degerlerinden ayarlanir. Mevcut degerler (`max(130%, 190vh)` + `center 15%`)
bu gorsele ozeldir: ortasindaki yazi bandi, ekranin ortasindaki arama
cubugunun arkasina denk gelmesin diye gorsel buyutulup asagi kaydirildi.
Dikey yuzde ne kadar kucukse gorsel o kadar asagi kayar.

**Icerik sayfalarindaki karartmayi kaldirmak** icin 8. bolumdeki
`html.ymin-wallpaper:not(.ymin-blocked)` kuralini silin. O zaman gorsel her
sayfada tam parlakliginda gorunur (sonuc yazilari acik zeminlerde okunmayabilir).

**Odak renginin tonunu degistirmek** icin `content.css` 1. bolumdeki
`--ymin-focus-red` (ve halesi icin `--ymin-focus-glow`) degiskenlerini
duzenleyin; ornegin `#ff0033` daha yumusak bir YouTube kirmizisidir.

**Odak cercevesini tamamen kaldirmak** icin ayni bolumdeki "Odakli hal"
kuralini silin. Boyutlar her iki durumda da degismez, cunku `border-width`,
`padding` ve `width/height` degerlerine hic dokunulmuyor.

**Placeholder'i geri getirmek** icin `content.js` icindeki
`stripPlaceholder()` cagrilarini kaldirin.

**Arama cubugunu her zaman ustte tutmak** icin 3. bolumdeki
`html.ymin-blocked #masthead-container.ytd-app` kuralindaki `transform`
satirini silin.

**Baska bir sayfayi da bosaltmak** icin `content.js` icindeki
`BLOCKED_PATHS` kumesine yolu ekleyin (ornek: `"/feed/history"`).

## Ayarlar paneli

Bos sayfada sag ust kosede bir disli butonu belirir; panel iki bolumden olusur:

- **Wallpapers** — izgaranin ilk kutusu "+" kartidir: bilgisayarinizdan gorsel
  yukler. Ardindan `wallpapers/` klasorundeki yerlesik gorseller, en sonda da
  yukledikleriniz listelenir (uzerlerine gelince kucuk bir silme dugmesi
  cikar). Birine tiklandiginda arka plan aninda degisir ve secim
  `chrome.storage.local` icinde `selectedWallpaper` olarak saklanir.
- **Settings** — "Karisik Duvar Kagidi" anahtari. Acikken ana sayfa her
  acildiginda rastgele bir gorsel gosterilir; havuza yerlesikler kadar
  kendi yukledikleriniz de dahildir. Deger `shuffleWallpaper` anahtarinda
  tutulur. Bolumun altinda depolama kullanimi ozeti yer alir.

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

## Sorun giderme

Eklenti kendini korur: `content.js` her gezinmede arama kutusunun gercekten
ekranda olup olmadigini olcer. Kutu gizlenmis ya da gorunur alanin disina
tasmissa `<html>` uzerine `ymin-safe` sinifini ekler; bu sinif CSS'teki
**oneri gizleme** ve **ortalama** bloklarini komple kapatir. Yani hatali bir
secici en kotu ihtimalle bu iki ozelligi devre disi birakir, sizi bos ekranda
birakmaz. Boyle bir durumda DevTools konsolunda su uyari gorunur:

```
[Curious YouTube] Arama kutusu gorunmuyor; oneri gizleme ve
ortalama kurallari bu sekmede devre disi birakildi.
```

Bir sey hala ters gorunuyorsa `chrome://extensions` -> eklentiyi **yenile**
ve YouTube sekmesini bir kez tazeleyin.

## Notlar

- YouTube arayuzunu sik degistirir; bir bolum yeniden gorunmeye baslarsa
  ilgili ozel elemanin adi (`ytd-*`) degismis demektir. DevTools ile yeni adi
  bulup `content.css` icindeki uygun bolume eklemek yeterlidir.
- CSS'te `:has()` kullanilir; Chrome 105 ve uzeri gerekir.
