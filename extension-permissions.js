'use strict';
// Conservative capability comparison: a changed match pattern requires approval,
// even when the new pattern may be narrower. Never silently approximate grants.
function capabilities(manifest){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Invalid extension manifest');
 const out=new Set();
 const list=(value,key)=>{if(value===undefined)return [];if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw Error('Invalid '+key);return value;};
 for(const key of ['permissions','optional_permissions','host_permissions','optional_host_permissions'])for(const item of list(manifest[key],key))out.add(key+':'+item);
 if(manifest.content_scripts!==undefined&&!Array.isArray(manifest.content_scripts))throw Error('Invalid content scripts');
 for(const cs of manifest.content_scripts||[]){
  if(!cs||typeof cs!=='object')throw Error('Invalid content script');
  const scope={};for(const key of ['matches','exclude_matches','include_globs','exclude_globs'])scope[key]=[...list(cs[key],key)].sort();
  for(const key of ['all_frames','match_about_blank','match_origin_as_fallback'])scope[key]=!!cs[key];
  scope.world=cs.world||'ISOLATED';scope.run_at=cs.run_at||'document_idle';
  out.add('content_script:'+JSON.stringify(scope));
 }
 if(manifest.externally_connectable!==undefined){const ec=manifest.externally_connectable;if(!ec||typeof ec!=='object')throw Error('Invalid externally_connectable');for(const key of ['matches','ids'])for(const item of list(ec[key],key))out.add('external:'+key+':'+item);if(ec.accepts_tls_channel_id)out.add('external:tls');}
 return out;
}
function assertPermissions(approved,installed){const before=capabilities(approved);const added=[...capabilities(installed)].filter(x=>!before.has(x));if(added.length)throw Error('Extension permissions changed; new approval required: '+added.join(', '));}
module.exports={capabilities,assertPermissions};
