'use strict';
const $=id=>document.getElementById(id),popup=new URLSearchParams(location.search).has('popup');
document.body.classList.toggle('popup',popup);$('openList').hidden=!popup;
let data={groups:[],open:[]},filter='all',busy=false,lastSelection=null,preferenceLoaded=false,popupReady=false;
const trashBatch=crypto.randomUUID();
const archiveSelections=new Map();
function selectArchiveTab(group,tab,event,checkbox=false){let state=archiveSelections.get(group.id);if(!state){state={selected:new Set(),anchor:null};archiveSelections.set(group.id,state);}const ids=group.tabs.map(t=>t.id),index=ids.indexOf(tab.id),anchor=state.anchor?ids.indexOf(state.anchor):0;
 if(event.shiftKey){if(!event.ctrlKey&&!event.metaKey)state.selected.clear();for(let i=Math.min(Math.max(0,anchor),index);i<=Math.max(Math.max(0,anchor),index);i++)state.selected.add(ids[i]);}
 else if(event.ctrlKey||event.metaKey||checkbox){if(state.selected.has(tab.id))state.selected.delete(tab.id);else state.selected.add(tab.id);state.anchor=tab.id;}
 else{state.selected=new Set([tab.id]);state.anchor=tab.id;}
 updateArchiveSelection(group.id);
}
function updateArchiveSelection(id){const state=archiveSelections.get(id),card=[...document.querySelectorAll('#groups .card')].find(n=>n.dataset.groupId===id);if(!card)return;card.classList.toggle('selection-mode',!!state);for(const row of card.querySelectorAll('[data-tab-id]')){const selected=!!state?.selected.has(row.dataset.tabId);row.classList.toggle('selected',selected);const box=row.querySelector('.archive-select');if(box){box.hidden=!state;box.checked=selected;}}const open=card.querySelector('.group-open');if(open){open.textContent=state?'Seçilenleri aç':'Tümünü geri aç';open.disabled=!!state&&!state.selected.size;}}

