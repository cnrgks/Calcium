'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');const root=path.join(__dirname,'..'),base=fs.readFileSync('dist/idle-review/profile-path.txt','utf8').trim();
if(path.dirname(path.resolve(base))!==path.resolve(os.tmpdir())||!path.basename(base).startsWith('calcium-idle-bench-'))throw Error('Unexpected test profile');
for(const variant of process.argv.includes('--early')?['early']:['normal','compact']){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'calcium-idle-warm-'));fs.cpSync(base,profile,{recursive:true});
 const env={...process.env,CALCIUM_PROFILE:profile,CALCIUM_TEST_MODE:'1',CALCIUM_TEST_DISPLAY:'0',CALCIUM_IDLE_OUTPUT:path.join(root,'dist/idle-review/'+variant+'-warm.json'),CALCIUM_IDLE_SOURCE:path.join(root,'dist/idle-review/baseline-main.js')};delete env.ELECTRON_RUN_AS_NODE;if(variant==='compact')env.CALCIUM_IDLE_SIZE='1';else delete env.CALCIUM_IDLE_SIZE;if(variant==='early')env.CALCIUM_IDLE_EARLY='1';else delete env.CALCIUM_IDLE_EARLY;
 const p=spawnSync(require('electron'),[path.join(__dirname,'bench-idle.cjs')],{env,stdio:'inherit',windowsHide:true,timeout:150000});
 if(path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('calcium-idle-warm-'))throw Error('Unsafe cleanup');fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});if(p.status!==0)throw Error('Warm comparison failed '+p.status);
}
