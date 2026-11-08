'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const hash=bytes=>'sha256-'+crypto.createHash('sha256').update(bytes).digest('base64');
for(const name of ['ui','newtab','welcome','history','downloads','settings','extensions','taskmanager','securitywarning','update-notice']){
 const file=path.join(root,name+'.html');let html=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');const hashes=new Set();
 html=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,code)=>{
  const src=/\bsrc="([^"]+)"/.exec(attrs);
  if(src){if(!/^[a-z0-9-]+\.js$/i.test(src[1]))throw Error('Unreviewed script source: '+src[1]);const digest=hash(fs.readFileSync(path.join(root,src[1])));hashes.add(digest);return '<script'+attrs.replace(/\s+integrity="[^"]*"/g,'')+' integrity="'+digest+'"></script>';}
  hashes.add(hash(code));return tag;
 });
 if(!hashes.size)throw Error('No scripts: '+name);
 html=html.replace(/script-src\s+[^;"<>]+/g,'script-src '+[...hashes].map(h=>"'"+h+"'").join(' '));
 fs.writeFileSync(file,html);
}
