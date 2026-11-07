# Klavye ve odak kuralları

- Açık menüler ve iletişim kutularında Tab/Shift+Tab odağı o katmanda tutar; görünmeyen veya devre dışı öğeler atlanır.
- Menüde yukarı/aşağı ok ve Home/End öğeler arasında ilerler. Sağ ok alt menüyü açar, sol ok veya ilk Escape alt menüyü kapatır. Sonraki Escape menüyü kapatır.
- Menü araç çubuğundan açılmışsa kapanınca odak açan düğmeye döner. Düzenlenebilir alana ait bağlam menüsü kapanınca alanın odağı geri gelir; adres arama penceresi yanlışlıkla tekrar açılmaz. Sayfadan açılmış menü kapanınca sayfaya dönülür.
- Arama üzerindeki özel bağlam menüsü kapanınca yazılan metin ve seçim korunarak aramaya dönülür. Arama penceresi açıkken Escape kapatır; Ctrl+T yeni sekme, adres odağından açılan pencere aynı sekmede gezinme davranışını korur. Arama sonucu seçimi ekran okuyucuya aktif öğe olarak bildirilir.
- İzin penceresinin başlangıç odağı izin verme düğmesi yerine güvenli iptal/engelleme düğmesindedir. Cihaz seçicisinde iptal düğmesine basılan Enter bağlantı izni vermez.
- Sekme satırlarında Tab ile aktif sekmeye girilir. Ok tuşları ve Home/End odaklanan sekmeyi değiştirir; Enter/Space sekmeyi açar, Delete kapatır. Shift+F10 bağlam menüsünü açar. Yan çubuk klavyeyle kullanılırken imleç başka yerde diye otomatik kapanmaz.

Bu kurallar gerçek Electron renderer testlerinde doğrulanır. Yerel sistemin gösterdiği native menüler kendi işletim sistemi klavye kurallarını kullanır.

Ayarlar → Klavye kısayolları, mevcut komutları açılabilir gruplar halinde listeler. Yan çubuk açık/kapalı düzenine göre Ctrl+S açıklaması güncellenir. Shift+F10 odaklanan sekmenin bağlam menüsüne ayrılmıştır; F10 tarayıcı menüsünü açar.
