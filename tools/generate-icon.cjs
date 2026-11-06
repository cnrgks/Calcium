'use strict';
// Render the authored vector with Chromium and produce Windows icon sizes.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('fs'),path=require('path'),ResEdit=require('resedit');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const root=path.join(__dirname,'..');
 const win=new BrowserWindow({show:false,transparent:true,backgroundColor:'#00000000',width:256,height:256,useContentSize:true,webPreferences:{sandbox:true,offscreen:true}});
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>body{margin:0;width:256px;height:256px;overflow:hidden}svg{display:block;width:256px;height:256px}</style>'+fs.readFileSync(path.join(root,'build','bone.svg'),'utf8')));
 await new Promise(r=>setTimeout(r,150));
 const png=(await win.webContents.capturePage()).toPNG();
 fs.writeFileSync(path.join(root,'icon.png'),png);fs.writeFileSync(path.join(root,'build','icon.png'),png);
 const image=nativeImage.createFromBuffer(png),ico=new ResEdit.Data.IconFile();
 ico.icons=[16,24,32,48,64,128,256].map(size=>{
  const resized=image.resize({width:size,height:size});
  if(size===256)return {data:ResEdit.Data.RawIconItem.from(resized.toPNG(),size,size,32)};
  const pixels=resized.toBitmap(),stride=size*4,maskStride=Math.ceil(size/32)*4;
  const dib=Buffer.alloc(40+pixels.length+maskStride*size);dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(pixels.length+maskStride*size,20);
  for(let y=0;y<size;y++){pixels.copy(dib,40+(size-1-y)*stride,y*stride,(y+1)*stride);for(let x=0;x<size;x++)if(pixels[y*stride+x*4+3]===0)dib[40+pixels.length+(size-1-y)*maskStride+(x>>3)]|=128>>(x&7);}
  return {data:ResEdit.Data.IconItem.from(size,size,dib)};
 });
 fs.writeFileSync(path.join(root,'build','icon.ico'),Buffer.from(ico.generate()));
 console.log('Generated Calcium bone PNG and ICO.');win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
