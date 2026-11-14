'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const drawer={},page={},layers=[page,drawer];let finishExit;
 const notice={setBounds(){},setVisible(value){this.visible=value;},webContents:{executeJavaScript(code){assert(code.includes('await exit.finished'));return new Promise(resolve=>{finishExit=resolve;});}}};
 const parent={children:layers,addChildView(view,index){const old=layers.indexOf(view);if(old>=0)layers.splice(old,1);layers.splice(index??layers.length,0,view);}};
 parent.addChildView(notice);
 const w={tabNotice:notice,tabNoticeVisible:true,tabNoticeGeneration:1,ui:drawer,win:{isDestroyed:()=>false,getContentBounds:()=>({width:900,height:700}),contentView:parent}};
 const context={W:w,overlayOpen:true,overlayKind:'side',clearTimeout(){}};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function dismissBackgroundTabNotice('),source.indexOf('function showBackgroundTabNotice(')),context);
 context.layoutBackgroundTabNotice(w);
 assert(w.tabNoticeClosing,'drawer begins exit');
 assert(w.tabNoticeVisible,'notice remains visible during exit');
 assert(layers.indexOf(notice)>layers.indexOf(drawer),'drawer must not conceal the fade');
 // Drawer animation and subsequent layouts must preserve the exit layer.
 parent.addChildView(drawer);context.layoutBackgroundTabNotice(w);
 assert(layers.indexOf(notice)>layers.indexOf(drawer));
 finishExit(true);await Promise.resolve();
 assert.equal(notice.visible,false,'hide only after renderer confirms fade completion');
 assert(layers.indexOf(notice)<layers.indexOf(drawer),'park hidden notice behind drawer');
 // A delayed completion from an old notice must not hide a newer one.
 w.tabNoticeVisible=true;w.tabNoticeClosing=false;context.layoutBackgroundTabNotice(w);
 w.tabNoticeGeneration++;finishExit(true);await Promise.resolve();assert(w.tabNoticeVisible);
 console.log('PASS: drawer retains visible exit animation, then hides and moves notice behind; stale exits ignored');
})().catch(error=>{console.error(error);process.exitCode=1;});
