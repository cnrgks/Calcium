'use strict';
const path=require('node:path');
const fs=require('node:fs');
function parsed(value){try{if(typeof value!=='string'||value.length>128*1024||/[\x00-\x1f\x7f]/.test(value))return null;return new URL(value);}catch{return null;}}
function webOpenable(value,source='',image=false){
 const u=parsed(value),from=parsed(source);if(!u)return false;
 if(['http:','https:'].includes(u.protocol))return true;
 if(u.href==='about:blank')return true;
 if(u.protocol==='blob:')return !!from&&u.origin!=='null'&&u.origin===from.origin;
 if(u.protocol==='chrome-extension:')return !!from&&from.protocol===u.protocol&&from.host===u.host;
 return image&&/^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,[a-z0-9+/=]+$/i.test(value);
}
function extensionOpenable(value,extensionId){const u=parsed(value);return !!u&&(['http:','https:'].includes(u.protocol)||u.href==='about:blank'||u.protocol==='chrome-extension:'&&(!extensionId||u.hostname===extensionId));}
// Explicitly supported desktop handoffs. Unknown protocols fail closed.
function externalScheme(value){const u=parsed(value);if(!u)return null;const scheme=u.protocol.slice(0,-1).toLowerCase();return ['mailto','tel','sms','zoommtg','zoomus','msteams','slack','discord','spotify','steam'].includes(scheme)?scheme:null;}
function riskyDownload(file){return /\.(exe|msi|msp|msix|msixbundle|appx|appxbundle|com|scr|pif|cpl|hta|lnk|url|website|scf|js|jse|vbs|vbe|wsf|wsh|ps1|psm1|psd1|bat|cmd|reg|inf|iso|img|vhd|vhdx|jar|application|gadget|chm|dmg|pkg|app|command|sh|desktop)$/i.test(path.basename(file).replace(/[. ]+$/,''));}
async function markDownloadedFile(file){if(process.platform==='win32')await fs.promises.writeFile(file+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\n',{encoding:'utf8'});}
module.exports={webOpenable,extensionOpenable,externalScheme,riskyDownload,markDownloadedFile};
