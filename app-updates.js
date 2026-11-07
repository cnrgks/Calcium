'use strict';
const fs=require('fs'),fsp=require('fs/promises'),path=require('path'),crypto=require('crypto');
const {Readable,Transform}=require('stream');const {pipeline}=require('stream/promises');
const {readResponseBytes}=require('./bounded-fetch');
const RELEASE_API='https://api.github.com/repos/cnrgks/Calcium/releases/latest';
const RELEASE_PAGE='https://github.com/cnrgks/Calcium/releases/latest';
const MAX_INSTALLER=512*1024*1024;
function versionParts(value){const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value||'');if(!m)return null;const parts=m.slice(1).map(Number);return parts.every(Number.isSafeInteger)?parts:null;}
function newer(candidate,current){const a=versionParts(candidate),b=versionParts(current);if(!a||!b)return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function releaseInfo(data,current){
 if(!data||data.draft!==false||data.prerelease!==false||!versionParts(data.tag_name))throw Error('manifest');
 const version=versionParts(data.tag_name).join('.');if(!newer(version,current))return null;
 const name=`Calcium-Setup-${version}.exe`;
 const asset=Array.isArray(data.assets)?data.assets.find(a=>a.name===name&&a.state==='uploaded'):null;
 const url=`https://github.com/cnrgks/Calcium/releases/download/${data.tag_name}/${name}`;
 if(!asset||asset.browser_download_url!==url||!Number.isSafeInteger(asset.size)||asset.size<2||asset.size>MAX_INSTALLER||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw Error('manifest');
 return Object.freeze({version,name,url,size:asset.size,sha256:asset.digest.slice(7).toLowerCase()});
}
function allowedDownload(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname);}catch{return false;}}
async function installerResponse(fetchImpl,url,signal){
 for(let i=0;i<5;i++){
  if(!allowedDownload(url))throw Error('source');
  const response=await fetchImpl(url,{redirect:'manual',signal,credentials:'omit',headers:{'User-Agent':'Calcium-updates'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('source');url=new URL(location,url).href;continue;}
  if(!response.ok||!response.body)throw Error('network');return response;
 }
 throw Error('source');
}
async function downloadInstaller({release,cacheDir,fetchImpl,signal,onProgress}){
 await fsp.mkdir(cacheDir,{recursive:true});const stat=await fsp.lstat(cacheDir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('storage');
 const dir=await fsp.mkdtemp(path.join(cacheDir,'pending-')),partial=path.join(dir,'installer.part'),file=path.join(dir,release.name);
 try{
  const response=await installerResponse(fetchImpl,release.url,signal);
  const length=response.headers.get('content-length');if(length!==null&&Number(length)!==release.size){await response.body.cancel();throw Error('integrity');}
  let received=0,lastProgress=-1;const hash=crypto.createHash('sha256');let first=Buffer.alloc(0);
  const meter=new Transform({transform(chunk,_encoding,callback){
   received+=chunk.length;if(received>release.size||received>MAX_INSTALLER){callback(Error('integrity'));return;}
   if(first.length<2)first=Buffer.concat([first,chunk.subarray(0,2-first.length)]);
   hash.update(chunk);const progress=Math.floor(received/release.size*100);if(progress!==lastProgress){lastProgress=progress;onProgress(progress);}callback(null,chunk);
  }});
  await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(partial,{flags:'wx',mode:0o600}),{signal});
  if(received!==release.size||hash.digest('hex')!==release.sha256||first.toString('ascii')!=='MZ')throw Error('integrity');
  await fsp.rename(partial,file);return file;
 }catch(error){await removePending(cacheDir,dir);throw error;}
}
async function removePending(cacheDir,dir){
 const resolved=path.resolve(dir),root=path.resolve(cacheDir);
 if(path.dirname(resolved)!==root||!/^pending-[a-zA-Z0-9]+$/.test(path.basename(resolved)))throw Error('storage');
 await fsp.rm(resolved,{recursive:true,force:true}).catch(()=>{});
}
async function cleanupUpdates(cacheDir){
 try{const stat=await fsp.lstat(cacheDir);if(!stat.isDirectory()||stat.isSymbolicLink())return;for(const entry of await fsp.readdir(cacheDir,{withFileTypes:true})){if(entry.isDirectory()&&!entry.isSymbolicLink()&&/^pending-[a-zA-Z0-9]+$/.test(entry.name))await removePending(cacheDir,path.join(cacheDir,entry.name));}}catch{}
}
function createAppUpdates({currentVersion,cacheDir,fetchImpl=fetch,readPreferences=()=>({}),savePreferences=()=>{},canInstall=false,launchInstaller,onChange=()=>{}}){
 let state={status:'idle',version:null,progress:0,error:null,notice:false},release=null,checkJob=null,checkContext=null,installJob=null,controller=null,disposed=false,manualUsedThisSession=false;
 const snapshot=()=>({...state,currentVersion,canInstall:canInstall&&!!release,notificationsPaused:!!readPreferences().updatePromptDismissed,releasePage:RELEASE_PAGE});
 const emit=patch=>{state={...state,...patch};if(!disposed)onChange(snapshot());};
 function later(){savePreferences({updatePromptDismissed:true});emit({notice:false});return snapshot();}
 function clearNotice(){emit({notice:false});}
 function check({manual=true,internal=false}={}){
  if(disposed)return Promise.resolve(snapshot());
  if(manual)manualUsedThisSession=true;
  if(manual&&state.notice)emit({notice:false});
  if(installJob&&!internal)return installJob;
  if(checkJob){if(manual)checkContext.manual=true;return checkJob;}
  if(!manual&&(readPreferences().updatePromptDismissed||manualUsedThisSession))return Promise.resolve(snapshot());
  const context=checkContext={manual};controller=new AbortController();const signal=controller.signal;
  emit({status:'checking',error:null});
  checkJob=Promise.resolve().then(async()=>{
   const timer=setTimeout(()=>controller?.abort(),15000);
   try{
    const response=await fetchImpl(RELEASE_API,{signal,redirect:'error',credentials:'omit',headers:{Accept:'application/vnd.github+json','User-Agent':'Calcium-updates','X-GitHub-Api-Version':'2022-11-28'}});
    if(!response.ok)throw Error('network');const data=JSON.parse((await readResponseBytes(response,1024*1024)).toString('utf8'));
    if(disposed)return snapshot();
    release=releaseInfo(data,currentVersion);
    const preferences=readPreferences();const notice=!!release&&!context.manual&&!preferences.updatePromptDismissed&&preferences.updatePromptOfferedVersion!==release.version;
    if(notice)savePreferences({updatePromptOfferedVersion:release.version});
    emit({status:release?'available':'current',version:release?.version||null,notice,error:null,progress:0});
   }catch(error){emit({status:'error',error:error.message==='manifest'?'manifest':'check',notice:false});}
   finally{clearTimeout(timer);controller=null;checkJob=null;checkContext=null;}
   return snapshot();
  });return checkJob;
 }
 function install(){
  if(disposed||state.status==='launched')return Promise.resolve(snapshot());if(installJob)return installJob;
  // Only this explicit action downloads executable content; checks never do.
  installJob=Promise.resolve().then(async()=>{
   let file;
   try{
    if(checkJob)await checkJob;
    if(!release){await check({internal:true});if(!release)return snapshot();}
    if(!canInstall)throw Error('unsupported');
    emit({status:'downloading',notice:false,error:null,progress:0});
    controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),10*60*1000);
    try{file=await downloadInstaller({release,cacheDir,fetchImpl,signal:controller.signal,onProgress:progress=>emit({progress})});}finally{clearTimeout(timer);controller=null;}
    if(disposed)return snapshot();
    emit({status:'installing',progress:100});
    await launchInstaller(file,release.sha256);
    savePreferences({updatePromptDismissed:false,updatePromptOfferedVersion:release.version});
    emit({status:'launched'});
   }catch(error){if(file)await removePending(cacheDir,path.dirname(file));emit({status:'error',notice:false,error:['integrity','unsupported','manifest'].includes(error.message)?error.message:'download'});}
   finally{installJob=null;}
   return snapshot();
  });return installJob;
 }
 return {snapshot,check,install,later,clearNotice,dispose(){disposed=true;controller?.abort();},cleanup:()=>cleanupUpdates(cacheDir)};
}
function installerHandoffScript(file,digest,parentPid){
 if(!path.win32.isAbsolute(file)||!file.toLowerCase().endsWith('.exe')||!/^([a-f0-9]{64})$/i.test(digest)||!Number.isSafeInteger(parentPid)||parentPid<1)throw Error('source');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 return "$ErrorActionPreference='Stop'; $parent=Get-Process -Id "+parentPid+" -ErrorAction SilentlyContinue; if($parent -and -not $parent.WaitForExit(60000)){exit 1}; if((Get-FileHash -LiteralPath "+literal(file)+" -Algorithm SHA256).Hash -ne "+literal(digest)+"){exit 2}; Start-Process -FilePath "+literal(file)+" -ArgumentList '/S','--updated','--force-run' -WindowStyle Hidden";
}
async function launchWindowsInstaller(file,digest,{parentPid=process.pid,spawnImpl=require('child_process').spawn}={}){
 const script=installerHandoffScript(file,digest,parentPid);
 const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 await new Promise((resolve,reject)=>{
  const child=spawnImpl(executable,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{cwd:path.dirname(file),detached:true,stdio:'ignore',windowsHide:true});
  child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
 });
}
module.exports={installerHandoffScript,launchWindowsInstaller,createAppUpdates,releaseInfo,newer,downloadInstaller,cleanupUpdates,RELEASE_API,RELEASE_PAGE};
