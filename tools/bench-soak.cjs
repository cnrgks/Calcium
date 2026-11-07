'use strict';
const {app,webContents}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module'),http=require('http'),assert=require('assert'),crypto=require('crypto');
const root=path.join(__dirname,'..'),output=process.env.CALCIUM_SOAK_OUTPUT,profile=process.env.CALCIUM_PROFILE;
if(!output||!profile||!path.basename(profile).startsWith('calcium-soak-'))throw Error('Use npm run bench:soak');
const duration=Number(process.env.CALCIUM_SOAK_MINUTES)*60000;
if(!Number.isFinite(duration)||duration<60000)throw Error('Invalid duration');
process.env.CALCIUM_TEST_MODE='1';
app.commandLine.appendSwitch('host-resolver-rules','MAP *.calcium-bench.test 127.0.0.1');app.commandLine.appendSwitch('no-proxy-server');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
const downloads=path.join(profile,'downloads');fs.mkdirSync(downloads);app.setPath('downloads',downloads);
const entry=path.join(root,'main.js'),source=fs.readFileSync(entry,'utf8'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
m._compile(source+'\nmodule.exports.soak={ready:mainBlockReady,windows:()=>windows,createWindow,newTab,closeTab,activateTab,inWin,sleepTab,sleepIdleTabs,settlePrompt,prompts,uboBackground,getDownloads:()=>downloads};',entry);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function bounded(promise,ms,fallback){let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]);}finally{clearTimeout(timer);}}
const heapReads=new WeakMap();
async function readHeap(wc){let pending=heapReads.get(wc);if(!pending){pending=wc.executeJavaScript('performance.memory.usedJSHeapSize').catch(()=>0).finally(()=>heapReads.delete(wc));heapReads.set(wc,pending);}return bounded(pending,500,0);}
const sockets=new Set();let downloadTimer;
const server=http.createServer((req,res)=>{
 if(req.url==='/download'){
  res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="soak.bin"','Content-Length':String(64*1024*1024)});
  downloadTimer=setInterval(()=>res.write(Buffer.alloc(1024)),1000);res.on('close',()=>clearInterval(downloadTimer));return;
 }
 res.setHeader('Content-Type','text/html');
 res.end('<title>Calcium soak fixture</title><style>.row{padding:4px}</style><input id="draft"><canvas id="canvas" width="160" height="90"></canvas><video muted autoplay></video><div id="feed"></div><script>window.payload=new Uint8Array(1024*1024);for(let i=0;i<payload.length;i+=4096)payload[i]=42;feed.innerHTML=Array.from({length:250},(_,i)=>`<div class="row">Local article ${i}</div>`).join("");window.ticks=0;setInterval(()=>{ticks++;feed.firstElementChild.textContent="Updated "+ticks},3000)</script>');
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
async function loaded(tab){const end=Date.now()+15000;while(Date.now()<end){if(tab.view&&!tab.view.webContents.isLoading()&&await tab.view.webContents.executeJavaScript('document.readyState==="complete"&&!!document.querySelector("#draft")').catch(()=>false))return;await wait(50);}throw Error('Fixture load timeout');}
function percentile(values,p){const a=[...values].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]??null;}
(async()=>{
 await app.whenReady();const api=m.exports.soak;await api.ready;
 const bg=api.uboBackground();assert(bg&&await bg.executeJavaScript('µBlock.readyToFilter'),'uBlock must be enabled');
 while(!api.windows()[0]?.tabs.length)await wait(50);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const normal=api.windows()[0];normal.win.hide();
 const regular=[];for(let i=0;i<8;i++){const t=api.inWin(normal,()=>api.newTab('http://site'+i+'.calcium-bench.test:'+port+'/article'));await loaded(t);regular.push(t);}
 const second=api.createWindow();second.win.hide();
 const edited=api.inWin(second,()=>api.newTab('http://forms.calcium-bench.test:'+port+'/form'));await loaded(edited);
 await edited.view.webContents.executeJavaScript('draft.focus()');await edited.view.webContents.insertText('Keep this unsent draft');await wait(100);assert(edited.formDirty);
 const media=api.inWin(second,()=>api.newTab('http://localhost:'+port+'/media'));await loaded(media);
 // Accept only our loopback fixture's real permission prompt. The fake device
 // avoids accessing the user's physical camera/microphone during the benchmark.
 const permissionTimer=setInterval(()=>{for(const p of [...api.prompts])if(p.data?.title?.includes('localhost'))api.settlePrompt(p,'ok');},50);
 try{await Promise.race([media.view.webContents.executeJavaScript('(async()=>{window.callStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});document.querySelector("video").srcObject=callStream;window.canvasStream=canvas.captureStream(5);window.drawTimer=setInterval(()=>{const c=canvas.getContext("2d");c.fillStyle=ticks%2?"#333":"#777";c.fillRect(0,0,160,90)},200);return callStream.getTracks().every(t=>t.readyState==="live")})()'),wait(15000).then(()=>{throw Error('Media fixture timeout');})]);}catch(error){clearInterval(permissionTimer);throw error;}
 assert(media.mediaPermission,'actual Session media grant protects the call');
 const captured=regular[0],captureWc=media.view.webContents;
 normal.ses.setDisplayMediaRequestHandler((request,callback)=>{if(request.frame?.frameTreeNodeId===captureWc.mainFrame.frameTreeNodeId)callback({video:captured.view.webContents.mainFrame});else callback({});});
 captureWc.focus();
 let tabShare;
 try{
  tabShare=await Promise.race([captureWc.executeJavaScript('(async()=>{try{window.tabShare=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});if(window.soakCaptureCancelled){tabShare.getTracks().forEach(t=>t.stop());return {supported:false,reason:"cancelled"};}return {supported:tabShare.getVideoTracks().every(t=>t.readyState==="live")};}catch(e){return {supported:false,reason:String(e.name)+": "+String(e.message)};}})()',true),wait(15000).then(()=>({supported:false,reason:'capture timeout'}))]);
 }catch(error){tabShare={supported:false,reason:error?.message||String(error)};}
 finally{clearInterval(permissionTimer);normal.ses.setDisplayMediaRequestHandler(null);}
 if(tabShare.supported)assert(captured.view.webContents.isBeingCaptured(),'real test-tab sharing must be active');
 else{await captureWc.executeJavaScript('window.soakCaptureCancelled=true');console.log('SOAK: test-tab sharing unavailable:',tabShare.reason);}
 const downloadTab=api.inWin(second,()=>api.newTab('http://localhost:'+port+'/download'));
 const control=api.inWin(second,()=>api.newTab('http://control.calcium-bench.test:'+port+'/control'));await loaded(control);
 for(let i=0;i<100&&!api.getDownloads().some(d=>d.tabId===downloadTab.id&&d.state==='progressing');i++)await wait(50);
 assert(api.getDownloads().some(d=>d.tabId===downloadTab.id&&d.state==='progressing'),'real background download must be active');
 const privateWindow=api.createWindow({incognito:true});privateWindow.win.hide();
 const privateTabs=[];for(let i=0;i<3;i++){const t=api.inWin(privateWindow,()=>api.newTab('http://private'+i+'.calcium-bench.test:'+port+'/article'));await loaded(t);privateTabs.push(t);}
 const latencies=[],idleCpuValues=[];let cycles=0,sampleCount=0,warmSample=null,lastSample=null;
 async function sample(phase){
  const rows=app.getAppMetrics(),windows=api.windows(),all=windows.flatMap(w=>w.tabs);
  const record={seconds:Math.round((Date.now()-start)/1000),phase,privateMiB:rows.reduce((s,p)=>s+(p.memory?.privateBytes||0),0)/1024,workingSetMiB:rows.reduce((s,p)=>s+(p.memory?.workingSetSize||0),0)/1024,cpuPercent:rows.reduce((s,p)=>s+(p.cpu?.percentCPUUsage||0),0),mainHeapMiB:process.memoryUsage().heapUsed/1024**2,processes:rows.length,webContents:webContents.getAllWebContents().length,windows:windows.length,tabs:all.length,liveTabs:all.filter(t=>t.view).length,cycles};
  const representatives=new Map();for(const wc of webContents.getAllWebContents()){try{const pid=wc.getOSProcessId();if(pid>0&&!representatives.has(pid))representatives.set(pid,wc);}catch{}}
  const heaps=await Promise.all([...representatives.values()].map(wc=>readHeap(wc)));
  record.sampledRendererHeapMiB=heaps.reduce((a,b)=>a+(Number(b)||0),0)/1024**2;
  try{record.uboHeapMiB=await readHeap(bg)/1024**2;}catch{record.uboHeapMiB=null;}
  sampleCount++;if(!warmSample)warmSample=record;lastSample=record;if(phase==='idle')idleCpuValues.push(record.cpuPercent);fs.appendFileSync(path.join(output,'samples.jsonl'),JSON.stringify(record)+'\n');return record;
 }
 // Warm all engines and keep the retained tab set stable before sampling.
 await wait(15000);const start=Date.now();await sample('warm');let nextAction=start,nextCycle=start;
 while(Date.now()-start<duration){
  const now=Date.now(),seconds=(now-start)/1000,phase=Math.floor(seconds/60)%3===2?'idle':'active';
  if(phase==='active'&&now>=nextAction){
   const selectable=regular.filter(t=>t!==captured);const tab=selectable[Math.floor(seconds/15)%selectable.length];
   api.inWin(normal,()=>api.activateTab(regular.find(t=>t!==tab).id));
   api.inWin(normal,()=>api.sleepTab(tab.id));const began=performance.now();api.inWin(normal,()=>api.activateTab(tab.id));await loaded(tab);latencies.push(performance.now()-began);nextAction=now+15000;
  }
  if(phase==='active'&&now>=nextCycle){const t=api.inWin(normal,()=>api.newTab('http://cycle.calcium-bench.test:'+port+'/cycle'));await loaded(t);api.inWin(normal,()=>api.closeTab(t.id));cycles++;nextCycle=now+30000;}
  if(Math.floor(seconds)%60<5){
   for(const t of api.windows().flatMap(w=>w.tabs))t.lastActive=Date.now()-120000;
   api.sleepIdleTabs(false,{total:8*1024**3,free:256*1024**2});
   assert(edited.view,'edited form must survive memory pressure');assert(media.view,'media session must survive memory pressure');assert(downloadTab.view,'active download must survive memory pressure');if(tabShare.supported)assert(captured.view&&captured.view.webContents.isBeingCaptured(),'shared tab must survive memory pressure');
   assert.equal(await edited.view.webContents.executeJavaScript('draft.value'),'Keep this unsent draft');
  }
  await sample(phase);await wait(Math.min(5000,Math.max(1,duration-(Date.now()-start))));
 }
 await sample('end');
 const result={electron:process.versions.electron,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),durationSeconds:(Date.now()-start)/1000,fixture:'loopback pages; 2 normal windows + 1 private window; uBO enabled; synthetic camera/microphone and canvas stream; test-tab sharing capability recorded separately; real in-profile download; memory pressure simulated',physicalDevicesTested:false,tabShare,networkEnvironment:'loopback workloads; normal engine/list background services remain enabled',sampleCount,cycles,wakeMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95),max:Math.max(...latencies)},warm:warmSample,end:lastSample,idleCpuPercent:{median:percentile(idleCpuValues,.5),p95:percentile(idleCpuValues,.95)},limitations:['Memory growth alone does not establish a leak. Repeat the same duration/workload before and after changes.','Private/workingset totals follow Electron Windows KB accounting and include GPU/utility processes.','Camera/microphone are synthetic; tab sharing is real but captures only the local test page. Physical calls and desktop sharing require a separate device test.','Fixtures retain deliberate media timers; idle CPU is workload idle, not a blank browser.']};
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(result,null,2));console.log('SOAK COMPLETE',JSON.stringify({seconds:result.durationSeconds,wakeMs:result.wakeMs,warmPrivateMiB:result.warm.privateMiB,endPrivateMiB:result.end.privateMiB,cycles}));
 clearInterval(downloadTimer);for(const socket of sockets)socket.destroy();server.close();app.exit(0);
})().catch(e=>{console.error(e?.stack||e?.message||String(e));clearInterval(downloadTimer);for(const socket of sockets)socket.destroy();server.close();app.exit(1);});
