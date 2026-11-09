'use strict';
const {app,webContents}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const root=path.resolve(__dirname,'..'),profile=process.env.CALCIUM_PROFILE;
if(!profile||path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('calcium-startup-test-'))throw Error('Use test:electron');
process.env.CALCIUM_TEST_MODE='1';process.env.CALCIUM_TEST_DISPLAY='0';app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'en'}));
const entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);
m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,loadExt,newTab,extensions:()=>extensions};',entry);
const pause=()=>new Promise(r=>setTimeout(r,100)),until=async fn=>{for(let i=0;i<200;i++){const result=await fn();if(result)return result;await pause();}throw Error('Extension compatibility test timed out');};
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;await until(()=>api.windows()[0]?.tabs.length&&api.extensions());
 const directory=path.join(profile,'fixture');fs.mkdirSync(directory);
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({manifest_version:3,name:'Favicon capability fixture',version:'1.0',permissions:['favicon','storage'],optional_permissions:['tabs','tabGroups'],action:{default_popup:'popup.html'}}));
 fs.writeFileSync(path.join(directory,'popup.html'),'<title>Capability probe</title>');
 const extension=await api.loadExt(directory),tab=api.newTab(`chrome-extension://${extension.id}/popup.html`),wc=tab.view.webContents;
 await until(()=>!wc.isLoading()&&wc.getURL().endsWith('/popup.html'));
 const probe=await wc.executeJavaScript(`(async()=>({all:await chrome.permissions.getAll(),favicon:await chrome.permissions.contains({permissions:['favicon']}),storage:await chrome.permissions.contains({permissions:['storage']}),request:await chrome.permissions.request({permissions:['favicon','tabs']}),after:await chrome.permissions.getAll(),manifest:chrome.runtime.getManifest()}))()`);
 assert(!probe.all.permissions.includes('favicon'));assert(probe.storage);assert.equal(probe.favicon,false);assert.equal(probe.request,false);assert(!probe.after.permissions.includes('tabs'),'unsupported mixed request must not grant other permissions');assert(probe.manifest.permissions.includes('favicon'),'original manifest preserved');
 assert.deepEqual(await wc.executeJavaScript(`(async()=>({none:chrome.tabGroups.TAB_GROUP_ID_NONE,groups:await chrome.tabGroups.query({}),tabs:(await chrome.tabs.query({})).map(t=>t.groupId)}))()`),{none:-1,groups:[],tabs:api.windows()[0].tabs.filter(t=>t.view).map(()=>-1)});
 console.log('PASS: unsupported favicon capability omitted, contains false, request denied atomically, storage and manifest preserved.');
 const source=process.env.CALCIUM_ONETAB_DIR;
 if(source){
  const dir=path.join(profile,'onetab');fs.cpSync(source,dir,{recursive:true});const ext=await api.loadExt(dir),base=`chrome-extension://${ext.id}/`;
  api.newTab(base+'onetab.html');
  const page=await until(async()=>{for(const c of webContents.getAllWebContents().filter(c=>c.getURL()===base+'onetab.html')){if(await c.executeJavaScript(`!document.getElementById('loadingSpinner') && document.body.innerText.includes('Options')`).catch(()=>false))return c;}});
  assert((await page.executeJavaScript('document.body.innerText')).includes('Import & Export'));
  // Select OneTab's actual toolbar setting, then use its native action API.
  await page.executeJavaScript(`chrome.runtime.sendMessage({type:'xt',Hp:true,args:['browserAction','openPopup']})`);
  await page.executeJavaScript(`chrome.action.setPopup({popup:'popup.html'}).then(()=>chrome.action.openPopup())`);
  const popup=await until(()=>webContents.getAllWebContents().find(c=>c.getURL()===base+'popup.html'));
  await until(()=>popup.executeJavaScript(`document.body.innerText.trim().length>20`).catch(()=>false));
  await popup.executeJavaScript(`[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent==='Continue')?.click()`);
  await until(()=>popup.executeJavaScript(`!document.getElementById('loadingSpinner') && !document.body.innerText.includes('Continue') && document.body.innerText.length>10`).catch(()=>false));
  const popupText=await popup.executeJavaScript('document.body.innerText');
  assert(popupText.includes('Destination:'));assert(popupText.includes('Close tabs and store'));
  console.log('OneTab popup:',popupText);
  api.extensions().api.browserAction.popup?.destroy();
  const options=api.newTab(base+'options.html').view.webContents;
  await until(()=>options.executeJavaScript(`document.body.innerText.includes('OneTab') && document.body.innerText.length>100`).catch(()=>false));
  console.log('PASS: real OneTab '+ext.manifest.version+' main page, toolbar popup and options rendered using untouched extension files in an isolated profile.');
 }
 app.exit(0);
})().catch(error=>{console.error(error);app.exit(1)});
