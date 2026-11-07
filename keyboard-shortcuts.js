'use strict';
function keyboardShortcuts({isMac=false,verticalTabs=true}={}){
 const groups=[
  {title:'Sekmeler ve pencereler',items:[
   ['Yeni sekme',['Ctrl+T']],['Kapatılan sekmeyi geri aç',['Ctrl+Shift+T']],['Sekmeyi kapat',['Ctrl+W','Ctrl+F4']],['Yeni pencere',['Ctrl+N']],['Yeni gizli pencere',['Ctrl+Shift+N']],['Pencereyi kapat',['Ctrl+Shift+W']],['Sonraki / önceki sekme',['Ctrl+Tab','Ctrl+Shift+Tab']],['Sonraki / önceki sekme',['Ctrl+PageDown','Ctrl+PageUp']],['Sekmeyi sağa / sola taşı',['Ctrl+Shift+PageDown','Ctrl+Shift+PageUp']],['İlk sekmelerden birini seç',['Ctrl+1–8']],['Son sekmeyi seç',['Ctrl+9']],['Sekmeyi sabitle / sabitlemeyi kaldır',['Ctrl+D']]]},
  {title:'Gezinme ve arama',items:[
   ['Adres çubuğuna odaklan',['Ctrl+L','Alt+D','F6']],['Arama kutusunu aç',['Ctrl+K','Ctrl+E']],['Sayfada bul',['Ctrl+F']],['Sonraki / önceki eşleşme',['Ctrl+G','Ctrl+Shift+G','F3','Shift+F3']],['Geri / ileri git',['Alt+←','Alt+→']],['Yeni sekme sayfasına git',['Alt+Home']],['Yenile',['Ctrl+R','F5']],['Önbelleği atlayarak yenile',['Ctrl+Shift+R','Ctrl+F5']],['Geçmişi aç',['Ctrl+H']],['İndirmeleri aç',['Ctrl+J']]]},
  {title:'Araçlar ve görünüm',items:[
   ['Görev yöneticisini aç',['Shift+Esc']],['Okuma modunu aç / kapat',['F9']],['Tam ekranı aç / kapat',['F11']],['Yakınlaştır / uzaklaştır',['Ctrl++','Ctrl+−']],['Yakınlaştırmayı sıfırla',['Ctrl+0']],['Sayfayı kaydet',['Ctrl+Shift+S',...(!verticalTabs?['Ctrl+S']:[])]],...(verticalTabs?[['Yan çubuğu gizle / göster',['Ctrl+S']]]:[]),['Dosya aç',['Ctrl+O']],['Yazdır',['Ctrl+P']],['Gezinti verilerini temizle',['Ctrl+Shift+Delete']],['Sayfa kaynağını görüntüle',['Ctrl+U']],['Geliştirici araçlarını aç / kapat',['F12','Ctrl+Shift+I']],['Tarayıcı menüsünü aç',['Alt+F','Alt+E','F10']]]},
  {title:'Menüler ve sekme listesi',items:[
   ['Açık kutuda odağı ilerlet / geri al',['Tab','Shift+Tab']],['Menüde veya sekme listesinde ilerle',['↑','↓','←','→','Home','End']],['Odaklanan öğeyi seç',['Enter','Space']],['Önce alt menüyü, sonra açık kutuyu kapat',['Esc']],['Odaklanan sekmeyi kapat',['Delete']],['Odaklanan sekmenin menüsünü aç',['Shift+F10']]]},
  {title:'Resim büyütme açıkken',items:[['Büyütülen resmi sabitle / bırak',['Z']],['Büyütülen resmi indir',['S']],['Büyütülen resmi kapat',['Esc']]]}
 ];
 return groups.map(group=>({...group,items:group.items.map(([label,keys])=>({label,keys:keys.map(key=>isMac?key.replaceAll('Ctrl','Cmd'):key)}))}));
}
module.exports={keyboardShortcuts};
