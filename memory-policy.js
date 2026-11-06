'use strict';
const MiB=1024*1024;
function memoryPressure({total,free}={}){return Number.isFinite(total)&&Number.isFinite(free)&&total>0&&free>=0&&free<Math.max(512*MiB,total*.1);}
function chooseSleepTabs(tabs,{now=Date.now(),timeoutMs=600000,pressure=false,force=false}={}){
 const candidates=tabs.filter(t=>t.live&&!t.active&&!t.protected&&!t.audible&&!t.loading&&!t.pending&&now-t.lastActive>=(force?0:pressure?Math.min(timeoutMs,60000):timeoutMs)).sort((a,b)=>a.lastActive-b.lastActive);
 if(force||!pressure)return candidates;
 // Release gradually; keep at least three loaded pages and revisit on the next tick.
 const budget=Math.min(3,Math.max(0,tabs.filter(t=>t.live).length-3));
 return candidates.slice(0,budget);
}
module.exports={memoryPressure,chooseSleepTabs};
