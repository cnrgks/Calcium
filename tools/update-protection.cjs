'use strict';
// Refresh the bundled data from official maintainers. This never updates binaries.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {readResponseBytes}=require('../bounded-fetch');
const {TRACKER_SOURCE,parseTrackerDomains}=require('../calcium-protection');
const root=path.join(__dirname,'..'),assets=require('../vendor/ublock/assets/assets.json');
async function main(){
 const jobs=[{url:TRACKER_SOURCE,file:'vendor/protection/tracking-servers.txt',tracker:true}];
 for(const [key,entry] of Object.entries(assets)){
  if(entry.content!=='filters'||entry.off)continue;
  const urls=[].concat(entry.contentURL||[]),local=urls.find(u=>u.startsWith('assets/'));
  const remote=[].concat(entry.cdnURLs||[],urls).find(u=>u.startsWith('https://'));
  if(local&&remote)jobs.push({url:remote,file:'vendor/ublock/'+local,key});
 }
 const records=[];let failure=false;
 await Promise.all(Array.from({length:3},async()=>{while(jobs.length){const job=jobs.shift();try{
  const response=await fetch(job.url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('HTTP '+response.status);
  const bytes=await readResponseBytes(response,16*1024*1024),text=bytes.toString('utf8');if(bytes.length<100||/<html[\s>]/i.test(text.slice(0,500)))throw Error('Invalid filter response');
  if(job.tracker&&parseTrackerDomains(text).deny.size<100)throw Error('Invalid tracker list');
  const dest=path.join(root,job.file);fs.mkdirSync(path.dirname(dest),{recursive:true});await fs.promises.writeFile(dest+'.tmp',bytes);await fs.promises.rename(dest+'.tmp',dest);
  records.push({source:job.url,file:job.file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});console.log('Updated '+(job.key||'Calcium trackers')+' ('+bytes.length+' bytes)');
 }catch(e){failure=true;console.error('Kept existing '+job.file+': '+e.message);}}}));
 fs.mkdirSync(path.join(root,'vendor','protection'),{recursive:true});fs.writeFileSync(path.join(root,'vendor','protection','sources.json'),JSON.stringify({updatedAt:new Date().toISOString(),sources:records},null,2)+'\n');
 if(failure)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
