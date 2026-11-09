'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
// Keep Ctrl+wheel consistent inside WebContentsView, including scrollable panels.
let lastZoomWheel=0;
window.addEventListener('wheel',event=>{
 if(!event.isTrusted||!event.ctrlKey||!event.deltaY)return;
 event.preventDefault();const now=performance.now();if(now-lastZoomWheel<80)return;lastZoomWheel=now;
 ipcRenderer.send('calcium-zoom-wheel',event.deltaY<0?1:-1);
},{capture:true,passive:false});

// Run in the main world BEFORE the page's own scripts
function inMainWorld(fn) {
  try {
    if (typeof contextBridge.executeInMainWorld === 'function') contextBridge.executeInMainWorld({ func: fn });
    else webFrame.executeJavaScript(`(${fn.toString()})()`);
  } catch {}
}

// 1) The browser's own local pages (new tab, welcome, history, downloads): shortcuts, theme, list API.
//    This API is never created on other sites. The main process also checks the sender page on every command.
if (location.protocol === 'file:' && ipcRenderer.sendSync('calcium-internal-page') === true) {
  contextBridge.exposeInMainWorld('pageApi', {
    lang: ipcRenderer.sendSync('calcium-lang'),
    getFont:()=>ipcRenderer.invoke('calcium-ui-font'),
    onFont:fn=>ipcRenderer.on('calcium-ui-font',(_e,font)=>fn(font)),   // UI language: 'tr' | 'en' (see i18n.js)
    get: () => ipcRenderer.invoke('page', 'get'),
    call: (cmd, arg) => ipcRenderer.invoke('page', cmd, arg),
    onUpdate: (fn) => { ipcRenderer.removeAllListeners('page-update'); ipcRenderer.on('page-update', (_e, d) => fn(d)); }
  });
}

// Preserve edited forms when automatic tab sleeping runs. Never transmit field values.
if(/^https?:$/.test(location.protocol)){
 let reported=false;
 window.addEventListener('input',e=>{if(!reported&&e.isTrusted){reported=true;ipcRenderer.send('calcium-form-dirty');}},{capture:true,passive:true});
}

