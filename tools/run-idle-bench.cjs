'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');const root=path.join(__dirname,'..');
fs.mkdirSync(path.join(root,'dist/idle-review'),{recursive:true});
let baseline=fs.readFileSync(path.join(root,'main.js'),'utf8');const flagStart=baseline.indexOf('// Let V8 return temporary');if(flagStart>=0){const flagEnd=baseline.indexOf('\n[',flagStart);if(flagEnd<0)throw Error('Cannot isolate idle setting');baseline=baseline.slice(0,flagStart)+baseline.slice(flagEnd+1);}
fs.writeFileSync(path.join(root,'dist/idle-review/baseline-main.js'),baseline);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'calcium-idle-bench-'));fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'en',keepLogins:false}));
const env={...process.env,CALCIUM_PROFILE:profile,CALCIUM_TEST_MODE:'1',CALCIUM_TEST_DISPLAY:'0',CALCIUM_IDLE_OUTPUT:path.join(root,'dist/idle-review/baseline-cold.json'),CALCIUM_IDLE_SOURCE:path.join(root,'dist/idle-review/baseline-main.js')};delete env.ELECTRON_RUN_AS_NODE;
fs.writeFileSync(path.join(root,'dist/idle-review/profile-path.txt'),profile);
const result=spawnSync(require('electron'),[path.join(__dirname,'bench-idle.cjs')],{env,stdio:'inherit',windowsHide:true,timeout:150000});if(result.status!==0)throw Error('Idle benchmark failed '+result.status);
