'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert');
const profile=process.env.CALCIUM_PROFILE;if(!profile)throw Error('Use run-electron-tests');
process.env.CALCIUM_TEST_MODE='1';process.env.CALCIUM_TEST_DISPLAY='0';app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'tr',verticalTabs:true,verticalAutoHide:false}));
const entry=path.resolve(__dirname,'..','main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(path.dirname(entry));
m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,newTab,SETTINGS_URL,settingsSet,openFind,closeFind,layout,showDownloadsPanel,showTaskManager,history,omniSuggest,openSearchPrompt,closeOverlay,handleShortcut,pushState,showTabMenu,runContextAction,selectTab,sleepTabSelection,sendTabsToVault,tabArchive,activeTab};',entry);
const capture=async(wc,name)=>{try{fs.writeFileSync(path.resolve('dist/ui-review/'+name),(await wc.capturePage()).toPNG());}catch{}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));const until=async fn=>{for(let i=0;i<100;i++){const x=await fn();if(x)return x;await pause(50);}throw Error('UI regression timeout');};
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;const w=await until(()=>api.windows()[0]?.tabs.length&&api.windows()[0]);
 const tab=api.newTab(api.SETTINGS_URL),wc=tab.view.webContents;await until(()=>!wc.isLoading()&&wc.executeJavaScript('!!document.querySelector("#gorunum")').catch(()=>false));
 w.win.show();w.win.focus();wc.focus();wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});await pause(300);
 await wc.executeJavaScript("scrollTo({top:0,behavior:'instant'})");
 wc.sendInputEvent({type:'mouseMove',x:550,y:200});await pause(120);await wc.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',x:550,y:200,deltaX:0,deltaY:500});
 await pause(350);assert(await wc.executeJavaScript('scrollY')>0,'native wheel scrolls Settings');
 assert(!await wc.executeJavaScript("document.body.innerText.includes('Yumuşak kaydırma')"),'animation option removed');
 api.history.unshift({url:'https://www.youtube.com/',title:'YouTube',t:Date.now()});const suggestions=api.omniSuggest('you');assert(suggestions.items.some(x=>x.url==='https://www.youtube.com/'));assert.equal(suggestions.inline,'youtube.com/');
 api.openSearchPrompt('address','');await pause(100);await w.ui.webContents.executeJavaScript("document.querySelector('#newtabQuery').value='you';document.querySelector('#newtabQuery').dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'u'}))");await until(()=>w.ui.webContents.executeJavaScript("document.querySelector('#newtabQuery').value==='youtube.com/'"));assert.equal(await w.ui.webContents.executeJavaScript("document.querySelector('#newtabQuery').selectionStart"),3);api.closeOverlay(false);
 api.openSearchPrompt('address','');await pause(100);
 const ui=w.ui.webContents;
 await ui.insertText('you');await until(()=>ui.executeJavaScript("document.querySelector('#newtabQuery').value==='youtube.com/'"));
 await ui.insertText(' ');await pause(200);assert.equal(await ui.executeJavaScript("document.querySelector('#newtabQuery').value"),'you ','space replaces the suggested suffix');
 for(let i=0;i<2;i++){
  ui.sendInputEvent({type:'keyDown',keyCode:'Backspace'});ui.sendInputEvent({type:'keyUp',keyCode:'Backspace'});await pause(200);
  assert.equal(await ui.executeJavaScript("document.querySelector('#newtabQuery').value"),'you');
  await ui.insertText(' ');await pause(200);assert.equal(await ui.executeJavaScript("document.querySelector('#newtabQuery').value"),'you ','space after backspace must not restore completion');
 }
 await ui.insertText('how to');await pause(200);assert.equal(await ui.executeJavaScript("document.querySelector('#newtabQuery').value"),'you how to');api.closeOverlay(false);
 const before=tab.view.getBounds(),sideBefore=await w.ui.webContents.executeJavaScript('document.querySelector("#side").getBoundingClientRect().top');api.openFind();await until(()=>w.findView&&!w.findView.webContents.isLoading());await pause(150);
 assert.deepEqual(tab.view.getBounds(),before,'find popup does not move page');assert.equal(await w.ui.webContents.executeJavaScript('document.querySelector("#side").getBoundingClientRect().top'),sideBefore,'find popup does not move vertical tabs');
 assert.equal(await w.findView.webContents.executeJavaScript('!!window.pageApi'),true);assert.equal(await w.ui.webContents.executeJavaScript('getComputedStyle(document.querySelector("#find")).display'),'none');
 await w.findView.webContents.executeJavaScript("document.querySelector('#query').value='Görünüm';document.querySelector('#query').dispatchEvent(new Event('input'))");await until(()=>w.findView.webContents.executeJavaScript("document.querySelector('#count').textContent.includes('/')"));fs.mkdirSync(path.resolve('dist/ui-review'),{recursive:true});await capture(w.findView.webContents,'find-popup.png');api.closeFind();assert(!w.findView);
 api.settingsSet('verticalAutoHide',true);await pause(300);assert.equal(tab.view.getBounds().x,8,'auto-hide reserves an eight-pixel browser rail');assert.equal(await w.ui.webContents.executeJavaScript("document.querySelector('#sideRail').getBoundingClientRect().width"),8);
 wc.sendInputEvent({type:'mouseMove',x:4,y:100});await pause(100);assert(!await w.ui.webContents.executeJavaScript("document.body.classList.contains('reveal')"),'page left controls do not reveal sidebar');
 assert.equal(await w.ui.webContents.executeJavaScript("document.elementFromPoint(4,180)?.id"),'sideRail');w.ui.webContents.debugger.attach('1.3');await w.ui.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:40,y:180});await w.ui.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:4,y:180});await until(()=>w.ui.webContents.executeJavaScript("document.body.classList.contains('reveal')"));assert.equal(tab.view.getBounds().x,8,'revealing sidebar overlays page without shifting it');api.closeOverlay(false);await pause(250);
 api.settingsSet('verticalTabs',false);await pause(100);assert.equal(tab.view.getBounds().x,0,'horizontal tabs reserve no side rail');api.settingsSet('verticalTabs',true);api.settingsSet('verticalAutoHide',false);await pause(250);
 const downloads=api.showDownloadsPanel(),tasks=api.showTaskManager();await until(()=>!downloads.webContents.isLoading()&&!tasks.webContents.isLoading());await pause(200);
 const colors=async panel=>panel.webContents.executeJavaScript("({bg:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,close:getComputedStyle(document.querySelector('#closePanel')).display,svg:!!document.querySelector('#closePanel svg')})");
 const a=await colors(downloads),b=await colors(tasks);assert.equal(a.bg,b.bg);assert.equal(a.text,b.text);assert.equal(a.close,'grid');assert.equal(b.close,'grid');assert(a.svg&&b.svg);
 await capture(tasks.webContents,'taskmanager-popup.png');await capture(downloads.webContents,'downloads-popup.png');

 // Exercise the actual tab mouse handlers and IPC in both orientations.
 downloads.close();tasks.close();w.win.show();w.win.focus();
 await w.ui.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await w.ui.webContents.insertCSS('#side { transition:none !important; }');
 const clickTab=async(id,modifiers=0,close=false)=>{
  const selector='.tab[data-id="'+id+'"]'+(close?' .x':'');
  const point=await w.ui.webContents.executeJavaScript('(()=>{window.scrollTo(0,0);const el=document.querySelector('+JSON.stringify(selector)+');const r=el.getBoundingClientRect();return {x:r.left+(Math.min(40,r.width/2)),y:r.top+r.height/2};})()');
  await w.ui.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1,modifiers});
  await w.ui.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1,modifiers});
 };
 const expectSelection=async ids=>until(()=>w.ui.webContents.executeJavaScript('JSON.stringify(state.selectedTabIds.slice().sort((a,b)=>a-b))').then(value=>value===JSON.stringify(ids.slice().sort((a,b)=>a-b))));
 for(const vertical of [true,false]){
  api.closeOverlay(false);api.settingsSet('verticalTabs',vertical);api.settingsSet('verticalAutoHide',false);
  await pause(300);
  const group=Array.from({length:4},()=>api.newTab('about:blank',true,null,-1,true));
  api.pushState();await until(()=>w.ui.webContents.executeJavaScript('!!document.querySelector('+JSON.stringify('.tab[data-id="'+group[3].id+'"]')+')'));
  await clickTab(group[0].id);await expectSelection([group[0].id]);
  await clickTab(group[2].id,2);await expectSelection([group[0].id,group[2].id]);
  await clickTab(group[2].id,2);await expectSelection([group[0].id]);
  await clickTab(group[0].id);await clickTab(group[2].id,8);await expectSelection(group.slice(0,3).map(t=>t.id));
  assert.equal(await w.ui.webContents.executeJavaScript('document.querySelectorAll(".tab.selected[aria-selected=true]").length'),3);
  api.pushState();await expectSelection(group.slice(0,3).map(t=>t.id));
  await clickTab(group[3].id,10);await expectSelection(group.map(t=>t.id));
  await clickTab(group[1].id);await expectSelection([group[1].id]);
  await clickTab(group[3].id,2);await expectSelection([group[1].id,group[3].id]);
  api.settingsSet('uiFont','consolas');
  const menuAction=async(label)=>{
   api.showTabMenu({id:group[3].id,x:100,y:100});await expectSelection([group[1].id,group[3].id]);
   const context=w.contextMenu,action=[...context.actions].find(([,item])=>item.label===label);assert(action,'group menu action '+label);
   api.runContextAction({token:context.token,id:action[0]});
  };
  await menuAction('Seçili sekmeleri sabitle');assert(group[1].pinned&&group[3].pinned);assert(!group[0].pinned&&!group[2].pinned);
  await menuAction('Seçili sekmelerin sabitlemesini kaldır');assert(!group[1].pinned&&!group[3].pinned);
  await until(()=>w.ui.webContents.executeJavaScript('!!document.querySelector('+JSON.stringify('.tab:not(.pin)[data-id="'+group[3].id+'"]')+')'));
  await pause(250);
  await clickTab(group[3].id,0,true);await until(()=>!w.tabs.includes(group[1])&&!w.tabs.includes(group[3]));
  assert(w.tabs.includes(group[0])&&w.tabs.includes(group[2]),'bulk close preserves unselected tabs');
  await clickTab(group[0].id);await clickTab(group[2].id,2);await expectSelection([group[0].id,group[2].id]);
  api.handleShortcut({key:'w',control:true,type:'keyDown'});await until(()=>group.every(t=>!w.tabs.includes(t)));
 }
 api.settingsSet('verticalTabs',true);

 api.settingsSet('savedTabsEnabled',true);
 const sleeping=Array.from({length:2},()=>api.newTab('about:blank',true,null,-1,true));
 api.selectTab({id:sleeping[0].id});api.selectTab({id:sleeping[1].id,toggle:true});
 api.showTabMenu({id:sleeping[1].id,x:100,y:100});
 const sleepContext=w.contextMenu,sleepAction=[...sleepContext.actions].find(([,item])=>item.label==='Sekmeleri uyut');assert(sleepAction);
 api.runContextAction({token:sleepContext.token,id:sleepAction[0]});
 assert(sleeping.every(t=>!t.view),'active selected tab sleeps with the group');assert(!sleeping.includes(api.activeTab()));
 api.selectTab({id:sleeping[0].id});assert(sleeping[0].view,'sleeping selected tab wakes on activation');
 const vault=[api.newTab('https://example.com/bulk-vault-a',true),api.newTab('https://example.org/bulk-vault-b',true)];
 const unrelated=api.newTab('https://unrelated.example/keep-awake',true);
 const exclusionMenu=(id,label,expected)=>{
  api.showTabMenu({id,x:100,y:100});const context=w.contextMenu,action=[...context.actions].find(([,item])=>item.label===label);
  assert(action,'keep-awake menu entry');assert.equal(action[1].checked,expected);
  api.runContextAction({token:context.token,id:action[0]});
 };
 exclusionMenu(unrelated.id,'Bu sekmeyi otomatik uyutma',false);
 exclusionMenu(vault[0].id,'Bu sekmeyi otomatik uyutma',false);
 api.selectTab({id:vault[0].id});api.selectTab({id:vault[1].id,toggle:true});
 const bulkExclusionLabel='Seçili sekmeleri otomatik uyutma';

 const sameSite=api.newTab('https://example.com/unselected-same-site',true);
 api.sleepTabSelection(vault.map(t=>t.id));assert(vault.every(t=>!t.view));const activeBeforeWake=api.activeTab();
 exclusionMenu(vault[1].id,bulkExclusionLabel,false);
 assert(vault.every(t=>t.autoSleepExcluded===true&&t.view&&!t.pendingNavigation),'only selected sleeping tabs wake and stay protected');
 assert.equal(api.activeTab(),activeBeforeWake,'waking selected tabs preserves active tab');
 assert(!sameSite.autoSleepExcluded&&!sameSite.view,'unselected tab on the same site stays asleep and unprotected');
 assert(unrelated.autoSleepExcluded,'unselected tab preference is preserved');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'ayarlar.json'))).sleepExcludedSites,[],'tab action never changes the site-wide exclusions');
 exclusionMenu(vault[1].id,bulkExclusionLabel,true);
 assert(vault.every(t=>t.autoSleepExcluded===false&&t.view),'turning off keep-awake allows auto sleep without immediately sleeping tabs');assert(unrelated.autoSleepExcluded);
 api.selectTab({id:vault[0].id});api.selectTab({id:vault[1].id,toggle:true});
 api.showTabMenu({id:vault[1].id,x:100,y:100});const vaultContext=w.contextMenu,vaultAction=[...vaultContext.actions].find(([,item])=>item.label==='Seçili sekmeleri kasaya gönder');assert(vaultAction);
 api.runContextAction({token:vaultContext.token,id:vaultAction[0]});
 assert(vault.every(t=>!w.tabs.includes(t)),'vault closes every saved selected tab');
 const savedGroup=api.tabArchive().data.groups.find(g=>vault.every(t=>g.tabs.some(link=>link.url===t.url)));assert(savedGroup,'selected tabs are saved together');assert(w.tabs.includes(sleeping[0]),'unselected tab stays open');
 const failed=api.newTab('https://example.com/failed-vault',true),store=api.tabArchive(),originalStore=store.store,originalData=JSON.stringify(store.data);
 try{store.store=()=>{throw Error('Simulated write failure');};assert.throws(()=>api.sendTabsToVault([failed.id]),/write failure/);assert(w.tabs.includes(failed),'failed archive write leaves source open');assert.equal(JSON.stringify(store.data),originalData);}finally{store.store=originalStore;}
 const allBefore=[...w.tabs];api.sleepTabSelection(allBefore.map(t=>t.id));assert(allBefore.every(t=>!t.view),'sleep all includes the active tab');assert(w.tabs.some(t=>!allBefore.includes(t)&&t.view),'sleep all creates an awake replacement');
 console.log('PASS: bulk vault save, atomic failure, plural menu labels, selected active-tab sleep, wake and all-tab sleep.');
 console.log('PASS: Ctrl toggle, Shift range, Ctrl+Shift union, plain-click reset, selection styling, bulk close button and Ctrl+W in vertical and horizontal tabs.');
 console.log('PASS: native Settings scrolling, visited URL completion, floating find without layout shifts, popup colors and centered close icons.');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
