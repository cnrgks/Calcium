# RAM ve güvenlik incelemesi — Calcium 1.3.3

İncelenen uygulama commit'i: ca83187. Tarih: 6 Kasım 2026.
Bu çalışma kaynak kodu incelemesi ve mevcut otomatik kontrollerdir; tam penetrasyon testi değildir. Yeni sürüm için gerçek sitelerle tekrarlanabilir RAM ölçümü henüz yapılmadı. Aşağıdaki kazançlar ölçülmüş sonuç olarak sunulmaz.

## Yayın doğrulaması

- `npm run test:security`: geçti (CRX imzası, arşiv sınırları, izin kontrolleri, yerel koruma ve atomik liste yenileme).
- `npm run test:electron`: varsayılan otomatik gizleme değişikliğinden sonra geçti; arka plan sekmeleri, UI, görev yöneticisi, scrollbar ve tam başlangıç doğrulandı.
- `npm audit --audit-level=moderate`: 0 bilinen açık.
- `npm run check:engine`: sabitlenen castLabs 45.2.1 ile resmi son kararlı sürüm aynı.
- `npm run dist:win`: başarılı. Authenticode sertifikası yok; Widevine VMP imzalama başarısız uyarısı var.
- Yeni profillerde `verticalAutoHide: true`; mevcut kullanıcının kayıtlı tercihi korunur.

## Güvenlik bulguları

### P1 — Cihaz izni site ve oturum kapsamını aşabiliyor

`main.js:721`, `setupDevices`, özellikle `setDevicePermissionHandler` içindeki `sessionDeviceIds.has(...)` kontrolü: bir cihaz seçildikten sonra global Set'e yalnızca cihaz kimliği yazılıyor. Daha sonraki izin kontrolü origin veya Electron session eşleştirmeden true dönebiliyor. Bir sitede seçilmiş cihazın başka bir origin/oturum için de yetkili sayılması mümkün. Kaynak kodunda doğrulandı; gerçek donanımla uçtan uca istismar denenmedi.

Düzeltme: geçici izinleri session + origin + cihaz türü + cihaz kimliğine göre tut; origin eşleşmesini her kontrolde zorunlu kıl. A sitesinde izin verip B sitesinde ve gizli oturumda erişim reddini doğrulayan regresyon testi ekle.

### P2 — Gizli oturum cihaz izinleri diske yazılıyor

`setupSession` gizli mod için `setupDevices(ses)` çağırıyor; bu fonksiyonun HID/USB/serial seçimleri her oturumda `addGrant` üzerinden `settings.deviceGrants` ve `saveSettings` kullanıyor. Gizli pencerede verilen cihaz izni kalıcı ayarlara ve normal oturuma taşınabiliyor.

Düzeltme: `setupDevices` oturumun gizli olduğunu bilmeli; gizli izinleri yalnızca bellekte tutmalı ve son gizli pencere kapanırken temizlemeli. Normal profil izinlerinden ayrı sakla. Gizli kullanım sonrası ayarlar dosyası değişmemeli.

### P2 — İzin kontrolünde bilinmeyen türler varsayılan olarak olumlu

`setPermissionCheckHandler` kayıtlı bir karar yoksa `permission !== 'notifications'` döndürüyor. İstek handler'ı ayrıca çoğu izni soruyor veya reddediyor; dolayısıyla bu bulgu tek başına kamera/mikrofon erişiminin doğrudan atlatıldığı anlamına gelmez. Ancak kontrol ve istek yolları tutarsız, yeni izin türleri de otomatik olumlu değerlendiriliyor.

Düzeltme: iki handler için ortak açık izin politikası; bilinmeyen türleri reddet. Kamera, mikrofon, konum, clipboard ve alt frame origin senaryolarını doğrula.

### Dağıtım ve güvenlik sınırları

- Kurulum Authenticode imzalı değil; uygulama güncellemesi manuel. İmzalı ve doğrulanan güncelleme süreci planlanmalı.
- Site izolasyonu varsayılan açık; ayarlardan kapatılabiliyor. RAM tasarrufu için izolasyonu veya sandbox'ı gevşetmek önerilmez.
- uBO/Electron testlerinde MV2 ve bazı desteklenmeyen izin uyarıları var. Mevcut testler tüm filtreleme ve extension API davranışlarını kapsamaz.
- Bağımlılık taramasının temiz olması uygulamada açık bulunmadığını kanıtlamaz.

Referanslar: https://www.electronjs.org/docs/latest/api/session ve https://www.electronjs.org/docs/latest/tutorial/security/

## RAM yol haritası

### 1. Tekrarlanabilir ölçüm ve sızıntı tabanı

