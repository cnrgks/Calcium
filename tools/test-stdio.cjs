'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),{spawn}=require('child_process');
const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const header=source.slice(0,source.indexOf('/*'));
const child=spawn(process.execPath,['-e',header+`;process.stdout.on('error',e=>{if(e.code==='EPIPE')process.stderr.write('handled');});let n=0;const timer=setInterval(()=>{console.log('fixture');if(++n===10)clearInterval(timer);},20);`],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let errors='';child.stderr.on('data',data=>errors+=data);child.stdout.destroy();
child.on('error',e=>{throw e;});
child.on('close',code=>{assert.equal(code,0,errors);assert(errors.includes('handled'),'exercise a real closed output pipe');console.log('PASS: closing the output reader does not crash the application logging path.');});
