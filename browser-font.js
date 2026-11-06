'use strict';
// Loaded only by Calcium-owned UI documents. No styles are injected into websites.
(()=>{
 const api=window.browserApi||window.pageApi;if(!api)return;
 let style=null;
 function apply(family){
  if(!family){style?.remove();style=null;return;}
  if(!style){style=document.createElement('style');style.dataset.calciumUiFont='';document.documentElement.append(style);}
  style.textContent='html,body,body *{font-family:'+family+' !important}';
 }
 let updated=false;api.onFont?.(font=>{updated=true;apply(font);});
 api.getFont?.().then(font=>{if(!updated)apply(font);}).catch(()=>{});
})();
