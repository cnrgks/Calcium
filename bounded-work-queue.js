'use strict';
function createWorkQueue({concurrency=3,capacity=128}={}){
 const pending=[],active=new Set();
 function finish(job,value){if(job.done)return;job.done=true;job.resolve(value);}
 function drain(){while(active.size<concurrency&&pending.length){const job=pending.shift();if(job.valid&&!job.valid()){finish(job,null);continue;}active.add(job);Promise.resolve().then(()=>job.fn(job.controller.signal)).then(value=>finish(job,value),()=>finish(job,null)).finally(()=>{active.delete(job);drain();});}}
 return {
  run(fn,{owner,valid}={}){if(pending.length>=capacity)return Promise.resolve(null);return new Promise(resolve=>{pending.push({fn,owner,valid,resolve,controller:new AbortController(),done:false});drain();});},
  cancel(owner){for(let i=pending.length-1;i>=0;i--)if(pending[i].owner===owner){const [job]=pending.splice(i,1);job.controller.abort();finish(job,null);}for(const job of active)if(job.owner===owner){job.controller.abort();finish(job,null);}},
  stats:()=>({pending:pending.length,active:active.size})
 };
}
module.exports={createWorkQueue};
