'use strict';
// Stateless reads of the existing uBO engines. Private hosts never enter uBO's
// page stores, selector/scriptlet caches, content-script registrations or logger.
const install = String.raw`(async()=>{
 const [{default:cosmetic},{default:scriptlets},{ScriptletFilteringEngine},uri,{MRUCache},{FilteringContext},{default:network},rules]=await Promise.all([
  import('./js/cosmetic-filtering.js'),import('./js/scriptlet-filtering.js'),import('./js/scriptlet-filtering-core.js'),import('./js/uri-utils.js'),import('./js/mrucache.js'),import('./js/filtering-context.js'),import('./js/static-net-filtering.js'),import('./js/filtering-engines.js')]);
 self.calciumPrivateContent=request=>{
  if(!µBlock.readyToFilter||!µBlock.getNetFilteringSwitch(request.top)||!µBlock.getNetFilteringSwitch(request.url))return null;
  const hostname=uri.hostnameFromURI(request.url),domain=uri.domainFromHostname(hostname);
  if(!hostname)return null;
  const context=new FilteringContext().setURL(request.url).setDocOriginFromURL(request.url);
  const allowed=type=>network.matchRequest(context.setType(type),3)!==2;
  const noSpecificCosmeticFiltering=!allowed('specifichide');
  const noGenericCosmeticFiltering=!allowed('generichide');
  let css='',exceptions=[];
  if(!rules.sessionSwitches.evaluateZ('no-cosmetic-filtering',hostname)){
   // retrieveSpecificSelectors supports dontInject. Shadow the mutable caches
   // with short-lived ones instead of letting private hostnames reach them.
   const reader=Object.create(cosmetic);reader.selectorCache=new Map();reader.highlyGeneric={};
   for(const [key,entry] of Object.entries(cosmetic.highlyGeneric))reader.highlyGeneric[key]={...entry,mru:new MRUCache(1)};
   const result=reader.retrieveSpecificSelectors({url:request.url,hostname,domain},{dontInject:true,noSpecificCosmeticFiltering,noGenericCosmeticFiltering:request.initial===false||noGenericCosmeticFiltering});
   css=request.initial===false?'':result.injectedCSS||'';exceptions=result.exceptionFilters||[];
   if(!noGenericCosmeticFiltering){
    const selectors=new Set(),except=new Set(exceptions);
    for(const hash of request.hashes||[]){const bucket=cosmetic.lowlyGeneric.get(hash);if(!bucket)continue;for(const selector of bucket.split(',\n'))if(!except.has(selector))selectors.add(selector);}
    if(selectors.size)css+='\n'+[...selectors].join(',\n')+'\n{display:none!important;}';
   }
  }
  let scripts;
  if(request.scripts===true&&!(µBlock.userSettings.advancedUserEnabled&&rules.sessionFirewall.evaluateCellZY(hostname,hostname,'*')===2)){
   // Call the core reader directly: the extension wrapper caches by hostname
   // and may enable logging/registration. Neither is appropriate in private mode.
   scripts=ScriptletFilteringEngine.prototype.retrieve.call(scriptlets,{url:request.url,hostname,domain,ancestors:(request.ancestors||[]).map(a=>({...a,domain:uri.domainFromHostname(a.hostname)}))});
  }
  const mainWorld=scripts?.mainWorld||'',isolatedWorld=scripts?.isolatedWorld||'';
  return {css:css.length<=524288?css:'',mainWorld:mainWorld.length<=524288?mainWorld:'',isolatedWorld:isolatedWorld.length<=524288?isolatedWorld:''};
 };
})()`;

function attachPrivateContent({ses,getBackground,ipcMain,preloadPath}) {
 const packs=new Map();let active=0,generation=0;
 const frameKey=frame=>frame?Number.isInteger(frame.frameTreeNodeId)?String(frame.frameTreeNodeId):`${frame.processId}:${frame.routingId}`:null;
 const valid=(event,url)=>{try{return !event.sender.isDestroyed()&&event.sender.session===ses&&typeof url==='string'&&url.length<=8192&&/^https?:\/\//i.test(url)&&event.senderFrame?.url===url;}catch{return false;}};
 async function read(request){
  const bg=getBackground();if(!bg||active>=16)return null;
  active++;
  let timer;
  const pending=Promise.resolve().then(()=>bg.executeJavaScript(`self.calciumPrivateContent(${JSON.stringify(request)})`)).finally(()=>active--);
  try{return await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);}
  catch{return null;}finally{clearTimeout(timer);}
 }
 async function prepare(details){
  if(details.resourceType!=='mainFrame'||!details.frame||!Number.isInteger(details.webContentsId))return;
  const frame=details.frame,key=frameKey(frame),url=details.url,epoch=generation;
  clearTimeout(packs.get(key)?.timer);packs.delete(key);
  const result=await read({url,top:url,scripts:true});
  if(!result||epoch!==generation)return;
  if(packs.size>=32){const oldest=packs.keys().next().value;clearTimeout(packs.get(oldest)?.timer);packs.delete(oldest);}
  const pack={url,wcId:details.webContentsId,result};
  pack.timer=setTimeout(()=>{if(packs.get(key)===pack)packs.delete(key);},8000);pack.timer.unref?.();
  packs.set(key,pack);
 }
 ipcMain.on('calcium-private-content-start',(event,url)=>{
  if(!valid(event,url)){event.returnValue=null;return;}
  const key=frameKey(event.senderFrame),pack=packs.get(key);clearTimeout(pack?.timer);packs.delete(key);
  event.returnValue=pack?.url===url&&pack.wcId===event.sender.id?pack.result:null;
 });
 ipcMain.handle('calcium-private-content-query',async(event,url,hashes,initial)=>{
  if(!valid(event,url)||typeof initial!=='boolean'||!Array.isArray(hashes)||hashes.length>512||!hashes.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffff))return null;
  const frame=event.senderFrame,top=frame.top?.url||url;
  const result=await read({url,top,hashes,initial,scripts:false});
  return valid(event,url)?result:null;
 });
 ses.registerPreloadScript({id:'calcium-private-content',type:'frame',filePath:preloadPath});
 return {prepare,clear:()=>{generation++;for(const pack of packs.values())clearTimeout(pack.timer);packs.clear();},install};
}
module.exports={attachPrivateContent,install};