// User-configured text expansion stays in its own isolated world and ignores secret/login fields.
// <text-expansion>
function installTextExpansion(rules,resolveValue){
 const key=Symbol.for('calcium.text-expansion');if(window[key]){window[key].update(rules);return;}
 let entries=new Map(),target=null,typed='',composing=false,expanding=false;
 const reset=()=>{target=null;typed='';};
 function update(next){entries=new Set((Array.isArray(next)?next:[]).slice(0,100).filter(r=>typeof r==='string'));reset();}
 function editable(node){
  if(!node||node.disabled||node.readOnly)return false;
  const autocomplete=(node.getAttribute?.('autocomplete')||'').toLowerCase();
  if(/password|one-time-code|cc-|username/.test(autocomplete))return false;
  if(node.closest?.('form')?.querySelector('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]'))return false;
  if(node.tagName==='INPUT')return ['text','search','url','tel'].includes(node.type)&&!/password|passwd|otp|pin|creditcard|cardnumber/i.test((node.name||'')+' '+(node.id||''));
  return node.tagName==='TEXTAREA'||node.isContentEditable;
 }
 const element=e=>e.composedPath?.().find(n=>editable(n))||null;
 document.addEventListener('compositionstart',()=>{composing=true;reset();},true);document.addEventListener('compositionend',()=>{composing=false;reset();},true);
 document.addEventListener('pointerdown',reset,true);document.addEventListener('focusout',reset,true);
 document.addEventListener('input',event=>{
  if(expanding)return;if(!event.isTrusted||composing){reset();return;}const node=element(event);if(!node){reset();return;}if(target!==node){reset();target=node;}
  if(event.inputType==='deleteContentBackward'){typed=typed.slice(0,-1);return;}
  if(event.inputType!=='insertText'||typeof event.data!=='string'){reset();return;}
  for(const char of event.data){if(char==='#')typed='#';else if(typed&&/^[\p{L}\p{N}_-]$/u.test(char)&&typed.length<33)typed+=char;else typed='';}
 },true);
 document.addEventListener('keydown',async event=>{
  if(!event.isTrusted||composing||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||![' ','Enter','Tab'].includes(event.key))return;
  const node=element(event);if(node!==target||!typed.startsWith('#'))return;
  const trigger=typed.slice(1).normalize('NFC').toLowerCase();if(!entries.has(trigger))return;
  event.preventDefault();
  const token=typed,oldValue=node.value,startOffset=node.selectionStart,endOffset=node.selectionEnd;
  const oldSelection=node.isContentEditable?getSelection():null,anchor=oldSelection?.anchorNode,offset=oldSelection?.anchorOffset;
  let replacement;try{replacement=await resolveValue(trigger);}catch{return;}
  if(typeof replacement!=='string'||replacement.length>4096||target!==node||typed!==token||!editable(node)||!node.isConnected)return;
  if(node.isContentEditable){const current=getSelection();if(!current?.isCollapsed||current.anchorNode!==anchor||current.anchorOffset!==offset)return;}
  else if(node.value!==oldValue||node.selectionStart!==startOffset||node.selectionEnd!==endOffset)return;
  const suffix=event.key===' '?' ':event.key==='Enter'&&(node.tagName==='TEXTAREA'||node.isContentEditable)?'\n':'';
  let restore;
  if(node.tagName==='INPUT'||node.tagName==='TEXTAREA'){
   const end=node.selectionEnd;if(node.selectionStart!==end||node.value.slice(Math.max(0,end-typed.length),end)!==typed){reset();return;}
   const start=end-typed.length;node.setSelectionRange(start,end);restore=()=>{node.setRangeText(replacement+suffix,start,end,'end');node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:replacement+suffix}));};
  }else{
   const selection=getSelection(),anchor=selection?.anchorNode,end=selection?.anchorOffset;
   if(!selection?.isCollapsed||anchor?.nodeType!==3||anchor.textContent.slice(Math.max(0,end-typed.length),end)!==typed){reset();return;}
   const range=document.createRange();range.setStart(anchor,end-typed.length);range.setEnd(anchor,end);selection.removeAllRanges();selection.addRange(range);
   restore=()=>{range.deleteContents();const text=document.createTextNode(replacement+suffix);range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:replacement+suffix}));};
  }
  expanding=true;try{if(!document.execCommand('insertText',false,replacement+suffix))restore();}finally{expanding=false;reset();}
 },true);
 update(rules);window[key]={update};
}
// </text-expansion>
if(/^https?:$/.test(location.protocol)){
 const apply=rules=>installTextExpansion(rules,trigger=>ipcRenderer.invoke('calcium-text-value',trigger));
 ipcRenderer.invoke('calcium-text-shortcuts').then(pack=>{if(pack)apply(pack.rules);}).catch(()=>{});
 ipcRenderer.on('calcium-text-shortcuts-changed',(_e,rules)=>apply(rules));
}
// Capture visible link labels; no background page or media needs to load just for a title.
if (/^https?:$/.test(location.protocol)) {
  window.addEventListener('mousedown',e=>{
    if(!e.isTrusted || !(e.button===1 || e.button===0&&(e.ctrlKey||e.metaKey)))return;
    const link=e.composedPath().find(el=>el?.tagName==='A'&&el.href);
    if(!link||!/^https?:/i.test(link.href))return;
    const card=link.closest('ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model');
    const named=card?.querySelector('a#video-title,a#video-title-link,[role="heading"]');
    const title=named?.getAttribute('title')||named?.textContent||link.getAttribute('title')||link.getAttribute('aria-label')||link.textContent;
    if(title?.trim())ipcRenderer.sendSync('calcium-link-title',{url:link.href,title:title.slice(0,300)});
  },{capture:true,passive:true});
}

// 2) Passkeys fully disabled: sites see no passkey support,
//    Windows Hello / "use a passkey" dialogs never open. Sites fall back to password sign-in.
inMainWorld(() => {
  try {
    const c = navigator.credentials;
    if (c) {
      const deny = () => Promise.reject(new DOMException('Passkeys are disabled in this browser', 'NotAllowedError'));
      const og = c.get && c.get.bind(c), oc = c.create && c.create.bind(c);
      Object.defineProperty(c, 'get', { value: (o) => (o && o.publicKey ? deny() : og(o)), configurable: true, writable: true });
      Object.defineProperty(c, 'create', { value: (o) => (o && o.publicKey ? deny() : oc(o)), configurable: true, writable: true });
    }
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true });
  } catch {}
});

