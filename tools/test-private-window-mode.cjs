'use strict';
const {app,screen}=require('electron'),fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert');
const profile=process.env.CALCIUM_PROFILE;if(!profile)throw Error('Use run-electron-tests');process.env.CALCIUM_TEST_MODE='1';process.env.CALCIUM_TEST_DISPLAY='0';app.disableHardwareAcceleration();fs.writeFileSync(path.join(profile,'ayarlar.json'),JSON.stringify({firstRunDone:true,language:'en'}));
const entry=path.resolve(__dirname,'..','main.js'),m=new Module(entry,module);m.filename=entry;m.paths=Module._nodeModulePaths(path.dirname(entry));m._compile(fs.readFileSync(entry,'utf8')+'\nmodule.exports.test={ready:mainBlockReady,windows:()=>windows,createWindow,placement:()=>settings.windowPlacement};',entry);
const pause=()=>new Promise(r=>setTimeout(r,50)),until=async fn=>{for(let i=0;i<120;i++){if(await fn())return;await pause();}throw Error('Private window mode timeout');};
(async()=>{
 await app.whenReady();const api=m.exports.test;await api.ready;await until(()=>api.windows()[0]?.tabs.length);const normal=api.windows()[0];normal.win.showInactive();
 for(const mode of ['maximized','fullscreen','normal']){
  normal.win.setFullScreen(false);await until(()=>!normal.win.isFullScreen());normal.win.unmaximize();await until(()=>!normal.win.isMaximized());
  if(mode==='maximized'){normal.win.maximize();await until(()=>normal.win.isMaximized());}
  if(mode==='fullscreen'){normal.win.setFullScreen(true);await until(()=>normal.win.isFullScreen());}
  await pause();const saved=JSON.stringify(api.placement()),display=screen.getDisplayMatching(normal.win.getBounds()).id;
  const privateWindow=api.createWindow({incognito:true});await until(()=>privateWindow.win.isFullScreen()===(mode==='fullscreen')&&(mode==='fullscreen'||privateWindow.win.isMaximized()===(mode==='maximized')));
  assert.equal(screen.getDisplayMatching(privateWindow.win.getBounds()).id,display,'same display');assert.equal(JSON.stringify(api.placement()),saved,'private window does not change saved normal placement');
  privateWindow.win.close();await until(()=>!api.windows().includes(privateWindow));
 }
 console.log('PASS: private windows inherit normal, maximized and F11 fullscreen modes on the same display without saving private placement.');app.exit(0);
})().catch(error=>{console.error(error);app.exit(1)});
