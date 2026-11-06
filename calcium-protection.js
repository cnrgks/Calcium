'use strict';
const fs=require('fs'),path=require('path'),{getDomain}=require('tldts');
const {readResponseBytes}=require('./bounded-fetch');
const TRACKER_SOURCE='https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/SpywareFilter/sections/tracking_servers.txt';
const MAX_LIST=2*1024*1024,DAY=24*60*60*1000;
function parseTrackerDomains(text){
 const deny=new Set(),allow=new Set();
 for(const raw of text.split(/\r?\n/)){
  // Only standalone domain rules are used. Rules with conditions, paths,
  // redirects, scripts or site exclusions are deliberately not approximated.
  const m=/^(@@)?\|\|([a-z0-9.-]+)\^(?:\$(?:third-party|3p))?$/.exec(raw.trim());
  if(!m||m[2].length>253||!m[2].includes('.')||m[2].includes('..'))continue;
  (m[1]?allow:deny).add(m[2]);
 }
 return {deny,allow};
}
function matches(set,host){for(let h=host;h.includes('.');h=h.slice(h.indexOf('.')+1))if(set.has(h))return true;return false;}
const siteOf=h=>getDomain(h,{allowPrivateDomains:true})||h;
function cleanTrackingUrl(raw){
 try{const u=new URL(raw);if(!/^https?:$/.test(u.protocol))return raw;
  const keys=[...u.searchParams.keys()];if(keys.some(k=>/^(x-amz-signature|x-goog-signature|signature|sig|hmac|oauth_signature)$/i.test(k)))return raw;
  let changed=false;for(const k of keys)if(/^(utm_(source|medium|campaign|term|content|id|source_platform|creative_format|marketing_tactic)|fbclid|gclid|dclid|msclkid|gbraid|wbraid|mc_cid|mc_eid)$/i.test(k)){u.searchParams.delete(k);changed=true;}
  return changed?u.href:raw;
 }catch{return raw;}
}
function createCalciumProtection({root,profile,fetchImpl=fetch}){
 const file=path.join(profile,'calcium-trackers.txt'),bundled=path.join(root,'vendor','protection','tracking-servers.txt');
 let sets={deny:new Set(),allow:new Set()},updatedAt=0,lastError=null,inFlight=null;
 for(const candidate of [file,bundled])try{const st=fs.statSync(candidate);if(st.size>MAX_LIST)continue;const parsed=parseTrackerDomains(fs.readFileSync(candidate,'utf8'));if(parsed.deny.size<100)continue;sets=parsed;updatedAt=st.mtimeMs;break;}catch{}
 return {
  shouldBlock(url,topUrl,type){
   if(type==='mainFrame')return false;
   try{const request=new URL(url),top=new URL(topUrl);if(!/^(https?|wss?):$/.test(request.protocol)||!/^https?:$/.test(top.protocol))return false;
    if(!matches(sets.deny,request.hostname)||matches(sets.allow,request.hostname))return false;
    return siteOf(request.hostname)!==siteOf(top.hostname);
   }catch{return false;}
  },
  stats:()=>({domains:sets.deny.size,updatedAt,lastError}),
  refresh({force=false}={}){
   if(inFlight)return inFlight;
   if(!force&&Date.now()-updatedAt<DAY)return Promise.resolve(true);
   inFlight=(async()=>{try{const r=await fetchImpl(TRACKER_SOURCE,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const text=(await readResponseBytes(r,MAX_LIST)).toString('utf8'),parsed=parseTrackerDomains(text);if(parsed.deny.size<100||parsed.deny.size>20000)throw Error('Invalid tracker list');
    fs.mkdirSync(profile,{recursive:true});await fs.promises.writeFile(file+'.tmp',text);await fs.promises.rename(file+'.tmp',file);sets=parsed;updatedAt=Date.now();lastError=null;return true;
   }catch(e){lastError=e.message;return false;}finally{inFlight=null;}})();return inFlight;
  }
 };
}
module.exports={createCalciumProtection,parseTrackerDomains,cleanTrackingUrl,TRACKER_SOURCE};
