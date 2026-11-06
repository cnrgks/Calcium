'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module'),http=require('http');
const root=path.join(__dirname,'..');
process.env.CALCIUM_TEST_MODE='1';
app.commandLine.appendSwitch('host-resolver-rules','MAP *.test 127.0.0.1');app.commandLine.appendSwitch('no-proxy-server');
const entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
const source=fs.readFileSync(process.env.CALCIUM_BENCH_SOURCE||entry,'utf8');
m._compile(source+`\nmodule.exports.bench={snapshot:()=>windows,newTab,activateTab,closeTab,sleepIdleTabs,getTabs:()=>tabs};`,entry);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await app.whenReady();
 const api=m.exports.bench;let w;for(let i=0;i<300;i++){w=api.snapshot()[0];if(w?.tabs.length)break;await delay(100);}if(!w)throw Error('Startup timed out');w.win.hide();await delay(10000);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<title>RAM fixture</title><script>window.payload=new Uint8Array(8*1024*1024);for(let i=0;i<payload.length;i+=4096)payload[i]=42;</script><h1>Calcium local RAM fixture</h1>`)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const n=Number(process.env.CALCIUM_BENCH_TABS||10),url='http://calcium-memory-0.test:'+server.address().port;
 const initial=api.getTabs()[0];
 for(let i=0;i<n;i++){
  const t=api.newTab(url.replace('memory-0','memory-'+i)+'/?tab='+i,false);
  await new Promise((resolve,reject)=>{const wc=t.view.webContents;if(!wc.isLoading())return resolve();wc.once('did-finish-load',resolve);wc.once('did-fail-load',(_e,c,d)=>reject(Error(c+': '+d)));});
 }
 api.closeTab(initial.id);await delay(2000);
 const sample=label=>({label,at:new Date().toISOString(),liveTabs:api.getTabs().filter(t=>t.view).length,webContents:require('electron').webContents.getAllWebContents().length,processes:app.getAppMetrics().length,privateKB:app.getAppMetrics().reduce((s,p)=>s+(p.memory?.privateBytes||0),0),workingSetKB:app.getAppMetrics().reduce((s,p)=>s+(p.memory?.workingSetSize||0),0)});
 const results=[sample('loaded')];
 // Both versions receive the same simulated low-memory signal and idle age.
 for(const t of api.getTabs())t.lastActive=Date.now()-2*60*1000;
 for(let i=0;i<10;i++){api.sleepIdleTabs(false,{total:8*1024**3,free:512*1024**2});await delay(100);}await delay(2000);results.push(sample('pressure'));
 api.sleepIdleTabs(true);await delay(1500);results.push(sample('manual-sleep'));
 for(let i=0;i<20;i++){const t=api.newTab(url+'/?cycle='+i,false);await delay(50);api.closeTab(t.id);}
 await delay(1500);results.push(sample('after-20-cycles'));
 fs.writeFileSync(process.env.CALCIUM_BENCH_OUTPUT,JSON.stringify({tabs:n,electron:process.versions.electron,fixtureBytesPerTab:8*1024**2,sourceSHA256:require('crypto').createHash('sha256').update(source).digest('hex'),simulatedPressure:true,uboDisabled:!!process.env.MONDIUM_NO_UBO,results},null,2));
 console.log('BENCH',n,JSON.stringify(results));server.close();app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
