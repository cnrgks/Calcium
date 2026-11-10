'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('savedApi',{call:(cmd,arg)=>ipcRenderer.invoke('saved-tabs',cmd,arg),onUpdate:fn=>ipcRenderer.on('saved-tabs-update',()=>fn()),onOpen:fn=>ipcRenderer.on('saved-popup-open',()=>fn())});
