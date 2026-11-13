'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createAppUpdates,releaseInfo,newer,RELEASE_API,cleanupUpdates,windowsInstallerArguments,launchWindowsInstaller,waitForInstallerReady}=require('../app-updates');
const exe=Buffer.alloc(4096,42);exe.write('MZ');const digest=crypto.createHash('sha256').update(exe).digest('hex');
function manifest(version='1.3.7'){return {tag_name:'v'+version,draft:false,prerelease:false,assets:[{name:'Calcium-Setup-'+version+'.exe',state:'uploaded',size:exe.length,digest:'sha256:'+digest,browser_download_url:'https://github.com/cnrgks/Calcium/releases/download/v'+version+'/Calcium-Setup-'+version+'.exe'}]};}
const guard=p=>Promise.race([p,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Update job stalled')),3000);timer.unref();})]);
(async()=>{
 assert(newer('1.10.0','1.9.99'));assert(!newer('1.3.6','1.3.6'));assert(!newer('1.3.7-beta','1.3.6'));
 assert.equal(releaseInfo(manifest('1.3.6'),'1.3.6'),null);
 for(const change of [m=>m.draft=true,m=>m.assets[0].digest=null,m=>m.assets[0].browser_download_url='https://evil.example/update.exe',m=>m.assets[0].size=Number.MAX_SAFE_INTEGER]){const m=manifest();change(m);assert.throws(()=>releaseInfo(m,'1.3.6'),/manifest/);}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'calcium-updates-test-'));
 const token='a'.repeat(64),args=windowsInstallerArguments('C:\\test\\installer.exe',{appPath:"C:\\O'Connor installed app\\Calcium.exe",parentPid:1234,token});assert(args.includes('--updated'));assert(args.includes('--force-run'));assert(!args.includes('/S'));assert.equal(args.at(-1),"/D=C:\\O'Connor installed app");assert.throws(()=>windowsInstallerArguments('relative.exe',{parentPid:1,token}));assert.throws(()=>windowsInstallerArguments('C:\\test.exe',{appPath:'C:\\Calcium.exe',parentPid:1,token:'../bad'}));
 const fake=path.join(root,'installer.exe');fs.writeFileSync(fake,exe);let helperStarted=false;
 for(const appPath of ['C:\\project\\node_modules\\electron\\dist\\Calcium.exe','C:/project/node_modules/electron/dist/electron.exe'])assert.throws(()=>windowsInstallerArguments('C:\\test\\installer.exe',{appPath,parentPid:1234,token}),/unsupported/,'updates must never overwrite a development Electron runtime');
 await launchWindowsInstaller(fake,digest,{parentPid:1234,appPath:'C:\\test\\Calcium.exe',waitForReadyImpl:async(_child,options)=>{assert.equal(options.token.length,64);assert(options.readyFile.includes('update-ready-'));},spawnImpl:(command,args,options)=>{assert.equal(command,fake);assert.equal(options.windowsHide,false);assert(options.detached);assert(options.windowsVerbatimArguments);assert(args.at(-1).startsWith('/D='));helperStarted=true;const child=new(require('events').EventEmitter)();child.unref=()=>{};child.kill=()=>{};process.nextTick(()=>child.emit('spawn'));return child;}});assert(helperStarted);
 const readyFile=path.join(root,'ready.txt');await assert.rejects(waitForInstallerReady({exitCode:0},{readyFile,token,timeoutMs:10}),/launch/);fs.writeFileSync(readyFile,token);await waitForInstallerReady({exitCode:null},{readyFile,token,timeoutMs:100});fs.writeFileSync(readyFile,'b'.repeat(64));await assert.rejects(waitForInstallerReady({exitCode:null},{readyFile,token,timeoutMs:10}),/launch/);
 await assert.rejects(launchWindowsInstaller(fake,'0'.repeat(64),{appPath:'C:\\test\\Calcium.exe',spawnImpl:()=>{throw Error('must not execute tampered installer');}}),/integrity/);
 let prefs={},metadata=0,downloads=0,launches=0;let next=manifest();
 const fetchImpl=async(url,options)=>{assert.equal(options.credentials,'omit');if(url===RELEASE_API){metadata++;return new Response(JSON.stringify(next));}downloads++;return new Response(exe,{headers:{'content-length':String(exe.length)}});};
 const make=(extra={})=>createAppUpdates({currentVersion:'1.3.6',cacheDir:path.join(root,'cache'),fetchImpl,canInstall:true,readPreferences:()=>prefs,savePreferences:patch=>Object.assign(prefs,patch),launchInstaller:async file=>{launches++;assert.equal(path.dirname(path.dirname(file)),path.join(root,'cache'));assert.deepEqual(fs.readFileSync(file),exe);},...extra});
 try{
  let u=make();const first=u.check({manual:false});assert.equal(first,u.check({manual:false}));await guard(first);assert.equal(metadata,1);assert(u.snapshot().notice);assert.equal(downloads,0,'checking never downloads executable files');
  u.later();assert.equal(prefs.updatePromptDismissed,true);assert(!u.snapshot().notice);u.dispose();
  u=make();next=manifest('2.0.0');await u.check({manual:false});assert.equal(metadata,1,'Later suppresses startup checks across launches and future releases');
  await guard(u.check());assert.equal(metadata,2);assert.equal(u.snapshot().version,'2.0.0');assert(!u.snapshot().notice);assert.equal(prefs.updatePromptDismissed,true,'manual check does not revoke Later');
  const install=u.install();assert.equal(install,u.install());await guard(install);assert.equal(downloads,1);assert.equal(launches,1);assert.equal(prefs.updatePromptDismissed,false,'only approved successful install enables future prompts');assert.equal(u.snapshot().status,'launched');u.dispose();
  await cleanupUpdates(path.join(root,'cache'));assert.deepEqual(fs.readdirSync(path.join(root,'cache')),[]);
  const active=path.join(root,'cache','pending-active');fs.mkdirSync(active);const statusFile=path.join(active,'update-status.json');fs.writeFileSync(statusFile,JSON.stringify({status:'installing'}));await cleanupUpdates(path.join(root,'cache'));assert(fs.existsSync(active),'early browser restart cannot remove active installation');fs.utimesSync(statusFile,new Date(0),new Date(0));await cleanupUpdates(path.join(root,'cache'));assert(!fs.existsSync(active),'stale installer staging is eventually removed');
  // Direct Update, without a prior check, must not await its own install promise.
  u=make();await guard(u.install());assert.equal(launches,2);u.dispose();await cleanupUpdates(path.join(root,'cache'));
  let requestCount=0;u=make({fetchImpl:async(url,options)=>{requestCount++;if(url===RELEASE_API)return fetchImpl(url,options);return new Response(Buffer.alloc(exe.length,7));}});await guard(u.install());assert.equal(u.snapshot().error,'integrity');assert.equal(launches,2);assert.deepEqual(fs.readdirSync(path.join(root,'cache')),[]);u.dispose();
  u=make({fetchImpl:async(url,options)=>url===RELEASE_API?fetchImpl(url,options):new Response(null,{status:302,headers:{location:'http://127.0.0.1/unsafe.exe'}})});await guard(u.install());assert.equal(u.snapshot().status,'error');assert.equal(launches,2);u.dispose();
  u=make({launchInstaller:async()=>{throw Error('blocked helper');}});await guard(u.install());assert.equal(u.snapshot().error,'launch');u.dispose();
  const oldDownloads=downloads;u=make({canInstall:false});await guard(u.install());assert.equal(u.snapshot().error,'unsupported');assert.equal(downloads,oldDownloads);u.dispose();
  prefs={};u=make();const a=u.check({manual:false}),b=u.check({manual:true});assert.equal(a,b);await guard(a);assert(!u.snapshot().notice,'manual check joining startup does not produce a popup');const beforeAuto=metadata;await u.check({manual:false});assert.equal(metadata,beforeAuto,'startup does not repeat a manual check in the same session');u.dispose();
  prefs={};u=make();await u.check({manual:false});assert(u.snapshot().notice);u.clearNotice();u.dispose();u=make();await u.check({manual:false});assert(!u.snapshot().notice,'same release is not offered repeatedly');u.dispose();
  console.log('PASS: startup/manual checks, permanent Later, no surprise downloads, coalescing, version/asset validation, SHA-256/PE/redirect rejection and safe installer launch boundary.');
 }finally{
  const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('calcium-updates-test-'))throw Error('Unsafe cleanup');fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
