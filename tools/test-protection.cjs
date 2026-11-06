'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {parseTrackerDomains,createCalciumProtection,cleanTrackingUrl}=require('../calcium-protection');
const {siteOfHost}=require('../site-data');
(async()=>{
 const parsed=parseTrackerDomains('||tracker.test^$third-party\n@@||safe.tracker.test^\n||conditional.test^$third-party,domain=~site.test\n||path.test/path^\n! comment');
 assert(parsed.deny.has('tracker.test'));assert(!parsed.deny.has('conditional.test'));assert(!parsed.deny.has('path.test'));
 assert.equal(siteOfHost('login.example.co.uk'),'example.co.uk');assert.notEqual(siteOfHost('alice.github.io'),siteOfHost('bob.github.io'));
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'calcium-protection-test-'));
 try{
  const list='||tracker.test^$third-party\n@@||safe.tracker.test^\n'+Array.from({length:101},(_,i)=>'||old'+i+'.test^').join('\n');
  fs.mkdirSync(path.join(tmp,'vendor','protection'),{recursive:true});fs.writeFileSync(path.join(tmp,'vendor','protection','tracking-servers.txt'),list);
  let current=Array.from({length:101},(_,i)=>'||new'+i+'.test^$third-party').join('\n'),calls=0;
  const p=createCalciumProtection({root:tmp,profile:path.join(tmp,'profile'),fetchImpl:async()=>{calls++;return new Response(current)}});
  assert(p.shouldBlock('https://cdn.tracker.test/a.js','https://site.test/','script'));
  assert(!p.shouldBlock('https://tracker.test/','https://site.test/','mainFrame'));
  assert(!p.shouldBlock('https://tracker.test/a.js','https://login.tracker.test/','script'));
  assert(!p.shouldBlock('https://nottracker.test/a.js','https://site.test/','script'));
  assert(!p.shouldBlock('https://safe.tracker.test/a.js','https://site.test/','script'));
  assert(!p.shouldBlock('https://tracker.test/a.js','file:///internal.html','script'));
  await p.refresh();assert.equal(calls,0,'fresh data does not trigger network requests');
  assert(await p.refresh({force:true}));assert(!p.shouldBlock('https://tracker.test/a','https://site.test/','script'),'stale domains are retired');assert(p.shouldBlock('https://new1.test/a','https://site.test/','script'));
  current='<html>error</html>';assert(!await p.refresh({force:true}));assert(p.shouldBlock('https://new1.test/a','https://site.test/','script'),'failed updates preserve working filters');
 }finally{const resolved=path.resolve(tmp);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('calcium-protection-test-'))throw Error('Unsafe test cleanup');fs.rmSync(resolved,{recursive:true,force:true});}
 assert.equal(cleanTrackingUrl('https://site.test/p?utm_source=x&fbclid=y&keep=1#frag'),'https://site.test/p?keep=1#frag');
 const signed='https://site.test/p?utm_source=x&X-Amz-Signature=abc';assert.equal(cleanTrackingUrl(signed),signed);
 const login='https://site.test/?code=abc&state=xyz&redirect_uri=https%3A%2F%2Fother.test';assert.equal(cleanTrackingUrl(login),login);
 console.log('PASS: lightweight third-party filtering, PSL/private suffixes, exceptions, signed URLs and atomic list refresh.');
})().catch(e=>{console.error(e);process.exitCode=1});
