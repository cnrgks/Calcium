'use strict';
const UI_FONTS=Object.freeze([
 {key:'default',name:'Varsayılan',family:null},
 {key:'arial',name:'Arial',family:'Arial'},
 {key:'tahoma',name:'Tahoma',family:'Tahoma'},
 {key:'verdana',name:'Verdana',family:'Verdana'},
 {key:'trebuchet',name:'Trebuchet MS',family:'Trebuchet MS'},
 {key:'georgia',name:'Georgia',family:'Georgia'},
 {key:'consolas',name:'Consolas',family:'Consolas'}
]);
const validUiFont=key=>UI_FONTS.some(font=>font.key===key);
const uiFontFamily=key=>{const font=UI_FONTS.find(font=>font.key===key);return font?.family?JSON.stringify(font.family)+', "Segoe UI", system-ui, sans-serif':null;};
module.exports={UI_FONTS,validUiFont,uiFontFamily};
