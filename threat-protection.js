'use strict';
const fs=require('fs'),path=require('path');const {readResponseBytes}=require('./bounded-fetch');
// A local, conservative domain layer using the malicious-site lists already bundled with uBO.
// Browsing URLs are never submitted to a reputation service.
function parseHosts(text){const deny=new Set(),allow=new Set();for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line[0]==='!')continue;const filter=/^(@@)?\|\|([a-z0-9.-]+)\^(?:\$(?:doc|document|all))?$/.exec(line);const host=filter?filter[2]:/^[a-z0-9.-]+$/.test(line)?line:null;if(!host||host.length>253||!host.includes('.')||host.includes('..'))continue;(filter?.[1]?allow:deny).add(host.toLowerCase());}return {deny,allow};}
function createThreatProtection({root,profile,fetchImpl=fetch}){
 const file=path.join(profile,'malware-hosts.txt');let sets={deny:new Set(),allow:new Set()};
 const add=text=>{const parsed=parseHosts(text);for(const h of parsed.deny)sets.deny.add(h);for(const h of parsed.allow)sets.allow.add(h);};
 const badware=path.join(root,'vendor','ublock','assets','ublock','badware.min.txt');
 let base='';try{base=fs.readFileSync(badware,'utf8');}catch{}
 const bundled=path.join(root,'vendor','ublock','assets','thirdparties','urlhaus-filter','urlhaus-filter-online.txt');
 let dynamic='';for(const f of [file,bundled])try{if(fs.statSync(f).size<=16*1024*1024){const text=fs.readFileSync(f,'utf8');if(parseHosts(text).deny.size){dynamic=text;break;}}}catch{}
 add(base);add(dynamic);
 const matches=(set,host)=>{for(let h=host;h.includes('.');h=h.slice(h.indexOf('.')+1))if(set.has(h))return true;return false;};
 return {isBlocked(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)&&!matches(sets.allow,u.hostname)&&matches(sets.deny,u.hostname);}catch{return false;}},async refresh(){try{const r=await fetchImpl('https://malware-filter.gitlab.io/urlhaus-filter/urlhaus-filter-ag-online.txt',{signal:AbortSignal.timeout(15000)});if(!r.ok)return false;const text=(await readResponseBytes(r,16*1024*1024)).toString('utf8');if(parseHosts(text).deny.size<100)return false;fs.mkdirSync(profile,{recursive:true});await fs.promises.writeFile(file+'.tmp',text);await fs.promises.rename(file+'.tmp',file);sets={deny:new Set(),allow:new Set()};add(base);add(text);return true;}catch{return false;}}};
}
module.exports={parseHosts,createThreatProtection};
