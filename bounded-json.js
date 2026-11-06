'use strict';
const fs=require('fs');
function readBoundedJson(file,maxBytes,fallback){
 let size;try{size=fs.statSync(file).size;}catch{return fallback;}
 if(size>maxBytes){
  // Preserve the original before defaults or an empty list can be written back.
  const backup=file+'.oversized-'+Date.now()+'.bak';
  fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
  console.warn('Profile file exceeds size limit; original preserved:',backup);
  return fallback;
 }
 try{const text=fs.readFileSync(file,'utf8');if(Buffer.byteLength(text,'utf8')>maxBytes)throw Error('Profile file grew while being read');return JSON.parse(text);}catch{return fallback;}
}
module.exports={readBoundedJson};
