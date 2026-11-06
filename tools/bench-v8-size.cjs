'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('fs');if(process.env.CALCIUM_IDLE_SIZE)app.commandLine.appendSwitch('js-flags','--optimize-for-size');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadURL('data:text/html,<title>V8 perf fixture</title>');
 const results=await win.webContents.executeJavaScript(`(()=>{
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const compute=()=>{let n=0;for(let i=0;i<5000000;i++)n=(n+(i%97))|0;return n;};
 const allocate=()=>{let sum=0;for(let r=0;r<30;r++){const rows=Array.from({length:10000},(_,i)=>({i,value:'value-'+i}));sum+=rows.reduce((n,r)=>n+r.i,0);}return sum;};
 const out={};for(const [name,fn] of Object.entries({compute,allocate})){for(let i=0;i<3;i++)fn();const samples=[];let checksum;for(let i=0;i<9;i++){const start=performance.now();checksum=fn();samples.push(performance.now()-start);}out[name]={medianMs:median(samples),samples,checksum};}return out;
 })()`);fs.writeFileSync(process.env.CALCIUM_PERF_OUTPUT,JSON.stringify(results,null,2));console.log(process.env.CALCIUM_IDLE_SIZE?'compact':'normal',JSON.stringify(results));win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
