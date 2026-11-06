'use strict';
function contextMenuModel(menu,register,depth=0){
 if(depth>8)return [];
 return menu.items.filter(item=>item.visible!==false).slice(0,500).map(item=>{
  if(item.type==='separator')return {sep:true};
  const row={label:item.label.replace(/&&/g,'\u0000').replace(/&/g,'').replace(/\u0000/g,'&'),dis:item.enabled===false,accel:item.accelerator||undefined,checked:['checkbox','radio'].includes(item.type)?!!item.checked:undefined};
  if(item.icon&&typeof item.icon.toDataURL==='function')row.img=item.icon.toDataURL();
  if(item.submenu)row.children=contextMenuModel(item.submenu,register,depth+1);
  else if(!row.dis)Object.assign(row,{act:'context-action',arg:register(item)});
  return row;
 });
}
module.exports={contextMenuModel};
