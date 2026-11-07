'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const isolated=process.argv.includes('--isolated');const label=process.argv[2];if(!/^(baseline|optimized)$/.test(label))throw Error('Use baseline or optimized');
const root=path.join(__dirname,'..'),output=path.join(root,'dist','ram-review');fs.mkdirSync(output,{recursive:true});
if(label==='baseline'&&!fs.existsSync(path.join(output,'baseline-main.js')))fs.writeFileSync(path.join(output,'baseline-main.js'),require('child_process').execFileSync('git',['show','ca83187:main.js'],{cwd:root}));
if(label==='optimized')fs.copyFileSync(path.join(root,'main.js'),path.join(output,'optimized-main.js'));
for(const tabs of [1,10,30])for(let run=1;run<=3;run++){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'calcium-memory-bench-'));
 fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,restoreSession:false,keepLogins:false,hoverZoom:false,language:'tr'}));
 const env={...process.env,CALCIUM_PROFILE:profile,CALCIUM_TEST_MODE:'1',CALCIUM_BENCH_TABS:String(tabs),CALCIUM_BENCH_OUTPUT:path.join(output,`${label}${isolated?'-isolated':''}-${tabs}-${run}.json`)};
 if(isolated)env.CALCIUM_NO_UBO='1';
 delete env.ELECTRON_RUN_AS_NODE;env.CALCIUM_BENCH_SOURCE=path.join(output,label+'-main.js');
 const p=spawnSync(require('electron'),[path.join(__dirname,'bench-memory.cjs')],{env,stdio:'inherit',timeout:120000,windowsHide:true});
 if(path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('calcium-memory-bench-'))throw Error('Unsafe cleanup');fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 if(p.status!==0)throw Error('Benchmark failed '+p.status+' '+(p.error?.message||''));
}
