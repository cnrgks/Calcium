'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
let locale='tr-TR';const context={settings:{language:'auto'},app:{getPreferredSystemLanguages:()=>[locale]}};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('let uiLangCache = null;'),source.indexOf('const T =')),context);
for(const [os,expected] of [['tr-TR','tr'],['tr','tr'],['en-US','en'],['de-DE','en'],['ar-SA','en'],['ja-JP','en'],['','en']]){locale=os;vm.runInContext('uiLangCache=null',context);assert.equal(context.uiLang(),expected,os);}
context.settings.language='en';locale='tr-TR';vm.runInContext('uiLangCache=null',context);assert.equal(context.uiLang(),'en');context.settings.language='tr';locale='de-DE';vm.runInContext('uiLangCache=null',context);assert.equal(context.uiLang(),'tr');
let request,check;const ctx={byWcId:new Map(),Set,Object,settings:{sitePerms:{}},incognito:false,incognitoPerms:{},normalizedOrigin:require('../device-policy').normalizedOrigin,PERM_TEXT:{media:{},notifications:{}},ses:{setPermissionRequestHandler:f=>request=f,setPermissionCheckHandler:f=>check=f},winOfWc:()=>null};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  const alwaysAllow = new Set('),source.indexOf('  setupDevices(ses,')),ctx);
assert.equal(check(null,'future-permission','https://a.example'),false);assert.equal(check(null,'media','https://a.example'),false);ctx.settings.sitePerms['https://a.example|media']=true;assert.equal(check(null,'media','https://a.example'),true);assert.equal(check(null,'media','https://b.example'),false);let answer;request(null,'future-permission',v=>answer=v,{});assert.equal(answer,false);
assert(!fs.readFileSync(path.join(__dirname,'..','welcome.html'),'utf8').includes('id="lang"'));
console.log('PASS: OS language fallback, explicit settings override, welcome without language picker and deny-by-default permission checks.');
