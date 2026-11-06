'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const assert=require('assert'),{createDevicePolicy}=require('../device-policy');
let saved=[],writes=0;const normal=createDevicePolicy({getSaved:()=>saved,save:g=>{saved.push(g);writes++;}}),privatePolicy=createDevicePolicy({incognito:true,getSaved:()=>{throw Error('Private policy read disk grants');},save:()=>{throw Error('Private policy wrote disk');}});
for(const type of ['hid','usb','serial']){
 const device={deviceId:'id-'+type,portId:'id-'+type,vendorId:42,productId:99,serialNumber:'serial-'+type};
 const details={origin:'https://a.example',deviceType:type,device};
 assert(!normal.allows(details));assert(normal.grant(type,details.origin,device,device.deviceId));assert(normal.allows(details));assert(!normal.allows({...details,origin:'https://b.example'}));assert(!normal.allows({...details,deviceType:'other'}));assert(!privatePolicy.allows(details));
 assert(privatePolicy.grant(type,details.origin,device,device.deviceId));assert(privatePolicy.allows(details));assert(!privatePolicy.allows({...details,origin:'https://b.example'}));privatePolicy.clear();assert(!privatePolicy.allows(details));
 normal.clear();assert(normal.allows(details),'serial-identified persisted grant survives');assert(!normal.allows({...details,device:{...device,serialNumber:'other'}}));
}
assert.equal(writes,3);
const anonymous={deviceId:'anonymous',vendorId:42,productId:99};normal.grant('usb','https://a.example',anonymous,anonymous.deviceId);assert(normal.allows({origin:'https://a.example',deviceType:'usb',device:anonymous}));normal.clear();assert(!normal.allows({origin:'https://a.example',deviceType:'usb',device:anonymous}));assert.equal(writes,3);
assert(!normal.grant('usb','null',anonymous,'anonymous'));assert(!normal.allows({origin:'null',deviceType:'usb',device:anonymous}));
// Execute the actual Session wiring, including private setup, with a mocked chooser.
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');let diskWrites=0;const settings={deviceGrants:[]};
 const ctx={createDevicePolicy,settings,saveSettings:()=>diskWrites++,webContents:{fromFrame:()=>({})},originOf:u=>new URL(u).origin,winOfWc:()=>null,Map,Set};vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('const devicePolicies ='),source.indexOf('// Web Bluetooth selection')),ctx);
 ctx.openChooser=async(_kind,_origin,list)=>list[0];
 const session=()=>{const events={};return {events,on:(name,fn)=>events[name]=fn,setDevicePermissionHandler:fn=>events.permission=fn};};
 const normalSession=session(),privateSession=session();ctx.setupDevices(normalSession,false);ctx.setupDevices(privateSession,true);
 const device={deviceId:'probe',vendorId:12,productId:34,serialNumber:'unique'},details={frame:{url:'https://a.example/frame'},deviceList:[device]};let selected;
 await normalSession.events['select-usb-device']({preventDefault(){}},details,id=>selected=id);await Promise.resolve();assert.equal(selected,'probe');assert.equal(diskWrites,1);
 const query={origin:'https://a.example',deviceType:'usb',device};assert(normalSession.events.permission(query));assert(!normalSession.events.permission({...query,origin:'https://b.example'}));assert(!privateSession.events.permission(query));
 await privateSession.events['select-usb-device']({preventDefault(){}},details,()=>{});await Promise.resolve();assert(privateSession.events.permission(query));assert.equal(diskWrites,1);vm.runInContext('devicePolicies',ctx).get(privateSession).clear();assert(!privateSession.events.permission(query));
 console.log('PASS: actual Session device chooser wiring preserves origin and incognito isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
console.log('PASS: device grants scoped by origin/type/session; private grants never persisted; anonymous devices not authorized by model alone.');
