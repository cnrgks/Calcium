'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function run(){
 const source=fs.readFileSync(path.join(__dirname,'../vendor/secure-web-store.js'),'utf8');
 const start=source.indexOf('async function handleWebStoreIpc('),end=source.indexOf('\n      });',start);
 assert(start>=0&&end>start);
 const session={},handlersMap=new Map([[session,async()=> 'accepted']]);
 const handler=vm.runInNewContext('('+source.slice(start,end)+'})',{WEBSTORE_URL:'https://chromewebstore.google.com',handlersMap,channel:'test',d3(){}});
 for(const origin of ['https://chromewebstore.google.com.attacker.example','http://chromewebstore.google.com','https://chromewebstore.google.com:444','null',undefined]){
  assert.equal(await handler({senderFrame:{origin},sender:{session}}),undefined,origin);
 }
 assert.equal(await handler({senderFrame:{origin:'https://chromewebstore.google.com'},sender:{session}}),'accepted');
 const preload=fs.readFileSync(path.join(__dirname,'../vendor/secure-web-store-preload.js'),'utf8');
 for(const url of ['https://chromewebstore.google.com.attacker.example/','http://chromewebstore.google.com/','https://chromewebstore.google.com:444/','https://chromewebstore.google.com/']){
  let exposed=0;
  const electron={contextBridge:{exposeInMainWorld(){exposed++;}},webFrame:{executeJavaScript(){}},ipcRenderer:{invoke:async()=>({})}};
  vm.runInNewContext(preload,{require:()=>electron,location:{href:url,origin:new URL(url).origin},navigator:{userAgent:'Chrome/145.0.0.0'},console:{debug(){}},process:{once(){}},window:{}});
  assert.equal(exposed>0,new URL(url).origin==='https://chromewebstore.google.com',url);
 }
 console.log('PASS: real Web Store IPC handler and preload reject lookalike origins and accept the store.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
