'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),Module=require('module');
const root=path.join(__dirname,'..'),profile=process.env.MONDIUM_PROFILE;
if(!profile||path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('mondium-startup-test-'))throw Error('Run this test through npm run test:electron with an isolated temporary profile');
process.env.CALCIUM_TEST_MODE='1';process.env.MONDIUM_PROFILE=profile;delete process.env.MONDIUM_NO_UBO;process.env.MONDIUM_TEST_DISPLAY='0';fs.writeFileSync(path.join(profile,'malware-hosts.txt'),'blocked.test');fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,restoreSession:false,keepLogins:false,language:'tr'}));
fs.writeFileSync(path.join(profile,'calcium-trackers.txt'),fs.readFileSync(path.join(root,'vendor/protection/tracking-servers.txt'),'utf8')+'\n||tracking.calcium-test.invalid^\n');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('no-proxy-server');
app.commandLine.appendSwitch('host-resolver-rules','MAP calcium-fixture.test 127.0.0.1, MAP tracking.calcium-test.invalid 127.0.0.1');
const entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
m._compile(fs.readFileSync(entry,'utf8')+`\nmodule.exports.test={sleepTab,activateTab,seedUiFixture:()=>{const file=path.join(app.getPath('userData'),'fixture.txt');fs.writeFileSync(file,'fixture');downloads.push({id:'fixture-done',name:'notlar.txt',url:'https://example.com/notlar.txt',file,t:Date.now(),state:'completed',total:2048,received:2048},{id:'fixture-progress',name:'arsiv.zip',url:'https://example.com/arsiv.zip',file,t:Date.now(),state:'progressing',total:1024*1024,received:512*1024});history.push({t:Date.now()-60000,url:'https://example.com/',title:'Örnek sayfa'},{t:Date.now()-120000,url:'https://example.org/docs',title:'Belgeler'});},finishFixture:()=>{downloads.find(d=>d.id==='fixture-progress').state='completed';notifyPages('downloads');},pushState,calciumProtection,calciumEnabledFor,toggleCalciumSite,uboBackground,layout,handleShortcut,showTaskManager,taskPanels,DOWNLOADS_URL,HISTORY_URL,showDownloadsPanel,downloadPanels,toggleAutoHide,ensureUBlock,snapshot:()=>({windows,settings,CWS,extensions,uboId}),incognito:()=>createWindow({incognito:true}),newTab:(u,b)=>newTab(u,b),go:(wc,url)=>go(wc,url),settingsSet,SETTINGS_URL,SECURITY_URL};`,entry);
(async()=>{
 await app.whenReady();let state;for(let i=0;i<150;i++){state=m.exports.test.snapshot();if(state.windows[0]?.ui&&state.windows[0]?.tabs.length)break;await new Promise(r=>setTimeout(r,100));}
 const w=state.windows[0];assert(w?.ui);w.win.hide();for(let i=0;i<50&&!state.extensions;i++){await new Promise(r=>setTimeout(r,100));state=m.exports.test.snapshot();}
 assert.equal(process.versions.electron,'45.2.1');assert(state.CWS);assert(state.extensions);assert.equal(state.settings.strictIsolation,true);assert(app.commandLine.hasSwitch('site-per-process'));assert.equal(w.ui.webContents.getLastWebPreferences().sandbox,true);
 await new Promise(r=>setTimeout(r,200));assert(await w.ui.webContents.executeJavaScript(`!!customElements.get('browser-action-list')`));
 assert.equal(state.settings.restoreSession,true);
 for(const key of ['verticalTabs','pitchBlack','newTabPrompt','askDownloadLocation','verticalAutoHide'])assert.equal(state.settings[key],true,key+' defaults on');
 for(const key of ['bookmarksEnabled','tabAudio','downloadNotify'])assert.equal(state.settings[key],false,key+' defaults off');
 for(const key of ['bookmarksEnabled','tabAudio','downloadNotify'])assert.equal(m.exports.test.settingsSet(key,true),false,'fixed setting cannot change');
 assert(await m.exports.test.ensureUBlock(w.ses),'main uBO must be ready');assert(await m.exports.test.uboBackground().executeJavaScript('µBlock.userSettings.autoUpdate'),'uBlock automatic filter updates are enabled');assert(m.exports.test.calciumProtection.stats().domains>1000);assert(m.exports.test.calciumEnabledFor('https://example.com/'));m.exports.test.toggleCalciumSite('https://example.com/');assert(!m.exports.test.calciumEnabledFor('https://example.com/'));m.exports.test.toggleCalciumSite('https://example.com/');

 // Loopback-only requests prove each protection layer independently blocks traffic.
 const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type',req.url.startsWith('/probe')?'application/javascript':'text/html');res.end(req.url.startsWith('/probe')?'window.probeLoaded=true':`<script src="http://tracking.calcium-test.invalid:${server.address().port}/probe.js"></script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const origin='http://calcium-fixture.test:'+server.address().port;
  const bg=m.exports.test.uboBackground();
  await bg.executeJavaScript(`(async()=>{await µBlock.appendUserFilters('||tracking.calcium-test.invalid^');})()`);
  for(const [stage,native,ubo,expected] of [[0,false,false,true],[1,true,false,false],[2,false,true,false]]){
   state.settings.calciumProtection=native;
   await bg.executeJavaScript('µBlock.toggleNetFilteringSwitch('+JSON.stringify(origin)+',"site",'+ubo+')');
   await new Promise(r=>setTimeout(r,250));const fixture=m.exports.test.newTab(origin+'/stage'+stage),fw=fixture.view.webContents;
   for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,50));if(fw.getURL()===origin+'/stage'+stage&&!fw.isLoading()&&await fw.executeJavaScript('document.readyState==="complete"').catch(()=>false))break;}
   await new Promise(r=>setTimeout(r,500));assert.equal(await fw.executeJavaScript('window.probeLoaded===true'),expected,'actual network stage '+stage);
   if(stage===0){
    await fw.executeJavaScript(`document.body.insertAdjacentHTML('beforeend','<input id="sleep-test">');document.querySelector('#sleep-test').focus()`);
    await fw.insertText('edited');await new Promise(r=>setTimeout(r,100));assert.equal(fixture.formDirty,true,'trusted editing protects the tab from automatic sleeping');
    assert(m.exports.test.sleepTab(fixture.id));for(let i=0;i<50&&!fw.isDestroyed();i++)await new Promise(r=>setTimeout(r,20));assert(fw.isDestroyed(),'sleep destroys actual WebContents');
    const wakeStart=Date.now();m.exports.test.activateTab(fixture.id);const restored=fixture.view.webContents;
    for(let i=0;i<100;i++){if(restored.getURL()===origin+'/stage0'&&!restored.isLoading())break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(restored.getURL(),origin+'/stage0');assert.equal(await restored.executeJavaScript('window.probeLoaded===true'),true);assert.equal(fixture.formDirty,false,'new document clears old form protection');console.log('Local tab wake latency:',Date.now()-wakeStart,'ms');
   }

  }
  await bg.executeJavaScript('µBlock.toggleNetFilteringSwitch('+JSON.stringify(origin)+',"site",true)');
 } finally {state.settings.calciumProtection=true;await new Promise(r=>server.close(r));}
 const settingsTab=m.exports.test.newTab(m.exports.test.SETTINGS_URL);
 const wc=settingsTab.view.webContents;
 for(let i=0;i<100;i++){if(!wc.isLoading()&&await wc.executeJavaScript(`document.querySelectorAll('.themes button').length===3`).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
 state.settings.firstRunDone=false;m.exports.test.layout();m.exports.test.pushState();await new Promise(r=>setTimeout(r,100));assert.equal(settingsTab.view.getBounds().x,0,'welcome reserves no sidebar space');assert.equal(await w.ui.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#side')).display`),'none');assert.equal(await w.ui.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#strip')).display`),'none');state.settings.firstRunDone=true;m.exports.test.layout();m.exports.test.pushState();
 const settingsText=await wc.executeJavaScript('document.body.innerText');assert(settingsText.includes('Calcium'));assert(!settingsText.includes('Önceki sekmeleri geri aç'));assert(!settingsText.includes('Yeni sekme başlığı'));assert(!settingsText.includes('Güncellemeler'));
 assert.equal(await wc.executeJavaScript(`getComputedStyle(document.querySelector('button.sw')).cursor`),'pointer');
 wc.setBackgroundThrottling(false);w.win.showInactive();await wc.executeJavaScript(`document.querySelector('#nav a[href="#indirmeler"]').click()`);await new Promise(r=>setTimeout(r,30));assert.equal(await wc.executeJavaScript(`document.querySelectorAll('#nav .on').length`),0,'no persistent selected item');assert(await wc.executeJavaScript(`document.getElementById('indirmeler').nextElementSibling.getAnimations().some(a=>a.effect.getTiming().duration===1000)`));await new Promise(r=>setTimeout(r,1300));assert.equal(await wc.executeJavaScript(`document.getElementById('indirmeler').nextElementSibling.getAnimations().filter(a=>a.playState==='running').length`),0,'section flash disappears');w.win.hide();
 for(const label of ['Yer işaretlerini etkinleştir','Sekmelerde ses düğmesi','İndirme bildirimi'])assert(!settingsText.includes(label));
 await wc.executeJavaScript(`[...document.querySelectorAll('.row')].find(r=>r.textContent.includes('Resim büyütme')).click()`);await new Promise(r=>setTimeout(r,50));assert.equal(state.settings.hoverZoom,true,'row background must not toggle');
 await wc.executeJavaScript(`[...document.querySelectorAll('.row')].find(r=>r.textContent.includes('Resim büyütme')).querySelector('button').click()`);await new Promise(r=>setTimeout(r,100));assert.equal(state.settings.hoverZoom,false,'only switch toggles');m.exports.test.settingsSet('hoverZoom',true);
 w.win.showInactive();m.exports.test.handleShortcut({key:'F11',type:'keyDown'});await new Promise(r=>setTimeout(r,350));assert(w.win.isFullScreen());m.exports.test.layout();assert.equal(settingsTab.view.getBounds().y,0);assert.equal(settingsTab.view.getBounds().height,w.win.getContentBounds().height);assert.equal(w.ui.getBounds().height,0);
 m.exports.test.handleShortcut({key:'F11',type:'keyDown'});await new Promise(r=>setTimeout(r,350));m.exports.test.layout();assert(w.ui.getBounds().height>0);w.win.hide();
 assert(app.commandLine.hasSwitch('disable-translate'));assert(app.commandLine.getSwitchValue('disable-features').includes('TranslateUI'));
 m.exports.test.settingsSet('verticalTabs',true);m.exports.test.toggleAutoHide();await new Promise(r=>setTimeout(r,150));
 assert.equal(await wc.executeJavaScript(`[...document.querySelectorAll('.row')].find(r=>r.textContent.includes('Kenar çubuğunu gizle')).querySelector('[role=switch]').getAttribute('aria-checked')`),String(state.settings.verticalAutoHide),'Ctrl+S synchronizes settings');
 m.exports.test.toggleAutoHide();await new Promise(r=>setTimeout(r,100));
 await wc.executeJavaScript(`document.querySelector('.ps-add input').value='youtube.com';document.querySelector('.ps-add').requestSubmit()`);await new Promise(r=>setTimeout(r,200));
 assert(await wc.executeJavaScript(`document.querySelector('.deps').innerText.includes('google.com')`),'YouTube protection suggests Google inline');
 await wc.executeJavaScript(`document.querySelector('.deps button').click()`);await new Promise(r=>setTimeout(r,200));assert(state.settings.protectedSites.includes('google.com'));
 assert.equal(await wc.executeJavaScript(`[...document.querySelectorAll('h2')].filter(x=>x.textContent==='Siteler ve çerezler').length`),1);
 assert(!await wc.executeJavaScript(`document.body.innerText.includes('Yeni sürümleri kurulum')`));
 m.exports.test.seedUiFixture();
 const beforeTabs=w.tabs.length,panel=m.exports.test.showDownloadsPanel();assert(panel);assert.equal(w.tabs.length,beforeTabs,'downloads does not create a tab');
 for(let i=0;i<50;i++){if(!panel.webContents.isLoading()&&await panel.webContents.executeJavaScript(`document.body.classList.contains('popup')&&!!window.pageApi`).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
 assert(await panel.webContents.executeJavaScript(`document.body.innerText.includes('notlar.txt')&&!!document.querySelector('.bar')`));m.exports.test.finishFixture();await new Promise(r=>setTimeout(r,450));assert(!await panel.webContents.executeJavaScript(`!!document.querySelector('.bar')`),'popup receives live completion updates');
 assert.equal(panel.getParentWindow(),w.win);assert.equal(panel.webContents.getLastWebPreferences().sandbox,true);
 assert.equal(await panel.webContents.executeJavaScript(`getComputedStyle(document.querySelector('nav')).display`),'none');
 const ownerBounds=w.win.getBounds(),panelBounds=panel.getBounds();assert(Math.abs(panelBounds.x+panelBounds.width/2-ownerBounds.x-ownerBounds.width/2)<3);
 await panel.webContents.executeJavaScript(`document.querySelector('#closePanel').click()`);await new Promise(r=>setTimeout(r,100));assert(!m.exports.test.downloadPanels.has(w));
 w.win.showInactive();
 const taskCount=w.tabs.length,taskPanel=m.exports.test.showTaskManager();assert.equal(w.tabs.length,taskCount);for(let i=0;i<50;i++){if(!taskPanel.webContents.isLoading()&&await taskPanel.webContents.executeJavaScript(`document.body.classList.contains('popup')`).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}assert.equal(taskPanel.getParentWindow(),w.win);await taskPanel.webContents.executeJavaScript(`document.querySelector('#closePanel').click()`);await new Promise(r=>setTimeout(r,100));assert(!m.exports.test.taskPanels.has(w));assert(w.win.isEnabled());assert(w.win.isFocused(),'closing task manager restores browser focus');w.win.hide();
 await wc.executeJavaScript(`document.documentElement.style.colorScheme='dark'`);
 const preview=new (require('electron').BrowserWindow)({show:false,width:1200,height:900,useContentSize:true,webPreferences:{session:w.ses,preload:path.join(root,'page-preload.js'),sandbox:true,contextIsolation:true,offscreen:true}});
 await preview.loadFile(path.join(root,'welcome.html'));await new Promise(r=>setTimeout(r,200));assert(await preview.webContents.executeJavaScript(`!document.querySelector('#lang')&&!!document.querySelector('.logo svg')&&!document.querySelector('.logo span')&&getComputedStyle(document.querySelector('.logo')).backgroundImage==='none'`),'welcome uses the bone logo');const welcomeGeometry=await preview.webContents.executeJavaScript("(()=>{const cards=[...document.querySelectorAll('#grid .card')],first=cards[0].getBoundingClientRect(),last=cards.at(-1).getBoundingClientRect(),go=document.querySelector('#go').getBoundingClientRect(),logo=document.querySelector('.logo').getBoundingClientRect();return {count:cards.length,center:(first.left+last.right)/2,go:(go.left+go.right)/2,logo:(logo.left+logo.right)/2,light:getComputedStyle(document.querySelector('.light-bone')).color,dark:getComputedStyle(document.querySelector('.dark-bone')).color,clips:document.querySelectorAll('.system-bone clipPath').length,roles:cards.every(c=>c.getAttribute('role')==='radio')}})()");assert.equal(welcomeGeometry.count,3);assert(welcomeGeometry.roles);assert(Math.abs(welcomeGeometry.center-welcomeGeometry.go)<1,'theme cards align with Start');assert(Math.abs(welcomeGeometry.center-welcomeGeometry.logo)<1,'theme cards align with logo');assert.equal(welcomeGeometry.light,'rgb(16, 16, 16)');assert.equal(welcomeGeometry.dark,'rgb(245, 245, 245)');assert.equal(welcomeGeometry.clips,2,'system bone is split diagonally');await preview.webContents.capturePage().then(image=>fs.writeFileSync(path.join(os.tmpdir(),'calcium-welcome.png'),image.toPNG()));
 await preview.loadURL(m.exports.test.SETTINGS_URL);await new Promise(r=>setTimeout(r,400));
 await preview.webContents.capturePage().then(image=>fs.writeFileSync(path.join(require('os').tmpdir(),'calcium-settings.png'),image.toPNG()));
 await preview.loadURL(m.exports.test.SETTINGS_URL+'#siteler');await new Promise(r=>setTimeout(r,500));await preview.webContents.executeJavaScript("psMsg('youtube.com korunuyor.',false,[{display:'google.com',site:'google.com'}])");await preview.webContents.capturePage().then(image=>fs.writeFileSync(path.join(os.tmpdir(),'calcium-sites.png'),image.toPNG()));
 await preview.loadURL(m.exports.test.DOWNLOADS_URL+'?popup=1');preview.setSize(740,580);await new Promise(r=>setTimeout(r,300));await preview.webContents.capturePage().then(image=>fs.writeFileSync(path.join(os.tmpdir(),'calcium-downloads.png'),image.toPNG()));
 await preview.webContents.executeJavaScript(`document.querySelector('#clearAll').click()`);await new Promise(r=>setTimeout(r,150));assert.equal(await preview.webContents.executeJavaScript(`document.querySelectorAll('.dl').length`),0,'clear all removes completed entries immediately without a dialog');assert(fs.existsSync(path.join(profile,'fixture.txt')),'clearing the list preserves downloaded files');
 await preview.loadURL(m.exports.test.HISTORY_URL);preview.setSize(1200,900);await new Promise(r=>setTimeout(r,300));await preview.webContents.capturePage().then(image=>fs.writeFileSync(path.join(os.tmpdir(),'calcium-history.png'),image.toPNG()));
 preview.setSize(740,440);await preview.loadURL(m.exports.test.SETTINGS_URL+'#temizle');await new Promise(r=>setTimeout(r,350));
 assert.equal(await preview.webContents.executeJavaScript('document.activeElement.tagName'), 'DIV','clear dialog does not focus the range select');
 const clearGeometry=await preview.webContents.executeJavaScript(`({native:getComputedStyle(document.querySelector('.modal .dlg')).scrollbarWidth,panel:document.querySelector('[data-calcium-scrollbar=panel]')?.getBoundingClientRect().height,overflow:document.querySelector('.modal .dlg').scrollHeight>document.querySelector('.modal .dlg').clientHeight})`);
 assert.equal(clearGeometry.native,'none');assert(clearGeometry.panel>0);assert(clearGeometry.overflow,'short windows exercise the dialog scrollbar');
 await preview.webContents.capturePage().then(image=>fs.writeFileSync(path.join(os.tmpdir(),'calcium-clear.png'),image.toPNG()));
 await preview.webContents.executeJavaScript(`cl.cookies.checked=false;cl.cache.checked=false;cl.hist.checked=true;cl.dl.checked=false;clNotes();cl.el.querySelector('.dlg').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await new Promise(r=>setTimeout(r,300));
 assert.equal(await preview.webContents.executeJavaScript(`document.querySelectorAll('.res').length`),0,'clearing has no detailed result section');assert(await preview.webContents.executeJavaScript(`cl.go.hidden&&cl.bar.hidden`));
 await preview.webContents.executeJavaScript('clClose()');await new Promise(r=>setTimeout(r,50));assert.equal(await preview.webContents.executeJavaScript(`getComputedStyle(document.querySelector('[data-calcium-scrollbar=panel]')).display`),'none','dialog scrollbar hides with dialog');preview.destroy();
 m.exports.test.settingsSet('language','en');await wc.reload();await new Promise(r=>setTimeout(r,700));
 const english=await wc.executeJavaScript('document.body.innerText');fs.writeFileSync(path.join(require('os').tmpdir(),'calcium-settings-en.txt'),english);assert(english.includes('Appearance'));assert(english.includes('Privacy'));
 const privateWindow=m.exports.test.incognito();privateWindow.win.hide();assert.equal(privateWindow.ui.webContents.session,privateWindow.ses);assert.notEqual(privateWindow.ses,w.ses);assert.equal(privateWindow.ses.isPersistent(),false);
 assert(await m.exports.test.ensureUBlock(privateWindow.ses),'private uBO must be ready');
 const bg=require('electron').webContents.getAllWebContents().find(x=>x.getURL().includes('/background.html'));
 const decision=await bg.executeJavaScript(`self.calciumPrivateFilter([{url:'https://googleads.g.doubleclick.net/pagead/ads',type:'script',document:'https://example.com/',top:'https://example.com/'},{url:'https://example.com/main.js',type:'script',document:'https://example.com/',top:'https://example.com/'}])`);
 assert.deepEqual(decision,[true,false],'private filtering uses actual uBO lists');
 const page=m.exports.test.newTab('about:blank');await m.exports.test.go(page.view.webContents,'https://blocked.test/');for(let i=0;i<50&&page.view.webContents.getURL()!==m.exports.test.SECURITY_URL;i++)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,3200));assert.equal(page.view.webContents.getURL(),m.exports.test.SECURITY_URL,'known malicious domain is blocked before navigating');
 console.log('PASS: full Calcium startup on Electron 45.2.1, site isolation, sandboxed UI icons, secure Web Store adapter, incognito session and local threat interstitial.');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
