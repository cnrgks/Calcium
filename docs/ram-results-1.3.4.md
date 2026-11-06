# Calcium 1.3.4 — uygulanan değişiklikler ve RAM karşılaştırması

6 Kasım 2026. Önceki sürüm: GitHub `ca83187` (1.3.3). Bu rapor yerel 1.3.4 adayına aittir.

## Sonuç

Düşük bellek altında arka plan sekmelerinin daha erken uyutulması ölçülebilir kazanç sağladı. Bütün sekmeler yüklüyken taban bellek maliyetinde belirgin bir düşüş ölçülmedi. Sonuçlar gerçek internet gezintisinde her zaman aynı yüzde tasarruf edileceği anlamına gelmez.

| Sekme sayısı | Önce: private bellek | Sonra: private bellek | Değişim | Bellek baskısından sonra yüklü sekmeler |
| --- | ---: | ---: | ---: | --- |
| 1 | 232 MiB | 228 MiB | Küçük fark; anlamlı kazanç sayılmadı | 1 → 1 |
| 10 | 525 MiB | 303 MiB | %42 azalma | 10 → 3 |
| 30 | 1.156 MiB | 322 MiB | %72 azalma | 30 → 3 |

Bütün sekmeler yüklüyken medyan değerler 10 sekmede 525 → 521 MiB, 30 sekmede 1.156 → 1.156 MiB idi. Ana kazanç uyutma politikasından geliyor; renderer başına bellek tüketiminin azaltıldığı iddia edilmiyor.

## Ölçüm yöntemi ve sınırları

- Windows, castLabs Electron 45.2.1; her sürüm ve 1/10/30 sekme senaryosu için üç ayrı geçici profil, medyan sonuç.
- Karşılaştırma, `ca83187` main-process kaynağı ile aday main-process kaynağını ortak çalışma dizini varlıkları üzerinde çalıştırır; önceki yayınlanmış EXE ile uçtan uca ürün karşılaştırması değildir.
- Yerel HTTP sayfaları, ayrı `.test` site origin'leri ve her sekmede dokunulmuş 8 MiB JavaScript buffer. Site izolasyonu ve sandbox açık kaldı.
- Metrik: Electron `app.getAppMetrics().memory.privateBytes` değerlerinin süreçler boyunca toplamı. Electron KiB değerleri 1024'e bölünerek MiB'ye çevrildi. Working-set toplamı ortak sayfaları birden fazla sayabileceği için ana sonuç olarak kullanılmadı.
- 8 GiB toplam / 512 MiB boş RAM sinyali politika fonksiyonuna verildi; işletim sisteminin RAM'i gerçekten doldurulmadı.
- Arka plan sekmeleri iki dakika kullanılmamış sayıldı. Önceki 10 dakikalık politika sekmeleri açık tutarken yeni politika kademeli uyuttu.
- Testte on politika kontrolü kısa aralıklarla çağrıldı. Üretimde kontrol 30 saniyede bir yapılır ve her kontrolde en fazla üç sekme uyur. Gerçek sistemde bellek rahatlayınca erken uyutma durur; tablo sürekli düşük bellek koşulunu temsil eder.
- uBlock başlangıç/listeleri bellek kullanımını ciddi dalgalandırdığı için ana karşılaştırmada yalnızca test ortamında uBO kapatıldı. Üretimde uBO açık kalır. Bu sayılar varsayılan kurulumun toplam RAM tüketimini temsil etmez. uBO açık ilk soğuk başlangıç ölçümleri kararsız bulundu ve yüzde hesabında kullanılmadı.
- Soğuk profillerin dil seçimi eski sürümdeki otomatik Türkçe geçişi, yeni sürümdeki sistem dili davranışı nedeniyle farklılaşabiliyor. Küçük taban farkları bu yüzden de optimizasyon kazancı sayılmadı.
- Son optimized koşunun kaynak kodu, önceki koşulara ek olarak başlık kuyruğu ve başlangıç indirme listesi sınırlarını içerir; foreground fixture senaryosu bu yolları kullanmaz. Ham kayıtlarda mevcut olan kaynak hash'leri korunmuştur.
- 20 sekme aç/kapat döngüsünden sonra her iki sürümde de canlı WebContents sayısı 2'ye (UI + aktif sayfa) döndü. Bu test sınırsız uzun süreli bellek sızıntısı olmadığını kanıtlamaz; tahsisçi/renderer ısınmasından kalan bellek ayrıca değerlendirilmelidir.
- Gerçek Electron entegrasyonunda elle uyutulan yerel sekme tekrar açıldı; tek koşuda 58 ms gözlendi. Bu, karşılaştırmalı gecikme benchmark'ı değildir.

Ham ölçümler ve medyan özet: `docs/benchmarks/memory-1.3.4/`.

Tekrar çalıştırma:

```powershell
npm run bench:memory -- baseline --isolated
npm run bench:memory -- optimized --isolated
```

`baseline` ilk çalıştırmada `ca83187:main.js` kaynağını Git'ten çıkarır. Sonuçlar `dist/ram-review/` altında tutulur. Geçici profiller kullanıcı profilinden ayrıdır. Testlerin CPU yükü ve sistemdeki diğer uygulamalar working-set sonuçlarını etkileyebilir.

