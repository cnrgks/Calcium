'use strict';
const {app,webContents}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module');
if(process.env.CALCIUM_IDLE_SIZE)app.commandLine.appendSwitch('js-flags','--optimize-for-size');
if(process.env.CALCIUM_IDLE_EARLY)app.commandLine.appendSwitch('js-flags','--gc-memory-reducer-start-delay-ms=10000');
const root=path.join(__dirname,'..'),entry=path.join(root,'main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(root);process.env.CALCIUM_TEST_MODE='1';
m._compile(fs.readFileSync(process.env.CALCIUM_IDLE_SOURCE||entry,'utf8')+'\nmodule.exports.idle={ready:mainBlockReady,windows:()=>windows,bg:uboBackground};',entry);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await app.whenReady();await m.exports.idle.ready;while(!m.exports.idle.windows()[0]?.tabs.length)await wait(100);const w=m.exports.idle.windows()[0];w.win.hide();
 const bg=m.exports.idle.bg();if(bg)await bg.executeJavaScript("µBlock.changeUserSettings('autoUpdate',false)");
 const results=[];let prior=0;
 for(const seconds of [0,15,45,75]){
  for(let elapsed=prior;elapsed<seconds;elapsed+=5)await wait(Math.min(5,seconds-elapsed)*1000);prior=seconds;
  const contents=webContents.getAllWebContents().map(wc=>({id:wc.id,pid:wc.getOSProcessId(),type:wc.getType(),url:wc.getURL()}));
  const rows=app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,name:p.name,privateKB:p.memory?.privateBytes,workingSetKB:p.memory?.workingSetSize,cpu:p.cpu?.percentCPUUsage,contents:contents.filter(w=>w.pid===p.pid)}));
  const bg=m.exports.idle.bg();let heap;try{heap=await bg.executeJavaScript('({used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,ready:µBlock.readyToFilter})');}catch{}
  const record={seconds,privateKB:rows.reduce((s,p)=>s+(p.privateKB||0),0),rows,main:process.memoryUsage(),uboHeap:heap};results.push(record);console.log('IDLE',seconds,JSON.stringify({privateMiB:record.privateKB/1024,mainHeapMiB:record.main.heapUsed/1024**2,rows:rows.map(p=>({type:p.type,name:p.name,privateMiB:p.privateKB/1024,cpu:p.cpu,url:p.contents.map(w=>w.url)})),uboHeap:heap}));
 }
 fs.writeFileSync(process.env.CALCIUM_IDLE_OUTPUT,JSON.stringify(results,null,2));app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
