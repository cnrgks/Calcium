'use strict';
const assert=require('assert');const {attachPrivateUBlock}=require('../private-ubo');
(async()=>{
 let listener;const lookups=[],batches=[];
 const background={executeJavaScript:async code=>{if(!code.startsWith('self.calciumPrivateFilter('))return;const batch=JSON.parse(code.slice('self.calciumPrivateFilter('.length,-1));batches.push(...batch);return batch.map(d=>d.url.includes('blocked') );}};
 const contents={fromId:id=>{assert(Number.isInteger(id)&&id>0,'Never pass missing/invalid IDs into Electron');lookups.push(id);if(id===7)return {isDestroyed:()=>false,getURL:()=> 'https://www.youtube.com/'};if(id===8)return {isDestroyed:()=>true,getURL:()=>{throw Error('Destroyed contents accessed');}};return null;}};
 await attachPrivateUBlock({webRequest:{onBeforeRequest:(_filter,fn)=>listener=fn}},()=>background,contents);
 const ids=[undefined,null,0,-1,NaN,1.5,'7',999,8,7];let completed=0;
 const answers=await Promise.all(ids.map((webContentsId,i)=>new Promise(resolve=>listener({webContentsId,url:'https://cdn.example/'+(i%2?'blocked':'allowed')+'.js',resourceType:'script',referrer:'https://www.youtube.com/'},decision=>{completed++;resolve(decision.cancel);}))));
 assert.equal(completed,ids.length);assert.deepEqual(lookups,[999,8,7]);assert.equal(batches.length,ids.length);assert(batches.every(d=>d.top==='https://www.youtube.com/'&&d.document==='https://www.youtube.com/'));assert.deepEqual(answers,ids.map((_,i)=>!!(i%2)));
 console.log('PASS: ownerless/invalid/destroyed webContents requests complete once, retain request context and remain filtered.');
})().catch(e=>{console.error(e);process.exitCode=1});
