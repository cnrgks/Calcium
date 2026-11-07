'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const root=path.join(__dirname,'..'),profile=process.env.CALCIUM_PROFILE;
if(!profile||path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('calcium-startup-test-'))throw Error('Use npm run test:electron');
process.env.CALCIUM_TEST_MODE='1';fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'tr'}));app.disableHardwareAcceleration();
let checks=0,version='99.8.7';const originalFetch=global.fetch;
global.fetch=async(url,options)=>{
 if(url!=='https://api.github.com/repos/cnrgks/Calcium/releases/latest')return originalFetch(url,options);
 checks++;return new Response(JSON.stringify({tag_name:'v'+version,draft:false,prerelease:false,assets:[{name:'Calcium-Setup-'+version+'.exe',state:'uploaded',size:4096,digest:'sha256:'+'a'.repeat(64),browser_download_url:'https://github.com/cnrgks/Calcium/releases/download/v'+version+'/Calcium-Setup-'+version+'.exe'}]}));
};
const entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,appUpdates,newTab,SETTINGS_URL,openOverlay,closeOverlay,incognito:()=>createWindow({incognito:true})};',entry);
const pause=()=>new Promise(r=>setTimeout(r,100));
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;for(let i=0;i<100&&!api.windows()[0]?.tabs.length;i++)await pause();const owner=api.windows()[0];assert(owner);owner.win.hide();
 const tab=api.newTab(api.SETTINGS_URL+'#hakkinda'),wc=tab.view.webContents;
 for(let i=0;i<100;i++){if(await wc.executeJavaScript('!!document.querySelector("#appUpdateCheck")').catch(()=>false))break;await pause();}
 assert.equal(checks,0,'no test/development startup network request');
 assert(await wc.executeJavaScript('document.querySelectorAll("#kisayollar+.card kbd").length>30'));
 const oldBounds=tab.view.getBounds();await api.appUpdates.check({manual:false});await pause();const notice=owner.updateNotice;assert(notice,'startup offer has a dedicated non-modal view');
 for(let i=0;i<50;i++){if(await notice.webContents.executeJavaScript('!!window.pageApi&&!!document.querySelector("#later")').catch(()=>false))break;await pause();}
 assert.equal(notice.webContents.getLastWebPreferences().sandbox,true);assert.equal(notice.webContents.getLastWebPreferences().nodeIntegration,false);assert.deepEqual(tab.view.getBounds(),oldBounds,'notice does not resize or cover the entire page');
 const bounds=notice.getBounds(),area=owner.win.getContentBounds();assert(bounds.width<=360&&bounds.height<=190);assert.equal(bounds.y,oldBounds.y+8,'notice sits directly below the toolbar');assert(bounds.x+bounds.width<=area.width);
 api.openOverlay({kind:'main',x:30,y:80});assert.equal(notice.getVisible(),false,'menus stay above the update offer');api.closeOverlay(false);assert.equal(notice.getVisible(),true);
 const privateWindow=api.incognito();privateWindow.win.hide();assert(!privateWindow.updateNotice,'offer never appears in a private window');
 await notice.webContents.executeJavaScript('document.querySelector("#later").click();void 0').catch(()=>{});await pause();assert(!owner.updateNotice);assert(api.appUpdates.snapshot().notificationsPaused);
 const persisted=JSON.parse(fs.readFileSync(path.join(profile,'ayarlar.json'),'utf8'));assert.equal(persisted.updatePromptDismissed,true);
 version='99.9.0';const prior=checks;await api.appUpdates.check({manual:false});assert.equal(checks,prior,'Later suppresses another automatic check');
 await wc.executeJavaScript('document.querySelector("#appUpdateCheck").click()');await pause();assert.equal(checks,prior+1);assert(!owner.updateNotice);assert((await wc.executeJavaScript('document.querySelector("#appUpdateStatus").textContent')).includes(version));
 assert.equal(await wc.executeJavaScript('document.querySelector("#appUpdatePaused").hidden'),false);
 console.log('PASS: About update controls, real shortcut list, non-modal top-right view, menu/private-window isolation, persistent Later and manual recheck without nagging.');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
