'use strict';
const MAX_RULES=100;
function trigger(value,prefix){const s=String(value||'').trim().replace(new RegExp('^'+(prefix==='#'?'#':'!')),'').normalize('NFC').toLowerCase();if(!/^[\p{L}\p{N}_-]{1,32}$/u.test(s))throw Error('Kısayol 1–32 harf, rakam, tire veya alt çizgiden oluşmalı.');return s;}
function webUrl(value,{template=false}={}){
 const s=String(value||'').trim();if(s.length>2048)throw Error('Adres çok uzun.');
 if(template&&!s)return '';
 if(template&&(!s.includes('{query}')||s.split('{query}').length!==2))throw Error('Arama adresinde bir kez {query} bulunmalı.');
 try{const u=new URL(s);if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw Error();return s;}catch{throw Error('Geçerli bir http veya https adresi yazın.');}
}
function sanitizeRule(kind,rule){
 if(kind==='site')return {trigger:trigger(rule.trigger,'!'),url:webUrl(rule.url),searchUrl:webUrl(rule.searchUrl,{template:true})};
 if(kind==='text'){const value=String(rule.value||'');if(!value.trim()||value.length>4096||value.includes('\0'))throw Error('Dönüştürülecek metin boş olamaz ve 4096 karakteri aşamaz.');return {trigger:trigger(rule.trigger,'#'),value};}
 throw Error('Geçersiz kısayol türü.');
}
function normalizeRules(kind,items){const out=[],seen=new Set();for(const item of Array.isArray(items)?items.slice(0,MAX_RULES):[])try{const r=sanitizeRule(kind,item);if(!seen.has(r.trigger)){seen.add(r.trigger);out.push(r);}}catch{}return out;}
function saveRule(kind,items,input){
 const list=normalizeRules(kind,items),rule=sanitizeRule(kind,input),original=input.original?trigger(input.original,kind==='site'?'!':'#'):null;
 if(list.some(r=>r.trigger===rule.trigger&&r.trigger!==original))throw Error('Bu kısayol zaten var.');
 const index=original?list.findIndex(r=>r.trigger===original):-1;if(original&&index<0)throw Error('Düzenlenen kısayol bulunamadı.');
 if(index<0){if(list.length>=MAX_RULES)throw Error('En fazla 100 kısayol ekleyebilirsiniz.');list.push(rule);}else list[index]=rule;
 return list;
}
function resolveInput(input,{siteCommands=[],textReplacements=[],searchUrl}={}){
 const text=String(input||'').trim();const exact=/^#([^\s#]+)$/u.exec(text);
 if(exact){const rule=textReplacements.find(r=>r.trigger===exact[1].normalize('NFC').toLowerCase());if(rule)return {kind:'text',value:rule.value};}
 const bang=/^!([^\s!]+)(?:\s+([\s\S]*))?$/u.exec(text);
 if(bang){const rule=siteCommands.find(r=>r.trigger===bang[1].normalize('NFC').toLowerCase());if(rule){const query=(bang[2]||'').trim();return {kind:query&&rule.searchUrl?'search':'url',url:query&&rule.searchUrl?rule.searchUrl.replace('{query}',encodeURIComponent(query)):rule.url,query:query&&rule.searchUrl?text:null};}}
 const url=/^(?:https?|file|about|data|view-source|chrome-extension|calcium|mondium|blob):/i.test(text)||/^localhost(?::\d+)?(?:\/|$)/i.test(text)||!/[\s]/.test(text)&&/^[^\s/]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i.test(text)||/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/.test(text);
 return url?{kind:'url',url:text}:{kind:'search',url:searchUrl+encodeURIComponent(text),query:text};
}
function suggestions(history,text){const q=String(text||'').trim().toLocaleLowerCase('tr');if(!q)return {items:[],inline:''};const words=q.split(/\s+/);return {items:history.filter(h=>typeof h.query==='string'&&words.every(w=>h.query.toLocaleLowerCase('tr').includes(w))).slice(0,6).map(h=>({value:h.query,title:h.query,kind:'search'})),inline:''};}
module.exports={trigger,normalizeRules,saveRule,resolveInput,suggestions};
