'use strict';
function archiveDialog(title){
 const previous=document.activeElement,dialog=el('dialog',undefined,'archive-dialog'),heading=el('h2',title),body=el('div',undefined,'dialog-body'),footer=el('div',undefined,'dialog-actions');
 heading.id='archive-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading,body,footer);document.body.append(dialog);
 const close=()=>{dialog.close();dialog.remove();previous?.isConnected&&previous.focus({preventScroll:true});};
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))close();});
 return {dialog,body,footer,close,show:()=>dialog.showModal()};
}
function archiveConfirm(message,action){
 const modal=archiveDialog('Kalıcı olarak sil');modal.body.append(el('p',message));const cancel=button('Vazgeç',modal.close),remove=button('Kalıcı sil',()=>{modal.close();run(action);});remove.className='danger';modal.footer.append(cancel,remove);modal.show();cancel.focus();
}
async function archiveTransfer(mode){
 try{const exporting=mode==='export',text=exporting?(await call('export-text')).text:'';const modal=archiveDialog(exporting?'Sekmeleri dışa aktar':'Sekmeleri içe aktar');modal.dialog.classList.add('transfer-dialog');
 const note=el('p',exporting?'Metni kopyalayıp saklayabilirsiniz.':'Bağlantılarınızı buraya yapıştırın. Her satır: URL | Başlık. Grupları boş satırla ayırın.'),area=el('textarea'),status=el('p',undefined,'transfer-status');area.value=text;area.readOnly=exporting;area.spellcheck=false;area.setAttribute('aria-label',exporting?'Dışa aktarılan sekmeler':'İçe aktarılacak sekmeler');status.setAttribute('role','status');modal.body.append(note,area,status);modal.footer.append(button('Kapat',modal.close));
 modal.footer.append(button(exporting?'Metni kopyala':'İçe aktar',async()=>{if(exporting){area.focus();area.select();status.textContent=document.execCommand('copy')?'Metin kopyalandı.':'Metni seçip Ctrl+C ile kopyalayabilirsiniz.';return;}try{await call('import-text',area.value);await refresh();modal.close();}catch(e){status.textContent=e.message;}}));modal.show();area.focus();if(exporting)area.select();
 }catch(e){$('error').textContent=e.message;}
}
let archiveContext=null;
function archiveMenu(event,label,action){
 event.preventDefault();archiveContext?.remove();const menu=el('div',undefined,'archive-context');menu.setAttribute('role','menu');const item=button(label,()=>{menu.remove();archiveContext=null;action();});item.setAttribute('role','menuitem');menu.append(item);document.body.append(menu);archiveContext=menu;
 const r=menu.getBoundingClientRect();Object.assign(menu.style,{left:Math.max(4,Math.min(event.clientX,innerWidth-r.width-4))+'px',top:Math.max(4,Math.min(event.clientY,innerHeight-r.height-4))+'px'});item.focus();
 menu.onkeydown=e=>{if(e.key==='Escape'){menu.remove();archiveContext=null;}if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();item.focus();}};
}
document.addEventListener('pointerdown',e=>{if(archiveContext&&!archiveContext.contains(e.target)){archiveContext.remove();archiveContext=null;}},true);

