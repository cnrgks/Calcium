'use strict';
const {spawn}=require('child_process');const path=require('path'),fs=require('fs'),os=require('os');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
(async()=>{const executable=require('electron');for(const script of ['test-background-tabs.cjs','test-zen-features.cjs','test-taskmanager.cjs','test-scrollbar.cjs','test-startup.cjs']){const profile=script==='test-startup.cjs'?fs.mkdtempSync(path.join(os.tmpdir(),'calcium-startup-test-')):null;
 const childEnv=profile?{...env,CALCIUM_PROFILE:profile}:env;
 const code=await new Promise((resolve,reject)=>{const p=spawn(executable,[path.join(__dirname,script)],{stdio:'inherit',env:childEnv,cwd:path.join(__dirname,'..')});p.on('exit',resolve);p.on('error',reject);});if(profile){if(path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('calcium-startup-test-'))throw Error('Unsafe test profile cleanup');fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}if(code)process.exit(code);}})().catch(e=>{console.error(e);process.exit(1)});