Önce profil, makine ve sekme listesini sabitle. Yeni profil ve gerçekçi profil için 1/10/30 sekme, 1/3 pencere, normal/gizli ve eklenti senaryolarını ayrı ölç. Başlangıçtan 30 saniye sonra, 5 dakika boşta, uyutma sonrası ve 20 aç/kapat döngüsü sonrasında PID bazında private bytes, working set, renderer sayısı, CPU ve sekme uyanma süresini kaydet. Aynı sitelerin reklam/ağ değişkenliğini azaltmak için yerel fixture ile de çalıştır. En az üç tekrarın medyanını karşılaştır.

Kabul: kapanan sekmelerin WebContents nesneleri yok edilmeli; görev yöneticisindeki PID toplamları Windows ölçümüyle uzlaştırılmalı. Sızıntı varsa retained nesneler heap snapshot ile bulunmalı. Kod içindeki eski 4.6/2.8 GB yorumları bu sürümün ölçümü sayılmamalı.

### 2. Bellek baskısına göre sekme uyutma

Mevcut sistem arka plan sekmelerini 10 dakika sonra gerçekten kapatıyor; geri yüklenen sekmeler zaten ertelenmiş. Buna düşük kullanılabilir sistem RAM'i ve toplam uygulama belleğine göre çalışan bir politika ekle. En uzun süredir kullanılmayan arka plan sekmelerinden başla; kullanıcıya performans/dengeli/tasarruf profilleri sun.

Ses çalan sekmeler zaten korunuyor. Ek olarak görüşme, capture, form değişiklikleri ve sürmekte olan indirme durumları korunmalı; kullanıcı istisna tanımlayabilmeli. Otomatik kapatmanın form ve gezinme durumunu kaybettirebileceğini çözmeden süreyi körlemesine azaltma. Kazancı uyutma sonrası bellek ve yeniden açılış gecikmesiyle birlikte ölç.

### 3. Kuyruklar ve önbellekler için sınırlar

`iconColors` 128 girişle, ikon eşzamanlılığı 3 işle sınırlandırılmış. Fakat `iconJobs` kuyruğu için toplam kapasite ve kapatılan sekmeye ait işlerin erken iptali yok. Çok sayıda sabit sekme ve ikon değişiminde kuyruk birikimini ölç; yinelenen işleri birleştir, kapasite ve iptal ekle.

Başlangıçta JSON geçmişi/oturum/ayar dosyaları tümüyle okunuyor. Büyük veya bozulmuş dosyalar için dosya boyutu, sekme sayısı ve favicon uzunluğu sınırları ekle; geçmişi belleğe alırken de HISTORY_MAX uygula. Kalıcı favicon verilerini bayt bütçeli LRU ile değerlendirmek uygun.

### 4. Sekme kapatma ve pencere yaşam döngüsü

`destroyView`, pencere kapanışı, eklenti köprüleri ve görev yöneticisi panellerinin listener/timer kayıtlarını 100 aç/kapat döngüsüyle izle. `close()` sonrası `destroyed` olayını doğrula; kapatılan sekmelerin ikon işleri, metadata istekleri ve referanslarını temizle. Worker/service worker ve eklenti süreçlerini ayrıca say; bir renderer'ın kapanması tüm arka plan süreçlerinin kapanacağını garanti etmez.

### 5. UI ve eklenti maliyeti

Sekme durumunun topluca gönderildiği `pushState` için 30/100 sekmede IPC veri boyutu ve render sayısını ölç. Değişen alanları gönderme ve kapalı panellerin sorgularını durdurma ancak ölçüm maliyeti doğrularsa uygulanmalı. uBO'nun tek motorunu koru; ikinci filtre motoru oluşturma. Eklentilerin süreç/bellek maliyetini görev yöneticisinde anlaşılır göster.

## Önerilen sıra ve başarı ölçütleri

1. Cihaz izni kapsamı ve gizli mod kalıcılığı için güvenlik düzeltmesi + regresyon testleri.
2. RAM ölçüm aracı ve sabit senaryolar.
3. Basınca duyarlı uyutma, korunan sekmeler ve uyandırma davranışı.
4. Kuyruk/önbellek sınırları ve sızıntı düzeltmeleri.
5. Ölçüme göre UI/IPC iyileştirmesi ve yeni release.

Hedef: aynı senaryoda daha düşük medyan private bytes ve kararlı aç/kapat döngüsü; aktif sekme gecikmesi, CPU veya veri kaybı pahasına tasarruf yapılmamalı. Sayısal yüzde hedefi ilk ölçümden sonra belirlenmeli.
