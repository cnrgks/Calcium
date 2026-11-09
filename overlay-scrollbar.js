'use strict';
// A thin overlay for the document and browser tab lists. Content keeps the full
// viewport width; only the transparent edge hit target receives pointer events.
function installOverlayScrollbars(insertCSS, smooth = true) {
const installed=Symbol.for('calcium.overlay-scrollbars');
if(window[installed])return window[installed];
if (/^(https?:|file:|about:)$/.test(location.protocol)) {
  insertCSS('*::-webkit-scrollbar{width:0!important;height:0!important}*{scrollbar-width:none!important}');
  let motionCSS;
  const applyMotion=enabled=>{
    smooth=enabled!==false;
    const sheet=new CSSStyleSheet();
    sheet.replaceSync('*{scroll-behavior:'+(smooth?'smooth':'auto')+'!important}');
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
      const scrollTo = y => { target.scrollTo({top:Math.max(0,Math.min(entry.max,y)),behavior:entry.dragging?'instant':(smooth?'smooth':'instant')}); schedule(); };
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
  const goals=new WeakMap();
  document.addEventListener('wheel',event=>{
    if(!smooth||event.defaultPrevented||event.ctrlKey||event.metaKey||event.deltaX||event.shiftKey||!event.deltaY)return;
    const direction=Math.sign(event.deltaY);
    let target=event.composedPath().find(node=>node?.nodeType===1&&/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1&&(direction>0?node.scrollTop<node.scrollHeight-node.clientHeight-1:node.scrollTop>0));
    target=target||document.scrollingElement;if(!target)return;
    const max=target.scrollHeight-target.clientHeight;
    if(max<=0||(direction>0?target.scrollTop>=max-1:target.scrollTop<=0))return;
    event.preventDefault();
    const now=performance.now(),last=goals.get(target);
    const base=last&&now-last.time<180&&last.direction===direction?last.y:target.scrollTop;
    const y=Math.max(0,Math.min(max,base+event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?target.clientHeight:1)));
    goals.set(target,{y,time:now,direction});target.scrollTo({top:y,behavior:'smooth'});
  },{passive:false});
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
