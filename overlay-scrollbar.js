'use strict';
// A thin overlay for the document and browser tab lists. Content keeps the full
// viewport width; only the transparent edge hit target receives pointer events.
function installOverlayScrollbars(insertCSS, smooth = true) {
const installed=Symbol.for('calcium.overlay-scrollbars');
if(window[installed])return window[installed];
if (/^(https?:|file:|about:)$/.test(location.protocol)) {
  insertCSS('*::-webkit-scrollbar{width:0!important;height:0!important}*{scrollbar-width:none!important}');
  const internal=location.protocol==='file:';
  let motionCSS;
  const animations=new Map();
  function move(target,left,top,instant=false){
    if(!internal){target.scrollTo({left,top,behavior:smooth&&!instant?'smooth':'instant'});return;}
    const previous=animations.get(target);if(previous)cancelAnimationFrame(previous.frame);
    animations.delete(target);
    left=Math.max(0,Math.min(target.scrollWidth-target.clientWidth,left));
    top=Math.max(0,Math.min(target.scrollHeight-target.clientHeight,top));
    if(!smooth||instant){target.scrollTo({left,top,behavior:'instant'});return;}
    const x=target.scrollLeft,y=target.scrollTop,start=performance.now();
    const animation={left,top,frame:0};animations.set(target,animation);
    const step=now=>{
      if(!target.isConnected){animations.delete(target);return;}
      const t=Math.min(1,(now-start)/240),ease=1-Math.pow(1-t,3);
      target.scrollTo({left:x+(left-x)*ease,top:y+(top-y)*ease,behavior:'instant'});
      if(t<1)animation.frame=requestAnimationFrame(step);else animations.delete(target);
    };
    animation.frame=requestAnimationFrame(step);
  }
  document.addEventListener('pointerdown',()=>{for(const a of animations.values())cancelAnimationFrame(a.frame);animations.clear();},true);
  const applyMotion=enabled=>{
    smooth=enabled!==false;
    if(!smooth){for(const a of animations.values())cancelAnimationFrame(a.frame);animations.clear();}
    const sheet=new CSSStyleSheet();
    // Never animate a website's own positioning/scroll anchoring corrections.
    sheet.replaceSync(internal?'html,[data-calcium-scrollable]{scroll-behavior:'+(smooth?'smooth':'auto')+'!important}':'');
    document.removeEventListener('wheel',wheel);
    if(internal||!smooth)document.addEventListener('wheel',wheel,{passive:false});
    document.adoptedStyleSheets=document.adoptedStyleSheets.filter(s=>s!==motionCSS).concat(sheet);
    motionCSS=sheet;
  };
  window[installed]=applyMotion;applyMotion(smooth);
  const start = () => {
    const entries = new Map();
    let pending = false;
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
    function add(target) {
      if (!target || entries.has(target) || entries.size >= 96) return;
      const host = document.createElement('div');
      host.setAttribute('data-calcium-scrollbar',target===document.scrollingElement?'document':'panel');
      if(target!==document.scrollingElement)target.setAttribute('data-calcium-scrollable','');
      host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;pointer-events:none!important;right:0!important;top:0!important;width:10px!important;';
      const shadow = host.attachShadow({ mode: 'closed' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(':host{color-scheme:light dark}.track{position:absolute;inset:0;pointer-events:auto;touch-action:none}.thumb{position:absolute;right:1px;width:1px;border-radius:4px;background:#808080;opacity:.7;transition:width .12s,opacity .12s;pointer-events:none}.track:hover .thumb,.track.drag .thumb{width:4px;opacity:1}.track:focus-visible{outline:1px solid #808080;outline-offset:-1px}');
      shadow.adoptedStyleSheets = [sheet];
      const track = document.createElement('div'), thumb = document.createElement('div');
      track.className = 'track'; thumb.className = 'thumb'; track.append(thumb); shadow.append(track);
      track.tabIndex = 0; track.setAttribute('role', 'scrollbar');
      track.setAttribute('aria-label', location.protocol === 'file:' && document.documentElement.lang !== 'en' ? 'Kaydır' : 'Scroll');
      track.setAttribute('aria-orientation', 'vertical');track.setAttribute('aria-valuemin','0');
      const entry = { target, host, track, thumb, dragging: null, top: 0, height: 0, thumbHeight: 0, max: 0 };
      entries.set(target, entry); document.documentElement.append(host);
      const horizontal=document.createElement('div');horizontal.setAttribute('data-calcium-scrollbar-horizontal','');horizontal.style.cssText='all:initial!important;position:fixed!important;z-index:2147483647!important;height:10px!important;pointer-events:none!important;';
      const hs=horizontal.attachShadow({mode:'closed'}),ht=document.createElement('div'),hb=document.createElement('div'),hc=new CSSStyleSheet();hc.replaceSync('.track{position:absolute;inset:0;pointer-events:auto;touch-action:none}.thumb{position:absolute;bottom:1px;height:1px;border-radius:4px;background:#808080;opacity:.7;transition:height .12s}.track:hover .thumb,.track.drag .thumb{height:4px;opacity:1}');hs.adoptedStyleSheets=[hc];ht.className='track';hb.className='thumb';ht.append(hb);hs.append(ht);document.documentElement.append(horizontal);Object.assign(entry,{horizontal,ht,hb});ht.tabIndex=0;ht.setAttribute('role','scrollbar');ht.setAttribute('aria-label','Scroll');ht.setAttribute('aria-orientation','horizontal');ht.setAttribute('aria-valuemin','0');
      let hdrag=null;const hscroll=x=>{target.scrollTo({left:Math.max(0,Math.min(entry.hmax,x)),behavior:'instant'});schedule();};ht.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();ht.setPointerCapture(event.pointerId);const offset=event.clientX-entry.left,current=target.scrollLeft/entry.hmax*(entry.width-entry.thumbWidth);if(offset<current||offset>current+entry.thumbWidth)hscroll((offset-entry.thumbWidth/2)/Math.max(1,entry.width-entry.thumbWidth)*entry.hmax);hdrag={x:event.clientX,scroll:target.scrollLeft};ht.classList.add('drag');});ht.addEventListener('pointermove',event=>{if(hdrag)hscroll(hdrag.scroll+(event.clientX-hdrag.x)/Math.max(1,entry.width-entry.thumbWidth)*entry.hmax);});const hstop=()=>{hdrag=null;ht.classList.remove('drag');};ht.addEventListener('pointerup',hstop);ht.addEventListener('lostpointercapture',hstop);ht.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();hscroll(event.key==='Home'?0:event.key==='End'?entry.hmax:target.scrollLeft+(event.key==='ArrowLeft'?-40:40));}});
      const scrollTo = y => { move(target,target.scrollLeft,y,!!entry.dragging); schedule(); };
      track.addEventListener('pointerdown', e => {
        if(e.button!==0)return;
        e.preventDefault();track.setPointerCapture(e.pointerId);track.classList.add('drag');
        const offset=e.clientY-entry.top, current=entry.max?target.scrollTop/entry.max*(entry.height-entry.thumbHeight):0;
        if(offset<current || offset>current+entry.thumbHeight)scrollTo((offset-entry.thumbHeight/2)/(entry.height-entry.thumbHeight)*entry.max);
        entry.dragging={y:e.clientY,scroll:target.scrollTop};
      });
      track.addEventListener('pointermove', e => {if(entry.dragging)scrollTo(entry.dragging.scroll+(e.clientY-entry.dragging.y)/Math.max(1,entry.height-entry.thumbHeight)*entry.max);});
      const stop=()=>{entry.dragging=null;track.classList.remove('drag');};
      track.addEventListener('pointerup',stop);track.addEventListener('lostpointercapture',stop);
      track.addEventListener('keydown',e=>{const delta={ArrowDown:40,ArrowUp:-40,PageDown:entry.height,PageUp:-entry.height};if(e.key==='Home'||e.key==='End'||e.key in delta){e.preventDefault();scrollTo(e.key==='Home'?0:e.key==='End'?entry.max:target.scrollTop+delta[e.key]);}});
      track.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();scrollTo(target.scrollTop+e.deltaY*(e.deltaMode===1?20:e.deltaMode===2?entry.height:1));},{passive:false});
      target.addEventListener('scroll',schedule,{passive:true});
      observer.observe(target);
    }
    const observer = new ResizeObserver(schedule);
    function update() {
      pending = false;
      add(document.scrollingElement);
      if(location.protocol==='file:' && /\/ui\.html$/.test(location.pathname))for(const id of ['vtabs','pinnedtabs'])add(document.getElementById(id));
      const dialogs=location.protocol==='file:'?[...document.querySelectorAll('.modal .dlg')]:[];
      for(const dialog of dialogs)add(dialog);
      const activeDialog=dialogs.find(d=>d.getClientRects().length&&getComputedStyle(d).visibility!=='hidden');
      for (const [target, e] of entries) {
        if(!target.isConnected){e.host.remove();e.horizontal.remove();observer.unobserve(target);entries.delete(target);continue;}
        const root=target===document.scrollingElement,r=root?{top:0,right:innerWidth,bottom:innerHeight,height:innerHeight}:target.getBoundingClientRect();
        const height=root?innerHeight:target.clientHeight,max=target.scrollHeight-height;
        e.host.style.setProperty('display',max>1&&r.right>0&&r.bottom>0&&height>0&&(!activeDialog||activeDialog===target)?'block':'none','important');
        const visible=(!activeDialog||activeDialog===target)&&r.right>0&&r.bottom>0&&height>0;
        const width=root?innerWidth:target.clientWidth,left=Math.max(0,root?0:r.left),visibleWidth=Math.max(0,Math.min(width,innerWidth-left));e.left=left;e.width=visibleWidth;e.hmax=target.scrollWidth-width;e.thumbWidth=Math.min(visibleWidth,Math.max(24,visibleWidth*width/Math.max(1,target.scrollWidth)));
        e.horizontal.style.setProperty('display',visible&&e.hmax>1?'block':'none','important');e.horizontal.style.setProperty('left',left+'px','important');e.horizontal.style.setProperty('top',(Math.min(innerHeight,r.bottom)-10)+'px','important');e.horizontal.style.setProperty('width',visibleWidth+'px','important');e.hb.style.width=e.thumbWidth+'px';e.hb.style.left=(e.hmax>0?Math.max(0,target.scrollLeft)/e.hmax*(visibleWidth-e.thumbWidth):0)+'px';e.ht.setAttribute('aria-valuemax',String(Math.max(0,e.hmax)));e.ht.setAttribute('aria-valuenow',String(target.scrollLeft));
        if(max<=1)continue;
        const top=Math.max(0,r.top),visibleHeight=Math.min(height,innerHeight-top);
        e.top=top;e.height=visibleHeight;e.max=max;e.thumbHeight=Math.min(visibleHeight,Math.max(24,visibleHeight*height/target.scrollHeight));
        e.host.style.setProperty('top',top+'px','important');e.host.style.setProperty('right',Math.max(0,innerWidth-r.right)+'px','important');e.host.style.setProperty('height',visibleHeight+'px','important');
        e.thumb.style.height=e.thumbHeight+'px';e.thumb.style.top=Math.max(0,target.scrollTop)/max*(visibleHeight-e.thumbHeight)+'px';
        e.track.setAttribute('aria-valuemax',String(Math.round(max)));e.track.setAttribute('aria-valuenow',String(Math.round(target.scrollTop)));
      }
    }
    // Web pages often animate classes/styles continuously. Size and scroll events
    // are enough there; observe DOM mutations only for our own dynamic dialogs.
    if(location.protocol==='file:')new MutationObserver(records=>{if(records.some(r=>!r.target.hasAttribute?.('data-calcium-scrollbar')&&!r.target.hasAttribute?.('data-calcium-scrollbar-horizontal')))schedule();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
    const discover=event=>{for(const node of event.composedPath()){if(node?.nodeType!==1||node.hasAttribute('data-calcium-scrollbar'))continue;const style=getComputedStyle(node);if((/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1)||(/auto|scroll/.test(style.overflowX)&&node.scrollWidth>node.clientWidth+1))add(node);}schedule();};
    document.addEventListener('pointerover',discover,{capture:true,passive:true});document.addEventListener('wheel',discover,{capture:true,passive:true});document.addEventListener('focusin',discover,true);
    window.addEventListener('load',schedule,true);
    observer.observe(document.documentElement);if(document.body)observer.observe(document.body);
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);document.addEventListener('transitionend',schedule,true);
    update();
  };
  function wheel(event){
    if(internal&&!smooth)return;
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||(!event.deltaX&&!event.deltaY))return;
    let dx=event.deltaX,dy=event.deltaY;if(event.shiftKey&&!dx){dx=dy;dy=0;}
    const horizontal=Math.abs(dx)>Math.abs(dy),delta=horizontal?dx:dy;
    const target=event.composedPath().find(node=>{
      if(node?.nodeType!==1)return false;
      const root=node===document.scrollingElement,style=getComputedStyle(node);
      if(!root&&!/auto|scroll/.test(horizontal?style.overflowX:style.overflowY))return false;
      const position=horizontal?node.scrollLeft:node.scrollTop,max=horizontal?node.scrollWidth-node.clientWidth:node.scrollHeight-node.clientHeight;
      return max>1&&(delta>0?position<max-1:position>0);
    });
    if(!target)return;
    event.preventDefault();
    const goal=animations.get(target),scale=event.deltaMode===1?20:event.deltaMode===2?(horizontal?target.clientWidth:target.clientHeight):1;
    const x=target.scrollLeft,y=target.scrollTop;
    const sameX=goal&&Math.sign(goal.left-x)===Math.sign(dx),sameY=goal&&Math.sign(goal.top-y)===Math.sign(dy);
    move(target,(sameX?goal.left:x)+dx*scale,(sameY?goal.top:y)+dy*scale);
  }
  window.addEventListener('keydown',event=>{
    if(!internal||!smooth||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    if(!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))return;
    const path=event.composedPath();
    if(path.some(n=>n?.nodeType===1&&(n.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(n.tagName)||n.getAttribute('role')==='scrollbar')))return;
    if(event.key===' '&&path.some(n=>n?.tagName==='A'))return;
    const direction=['ArrowUp','PageUp','Home'].includes(event.key)||event.key===' '&&event.shiftKey?-1:1;
    const target=path.find(n=>n?.nodeType===1&&/auto|scroll/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1&&(direction>0?n.scrollTop<n.scrollHeight-n.clientHeight-1:n.scrollTop>0))||document.scrollingElement;
    if(!target)return;const max=target.scrollHeight-target.clientHeight;if(max<=0)return;
    const base=animations.get(target)?.top??target.scrollTop,step=event.key.startsWith('Arrow')?40:target.clientHeight*.9;
    const top=event.key==='Home'?0:event.key==='End'?max:Math.max(0,Math.min(max,base+direction*step));
    if(top===target.scrollTop)return;event.preventDefault();move(target,target.scrollLeft,top);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  return applyMotion;
}

}
if(typeof module!=='undefined')module.exports={installOverlayScrollbars};
if(typeof window!=='undefined'){
  const {webFrame,ipcRenderer}=require('electron');
  const apply=installOverlayScrollbars(css=>webFrame.insertCSS(css,{cssOrigin:'user'}),ipcRenderer.sendSync('calcium-smooth-scrolling')!==false);
  if(apply)ipcRenderer.on('calcium-smooth-scrolling',(_event,value)=>apply(value));
}
