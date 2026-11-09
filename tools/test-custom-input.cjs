'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert'),http=require('http');
const root=path.join(__dirname,'..'),profile=process.env.CALCIUM_PROFILE;
if(!profile||!path.basename(profile).startsWith('calcium-startup-test-'))throw Error('Use test:electron');
process.env.CALCIUM_TEST_MODE='1';app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'en',textReplacements:[{trigger:'adres',value:'Example address'}]}));
const entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,newTab,inWin,closeTab,reopenClosed,recordSearch,omniSuggest,showSiteMenu,closeOverlay,updateSiteControl,settings,settingsSet,handleShortcut,pushState,loadExt,WELCOME_URL,incognito:()=>createWindow({incognito:true}),navigateInput};',entry);
const pause=(ms=100)=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await pause();}throw Error('Timed out');};
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<input id="plain"><form><input id="login"><input type="password" id="secret"></form><textarea id="area"></textarea><div id="nested" style="height:80px;overflow:auto"><div style="height:800px">nested</div></div><iframe srcdoc="<style>body{height:1000px}</style>Frame"></iframe>');});
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;await until(()=>api.windows()[0]?.tabs.length);const w=api.windows()[0];w.win.hide();
 await pause(700);assert(await w.ui.webContents.executeJavaScript(`document.querySelector('#newtabPrompt').hidden&&!['url','newtabQuery'].includes(document.activeElement.id)`),'startup does not focus or open address editing');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const t=api.inWin(w,()=>api.newTab(origin)),wc=t.view.webContents;await until(()=>wc.executeJavaScript('!!document.querySelector("#plain")').catch(()=>false));await pause(300);
 api.inWin(w,()=>api.closeOverlay(false));w.win.show();wc.focus();wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});const ui=w.ui.webContents;api.inWin(w,()=>{api.recordSearch('nature videos');api.recordSearch('other search');});
 assert.equal(await wc.mainFrame.frames[0].executeJavaScript('document.querySelectorAll("[data-calcium-scrollbar]").length'),1,'subframe uses matching overlay');
 assert.equal(api.inWin(w,()=>api.omniSuggest('nature')).items[0].value,'nature videos');assert(api.inWin(w,()=>api.omniSuggest('127.0.0.1')).items.some(item=>item.url===origin+'/'),'visited URLs appear in local history suggestions');
 // Real Chromium input events, never synthetic DOM events, exercise trusted expansion.
 async function type(id){await wc.executeJavaScript(`document.querySelector('#${id}').focus()`);for(const ch of '#adres'){await wc.debugger.sendCommand('Input.insertText',{text:ch});}await wc.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await wc.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await pause();return wc.executeJavaScript(`document.querySelector('#${id}').value`);}
 assert.equal(await type('plain'),'Example address ');assert.equal(await type('login'),'#adres ');assert.equal(await type('secret'),'#adres ');
 await wc.executeJavaScript(`document.querySelector('#plain').value='#adres';document.querySelector('#plain').focus();document.querySelector('#plain').dispatchEvent(new InputEvent('input',{bubbles:true,data:'#adres',inputType:'insertText'}))`);wc.sendInputEvent({type:'keyDown',keyCode:'Space'});await pause();assert.equal(await wc.executeJavaScript('document.querySelector("#plain").value'),'#adres','page scripts cannot trigger expansion');
 wc.sendInputEvent({type:'mouseWheel',x:150,y:100,deltaY:120,modifiers:['control'],canScroll:true});await until(()=>wc.getZoomFactor()!==1);await pause();assert.equal(Math.round(wc.getZoomFactor()*100),110);assert.equal(Math.round(ui.getZoomFactor()*100),100);await ui.executeJavaScript('document.querySelector("#zoomPct").click()');await until(()=>wc.getZoomFactor()===1);
 api.inWin(w,()=>api.showSiteMenu());await pause();assert.equal(await ui.executeJavaScript('document.querySelectorAll(".site-switch").length'),2);assert(!(await ui.executeJavaScript('document.querySelector("#pop").textContent')).includes('çerez'));
 await ui.executeJavaScript('document.querySelector("[data-site-key=sleep]").click()');await pause();assert.equal(await ui.executeJavaScript('document.querySelectorAll(".awake-badge").length'),1);api.inWin(w,()=>api.closeOverlay(false));
 const p=api.incognito();p.win.hide();api.inWin(p,()=>api.newTab(''));const privateURL=origin+'/private-only';const pt=api.inWin(p,()=>api.newTab(privateURL));await pause();api.inWin(p,()=>api.closeTab(pt.id));assert(p.closedTabs.some(t=>t.url===privateURL));api.inWin(p,()=>api.reopenClosed());assert(p.tabs.some(t=>t.url===privateURL));
 api.inWin(p,()=>api.recordSearch('private query'));assert.equal(api.inWin(w,()=>api.omniSuggest('private')).items.length,0);p.win.close();await pause();assert.equal(p.closedTabs.length,0);assert.equal(p.searchHistory.length,0);for(const file of ['aramalar.json','gecmis.json','oturum.json'])if(fs.existsSync(path.join(profile,file)))assert(!fs.readFileSync(path.join(profile,file),'utf8').includes('private-only'));
 const preferences=api.inWin(w,()=>api.newTab('calcium://settings')),swc=preferences.view.webContents;await until(()=>swc.executeJavaScript('document.querySelectorAll(".custom-rule-group").length===2').catch(()=>false));
 assert(await swc.executeJavaScript(`!document.querySelector('#kisayollar')&&!document.querySelector('a[href="#kisayollar"]')`));
 await swc.executeJavaScript(`pageApi.call('settings-set',{key:'theme',value:'koyu'})`);
 await swc.executeJavaScript(`pageApi.call('settings-set',{key:'verticalTabs',value:false})`);
 for(const enabled of [false,true,false,true]){
  await swc.executeJavaScript(`pageApi.call('settings-set',{key:'pitchBlack',value:${enabled}})`);
  const toolbar=enabled?'rgb(0, 0, 0)':'rgb(60, 60, 60)',page=enabled?'rgb(0, 0, 0)':'rgb(31, 31, 31)';
  await until(()=>ui.executeJavaScript(`getComputedStyle(document.querySelector('#toolbar')).backgroundColor===${JSON.stringify(toolbar)}`));
  await until(()=>swc.executeJavaScript(`getComputedStyle(document.body).backgroundColor===${JSON.stringify(page)}`));
  assert(await ui.executeJavaScript(`getComputedStyle(document.querySelector('#tabs .tab.on')).backgroundColor===getComputedStyle(document.querySelector('#toolbar')).backgroundColor`),'horizontal active tab joins the toolbar in either dark mode');
 }
 // Model macOS placement on the real rendered UI; native traffic lights require a Mac.
 assert(await ui.executeJavaScript(`(()=>{document.body.classList.add('mac','vert');document.body.classList.remove('overlay');const left=document.querySelector('#toolbar').firstElementChild.getBoundingClientRect().left;document.body.classList.remove('mac','vert');document.body.classList.add('overlay');return left>=86;})()`),'vertical macOS toolbar reserves traffic-light space');
 assert.equal(api.settings.siteCommands.length,0);await swc.executeJavaScript(`[...document.querySelectorAll('.custom-rule-group:first-child button')].find(b=>b.textContent==='YouTube example').click()`);assert.equal(api.settings.siteCommands.length,0,'example only fills the form');
 await swc.executeJavaScript(`(()=>{const form=document.querySelector('form[data-kind=site]');form.elements.url.value=${JSON.stringify(origin)};form.elements.searchUrl.value=${JSON.stringify(origin+'/search?q={query}')};form.requestSubmit();})()`);await until(()=>api.settings.siteCommands.length===1);assert.equal(api.settings.siteCommands[0].trigger,'y');
 api.inWin(w,()=>api.navigateInput('!y nature & water'));await until(()=>swc.getURL().includes('/search?q=nature%20%26%20water'));
 const welcome=api.inWin(w,()=>api.newTab(api.WELCOME_URL)),wwc=welcome.view.webContents;await until(()=>wwc.executeJavaScript('!!window.pageApi').catch(()=>false));await wwc.executeJavaScript(`pageApi.call('welcome-done')`);await pause(700);assert(await ui.executeJavaScript(`document.querySelector('#newtabPrompt').hidden&&!['url','newtabQuery'].includes(document.activeElement.id)`),'completing setup does not steal address focus');
 api.inWin(w,()=>{api.settingsSet('newTabPrompt',false);api.handleShortcut({key:'t',control:true,type:'keyDown'});});await until(()=>ui.executeJavaScript("document.activeElement.id==='url'"));api.inWin(w,()=>api.settingsSet('newTabPrompt',true));
 if(process.env.BITWARDEN_TEST_PATH){
  const ext=await api.loadExt(process.env.BITWARDEN_TEST_PATH);assert.equal(ext.version,'2026.10.2');
  const popup=api.inWin(w,()=>api.newTab('chrome-extension://'+ext.id+'/popup/index.html'));await until(()=>popup.view.webContents.executeJavaScript('document.body.innerText.length>80').catch(()=>false));await pause(2000);
  const text=await popup.view.webContents.executeJavaScript('document.body.innerText');console.log('Bitwarden popup:',JSON.stringify(text.slice(0,600)));assert(/log in|login|email|account|vault/i.test(text),'real Bitwarden login UI renders');
  const login=api.inWin(w,()=>api.newTab(origin+'/bitwarden'));await until(()=>login.view.webContents.executeJavaScript('!!document.querySelector("#login")').catch(()=>false));await pause(1500);assert.equal(await login.view.webContents.executeJavaScript('document.querySelector("#secret").type'),'password');console.log('PASS: official Bitwarden 2026.10.2 MV3 loads and renders sign-in UI alongside a login form; no real vault/account used.');
 }
 console.log('PASS: live theme toggles, horizontal continuity, macOS toolbar spacing, no startup/setup focus, explicit Ctrl+T, removed shortcut section, local browsing/search history suggestions, trusted text expansion, password/login exclusions, Ctrl+wheel and reset, English site popup, coffee badge and window-local private restore.');server.close();app.exit(0);
})().catch(e=>{console.error(e);server.close();app.exit(1)});
