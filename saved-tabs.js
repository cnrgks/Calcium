'use strict';
const fs=require('fs'),{randomUUID}=require('crypto');
const validUrl=url=>typeof url==='string'&&url.length<=32768&&/^https?:\/\//i.test(url)&&(()=>{try{return !!new URL(url).hostname;}catch{return false;}})();
class SavedTabs {
 constructor(file,onChange){this.file=file;this.onChange=onChange;this.data={groups:[]};if(fs.existsSync(file)){const stat=fs.statSync(file);if(stat.size>32*1024*1024)throw Error('Sekme arşivi çok büyük.');const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(data.groups))throw Error('Sekme arşivi okunamadı.');this.data=data;}for(const g of this.data.groups){g.locked=false;g.starred=false;}}
 change(fn){const next=structuredClone(this.data);const result=fn(next);const json=JSON.stringify(next);if(Buffer.byteLength(json)>32*1024*1024)throw Error('Sekme arşivi dolu.');fs.writeFileSync(this.file+'.tmp',json,{encoding:'utf8',flush:true});fs.renameSync(this.file+'.tmp',this.file);this.data=next;this.onChange?.();return result;}
 store(items,name='',destination){const links=items.filter(t=>validUrl(t.url)).map(t=>({id:randomUUID(),url:t.url,title:String(t.title||t.url).slice(0,2048)}));if(!links.length)throw Error('Kaydedilecek sekme yok.');return this.change(d=>{let g=destination&&d.groups.find(g=>g.id===destination&&!g.deleted&&!g.locked);if(destination&&!g)throw Error('Hedef grup kullanılamıyor.');if(!g){g={id:randomUUID(),name:String(name).slice(0,160),created:Date.now(),tabs:[],locked:false,starred:false};d.groups.unshift(g);}g.tabs.push(...links);return g.id;});}
 edit(id,action,value){return this.change(d=>{const g=d.groups.find(g=>g.id===id);if(!g)throw Error('Grup bulunamadı.');if(action==='rename')g.name=String(value||'').slice(0,160);else if(action==='trash')g.deleted=Date.now();else if(action==='recover')delete g.deleted;else if(action==='remove'&&g.deleted)d.groups=d.groups.filter(x=>x!==g);else throw Error('Geçersiz işlem.');});}
 import(data){if(!Array.isArray(data?.groups)||data.groups.length>2000)throw Error('Geçersiz arşiv.');const groups=data.groups.map(g=>{if(!g||!Array.isArray(g.tabs)||g.tabs.length>10000||g.tabs.some(t=>!t||!validUrl(t.url)))throw Error('Geçersiz sekme.');return {id:randomUUID(),name:String(g.name||'').slice(0,160),created:Number.isFinite(g.created)?g.created:Date.now(),locked:false,starred:false,...(g.deleted?{deleted:Date.now()}:{}),tabs:g.tabs.map(t=>({id:randomUUID(),url:t.url,title:String(t.title||t.url).slice(0,2048)}))};});this.change(d=>d.groups.unshift(...groups));}
 splitTab(id,tabId){return this.moveTabs([{id,tabId}],null);}
 emptyTrash(){this.change(d=>{d.groups=d.groups.filter(g=>!g.deleted);});}
 mergeGroups(id,targetId){this.change(d=>{const from=d.groups.find(g=>g.id===id&&!g.deleted),to=d.groups.find(g=>g.id===targetId&&!g.deleted);if(!from||!to)throw Error('Grup bulunamadı.');if(from===to)return;to.tabs.push(...from.tabs);d.groups=d.groups.filter(g=>g!==from);});}
 moveGroup(id,beforeId){this.change(d=>{const g=d.groups.find(g=>g.id===id&&!g.deleted);if(!g||id===beforeId)return;const target=beforeId&&d.groups.find(t=>t.id===beforeId&&!t.deleted);if(beforeId&&!target)throw Error('Grup bulunamadı.');d.groups=d.groups.filter(t=>t!==g);const index=target?d.groups.indexOf(target):d.groups.findIndex(t=>t.deleted);d.groups.splice(index<0?d.groups.length:index,0,g);});}
 moveTab(id,tabId,targetId,beforeId){this.moveTabs([{id,tabId}],targetId,beforeId);}
 moveTabs(items,targetId,beforeId){
  return this.change(data=>{
   const groups=new Map(data.groups.filter(group=>!group.deleted).map(group=>[group.id,group]));
   const target=targetId===null?{id:randomUUID(),name:'',created:Date.now(),locked:false,starred:false,tabs:[]}:groups.get(targetId);
   if(!target||!Array.isArray(items)||!items.length)throw Error('Sekme veya grup bulunamadı.');
   const moving=new Map(),ordered=[];
   for(const {id,tabId} of items){
    const source=groups.get(id),tab=source?.tabs.find(entry=>entry.id===tabId);
    if(!tab)throw Error('Sekme bulunamadı.');
    if(!moving.has(source))moving.set(source,new Set());
    const selected=moving.get(source);
    if(!selected.has(tabId)){selected.add(tabId);ordered.push(tab);}
   }
   if(beforeId&&!target.tabs.some(tab=>tab.id===beforeId))throw Error('Hedef sekme bulunamadı.');
   if(moving.get(target)?.has(beforeId))return target.id;
   for(const [source,selected] of moving)source.tabs=source.tabs.filter(tab=>!selected.has(tab.id));
   const index=beforeId?target.tabs.findIndex(tab=>tab.id===beforeId):target.tabs.length;
   target.tabs.splice(index,0,...ordered);
   data.groups=data.groups.filter(group=>!moving.has(group)||group.tabs.length);
   if(targetId===null)data.groups.unshift(target);
   return target.id;
  });
 }
 recoverTab(id,tabId){this.change(d=>{const g=d.groups.find(g=>g.id===id&&g.deleted),tab=g?.tabs.find(t=>t.id===tabId);if(!tab)throw Error("Sekme bulunamadı.");let target=d.groups.find(t=>t.id===g.recoveredId&&!t.deleted);if(!target){target={id:randomUUID(),name:g.name,created:Date.now(),locked:false,starred:false,tabs:[]};g.recoveredId=target.id;d.groups.unshift(target);}target.tabs.push(tab);g.tabs=g.tabs.filter(t=>t!==tab);if(!g.tabs.length)d.groups=d.groups.filter(t=>t!==g);});}
 consume(id,ids,batch){this.consumeGroups([{id,tabIds:ids}],batch);}
 consumeGroups(selections,batch){
  this.change(data=>{
   for(const {id,tabIds} of selections){
    const group=data.groups.find(item=>item.id===id&&!item.deleted);
    if(!group)continue;
    const ids=new Set(tabIds),opened=group.tabs.filter(tab=>ids.has(tab.id));
    if(!opened.length)continue;
    let trash=data.groups.find(item=>item.deleted&&(batch?item.batch===batch:item.sourceId===id));
    if(!trash){
     trash={id:randomUUID(),sourceId:id,batch:batch||null,name:batch?'':group.name,created:group.created,deleted:Date.now(),locked:false,starred:false,tabs:[]};
     data.groups.push(trash);
    }
    trash.tabs.push(...opened);
    group.tabs=group.tabs.filter(tab=>!ids.has(tab.id));
    if(!group.tabs.length)data.groups=data.groups.filter(item=>item!==group);
   }
  });
 }
}
function parseText(text){if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw Error('Dosya çok büyük.');const groups=[];let name='',tabs=[];const flush=()=>{if(tabs.length)groups.push({name,tabs});name='';tabs=[];};for(const [i,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){const line=raw.trim();if(!line){flush();continue;}if(line.startsWith('# ')){flush();name=line.slice(2).trim();continue;}const pipe=line.indexOf(' | '),url=(pipe<0?line:line.slice(0,pipe)).trim(),title=pipe<0?url:line.slice(pipe+3).trim();if(!validUrl(url))throw Error('Geçersiz bağlantı, satır '+(i+1));tabs.push({url,title});}flush();if(!groups.length)throw Error('Dosyada bağlantı yok.');return {groups};}
function exportText(data){return data.groups.filter(g=>!g.deleted).map(g=>(g.name?'# '+g.name.replace(/[\r\n]/g,' ')+'\n':'')+g.tabs.map(t=>t.url+' | '+t.title.replace(/[\r\n]/g,' ')).join('\n')).join('\n\n');}
module.exports={SavedTabs,validUrl,parseText,exportText};
