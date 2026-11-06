'use strict';
const fs=require('fs'),path=require('path');
exports.default=async context=>{
 const resources=path.join(context.appOutDir,'resources');
 for(const name of ['electron-chrome-extensions','electron-chrome-web-store','adm-zip','debug','ms','pbf','protocol-buffers-schema','resolve-protobuf-schema','tldts','tldts-core']){
  if(!fs.existsSync(path.join(resources,'node_modules',name,'package.json')))throw Error('Packaged runtime dependency missing: '+name);
 }
 return require('./vmp-imza').afterSignWin(context);
};