## Uygulanan güvenlik düzeltmeleri

1. HID/USB/serial geçici izinleri artık Electron session + origin + cihaz türü + cihaz kimliğine bağlı. Başka siteye veya gizli oturuma taşınmaz.
2. Gizli cihaz politikası normal profil izinlerini okumaz, diske izin yazmaz; son gizli pencere kapandığında temizlenir.
3. Sadece model kimliğiyle kalıcı yetki verilmez. Seri numarasız cihazlar oturumluk izin kullanır; tekrar başlatmada yeniden seçilmeleri gerekir. Seri numaralı cihazların kalıcı izinleri siteye bağlıdır.
4. Bilinmeyen izin türleri varsayılan reddedilir; kayıtlı olmayan kamera/mikrofon gibi izinler kontrol aşamasında otomatik onaylanmaz ve istek akışı kullanıcı kararını ister.
5. Origin'i belirlenemeyen cihaz seçimi aktif sekmenin origin'ine tahminle bağlanmaz.
6. Cihaz izinlerini kaldırma işlemi geçici politikaları ve ilgili Electron session izinlerini de sıfırlar.

Cihaz politikası ve main-process session bağlantısı regresyon testlerinde doğrulandı. Fiziksel USB/HID/serial donanımıyla uçtan uca test yapılmadı. Bu çalışma tarayıcının tüm güvenlik yüzeylerinin denetlendiği iddiası değildir.

Referans: [Electron session API](https://www.electronjs.org/docs/latest/api/session).

## Uygulanan RAM iyileştirmeleri

- Boş RAM toplamın %10'undan veya 512 MiB'den azsa erken uyutma devreye girer. En az bir dakikadır arka plandaki en eski sekmeler seçilir; her turda en fazla üç sekme uyutulur ve en az üç yüklü sayfa tutulur.
- Aktif, ses çalan, yüklenen, düzenlenmiş form içeren, kamera/mikrofon/ekran izni kullanan, yakalanan veya indirme yapan sekmeler otomatik uyutulmaz. Medya izni koruması sayfa gezinmesine kadar ihtiyatlı biçimde sürer; medya bitişini tam izlemeye yönelik bir iddia yoktur.
- Form koruması trusted input olayını izler; alan değerlerini main process'e göndermez. Programın kendi oluşturduğu form değişiklikleri bu algılamaya dahil değildir.
- Performans ayarlarından erken uyutma kapatılabilir. Sekme sağ tık menüsündeki “Bu siteyi otomatik uyutma” kalıcı istisna tanımlar. Tek sekmeyi elle uyutma kullanıcı tercihi olarak korunur.
- İkon kuyruğu en fazla 128 bekleyen ve 3 aktif işle sınırlı; sekme kapanınca bekleyen işler çıkarılır ve aktif fetch iptal edilir. Başlık kuyruğu da sınırlı ve yinelenen tab kayıtları engellenir.
- Sekme kapanışında metadata istekleri iptal edilir; son gizli pencere kapanınca özel ikon önbelleği temizlenir.
- Başlangıç geçmişi 5.000, indirme kaydı 100 girişle sınırlı; favicon uzunluğu sınırlı. JSON profil dosyalarının okuma boyutu sınırlı; limit aşılırsa asıl dosya `.oversized-*.bak` olarak korunur.

## Dil davranışı

Yeni profiller Türkçe sistemde Türkçe, diğer tüm sistem dillerinde İngilizce açılır. Türkçe algılama hatası ve eski otomatik Türkçe zorlaması düzeltildi. Karşılama sayfasında dil seçimi yoktur. Ayarlar üzerinden Türkçe/İngilizce seçimi yapılır; açık kullanıcı tercihi sonraki başlangıçlarda korunur. Chromium dil anahtarı da çözümlenen dile göre ayarlanır.

## Doğrulama ve kalan işler

Güvenlik, RAM politikası ve mevcut gerçek Electron testleri geçti. Form girişi → koruma işareti, elle uyutma → WebContents yok edilmesi, yeniden açma → doğru URL ve belge yüklenmesi entegrasyonda doğrulandı.

Sonraki ölçüm odağı: uBO açık ve ısınmış gerçekçi profil, çok pencereli/gizli kullanım, görüşme ve capture senaryolarında fiziksel test, CPU/uyanma gecikmesi için karşılaştırmalı benchmark ve uzun süreli heap analizi. UI/IPC yapısı ölçülmüş bir darboğaz olmadığı için bu turda değiştirilmedi.

Authenticode sertifikası ve Widevine VMP imzası bu çalışmayla sağlanmadı. Manuel uygulama güncelleme davranışı devam eder.

## Kurulum adayı

`dist/Calcium-Setup-1.3.4.exe` oluşturuldu. Paket içindeki yeni modüller ve varsayılanlar doğrulandı; paketlenmiş uygulama ayrı geçici profilde açılıp uBlock yüklenmesi gözlendi. Son motor kontrolü 45.2.1 ile güncel, npm audit sonucu 0 bilinen açık.

SHA-256: `353343b43ea3779ab8868d79d7ad2244b700492c03a54f2ca40d716ca2155c7e`

Boşta erken bellek azaltma ile güncellenen aday için `docs/idle-memory-results-1.3.4.md` ek sonuçları geçerlidir.
