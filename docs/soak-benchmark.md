# Süreli kaynak kullanımı ölçümü

`npm run bench:soak` varsayılan olarak 120 dakika çalışır. Daha kısa doğrulama için:

```sh
npm run bench:soak -- --minutes 5
```

Ölçüm ayrı bir geçici profilde çalışır. Kullanıcının profilini, geçmişini veya indirme klasörünü kullanmaz. Sonuçlar `dist/soak/<tarih>/samples.jsonl` ve `summary.json` dosyalarına yazılır. Test sonunda geçici profil silinir. Örneklerde sayfa adresleri ve form içerikleri bulunmaz.

## İş yükü

- uBlock açık; iki normal pencere ve bir gizli pencere.
- Yerel HTTP sunucusundan farklı siteler gibi yüklenen haber/uygulama sayfaları; küçük DOM güncellemeleri ve sekme aç/kapat döngüleri.
- Düzenlenmiş ve gönderilmemiş form.
- Yapay kamera/mikrofon ve canvas akışı. Ayrıca yalnızca yerel test sekmesini paylaşma denenir; ortam bunu desteklemiyorsa neden `tabShare` alanında kaydedilir ve bu kontrol başarılı sayılmaz. Fiziksel kamera, mikrofon veya masaüstü yakalanmaz.
- Test profili içindeki klasöre devam eden gerçek bir indirme. Form, medya ve indirme arka plandayken bellek baskısından korunmalıdır. Gerçek test-sekmesi paylaşımı destekleniyorsa paylaşılan sekmenin korunması da kontrol edilir.
- Etkin kullanım ile bir dakikalık bekleme evreleri. Bellek baskısı kontrollü olarak taklit edilir; işletim sisteminin RAM'i tüketilmez.

15 saniyelik ısınmadan sonra beş saniyede bir süreçlerin private/working-set belleği, CPU, main-process heap, örneklenen renderer heap, uBlock heap, süreç ve WebContents sayıları kaydedilir. Renderer heap aynı süreçteki belgeleri iki kez saymamak için süreç başına bir belge üzerinden örneklenir; tam heap dökümü değildir. Uyandırma süresi yerel belgenin yüklenmesine kadar ölçülür; ekranın ilk çizildiği anı ölçmez. Rapor medyan ve p95 değerlerini verir.

## Sonuçları yorumlama

Aynı süre ve aynı iş yüküyle, benzer sistem koşullarında önce/sonra koşuları karşılaştırılmalıdır. Örneklerin `phase` ve `liveTabs` alanları birlikte değerlendirilmelidir: uyutulmuş sekmelerle başlangıçtaki bütün yüklü sekmeleri karşılaştırmak tek başına optimizasyon kanıtı değildir. CPU, Electron'un süreç başına verdiği değerlerin toplamıdır; Görev Yöneticisi yüzdesiyle bire bir karşılaştırılmamalıdır. İlk örneğin CPU değeri başlangıç referansıdır.

Kısa doğrulama koşusu saatler süren bir sızıntı incelemesinin yerine geçmez. Yapay medya ve yerel sayfalar gerçek görüntülü görüşme, DRM oynatma veya fiziksel masaüstü paylaşımının tamamını temsil etmez. Bu senaryolar ayrıca gerçek cihazlarda denenmelidir.

## 7 Kasım 2026 doğrulaması

İlk beş dakikalık koşu 62 örnek ve 8 sekme aç/kapat döngüsü tamamladı. Yerel sekme uyandırma medyanı 60,0 ms, p95 değeri 61,3 ms idi. Üç pencere, gizli sekmeler, form koruması, yapay medya ve indirme iş yükü kullanıldı. Bu ilk koşuda gerçek sekme paylaşımı ve renderer/uBlock heap örneklemesi henüz yoktu; genişletilmiş iş yükünün sonuçlarıyla doğrudan karşılaştırılmamalıdır.

Bu koşuda toplam private bellek 731,6 MiB'den 535,7 MiB'ye indi, ancak yüklü sekme sayısı da 15'ten 12'ye düştü. Bu nedenle sonuç bir bellek sızıntısı olmadığı veya genel performans artışı sağlandığı iddiası değildir. Ham çıktılar yerel `dist/soak/2026-11-07T12-55-00-344Z/` klasöründedir.

Genişletilmiş iş yüküyle yapılan üç dakikalık doğrulama 35 örnek ve 4 aç/kapat döngüsü tamamladı. Form, yapay kamera/mikrofon ve arka plandaki gerçek indirme bellek baskısından korundu. Uyandırma medyanı 59,9 ms, p95 değeri 61,3 ms idi. uBlock heap örnekleri 78,8–79,6 MiB, main-process heap örnekleri başlangıç/sonda 8,4/9,5 MiB oldu. Bu ortamda gerçek sekme paylaşımı `AbortError: Timeout starting video source` ile reddedildi; paylaşım kontrolü başarılı sayılmadı. Ham çıktılar `dist/soak/2026-11-07T13-13-40-707Z/` içindedir.
