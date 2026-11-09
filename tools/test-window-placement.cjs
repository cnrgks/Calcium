'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const first={id:1,workArea:{x:0,y:0,width:1920,height:1040}},second={id:2,workArea:{x:1920,y:0,width:2560,height:1400}};
let saves=0;const ctx={settings:{},W:null,htmlFullscreen:false,screen:{getAllDisplays:()=>[first,second],getPrimaryDisplay:()=>first,getDisplayMatching:b=>b.x>=1920?second:first},saveSettings:()=>saves++};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function windowPlacement(w)'),source.indexOf('function createWindow(opts')),ctx);
function fixture(){return {incognito:false,win:{bounds:{x:2200,y:100,width:800,height:600},max:false,full:false,isDestroyed:()=>false,getBounds(){return this.bounds},isMaximized(){return this.max},isFullScreen(){return this.full},setBounds(b){this.bounds=b},maximize(){this.max=true},unmaximize(){this.max=false},setFullScreen(b){this.full=b}}};}
const w=fixture();ctx.W=w;w.win.max=true;ctx.rememberWindowPlacement(w);assert.equal(ctx.settings.windowPlacement.displayId,2);assert.equal(ctx.settings.windowPlacement.maximized,true);assert.deepEqual(Object.keys(ctx.settings.windowPlacement).sort(),['displayId','fullscreen','maximized']);
w.win.full=true;ctx.rememberWindowPlacement(w);assert(ctx.settings.windowPlacement.fullscreen);assert(ctx.settings.windowPlacement.maximized);
const restored=fixture();ctx.applyWindowPlacement(restored,ctx.settings.windowPlacement);assert.equal(restored.win.bounds.x,2560);assert.equal(restored.win.bounds.width,1280);assert(restored.win.full&&restored.win.max);
ctx.applyWindowPlacement(restored,{displayId:999,maximized:false,fullscreen:false});assert.equal(restored.win.bounds.x,320);assert(!restored.win.full&&!restored.win.max);
const before=JSON.stringify(ctx.settings);w.placement=ctx.settings.windowPlacement;ctx.htmlFullscreen=true;ctx.rememberWindowPlacement(w);assert.equal(JSON.stringify(ctx.settings),before,'video fullscreen does not replace browser preference');
const privateWindow=fixture();privateWindow.incognito=true;const count=saves;ctx.rememberWindowPlacement(privateWindow);assert.equal(saves,count,'private window does not overwrite persisted preference');
console.log('PASS: monitor selection, maximized/F11 restore, missing-monitor fallback, default normal dimensions, video and private-window exclusion.');