if(popup){const params=new URLSearchParams(location.search);for(const key of ['x','y','width','height']){const n=Number(params.get(key));if(Number.isFinite(n)&&n>0)document.documentElement.style.setProperty('--popup-'+key,n+'px');}}
function updateSelection(){const boxes=[...document.querySelectorAll('#openTabs input')],count=boxes.filter(n=>n.checked).length;const all=$('selectAll');all.checked=boxes.length>0&&count===boxes.length;all.indeterminate=count>0&&count<boxes.length;all.disabled=!boxes.length;$('store').disabled=!count;}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function button(text,fn){const b=el('button',text);b.onclick=fn;return b;}
async function call(cmd,arg){const r=await savedApi.call(cmd,arg);if(r?.error)throw Error(r.error);return r;}
async function run(fn){if(busy)return;busy=true;try{$('error').textContent='';await fn();await refresh();if(popup&&!popupReady){await call('ready');popupReady=true;}}catch(e){$('error').textContent=e.message;}finally{busy=false;}}
async function refresh(){const next=await call('get');data=next;if(next.theme){const t=next.theme,st=document.documentElement.style;st.setProperty('--bg',t.page);st.setProperty('--card',t.card||t.toolbar);st.setProperty('--accent',t.accent);const dark=t.mode==='dark'||(t.mode==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);st.setProperty('--text',dark?'#e3e3e3':'#1f1f1f');st.setProperty('--muted',dark?'#a8abaf':'#5f6368');st.setProperty('--line',dark?'#3c3c3c':'#e3e3e3');st.setProperty('--field',dark?'#333537':'#e9eef6');st.setProperty('--hover',dark?'rgba(227,227,227,.08)':'rgba(31,31,31,.06)');if(next.font)document.body.style.fontFamily=next.font;}if(popup&&!preferenceLoaded){$('showList').checked=next.showList;preferenceLoaded=true;}render();}
function render(){
 if(popup){
  const checked=new Set([...document.querySelectorAll('#openTabs input:checked')].map(n=>Number(n.value)));
  $('openCount').textContent=`${data.open.length} açık sekme`;$('openTabs').replaceChildren();
  for(const t of data.open){const row=el('label',undefined,'row'),c=el('input');c.type='checkbox';c.value=t.id;c.checked=checked.has(t.id);c.onclick=e=>{const boxes=[...document.querySelectorAll('#openTabs input')],anchor=boxes.findIndex(n=>Number(n.value)===lastSelection),index=boxes.indexOf(c);if(e.shiftKey&&anchor>=0){for(let i=Math.min(anchor,index);i<=Math.max(anchor,index);i++)boxes[i].checked=c.checked;}else lastSelection=t.id;updateSelection();};row.append(c,el('span',t.title||t.url,'tab-title'));row.title=t.url;$('openTabs').append(row);}
  updateSelection();return;
 }
 const live=data.groups.filter(g=>!g.deleted),trash=data.groups.filter(g=>g.deleted),count=live.reduce((n,g)=>n+g.tabs.length,0);
 $('total').textContent=`${count} sekme · ${live.length} grup`;
 $('nav').replaceChildren(button(`Tümü (${count})`,()=>{filter='all';render();}),button(`Çöp kutusu (${trash.reduce((n,g)=>n+g.tabs.length,0)})`,()=>{filter='trash';render();}));
 const divider=el('hr');$('nav').append(divider);
 for(const g of live){const node=button(g.name||g.tabs.length+' sekme',()=>{if(filter!==g.id){filter=g.id;render();}});node.dataset.groupId=g.id;$('nav').append(node);}
 [...$('nav').children].forEach((n,i)=>{const active=i===0?filter==='all':i===1?filter==='trash':live[i-3]?.id===filter;n.classList.toggle('on',active);if(active)n.setAttribute('aria-current','page');});
 $('groups').replaceChildren();const q=$('search').value.toLocaleLowerCase();
 const groups=(filter==='trash'?trash:live).filter(g=>filter==='all'||filter==='trash'||g.id===filter).slice().sort((a,b)=>Number(b.starred)-Number(a.starred));
 for(const g of groups){const matches=g.name.toLocaleLowerCase().includes(q),items=g.tabs.filter(t=>matches||(t.title+' '+t.url).toLocaleLowerCase().includes(q));if(!items.length)continue;
  const card=el('article',undefined,'card'),head=el('div',undefined,'grouphead'),title=el('h2',`${g.locked?'▣ ':g.starred?'★ ':''}${g.name||g.tabs.length+' sekme'}`),date=el('span',new Date(g.created).toLocaleString(),'date');card.dataset.groupId=g.id;card.dataset.deleted=String(!!g.deleted);head.append(title,date);
  const edit=(action,value)=>run(()=>call('edit',{id:g.id,action,value}));
  if(!g.deleted){title.title='İsim vermek için çift tıklayın';title.ondblclick=()=>{if(title.querySelector('input'))return;const input=el('input');input.className='group-name';input.value=g.name;input.maxLength=160;title.replaceChildren(input);let finished=false;const finish=cancel=>{if(finished)return;finished=true;if(cancel){title.textContent=g.name||g.tabs.length+' sekme';return;}const value=input.value.trim();title.textContent=value||g.tabs.length+' sekme';if(value!==g.name)edit('rename',value);};input.onblur=()=>finish(false);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(false);}if(e.key==='Escape'){e.preventDefault();finish(true);}};input.focus();input.select();};}
  if(g.deleted){head.append(button('Geri al',()=>edit('recover')),button('Kalıcı sil',()=>{archiveConfirm('Bu grup kalıcı olarak silinsin mi?',()=>call('edit',{id:g.id,action:'remove'}));}));}
  else{head.append(button('Tümünü geri aç',()=>run(()=>{const state=archiveSelections.get(g.id);return call('restore',{id:g.id,batch:trashBatch,...(state?{tabIds:[...state.selected]}:{})});})));head.querySelector('button').classList.add('group-open');const trashButton=button('',()=>edit('trash'));trashButton.className='trash-button';trashButton.title='Çöp kutusuna taşı';trashButton.setAttribute('aria-label','Çöp kutusuna taşı');trashButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg>';head.append(trashButton);}
  card.append(head);for(const t of items){const row=el('div',undefined,'row'),link=el('a',t.title||t.url);row.dataset.groupId=g.id;row.dataset.tabId=t.id;row.dataset.deleted=String(!!g.deleted);link.href=t.url;link.title=t.url;link.onclick=e=>{e.preventDefault();if(!g.deleted){if(e.ctrlKey||e.metaKey||e.shiftKey||archiveSelections.has(g.id))selectArchiveTab(g,t,e);else run(()=>call('restore',{id:g.id,tabId:t.id,batch:trashBatch}));}};if(!g.deleted){const box=el('input',undefined,'archive-select');box.type='checkbox';box.hidden=!archiveSelections.has(g.id);box.setAttribute('aria-label',t.title+' seç');box.onclick=e=>{e.stopPropagation();selectArchiveTab(g,t,e,true);};row.append(box);row.oncontextmenu=e=>archiveMenu(e,'Çöp kutusuna gönder',()=>run(()=>call('trash-tab',{id:g.id,tabId:t.id,batch:trashBatch})));row.onclick=e=>{if(e.target!==link&&e.target!==box&&(e.ctrlKey||e.metaKey||e.shiftKey)){e.preventDefault();selectArchiveTab(g,t,e);}};}row.append(link,el('span',new URL(t.url).hostname,'domain'));if(g.deleted){const recover=button('Geri al',()=>run(()=>call('recover-tab',{id:g.id,tabId:t.id})));recover.className='recover-tab';row.append(recover);}card.append(row);}$('groups').append(card);
 }
 for(const [id,state] of archiveSelections){const group=live.find(g=>g.id===id);if(!group){archiveSelections.delete(id);continue;}state.selected=new Set([...state.selected].filter(t=>group.tabs.some(tab=>tab.id===t)));updateArchiveSelection(id);}
 wireArchiveInteractions();
 if(!$('groups').children.length)$('groups').append(el('div',q?'Aramayla eşleşen sekme yok.':filter==='trash'?'Çöp kutusu boş.':'Henüz kayıtlı sekme yok. Araç çubuğundaki Sekme Kasası düğmesiyle başlayın.','empty'));
}
$('openList').onclick=()=>run(()=>call('open-list'));
$('selectAll').onchange=()=>{document.querySelectorAll('#openTabs input').forEach(n=>n.checked=$('selectAll').checked);lastSelection=null;updateSelection();};
$('showList').onchange=()=>call('set-show-list',$('showList').checked).catch(e=>{$('error').textContent=e.message;});
$('store').onclick=()=>run(()=>call('store',{ids:[...document.querySelectorAll('#openTabs input:checked')].map(n=>Number(n.value))}));
$('search').oninput=render;
$('export').onclick=()=>archiveTransfer('export');
$('import').onclick=()=>archiveTransfer('import');$('file').onchange=()=>run(async()=>{const f=$('file').files[0];if(!f)return;if(f.size>16*1024*1024)throw Error('Dosya çok büyük.');const text=await f.text();if(f.name.toLowerCase().endsWith('.json'))await call('import',JSON.parse(text));else await call('import-text',text);$('file').value='';});
if(popup&&savedApi.onOpen)savedApi.onOpen(async()=>{try{lastSelection=null;preferenceLoaded=false;$('openTabs').replaceChildren();await refresh();await call('present',{height:Math.ceil(document.querySelector('header').offsetHeight+$('capture').querySelector('.card').scrollHeight+document.querySelector('.capture-footer').offsetHeight+44)});}catch(e){$('error').textContent=e.message;}});
let updateQueued=false;
if(savedApi.onUpdate)savedApi.onUpdate(()=>{if(updateQueued)return;updateQueued=true;const update=async()=>{if(busy||(!popup&&(archiveDrag||document.activeElement?.classList.contains('group-name')))){setTimeout(update,16);return;}try{await refresh();}catch(e){$('error').textContent=e.message;}finally{updateQueued=false;}};queueMicrotask(update);});
window.addEventListener('focus',()=>{if(!popup&&!busy)run(()=>Promise.resolve());});
document.addEventListener('pointerdown',e=>{if(popup&&!$('surface').contains(e.target))call('close').catch(()=>{});});
document.addEventListener('keydown',e=>{if(!popup&&e.key==='Escape'&&!document.querySelector('dialog[open]')&&!archiveDrag){for(const id of [...archiveSelections.keys()]){archiveSelections.delete(id);updateArchiveSelection(id);}}if(popup&&e.key==='Escape'){call('close').catch(()=>{});return;}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
run(()=>Promise.resolve());
