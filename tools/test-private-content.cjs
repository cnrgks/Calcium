'use strict';
const {app,webContents}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const root=path.join(__dirname,'..'),profile=process.env.CALCIUM_PROFILE;
if(!profile||path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('calcium-startup-test-'))throw Error('Use npm run test:electron');
process.env.CALCIUM_TEST_MODE='1';fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'en'}));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('no-proxy-server');app.commandLine.appendSwitch('host-resolver-rules','MAP calcium-private.test 127.0.0.1, MAP *.calcium-private.test 127.0.0.1, MAP calcium-private-other.test 127.0.0.1');
const entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,incognito:()=>createWindow({incognito:true}),ensureUBlock,newTab,go};',entry);
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;while(!api.windows()[0]?.tabs.length)await new Promise(r=>setTimeout(r,50));api.windows()[0].win.hide();
 const privateWindow=api.incognito();privateWindow.win.hide();assert(await api.ensureUBlock(privateWindow.ses));
 const bg=webContents.getAllWebContents().find(x=>x.getURL().includes('/background.html'));
 // Private document filtering uses real uBO rules without registering private hosts.
 await bg.executeJavaScript(String.raw`µBlock.appendUserFilters('calcium-private.test,calcium-private-other.test##.private-ad\ncalcium-private.test,calcium-private-other.test##.private-keep\ncalcium-private.test,calcium-private-other.test#@#.private-keep\ncalcium-private.test,calcium-private-other.test##+js(set-constant, calciumPrivateFlag, true)\n##.calcium-private-generic')`);
 const privateServer=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'nonce-fixture'; style-src 'none'; frame-src http:");res.end('<script nonce="fixture">window.initialPrivateFlag=window.calciumPrivateFlag</script><div class="private-ad">ad</div><div class="private-keep">keep</div><div class="calcium-private-generic">generic</div><script nonce="fixture">setTimeout(()=>{let d=document.createElement("div");d.className="calcium-private-generic";d.id="late-generic";document.body.append(d)},150)</script>'+(req.url.startsWith('/frame')?'':'<iframe src="http://sub.calcium-private.test:'+privateServer.address().port+'/frame"></iframe>'));});
 await new Promise(r=>privateServer.listen(0,'127.0.0.1',r));
 const privateUrl='http://calcium-private.test:'+privateServer.address().port+'/secret';
 const privateTab=api.newTab(privateUrl),privateWc=privateTab.view.webContents;
 try{
  for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,50));if(!privateWc.isLoading()&&await privateWc.executeJavaScript('!!document.querySelector("#late-generic")').catch(()=>false))break;}
  await new Promise(r=>setTimeout(r,300));
  const filtered=await privateWc.executeJavaScript(`({ad:getComputedStyle(document.querySelector('.private-ad')).display,keep:getComputedStyle(document.querySelector('.private-keep')).display,generic:getComputedStyle(document.querySelector('#late-generic')).display,flag:window.initialPrivateFlag,bridge:typeof window.ipcRenderer})`);
  assert.equal(filtered.ad,'none');assert.notEqual(filtered.keep,'none');assert.equal(filtered.generic,'none');assert.equal(filtered.flag,true,'scriptlets run before the first page script');assert.equal(filtered.bridge,'undefined');
  for(let i=0;i<50;i++){if(await privateWc.executeJavaScript('!!document.querySelector("iframe")?.contentWindow').catch(()=>false))break;await new Promise(r=>setTimeout(r,50));}
  const frames=privateWc.mainFrame.frames;assert(frames.length>0);assert.equal(await frames[0].executeJavaScript('typeof process'), 'undefined','subframe keeps Node disabled');
  const switched=privateUrl.replace('calcium-private.test','calcium-private-other.test');await api.go(privateWc,switched);await new Promise(r=>setTimeout(r,600));
  assert.equal(await privateWc.executeJavaScript('window.initialPrivateFlag'),true,'cross-site navigation receives the new frame pack');
  const caches=await bg.executeJavaScript(`(async()=>{const [{default:c},{default:s}]=await Promise.all([import('./js/cosmetic-filtering.js'),import('./js/scriptlet-filtering.js')]);return {selector:c.selectorCache.has('calcium-private.test'),scriptlet:s.scriptletCache.lookup('calcium-private.test')!==undefined,stores:[...µBlock.pageStores.values()].some(p=>String(p.rawURL||'').includes('calcium-private.test'))}})()`);
  assert.deepEqual(caches,{selector:false,scriptlet:false,stores:false});
  await bg.executeJavaScript(String.raw`µBlock.appendUserFilters('@@||calcium-private.test^$generichide')`);
  await api.go(privateWc,privateUrl+'?generic-off=1');await new Promise(r=>setTimeout(r,500));
  assert.equal(await privateWc.executeJavaScript('getComputedStyle(document.querySelector(".private-ad")).display'),'none','generic exception keeps specific rules');
  assert.notEqual(await privateWc.executeJavaScript('getComputedStyle(document.querySelector(".calcium-private-generic")).display'),'none','generichide exception is honored');
  await bg.executeJavaScript('µBlock.toggleNetFilteringSwitch('+JSON.stringify(privateUrl)+',"site",false)');await api.go(privateWc,privateUrl+'?off=1');await new Promise(r=>setTimeout(r,500));
  assert.notEqual(await privateWc.executeJavaScript('getComputedStyle(document.querySelector(".private-ad")).display'),'none','site exception disables private cosmetic filters');
  console.log('PASS: private CSS, generic/dynamic selectors, cosmetic exceptions and document-start scriptlets; no private hosts in normal uBO caches/page stores.');
 }finally{await new Promise(r=>privateServer.close(r));}

 app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
