'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const source=read('hoverzoom.js');
const definitions=source.slice(source.indexOf('  const IMG_EXT'),source.indexOf('  function youtubePlaybackAt'));
const rect={left:0,top:0,right:100,bottom:100,width:100,height:100};
let hits=[];
const doc={elementsFromPoint:()=>hits,body:{},documentElement:{}};
const ctx={URL,location:{href:'https://example.com/'},document:doc,host:{},getComputedStyle:el=>({visibility:'visible',backgroundImage:el.bg||'none'})};vm.createContext(ctx);vm.runInContext(definitions,ctx);
function element(tag,attrs={}){return {nodeType:1,tagName:tag,children:[],getBoundingClientRect:()=>rect,getAttribute:key=>attrs[key]||null,closest:()=>null,querySelectorAll:()=>[],...attrs};}
const img=element('IMG',{currentSrc:'https://example.com/test.gif'}),cover=element('DIV');hits=[cover,img];assert.equal(ctx.resolveAt(cover,50,50).candidate.url,img.currentSrc);assert(ctx.pick(img).sure,'same-size GIF can still animate');
const parent=element('DIV');parent.children=[img,cover];cover.parentElement=parent;hits=[cover];assert.equal(ctx.resolveAt(cover,50,50).candidate.url,img.currentSrc,'bounded ancestor discovers sibling image');
const bg=element('DIV',{bg:'url("https://example.com/full.webp")'});hits=[bg];assert.equal(ctx.resolveAt(bg,50,50).candidate.url,'https://example.com/full.webp');
const lazy=element('IMG',{'data-original':'/original.gif',currentSrc:'https://example.com/static.jpg'});assert.equal(ctx.pick(lazy).url,'https://example.com/original.gif');
const set=element('IMG',{srcset:'/small.jpg 200w,/large.jpg 1200w',currentSrc:'https://example.com/small.jpg'});assert.equal(ctx.pick(set).url,'https://example.com/large.jpg');
const video=element('VIDEO',{loop:true,muted:true,controls:false,currentSrc:'https://example.com/animation.webm'});assert(ctx.pick(video).video);video.controls=true;assert.equal(ctx.pick(video),null);
const shadow=element('DIV');shadow.shadowRoot={elementsFromPoint:()=>[img]};hits=[shadow];assert.equal(ctx.resolveAt(shadow,50,50).candidate.url,img.currentSrc);
assert.equal(ctx.resolveAt(cover,150,150),null,'unrelated image outside cursor is ignored');
assert.equal(ctx.upgrade('https://images.steamusercontent.com/ugc/123/ABC/?imw=256'),'https://images.steamusercontent.com/ugc/123/ABC/');
console.log('PASS: overlay siblings, bounded ancestors, GIF, CSS background, lazy originals, srcset, animation videos, open shadow roots, Steam');
(async()=>{
 const events=new Map(),observers=[];let scans=0,connections=0,warnings=0;
 class Media {constructor(src=''){this.currentSrc=src;this.crossOrigin=null;this.isConnected=true;}querySelectorAll(){return [];}addEventListener(){}}
 const media=new Media('blob:https://example.com/audio');
 const root={querySelectorAll(){scans++;return [media];},addEventListener(n,fn){events.set(n,fn);}};
 const gain={gain:{value:1},connect(){},disconnect(){}};
 class AudioContext {constructor(){this.state='suspended';this.destination={};}createGain(){return gain;}createDynamicsCompressor(){return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){}};}createMediaElementSource(el){if(el.conflict)throw Object.assign(new Error(),{name:'InvalidStateError'});connections++;return {connect(){}};}resume(){this.state='running';return Promise.resolve();}}
 const c={window:{},Symbol,URL,location:{href:'https://example.com/',origin:'https://example.com'},HTMLMediaElement:Media,AudioContext,MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}},queueMicrotask,console:{warn(){warnings++;}},document:root};vm.createContext(c);
 const apply=value=>vm.runInContext('{const GAIN='+value+';'+read('volume.js')+'}',c);
 apply(2);assert.equal(connections,1);assert.equal(gain.gain.value,2);const baseline=scans;
 const added=new Media('blob:https://example.com/new');observers[0].fn([{type:'childList',addedNodes:[added]}]);await Promise.resolve();assert.equal(connections,2);assert.equal(scans,baseline,'DOM mutation does not rescan document');
 apply(0);assert.equal(gain.gain.value,0);apply(1);assert.equal(gain.gain.value,1);
 apply(2);const conflict=new Media('blob:https://example.com/conflict');conflict.conflict=true;events.get('playing')({target:conflict});events.get('playing')({target:conflict});assert.equal(warnings,1,'conflicting player is reported once');
 const delayed=new Media();events.get('play')({target:delayed});delayed.currentSrc='blob:https://example.com/late';events.get('loadedmetadata')({target:delayed});assert.equal(connections,3);
 const inside=new Media('blob:https://example.com/shadow');media.shadowRoot={querySelectorAll:()=>[inside],addEventListener(){}};apply(3);assert.equal(connections,4);assert.equal(gain.gain.value,3);
 console.log('PASS: audio gain including zero/reset, incremental discovery, delayed sources, conflict reporting, shadow media, no duplicate routing');
})().catch(e=>{console.error(e);process.exitCode=1;});
// Frame installation uses the actual WebFrameMain API and removes scripts in all frames.
{
 const main=read('main.js'),sent=[];
 const child={url:'https://embedded.example/',executeJavaScript:code=>{sent.push(['child',code]);return Promise.resolve();}};
 const blank={url:'about:srcdoc',executeJavaScript:code=>{sent.push(['blank',code]);return Promise.resolve();}};
 const wc={isDestroyed:()=>false,getURL:()=> 'https://example.com/',mainFrame:{framesInSubtree:[child,blank]},executeJavaScriptInIsolatedWorld:(id,scripts)=>{sent.push(['main',scripts[0].code]);return Promise.resolve();}};
 const ctx={ZOOM_JS:'INSTALL',settings:{hoverZoom:true}};vm.createContext(ctx);vm.runInContext(main.slice(main.indexOf('function applyHoverZoom('),main.indexOf('function setFeature(')),ctx);
 ctx.applyHoverZoom(wc);assert.deepEqual(sent.map(x=>x[0]),['main','child','blank']);assert(sent.every(x=>x[1].startsWith('INSTALL')&&x[1].includes('setBackgrounds(false)')));sent.length=0;ctx.applyHoverZoom(wc,false);assert.equal(sent.length,3);assert(sent.every(x=>x[1].includes('z.off()')));
 console.log('PASS: main/cross-origin/srcdoc frame install and disable');
}
