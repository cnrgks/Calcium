// Run with Electron: electron tools/test-taskmanager.cjs
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');const root=path.join(__dirname,'..');
ipcMain.handle('calcium-ui-font',()=>null);
ipcMain.on('mondium-lang',e=>e.returnValue='tr');ipcMain.on('mondium-edge-px',e=>e.returnValue=60);
app.whenReady().then(async()=>{
 const source=fs.readFileSync(path.join(root,'main.js'),'utf8');
 const tabs=[{id:1,title:'YouTube',favicon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',w:{},view:{webContents:{getOSProcessId:()=>10}}},{id:2,title:'KICK',w:{},view:{webContents:{getOSProcessId:()=>10}}},{id:3,title:'Uyuyan',w:{},view:null}];
 const metrics=[{pid:10,type:'Tab',memory:{privateBytes:1024},cpu:{percentCPUUsage:3}},{pid:20,type:'Browser',memory:{privateBytes:2048},cpu:{percentCPUUsage:1}},{pid:30,type:'Utility',name:'Network Service',memory:{privateBytes:512},cpu:{percentCPUUsage:.5}}];
 const ctx={app:{getAppMetrics:()=>metrics},allTabs:()=>tabs,windows:[],W:null,activeId:0,webContents:{getAllWebContents:()=>[]},hostOf:u=>u};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function taskManagerData('),source.indexOf('// ---------------------------------------------------------------- Extensions')),ctx);
 const data=ctx.taskManagerData();assert.equal(data.total,3584);const g=data.groups.find(g=>g.key==='tabs');assert.equal(g.memory,1024);assert.equal(g.rows[1].shared,true);assert.equal(g.rows[2].sleeping,true);assert.equal(g.rows[0].icon,tabs[0].favicon);
 let slept=0,activated=0;ipcMain.handle('page',(_e,cmd,arg)=>{if(cmd==='get')return {theme:{page:'#000',toolbar:'#000',card:'#0a0a0a',accent:'#a8c7fa'}};if(cmd==='tasks-list')return data;if(cmd==='tasks-sleep'){slept=arg;return {ok:true}}if(cmd==='tasks-activate'){activated=arg;return {ok:true}}return {ok:true};});
 const win=new BrowserWindow({show:false,width:1100,height:760,webPreferences:{preload:path.join(root,'page-preload.js'),sandbox:true,contextIsolation:true}});await win.loadFile(path.join(root,'taskmanager.html'));await new Promise(r=>setTimeout(r,150));
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('#groups details').length`),3);assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('#groups .row').length`),5);assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.task img').length`),1);
 await win.webContents.executeJavaScript(`document.querySelector('[data-focus="sleep-1"]').click()`);await new Promise(r=>setTimeout(r,40));assert.equal(slept,1);
 await win.webContents.executeJavaScript(`document.querySelector('[data-focus="tab-2"]').click()`);await new Promise(r=>setTimeout(r,30));assert.equal(activated,2);
 await win.webContents.executeJavaScript(`document.querySelector('details').open=false;document.querySelector('#refresh').click()`);await new Promise(r=>setTimeout(r,30));assert.equal(await win.webContents.executeJavaScript(`document.querySelector('details').open`),false);
 const w={};const tab={id:1,w,url:'https://example.com/',view:{webContents:{getURL:()=> 'https://example.com/actual'}},audible:true,loading:true},other={id:2,w,view:{}};const sleepCtx={allTabs:()=>[tab,other],useWin:()=>{},tabs:[tab,other],activeId:1,activateTab:id=>{sleepCtx.activeId=id},destroyView:t=>{t.view=null},pushState:()=>{}};vm.createContext(sleepCtx);vm.runInContext(source.slice(source.indexOf('function sleepTab('),source.indexOf('function sleepIdleTabs(')),sleepCtx);assert.equal(sleepCtx.sleepTab(1),true);assert.equal(tab.view,null);assert.equal(tab.url,'https://example.com/actual');assert.equal(tab.audible,false);assert.equal(sleepCtx.activeId,2);
 console.log('PASS: grouped process totals, shared memory deduplication, icons, collapse persistence, tab actions and manual sleeping.');win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