// Built-in image zoom world (1014, see hoverzoom.js): separate img/media rule so the site's CSP doesn't block
// the large image from another server (extension content scripts work this way in Chrome too).
if (/^https?:$/.test(location.protocol)) {
  contextBridge.exposeInIsolatedWorld(1014, 'calciumZoomDownload', (url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) ipcRenderer.send('calcium-zoom-download', url);
  });
  try { webFrame.setIsolatedWorldInfo(1014, { name: 'Calcium resim büyütme', securityOrigin: location.origin, csp: "default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline'" }); } catch {}
}

// 3) Extension user scripts (chrome.userScripts compatibility, see user-scripts.js).
//    Runs only on web pages and only if an extension registered scripts; each extension in its own isolated world.
//    The listener list lives in the extension's world (bridge function copies would break removeListener
//    and listeners would pile up); only a single dispatcher function crosses the bridge.
if (/^https?:$/.test(location.protocol)) {
  let packs = [];
  try { packs = ipcRenderer.sendSync('calcium-us-get', location.href) || []; } catch {}
  if (packs.length) {
    const dispatchers = new Map();   // extension -> dispatcher in its world
    ipcRenderer.on('calcium-us-tabmsg', (_e, extId, reqId, msg) => {
      const d = dispatchers.get(extId);
      if (!d) { ipcRenderer.send('calcium-us-tabreply', reqId, undefined); return; }
      try { d(reqId, msg); } catch { ipcRenderer.send('calcium-us-tabreply', reqId, undefined); }
    });
    for (const p of packs) {
      try {
        // With a CSP Electron also requires a security origin; the page's own origin is used (as Chrome does)
        webFrame.setIsolatedWorldInfo(p.worldId, { name: p.name, csp: p.csp, securityOrigin: location.origin });
        // Each world already has Chromium's own "chrome" object; the bridge uses a separate name, then chrome.runtime is set up
        contextBridge.exposeInIsolatedWorld(p.worldId, '__calciumRuntime', {
          id: p.extId,
          send: (msg) => ipcRenderer.invoke('calcium-us-msg', p.extId, msg),
          reply: (reqId, value) => ipcRenderer.send('calcium-us-tabreply', reqId, value),
          setDispatcher: (fn) => { dispatchers.set(p.extId, fn); }
        });
      } catch { continue; }
      const run = (list) => { if (list.length) webFrame.executeJavaScriptInIsolatedWorld(p.worldId, list).catch(() => {}); };
      run([{ code: `(() => {
        const b = globalThis.__calciumRuntime; delete globalThis.__calciumRuntime;
        const listeners = new Set();
        const runtime = {
          id: b.id,
          lastError: undefined,
          getURL: (f) => 'chrome-extension://' + b.id + '/' + String(f || '').replace(/^\\//, ''),
          sendMessage: (...a) => {
            const cb = typeof a[a.length - 1] === 'function' ? a.pop() : null;
            const msg = a.length > 1 && typeof a[0] === 'string' ? a[1] : a[0];   // (extensionId, message) form also allowed
            const pr = b.send(msg);
            if (cb) { pr.then((v) => cb(v), () => cb()); return undefined; }
            return pr;
          },
          onMessage: {
            addListener: (fn) => { listeners.add(fn); },
            removeListener: (fn) => { listeners.delete(fn); },
            hasListener: (fn) => listeners.has(fn),
            hasListeners: () => listeners.size > 0
          }
        };
        b.setDispatcher((reqId, msg) => {
          let isAsync = false, answered = false;
          const respond = (v) => { if (answered) return; answered = true; b.reply(reqId, v); };
          for (const fn of [...listeners]) {
            try {
              const r = fn(msg, { id: b.id }, respond);
              if (r === true) isAsync = true;
              else if (r && typeof r.then === 'function') { isAsync = true; r.then(respond, () => respond(undefined)); }
            } catch (e) { console.error(e); }
          }
          if (!isAsync) respond(undefined);
        });
        const c = globalThis.chrome || (globalThis.chrome = {});
        try { Object.defineProperty(c, 'runtime', { value: runtime, configurable: true, writable: true }); } catch { c.runtime = runtime; }
      })()` }].concat(p.start));
      if (p.end.length || p.idle.length) {
        const later = () => { run(p.end); setTimeout(() => run(p.idle), 0); };
        if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', later, { once: true }); else later();
      }
    }
  }
}
