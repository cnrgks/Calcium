'use strict';
// One policy per Electron Session. Private policies never read or write saved grants.
const normalizedOrigin=value=>{try{const u=new URL(value);return /^(https?|file):$/.test(u.protocol)&&u.origin!=='null'?u.origin:null;}catch{return null;}};
const hex=n=>typeof n==='number'?n.toString(16).toUpperCase():String(n??'').replace(/^0x/i,'').replace(/^0+(?=.)/,'').toUpperCase();
function createDevicePolicy({incognito=false,getSaved=()=>[],save=()=>{}}={}){
 const temporary=new Map();
 const key=(origin,type,id)=>JSON.stringify([origin,type,id]);
 return {
  grant(type,rawOrigin,device,id){
   const origin=normalizedOrigin(rawOrigin);if(!origin||!device||!id)return false;
   temporary.set(key(origin,type,id),true);
   // VID/PID alone identify a model, not the selected physical device.
   if(!incognito&&device.serialNumber&&device.vendorId!=null&&device.productId!=null){
    const grant={type,origin,vendorId:device.vendorId,productId:device.productId,serialNumber:device.serialNumber,name:device.name||device.productName||device.displayName||device.portName||''};
    if(!getSaved().some(g=>matches(g,type,origin,device)))save(grant);
   }
   return true;
  },
  allows({origin:rawOrigin,deviceType,device={}}){
   const origin=normalizedOrigin(rawOrigin);if(!origin)return false;
   const id=device.deviceId||device.portId;
   if(id&&temporary.has(key(origin,deviceType,id)))return true;
   return !incognito&&getSaved().some(g=>matches(g,deviceType,origin,device));
  },
  get size(){return temporary.size;},
  clear(){temporary.clear();}
 };
}
function matches(g,type,origin,d){return g&&g.type===type&&g.origin===origin&&!!g.serialNumber&&g.serialNumber===d.serialNumber&&g.vendorId!=null&&d.vendorId!=null&&g.productId!=null&&d.productId!=null&&hex(g.vendorId)===hex(d.vendorId)&&hex(g.productId)===hex(d.productId);}
module.exports={createDevicePolicy,normalizedOrigin};
