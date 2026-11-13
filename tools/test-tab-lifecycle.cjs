'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert');
const profile=process.env.CALCIUM_PROFILE;if(!profile)throw Error('Use run-electron-tests');
process.env.CALCIUM_TEST_MODE='1';process.env.CALCIUM_TEST_DISPLAY='0';app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'en',verticalTabs:true,verticalAutoHide:true}));
process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
const entry=path.resolve(__dirname,'..','main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(path.dirname(entry));
m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,newTab,openSide,closeOverlay,layout,activateTab,sleepTab,sleepTabSelection,closeTab,activeTab,openUrl,loadExt,extensions:()=>extensions,handleShortcut,settings};',entry);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),until=async fn=>{for(let i=0;i<150;i++){const value=await fn();if(value)return value;await pause(30);}throw Error('Lifecycle test timed out');};
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;const w=await until(()=>api.windows()[0]?.tabs.length&&api.extensions()&&api.windows()[0]);
 let survivor=api.newTab('about:blank',false,null,-1,true);
 const victim=api.newTab('about:blank',false,null,-1,true),dead=victim.view.webContents;
 api.openSide();api.closeOverlay(false);dead.close();
 await pause(300);assert(dead.isDestroyed());assert(!w.tabs.includes(victim),'native close removes stale logical tab');assert.equal(victim.view,null);api.layout();assert(w.tabs.some(t=>t.view&&!t.view.webContents.isDestroyed()),'a live tab remains');
 const sleeping=api.newTab('about:blank',true,null,-1,true);assert(api.sleepTab(sleeping.id));assert(w.tabs.includes(sleeping),'intentional sleep preserves logical tab');assert.equal(sleeping.view,null);api.activateTab(sleeping.id);assert(sleeping.view&&!sleeping.view.webContents.isDestroyed(),'sleeping tab wakes with fresh view');
 // Closing skips even the nearest sleeping tab in favor of an existing awake page.
 const dormant=api.newTab('https://example.invalid/asleep',true);
 const closing=api.newTab('about:blank');api.closeTab(closing.id);
 assert.notEqual(api.activeTab(),dormant);assert.equal(dormant.view,null);
 assert(!api.activeTab().homePlaceholder,'an awake tab wins over the home placeholder');
 const count=w.tabs.length;
 api.sleepTabSelection(w.tabs.map(t=>t.id));
 assert.equal(w.tabs.length,count,'sleep all does not create a sidebar tab');
 assert(w.tabs.every(t=>!t.view),'sleep all leaves every listed tab asleep');
 assert(api.activeTab().homePlaceholder,'home page is visible outside the tab list');
 assert.deepEqual(w.selectedTabIds,[]);api.layout();
 await until(()=>!api.activeTab().view.webContents.isLoading());
 assert(api.activeTab().view.webContents.getURL().includes('/newtab.html'),'placeholder loads the Calcium home page');
 const homeView=api.activeTab().view.webContents;
 api.activateTab(survivor.id);await until(()=>homeView.isDestroyed());assert(!w.homeTab,'waking a real tab releases the placeholder');
 api.closeTab(survivor.id);
 assert(api.activeTab().homePlaceholder,'closing the last awake tab leaves sleepers untouched');
 assert(w.tabs.every(t=>!t.view));
 api.activateTab(sleeping.id);assert(api.sleepTab(sleeping.id),'the last awake tab can be slept directly');
 assert(api.activeTab().homePlaceholder);assert(w.tabs.every(t=>!t.view));
 const beforePin=w.tabs.map(t=>t.id);api.handleShortcut({key:'d',control:true,type:'keyDown'});
 assert.deepEqual(w.tabs.map(t=>t.id),beforePin,'Ctrl+D on invisible home cannot remove a real tab or insert home');assert(!api.activeTab().pinned);
 api.handleShortcut({key:'Tab',control:true,shift:true,type:'keyDown'});assert.equal(api.activeTab(),w.tabs.at(-1),'reverse cycle from invisible home starts at last tab');
 api.handleShortcut({key:'b',control:true,shift:true,type:'keyDown'});assert(api.activeTab().homePlaceholder,'Ctrl+Shift+B sleeps active tab');
 api.handleShortcut({key:'Tab',control:true,type:'keyDown'});assert.equal(api.activeTab(),w.tabs[0],'forward cycle from invisible home starts at first tab');
 api.sleepTabSelection(w.tabs.map(t=>t.id));
 api.handleShortcut({key:'t',control:true,type:'keyDown'});
 await until(()=>w.ui.webContents.executeJavaScript('!document.querySelector("#newtabPrompt").hidden'));
 api.closeOverlay(false);assert(w.tabs.every(t=>!t.view),'opening and dismissing Ctrl+T does not wake sleepers');
 api.settings.newTabPrompt=false;api.handleShortcut({key:'t',control:true,type:'keyDown'});
 assert(!api.activeTab().homePlaceholder && w.tabs.includes(api.activeTab()),'Ctrl+T without prompt creates a regular tab');
 const blank=api.activeTab();api.handleShortcut({key:'d',control:true,type:'keyDown'});assert(!blank.pinned,'normal empty new tab cannot be pinned');
 api.settings.newTabPrompt=true;
 api.sleepTabSelection(w.tabs.map(t=>t.id));api.openUrl('about:blank');
 assert(w.tabs.includes(api.activeTab())&&!api.activeTab().homePlaceholder,'address navigation from home creates a regular tab');
 // Restore a surviving real page for the extension/fullscreen checks below.
 survivor=api.newTab('about:blank');
 const fixture=path.join(profile,'close-fixture');fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'Bulk tab close fixture',version:'1.0',permissions:['tabs']}));fs.writeFileSync(path.join(fixture,'control.html'),'<title>Bulk close controller</title>');
 const ext=await api.loadExt(fixture),control=api.newTab('chrome-extension://'+ext.id+'/control.html',false,null,-1,true);await until(()=>!control.view.webContents.isLoading());const controller=control.view.webContents;
 const imported=Array.from({length:12},()=>api.newTab('about:blank',true,null,-1,true));api.activateTab(imported[0].id);api.openSide();api.closeOverlay(false);
 await controller.executeJavaScript('chrome.tabs.remove('+JSON.stringify(imported.map(t=>t.view.webContents.id))+')');await pause(300);api.layout();assert(imported.every(t=>!w.tabs.includes(t)),'extension bulk removal leaves no destroyed tab views');assert(w.tabs.includes(survivor));

 api.closeOverlay(false);
 const video=api.newTab('about:blank',false,null,-1,true);
 w.win.showInactive();await pause(300);
 for(const vertical of [true,false]){
  api.settings.verticalTabs=vertical;
  for(const html of [false,true]){
   api.activateTab(video.id);
   console.log('Fullscreen regression:',{vertical,html});
   if(html)video.view.webContents.emit('enter-html-full-screen');else w.win.setFullScreen(true);
   await until(()=>w.win.isFullScreen());api.layout();assert.equal(w.ui.getVisible(),false);
   api.handleShortcut({key:'t',control:true,type:'keyDown'});
   await until(()=>!w.win.isFullScreen()&&w.ui.getVisible()&&w.ui.getBounds().height>0);
   await until(()=>w.ui.webContents.executeJavaScript('document.body.classList.contains("vert")').then(value=>value===vertical));
   assert.equal(api.settings.verticalTabs,vertical);
   assert.equal(w.win.contentView.children.at(-1),w.ui,'prompt stays above the page after fullscreen resize');
   if(html)video.view.webContents.emit('leave-html-full-screen');
   assert(!w.win.isFullScreen(),'late HTML fullscreen exit does not hide the prompt');api.closeOverlay(false);
  }
 }
 api.settings.verticalTabs=true;
 api.activateTab(video.id);
 video.view.webContents.emit('enter-html-full-screen');await until(()=>w.win.isFullScreen());
 api.activateTab(survivor.id);await until(()=>!w.win.isFullScreen());assert(w.ui.getVisible());
 api.activateTab(video.id);w.win.setFullScreen(true);await until(()=>w.win.isFullScreen());
 video.view.webContents.emit('enter-html-full-screen');video.view.webContents.emit('leave-html-full-screen');
 assert(w.win.isFullScreen(),'leaving video fullscreen preserves pre-existing F11 fullscreen');w.win.setFullScreen(false);
 console.log('PASS: native active-tab close during sidebar animation, bulk extension tab removal, delayed layout and sleep/wake retain valid views.');app.exit(0);
})().catch(error=>{console.error(error);app.exit(1)});
