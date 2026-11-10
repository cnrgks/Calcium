const {app,BaseWindow,WebContentsView,session}=require('electron');
const {ElectronChromeExtensions}=require('electron-chrome-extensions');
const fs=require('fs'),vm=require('vm'),assert=require('assert');
app.whenReady().then(async()=>{
 const source=fs.readFileSync(require('path').join(__dirname,'..','main.js'),'utf8');
 const win=new BaseWindow({show:false});const w={win,tabs:[],incognito:false};
 let loads=0;
 const ctx={W:w,win,activeId:null,nextId:1,tabs:w.tabs,Date,Math,toUrl:u=>u,orderPinned:()=>{},queueTabTitle:()=>{},go:()=>{loads++},pushState:()=>{},layout:()=>{},isNewtab:()=>false,isInternal:()=>false,hostOf:u=>new URL(u).hostname,overlayOpen:false,findOpen:false};
 ctx.bridgeFor=()=>ctx.extensions;vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('let extensionTabRegistrationDepth'),source.indexOf('function toUrl(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function newTab('),source.indexOf('function destroyView(')),ctx);
 let callbacks=0;
 ctx.extensions=new ElectronChromeExtensions({license:'GPL-3.0',session:session.defaultSession,selectTab:wc=>{callbacks++;ctx.requestSelection(wc.id)}});
 ctx.requestSelection=id=>{const t=ctx.tabs.find(t=>t.view && t.view.webContents.id===id);if(t)vm.runInContext(`if (!extensionTabRegistrationDepth) activateTab(${t.id});`,ctx)};
 ctx.createView=tab=>{const view=new WebContentsView();tab.view=view;ctx.registerExtensionTab(view.webContents,w);return view;};
 const first=ctx.newTab('https://first.example',false);
 const second=ctx.newTab('https://background.example',true,first.id);
 assert.equal(second.view,null,'background links must not create a renderer');
 assert.equal(loads,1,'background links must not start navigation');
 assert.equal(ctx.activeId,first.id,'background creation must preserve browser selection');
 assert.equal(ctx.extensions.ctx.store.getActiveTabFromWindow(win).id,first.view.webContents.id,'extension selection must match');
 ctx.activateTab(second.id);assert.equal(ctx.activeId,second.id,'explicit selection must still work');assert.equal(loads,2,'selection loads deferred URL once');ctx.activateTab(second.id);assert.equal(loads,2,'repeat selection does not reload');
 const third=ctx.newTab('https://foreground.example',false);assert.equal(ctx.activeId,third.id,'foreground creation must still work');
 const deferred=ctx.newTab('https://extension-background.example',true,third.id,-1,true);assert(deferred.view);assert.equal(loads,3);assert.equal(ctx.activeId,third.id);ctx.activateTab(deferred.id);assert.equal(loads,4);
 // Exercise delayed script-generated titles with a real, isolated renderer.
 const server=require('http').createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>localhost</title><script>setTimeout(()=>document.title="Actual video title - YouTube",300)</script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const titleViews=[];
 const titleContext={URL,AbortController,setTimeout,clearTimeout,WebContentsView:class extends WebContentsView{constructor(options){super(options);titleViews.push(this.webContents);}},threatProtection:{isBlocked:()=>false},windows:[],inWin:()=>{},pushState:()=>{}};
 vm.createContext(titleContext);
 vm.runInContext(source.slice(source.indexOf('function meaningfulTabTitle('),source.indexOf('function newTab(')),titleContext);
 try {
   const titleTab={url:'http://localhost:'+server.address().port+'/',w:{ses:session.fromPartition('title-test-'+Date.now()),tabs:[]},title:'localhost',view:null};titleTab.w.tabs.push(titleTab);
   assert(!titleContext.meaningfulTabTitle('YouTube','https://www.youtube.com/watch?v=test'));
   assert(!titleContext.meaningfulTabTitle('youtube.com','https://www.youtube.com/watch?v=test'));
   await titleContext.readTabTitle(titleTab);
   assert.equal(titleTab.title,'Actual video title - YouTube','wait for the script-generated video title');
   assert(titleViews[0].isDestroyed(),'release renderer after title resolves');
   titleTab.title='localhost';const cancelled=titleContext.readTabTitle(titleTab);titleTab.titleRequest.abort();await cancelled;
   assert.equal(titleTab.title,'localhost','activation cancellation prevents stale title writes');
   assert(titleViews[1].isDestroyed(),'cancelled renderer is released');
 } finally {server.close();}
 console.log('PASS: actual ECE registration callbacks='+callbacks+'; background preserved, explicit/foreground selection works.');
 for(const t of ctx.tabs)t.view.webContents.close();win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
