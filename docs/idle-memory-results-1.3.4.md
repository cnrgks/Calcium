# Açık sayfa / yeni sekme ekranında boşta bellek — 7 Kasım 2026

1.3.4 adayında aktif sayfayı uyutmadan boşta tüketim incelendi. UI, sandbox, tam site izolasyonu, GPU hızlandırması ve uBlock filtreleri korunuyor.

## Ölçüm ve sonuç

Gerçek Electron 45.2.1, bir yeni sekme sayfası, uBlock açık. Önce ayrı geçici profil 75 saniye çalıştırılarak önbellek oluşturuldu; normal ve deneysel ayarlar bu profilin bağımsız kopyalarında denendi. Pencere ölçümde gizlendi fakat aktif sekmenin WebContents'i yaşatıldı; görünür pencerede sayfa okuma / kompozitör davranışı ayrıca ölçülmedi. Warm karşılaştırmada yalnızca test kopyalarının uBO otomatik liste yenilemesi kapatıldı; ürünün güncelleme davranışı değişmedi.

Toplam, süreçlerin Electron `privateBytes` metriklerinden hesaplandı (MiB). Her warm mod için bir koşu vardır; istatistiksel performans garantisi veya çok tekrarlı medyan değildir.

| Hazır olduktan sonra boşta süre | Normal | Erken bellek azaltma |
| --- | ---: | ---: |
| 0 saniye | 315,3 MiB | 312,5 MiB |
| 15 saniye | 347,3 MiB | 314,9 MiB |
| 45 saniye | 292,3 MiB | 291,0 MiB |
| 75 saniye | 288,1 MiB | 286,0 MiB |

15. saniyede yaklaşık 32 MiB daha az bellek gözlendi. 75. saniyedeki yaklaşık 2 MiB fark anlamlı bir taban bellek iyileştirmesi sayılmadı. Esas sonuç, geçici belleğin daha erken bırakılmasıdır. Kalan yaklaşık 280–300 MiB tüketimi bu çalışmada kalıcı olarak önemli ölçüde azaltılmadı.

Soğuk profilde filtrelerin ilk derlenmesi sırasında ilk örnek 1.151 MiB, 45. saniye 308 MiB, 75. saniye 408 MiB idi. Dalgalanmanın büyük kısmı uBO renderer'ındaydı; ilk derleme, sonraki önbellek/snapshot yazımı ve V8 bellek toplaması nedeniyle tek bir anlık sayı yanıltıcıdır. Bu tepe kalıcı bir sızıntı olarak yorumlanmadı.

## Uygulanan küçük değişiklik

V8 `gc-memory-reducer-start-delay-ms` başlangıcı, bu motorun varsayılan 30 saniyesinden 10 saniyeye çekildi. Normal heap sınırları, JIT ve bellek azaltıcının kendi kontrol mekanizması korundu; uygulamaya periyodik zorla GC zamanlayıcısı eklenmedi. Kullanıcının komut satırındaki açık aynı bayrak tercihi korunur. Bu motor içi bayrağın desteği bir sonraki Electron yükseltmesinde yeniden doğrulanmalıdır.

Bu, aktif sayfayı kapatma/uyutma veya bellek sınırına zorla sıkıştırma değildir. uBO filtresi, donanım hızlandırması ve güvenlik sınırları değiştirilmedi.

## Reddedilen daha sert ayar

`--optimize-for-size` ayrıca denendi. Bir warm koşuda toplam bellek 75. saniyede 261,7 MiB çıktı; fakat bunun yaklaşık 20 MiB'si GPU süreç farkından geldiği için tamamı V8 kazancı sayılamaz. Renderer ve main kazancı çok daha küçüktü.

Ayrı yerel testte, her iş yükü için ısınma sonrası 9 tekrarın medyanı:

- Sayısal döngü: normal 6,1 ms, compact 5,1 ms (bu örnekte daha hızlı; genellenmez).
- Nesne/string oluşturma: normal 21,3 ms, compact 35,1 ms (yaklaşık %65 daha yavaş).

Bu sonuçlarla boyut odaklı ayar ürüne eklenmedi. Global JavaScript heap sınırını düşürme, JIT kapatma, GPU kapatma ve çalışma kümesini Windows'a zorla budatma uygulanmadı.

## Doğrulama ve tekrar çalıştırma

Mevcut Electron regresyonları erken azaltma ayarıyla geçti; uBO normal/gizli filtreleme, UI, görev yöneticisi, site izolasyonu ve uyutma/uyandırma doğrulandı. Bu sefer yerel sekme yeniden açılışı tek koşuda 56 ms idi; önceki 58 ms ile fark performans kazancı sayılmadı.

Ham kayıtlar: `docs/benchmarks/idle-1.3.4/`. Yerel uygulama yolu kayıtlarda anonimleştirildi.

```powershell
node tools/run-idle-bench.cjs
node tools/compare-idle.cjs
node tools/compare-idle.cjs --early
node tools/run-v8-size-bench.cjs
```

İlk komut test profilini sonraki karşılaştırmalar için geçici dizinde bırakır; `dist/idle-review/profile-path.txt` bu test profilini gösterir. Kullanıcının Calcium profili kullanılmaz. Profil kopyaları karşılaştırmalardan sonra temizlenir. Her test yaklaşık 75 saniye örnekler; yalnızca yeni sekme ekranı ölçülmüştür, gerçek siteler için aynı sayılar garanti edilmez.

Bir sonraki anlamlı hedef, görünür aktif web sayfaları ve normal kullanıcı profiliyle uzun süreli ölçümdür. uBO motorunu kaldırmadan veya sayfayı askıya almadan daha büyük bir azaltma bu çalışmada doğrulanmadı.

Kaynaklar: motorun yerel `--v8-options` çıktısı ve [V8 bellek yönetimi açıklaması](https://v8.dev/blog/optimizing-v8-memory). `optimize-for-size` hız/bellek tercihi için [V8 bayrak tanımları](https://chromium.googlesource.com/v8/v8/+/7da17e32380ff567fd9bd52dc255ac758b6f2447/src/flags/flag-definitions.h).

Güncellenmiş 1.3.4 kurulumu yeniden oluşturuldu ve ayrı profille paket açılışı doğrulandı. SHA-256: `353343b43ea3779ab8868d79d7ad2244b700492c03a54f2ca40d716ca2155c7e`.
