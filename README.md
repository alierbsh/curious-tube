# YouTube Minimalist Search

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

Kutuya tiklandiginda gorunum sabit kalir: odak halindeki mavi cerceve, golge
ve solda beliren ikinci buyutec ikonu bastirilir; kutu ne buyur ne kayar.

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
| `manifest.json` | MV3 tanimi; yalnizca `www.youtube.com` ve `m.youtube.com` icin izin ister. Ekstra izin (storage, tabs vb.) yoktur. |
| `content.css` | Asil gizleme katmani. `document_start` ile enjekte edildigi icin sayfa hic titremez. |
| `content.js` | SPA rota takibi, Shorts yonlendirmesi, placeholder temizligi ve sonradan yuklenen dugumlerin temizligi (`MutationObserver`). |
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

**Kutuyu tamamen cercevesiz yapmak** icin 1. bolumdeki odak blogunda
`border-color` degerini `transparent` yapin (boyut degismez, cunku
`border-width`'e dokunulmuyor).

**Placeholder'i geri getirmek** icin `content.js` icindeki
`stripPlaceholder()` cagrilarini kaldirin.

**Arama cubugunu her zaman ustte tutmak** icin 3. bolumdeki
`html.ymin-blocked #masthead-container.ytd-app` kuralindaki `transform`
satirini silin.

**Baska bir sayfayi da bosaltmak** icin `content.js` icindeki
`BLOCKED_PATHS` kumesine yolu ekleyin (ornek: `"/feed/history"`).

## Sorun giderme

Eklenti kendini korur: `content.js` her gezinmede arama kutusunun gercekten
ekranda olup olmadigini olcer. Kutu gizlenmis ya da gorunur alanin disina
tasmissa `<html>` uzerine `ymin-safe` sinifini ekler; bu sinif CSS'teki
**oneri gizleme** ve **ortalama** bloklarini komple kapatir. Yani hatali bir
secici en kotu ihtimalle bu iki ozelligi devre disi birakir, sizi bos ekranda
birakmaz. Boyle bir durumda DevTools konsolunda su uyari gorunur:

```
[YouTube Minimalist Search] Arama kutusu gorunmuyor; oneri gizleme ve
ortalama kurallari bu sekmede devre disi birakildi.
```

Bir sey hala ters gorunuyorsa `chrome://extensions` -> eklentiyi **yenile**
ve YouTube sekmesini bir kez tazeleyin.

## Notlar

- YouTube arayuzunu sik degistirir; bir bolum yeniden gorunmeye baslarsa
  ilgili ozel elemanin adi (`ytd-*`) degismis demektir. DevTools ile yeni adi
  bulup `content.css` icindeki uygun bolume eklemek yeterlidir.
- CSS'te `:has()` kullanilir; Chrome 105 ve uzeri gerekir.