let archiveDrag=null,suppressArchiveClick=false;
function animateArchiveMove(parent,move){const nodes=[...parent.children],before=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]));for(const n of nodes)n.getAnimations().forEach(a=>a.cancel());move();for(const n of parent.children){const old=before.get(n),r=n.getBoundingClientRect();if(old&&n!==archiveDrag?.node&&(old.top!==r.top||old.left!==r.left))n.animate([{transform:`translate(${old.left-r.left}px,${old.top-r.top}px)`},{transform:'none'}],{duration:130,easing:'ease-out'});}}
function wireArchiveInteractions(){
 const trash=$('nav').children[1];trash.oncontextmenu=e=>archiveMenu(e,'Tümünü kalıcı olarak sil',()=>archiveConfirm('Çöp kutusundaki tüm sekmeler kalıcı olarak silinsin mi?',()=>call('empty-trash')));
 for(const node of document.querySelectorAll('nav [data-group-id]'))node.oncontextmenu=e=>archiveMenu(e,'Sekme grubunu sil',()=>run(()=>call('edit',{id:node.dataset.groupId,action:'trash'})));
}
document.addEventListener('dragstart',e=>{if(!popup&&e.target.closest('#groups,#nav'))e.preventDefault();});
document.addEventListener('click',e=>{if(suppressArchiveClick){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointerdown',e=>{
 if(popup||busy||e.ctrlKey||e.metaKey||e.shiftKey||e.button!==0||e.target.closest('input,textarea,button:not([data-group-id]),dialog'))return;
 const side=e.target.closest('nav [data-group-id]'),row=e.target.closest('#groups [data-tab-id]'),heading=e.target.closest('#groups h2');const node=side||row||heading?.closest('.card');if(!node||node.dataset.deleted==='true')return;
 archiveDrag={node,kind:row?'tab':'group',side:!!side,id:node.dataset.groupId,tabId:row?.dataset.tabId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,started:false,target:null};
});
function expandArchiveDrop(drop,expanded){
 if(drop.dataset.expanded===String(expanded))return;
 const height=drop.getBoundingClientRect().height,opacity=getComputedStyle(drop).opacity;drop.getAnimations().forEach(a=>a.cancel());drop.dataset.expanded=String(expanded);drop.classList.toggle('is-open',expanded);
 const animation=drop.animate([{height:height+'px',opacity,marginBottom:height?'12px':'0px'},{height:expanded?'90px':'0px',opacity:expanded?1:0,marginBottom:expanded?'12px':'0px'}],{duration:220,easing:'cubic-bezier(.2,0,0,1)',fill:'both'});
 animation.onfinish=()=>{if(!expanded&&drop.dataset.expanded==='false')drop.remove();};
}
function updateArchiveDrag(x,y){const d=archiveDrag;if(!d?.started)return;d.lastX=x;d.lastY=y;d.ghost.style.transform=`translate(${x-d.x}px,${y-d.y}px)`;document.querySelectorAll('.drop-target,.merge-target').forEach(n=>n.classList.remove('drop-target','merge-target'));const hit=document.elementFromPoint(x,y);if(!hit){d.target=null;return;}
 if(d.kind==='tab'){const tools=document.querySelector('#archive .tools'),top=tools?.getBoundingClientRect();let drop=$('newGroupDrop'),r=drop?.getBoundingClientRect();const near=top&&x>=top.left&&x<=top.right&&y>=Math.max(76,top.top-12)&&y<=Math.max(top.bottom+22,r?.bottom||0)+16;
 if(near){if(!drop){drop=el('div',undefined,'card new-group-drop');drop.id='newGroupDrop';drop.setAttribute('aria-label','Yeni grup oluştur');drop.append(el('span','+'));$('archive').insertBefore(drop,$('groups'));drop.getBoundingClientRect();}expandArchiveDrop(drop,true);drop.classList.add('drop-target');d.target={newGroup:true};return;}
 if(drop)expandArchiveDrop(drop,false);if(d.target?.newGroup)d.target=null;}

 if(d.kind==='group'){const target=hit.closest('nav [data-group-id],#groups .card[data-group-id]');if(!target||target.dataset.groupId===d.id||target.dataset.deleted==='true'){d.target=null;return;}const r=target.getBoundingClientRect(),edge=Math.min(30,r.height*.25),inside=y>r.top+edge&&y<r.bottom-edge;
 if(inside){target.classList.add('drop-target','merge-target');d.target={merge:true,targetId:target.dataset.groupId};return;}
 if(target.matches('nav button')!==d.side){d.target=null;return;}
 const before=y<r.top+r.height/2?target:target.nextElementSibling;if(before===d.node)return;animateArchiveMove(target.parentElement,()=>target.parentElement.insertBefore(d.node,before));const after=d.node.nextElementSibling;d.target={beforeId:after?.dataset.groupId||null};}

 else{const targetRow=hit.closest('#groups [data-tab-id]'),target=hit.closest('#groups .card[data-group-id],nav [data-group-id]');if(!target||target.dataset.deleted==='true')return;const targetId=target.dataset.groupId;if(target.matches('nav button')){target.classList.add('drop-target');d.target={targetId,beforeId:null};return;}if(targetRow===d.node)return;const before=targetRow?(y<targetRow.getBoundingClientRect().top+targetRow.offsetHeight/2?targetRow:targetRow.nextElementSibling):null;animateArchiveMove(target,()=>target.insertBefore(d.node,before));target.classList.add('drop-target');d.target={targetId,beforeId:d.node.nextElementSibling?.dataset.tabId||null};}
}
let archiveScrollFrame=0;
function archiveDragScroll(){const d=archiveDrag;if(!d?.started)return;const over=document.elementFromPoint(d.lastX,d.lastY),nav=over?.closest('nav'),r=nav?.getBoundingClientRect()||{top:76,bottom:innerHeight};const delta=d.lastY<r.top+36?-12:d.lastY>r.bottom-36?12:0;if(delta){if(nav)nav.scrollTop+=delta;else window.scrollBy(0,delta);updateArchiveDrag(d.lastX,d.lastY);}archiveScrollFrame=requestAnimationFrame(archiveDragScroll);}
document.addEventListener('pointermove',e=>{const d=archiveDrag;if(!d)return;if(!d.started){if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)return;d.started=true;d.pointerId=e.pointerId;try{document.body.setPointerCapture(e.pointerId);}catch{}suppressArchiveClick=true;const r=d.node.getBoundingClientRect();d.ghost=el('div',d.kind==='group'?d.node.querySelector('h2')?.textContent||d.node.textContent:d.node.querySelector('a')?.textContent,'archive-drag-ghost');Object.assign(d.ghost.style,{left:r.left+'px',top:r.top+'px',width:Math.min(r.width,650)+'px'});document.body.append(d.ghost);d.node.classList.add('drag-source');document.body.classList.add('archive-dragging');archiveScrollFrame=requestAnimationFrame(archiveDragScroll);}e.preventDefault();updateArchiveDrag(e.clientX,e.clientY);});
function finishArchiveDrag(cancel=false){const d=archiveDrag;if(!d)return;archiveDrag=null;if(d.pointerId!==undefined)try{document.body.releasePointerCapture(d.pointerId);}catch{}cancelAnimationFrame(archiveScrollFrame);d.ghost?.remove();$('newGroupDrop')?.remove();d.node.classList.remove('drag-source');document.body.classList.remove('archive-dragging');document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));if(d.started){if(!cancel&&d.target)run(()=>call(d.kind==='group'?(d.target.merge?'merge-groups':'move-group'):d.target.newGroup?'split-tab':'move-tab',{id:d.id,tabId:d.tabId,...d.target}));else render();setTimeout(()=>suppressArchiveClick=false,0);}}
document.addEventListener('pointerup',()=>finishArchiveDrag());document.addEventListener('pointercancel',()=>finishArchiveDrag(true));window.addEventListener('blur',()=>finishArchiveDrag(true));document.addEventListener('keydown',e=>{if(e.key==='Escape')finishArchiveDrag(true);});
