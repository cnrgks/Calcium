'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert');
const {installOverlayScrollbars}=require('../overlay-scrollbar');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{offscreen:true,backgroundThrottling:false}});
 await win.loadURL('about:blank');
 await win.webContents.executeJavaScript(`document.body.innerHTML='<style>#panel{position:absolute;left:0;top:0;width:240px;height:300px;overflow:auto;transition:transform .3s linear}#wrapper{position:relative;width:80px;height:80px}img{width:80px;height:80px}#cover{position:absolute;inset:0}</style><div id="panel"><div style="height:1200px"></div></div><div id="wrapper" style="position:absolute;left:300px;top:100px"><div><div><img src="https://example.com/avatar.png"></div></div></div>';`);
 await win.webContents.executeJavaScript(`(${installOverlayScrollbars})(css=>{const s=document.createElement('style');s.textContent=css;document.head.append(s)});document.querySelector('#panel').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,composed:true}));`);
 const samples=await win.webContents.executeJavaScript(`(async()=>{await new Promise(r=>setTimeout(r,60));const panel=document.querySelector('#panel'),bar=document.querySelector('[data-calcium-scrollbar="panel"]');const samples=[];for(const transform of ['translateX(-200px)','translateX(0)']){panel.style.transform=transform;for(let i=0;i<9;i++){await new Promise(requestAnimationFrame);samples.push(Math.abs(bar.getBoundingClientRect().right-panel.getBoundingClientRect().right));}await new Promise(r=>setTimeout(r,340));}return samples})()`);
 assert(samples.length===18 && samples.every(n=>n<20),`scrollbar follows panel: ${samples}`);
 // Expose only the resolver for focused DOM regression checks; production remains isolated.
 const source=fs.readFileSync(path.join(__dirname,'..','hoverzoom.js'),'utf8');
 await win.webContents.executeJavaScript(source.replaceAll('location.hostname',"'www.youtube.com'").replace('  // ---- Display layer', '  window.testImageAt = imageAt; window.testUpgrade = upgrade; window.testYoutube = youtubeThumbnail; window.testHoverState=()=>({target,timer});\n  // ---- Display layer'));
 assert.equal(await win.webContents.executeJavaScript(`testUpgrade('https://yt3.googleusercontent.com/avatar=s88-c-k-c0x00ffffff-no-rj')`),'https://yt3.googleusercontent.com/avatar=s800-c-k-c0x00ffffff-no-rj','YouTube avatars request larger source');
 assert.equal(await win.webContents.executeJavaScript(`testImageAt(document.querySelector('#wrapper'),320,120)?.tagName`),'IMG','nested wrapper finds its image');
 assert.equal(await win.webContents.executeJavaScript(`testImageAt(document.querySelector('#wrapper'),500,120)`),null,'unrelated area does not select image');
 assert.equal(await win.webContents.executeJavaScript(`(()=>{const host=document.createElement('div');document.querySelector('#wrapper').append(host);host.attachShadow({mode:'open'}).innerHTML='<div><img style="position:fixed;left:500px;top:100px;width:80px;height:80px"></div>';return testImageAt(host,520,120)?.tagName})()`),'IMG','open shadow wrapper finds image');
 const youtube=await win.webContents.executeJavaScript(`(()=>{
   const card=document.createElement('ytd-rich-item-renderer');card.style.cssText='position:absolute;left:300px;top:250px;width:300px;height:170px';
   card.innerHTML='<a id="thumbnail" href="https://www.youtube.com/watch?v=abcdefghijk" style="display:block;width:300px;height:170px"><img style="display:none" src="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"><video style="width:300px;height:170px"></video><div id="preview" style="position:absolute;inset:0"></div></a>';
   document.body.append(card);const preview=card.querySelector('#preview'),video=card.querySelector('video');
   const p=testYoutube(preview,320,270);preview.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,composed:true,clientX:320,clientY:270}));
   const before=testHoverState();preview.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,clientX:320,clientY:270}));preview.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:video}));video.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,composed:true,clientX:320,clientY:270}));
   return {url:p?.candidate.url,fallback:p?.candidate.next.url,stable:testHoverState().target===card&&testHoverState().timer===before.timer,outside:testYoutube(preview,700,500)===null};
 })()`);
 assert.equal(youtube.url,'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg');assert.equal(youtube.fallback,'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');assert(youtube.stable,'preview subtree swaps retain hover timer');assert(youtube.outside,'other cards are not selected');
 const playback=await win.webContents.executeJavaScript(`(()=>{
   const player=document.createElement('div');player.id='movie_player';player.style.cssText='position:absolute;left:0;top:320px;width:280px;height:180px';
   player.innerHTML='<a href="https://www.youtube.com/watch?v=abcdefghijk"><img style="width:280px;height:180px" src="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"></a><video style="position:absolute;inset:0"></video>';
   document.body.append(player);const image=player.querySelector('img');image.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,composed:true,clientX:50,clientY:350}));
   return {candidate:testYoutube(image,50,350),target:testHoverState().target,timer:testHoverState().timer,recommendations:!!testYoutube(document.querySelector('#preview'),320,270)};
 })()`);
 assert.equal(playback.candidate,null,'main playback thumbnail is excluded');assert.equal(playback.target,null);assert.equal(playback.timer,0,'playback schedules no zoom');assert(playback.recommendations,'recommendation preview still resolves beside the player');
 win.destroy();console.log('PASS: panel scrollbar animation and nested hover image discovery');app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
