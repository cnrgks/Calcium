'use strict';
// This preload is registered only on the in-memory private Session. No bridge
// is exposed to page scripts, and DOM identifiers never enter the normal cache.
const {ipcRenderer,webFrame}=require('electron');
if(/^https?:$/.test(location.protocol)){
 let url=location.href;let stopped=false,timer=null,inFlight=false,hasInitial=false;
 const seen=new Set(),pending=new Set(),styleKeys=[];
 function css(text){if(typeof text==='string'&&text&&text.length<=524288&&styleKeys.length<32)styleKeys.push(webFrame.insertCSS(text));}
 try{
  const pack=ipcRenderer.sendSync('calcium-private-content-start',url);
  if(pack){
   hasInitial=true;css(pack.css);
   if(pack.mainWorld)webFrame.executeJavaScript(pack.mainWorld).catch(()=>{});
   if(pack.isolatedWorld)webFrame.executeJavaScriptInIsolatedWorld(1015,[{code:`(${pack.isolatedWorld})()`}]).catch(()=>{});
  }
 }catch{}
 // Same bounded ID/class hash used by the bundled uBO cosmetic engine.
 function hash(type,s){let h=(type<<5)+type^s.length;const step=s.length+7>>>3;for(let i=0;i<s.length;i+=step)h=(h<<5)+h^s.charCodeAt(i);return h&0xffffff;}
 function add(type,token){if(!token||seen.size>=8192)return;const h=hash(type,token);if(seen.has(h))return;seen.add(h);pending.add(h);}
 function scan(root,descendants=true){
  let count=0;
  const visit=node=>{if(node.id)add(35,node.id);if(typeof node.className==='string')for(const token of node.classList)add(46,token);};
  if(root.nodeType===1)visit(root);
  if(!descendants)return;
  const walk=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
  for(let node;count<4096&&(node=walk.nextNode());count++)visit(node);
 }
 function resetRoute(){
  if(location.href===url)return;
  url=location.href;hasInitial=false;for(const key of styleKeys)webFrame.removeInsertedCSS(key);styleKeys.length=0;seen.clear();pending.clear();scan(document);
 }
 ipcRenderer.on('calcium-private-content-refresh',()=>{if(!stopped){resetRoute();schedule();}});
 async function flush(){
  timer=null;if(stopped||inFlight)return;
  resetRoute();const requestUrl=url;
  const hashes=[...pending].slice(0,512);for(const h of hashes)pending.delete(h);inFlight=true;
  try{const pack=await ipcRenderer.invoke('calcium-private-content-query',requestUrl,hashes,!hasInitial);if(!stopped&&location.href===requestUrl&&pack){hasInitial=true;css(pack.css);}}catch{}
  finally{inFlight=false;if(pending.size&&!stopped)schedule();}
 }
 function schedule(){if(!timer&&!inFlight&&!stopped&&styleKeys.length<32)timer=setTimeout(flush,100);}
 const observer=new MutationObserver(records=>{
  let count=0;for(const record of records){if(count++>=128)break;if(record.type==='attributes')scan(record.target,false);else for(const node of record.addedNodes){if(node.nodeType===1)scan(node);if(count++>=128)break;}}
  if(seen.size>=8192||styleKeys.length>=32){observer.disconnect();return;}
  if(pending.size)schedule();
 });
 function start(){if(stopped)return;scan(document);schedule();observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['id','class']});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);observer.disconnect();pending.clear();seen.clear();});
 window.addEventListener('pageshow',event=>{if(!event.persisted)return;stopped=false;hasInitial=false;url=location.href;for(const key of styleKeys)webFrame.removeInsertedCSS(key);styleKeys.length=0;seen.clear();pending.clear();start();});
}
