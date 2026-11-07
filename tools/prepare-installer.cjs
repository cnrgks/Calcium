'use strict';
// The pinned electron-builder one-click template normally opens a second,
// Windows-themed SpiderBanner. Keep the standard installation/uninstall flow,
// but render progress in Calcium's own themed MUI window instead.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),dir=path.join(root,'node_modules','app-builder-lib');
if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).version!=='26.18.0')throw Error('Review installer template before upgrading electron-builder');
const file=path.join(dir,'templates','nsis','installSection.nsh'),marker='# Calcium compact installer: use the themed MUI window.';
let source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
if(!source.includes(marker)){
 const start=source.indexOf('!ifdef ONE_CLICK\n  !ifdef HEADER_ICO'),end=source.indexOf('  !insertmacro CHECK_APP_RUNNING',start);
 if(start<0||end<0||!source.slice(start,end).includes('SpiderBanner::Show'))throw Error('Installer template changed');
 source=source.slice(0,start)+'!ifdef ONE_CLICK\n  '+marker+'\n'+source.slice(end);
 fs.writeFileSync(file,source);
}
if(!source.includes('Call CalciumWaitForUpdateParent')){
 const marker='!ifdef ONE_CLICK\n  # Calcium compact installer:';
 if(!source.includes(marker))throw Error('Installer wait insertion point changed');
 source=source.replace(marker,'Call CalciumWaitForUpdateParent\n\n'+marker);
 fs.writeFileSync(file,source);
}
console.log('Prepared compact themed installer UI.');
