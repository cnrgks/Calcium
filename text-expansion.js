'use strict';
// Runs in an isolated world. No page bridge, clipboard access or field content
// is sent to the main process. Only a genuinely typed #token can expand.
function installTextExpansion(rules){
 const key=Symbol.for('calcium.text-expansion');if(window[key]){window[key].update(rules);return;}
 let entries=new Map(),target=null,typed='',composing=false,expanding=false;
 const reset=()=>{target=null;typed='';};
 function update(next){entries=new Map((Array.isArray(next)?next:[]).slice(0,100).filter(r=>typeof r.trigger==='string'&&typeof r.value==='string'&&r.value.length<=4096).map(r=>[r.trigger,r.value]));reset();}
 function editable(node){
  if(!node||node.disabled||node.readOnly)return false;
  const autocomplete=(node.getAttribute?.('autocomplete')||'').toLowerCase();
  if(/password|one-time-code|cc-|username/.test(autocomplete))return false;
  if(node.closest?.('form')?.querySelector('input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"]'))return false;
  if(node.tagName==='INPUT')return ['text','search','url','tel'].includes(node.type)&&!/password|passwd|otp|pin|creditcard|cardnumber/i.test((node.name||'')+' '+(node.id||''));
  return node.tagName==='TEXTAREA'||node.isContentEditable;
 }
 const element=e=>e.composedPath?.().find(n=>editable(n))||null;
 document.addEventListener('compositionstart',()=>{composing=true;reset();},true);document.addEventListener('compositionend',()=>{composing=false;reset();},true);
 document.addEventListener('pointerdown',reset,true);document.addEventListener('focusout',reset,true);
 document.addEventListener('input',event=>{
  if(expanding)return;if(!event.isTrusted||composing){reset();return;}const node=element(event);if(!node){reset();return;}if(target!==node){reset();target=node;}
  if(event.inputType==='deleteContentBackward'){typed=typed.slice(0,-1);return;}
  if(event.inputType!=='insertText'||typeof event.data!=='string'){reset();return;}
  for(const char of event.data){if(char==='#')typed='#';else if(typed&&/^[\p{L}\p{N}_-]$/u.test(char)&&typed.length<33)typed+=char;else typed='';}
 },true);
 document.addEventListener('keydown',event=>{
  if(!event.isTrusted||composing||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||![' ','Enter','Tab'].includes(event.key))return;
  const node=element(event);if(node!==target||!typed.startsWith('#'))return;
  const replacement=entries.get(typed.slice(1).normalize('NFC').toLowerCase());if(replacement===undefined)return;
  const suffix=event.key===' '?' ':event.key==='Enter'&&(node.tagName==='TEXTAREA'||node.isContentEditable)?'\n':'';
  let restore;
  if(node.tagName==='INPUT'||node.tagName==='TEXTAREA'){
   const end=node.selectionEnd;if(node.selectionStart!==end||node.value.slice(Math.max(0,end-typed.length),end)!==typed){reset();return;}
   const start=end-typed.length;node.setSelectionRange(start,end);restore=()=>{node.setRangeText(replacement+suffix,start,end,'end');node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:replacement+suffix}));};
  }else{
   const selection=getSelection(),anchor=selection?.anchorNode,end=selection?.anchorOffset;
   if(!selection?.isCollapsed||anchor?.nodeType!==3||anchor.textContent.slice(Math.max(0,end-typed.length),end)!==typed){reset();return;}
   const range=document.createRange();range.setStart(anchor,end-typed.length);range.setEnd(anchor,end);selection.removeAllRanges();selection.addRange(range);
   restore=()=>{range.deleteContents();const text=document.createTextNode(replacement+suffix);range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:replacement+suffix}));};
  }
  event.preventDefault();expanding=true;try{if(!document.execCommand('insertText',false,replacement+suffix))restore();}finally{expanding=false;reset();}
 },true);
 update(rules);window[key]={update};
}
module.exports={installTextExpansion};
