// Calcium volume boost: routes the tab's video/audio elements through a Web Audio gain node.
// The main process prepends "const GAIN = <number>;" and runs it in every frame (isolated world in the main frame).
// Re-running only updates the gain; nodes are built once per element (no leak, WeakMap).
// Cross-origin media without CORS goes SILENT when connected to Web Audio, so it is left alone.
(() => {
  const KEY = Symbol.for('calcium.volume');
  let s = window[KEY];
  if (!s) {
    if (GAIN === 1) return 0;                       // don't set up on a page that was never boosted
    s = { ctx: null, gain: null, limit: null, boosted: false, linked: new WeakMap(), count: 0, failed: new WeakSet(), roots: new WeakSet() };
    Object.defineProperty(window, KEY, { value: s });
    const safe = (el) => {
      const src = el.currentSrc || '';
      if (el.srcObject) return true;
      if (!src) return false;                         // not loaded yet; retried on play
      if (/^(blob|data|mediastream):/i.test(src)) return true;   // YouTube, Twitch etc. (MSE)
      try { if (new URL(src, location.href).origin === location.origin) return true; } catch { return false; }
      return el.crossOrigin != null;                  // cross-origin media loaded with CORS
    };
    s.hook = (el) => {
      if (s.linked.has(el) || s.failed.has(el) || !safe(el)) return;
      try {
        if (!s.ctx) {
          s.ctx = new AudioContext();
          s.gain = s.ctx.createGain();
          // Limiter: reduces clipping at high gain; active only above 100%
          s.limit = s.ctx.createDynamicsCompressor();
          s.limit.threshold.value = -3; s.limit.knee.value = 3; s.limit.ratio.value = 20;
          s.limit.attack.value = 0.002; s.limit.release.value = 0.2;
          s.limit.connect(s.ctx.destination);
          s.route();
        }
        const n = s.ctx.createMediaElementSource(el);
        n.connect(s.gain);
        s.linked.set(el, n);
        s.count++;
        if (s.ctx.state === 'suspended') s.ctx.resume().catch(() => {});
      } catch (error) {
        s.failed.add(el);
        console.warn('[Calcium volume] Player could not be connected:', error.name);
      }
    };
    s.route = () => {
      if (!s.gain) return;
      s.gain.gain.value = s.value;
      const want = s.value > 1;
      if (s.boosted === want && s.routed) return;
      try { s.gain.disconnect(); } catch {}
      s.gain.connect(want ? s.limit : s.ctx.destination);
      s.boosted = want; s.routed = true;
    };
    const onMedia = (e) => {
      const el = e.composedPath?.()[0] || e.target;
      if (s.value !== 1 && el instanceof HTMLMediaElement) s.hook(el);
      if (s.ctx?.state === 'suspended') s.ctx.resume().catch(() => {});
    };
    const pending = new Set();
    let scheduled = false;
    const enqueue = node => {
      if (!node || s.value === 1) return;
      pending.add(node);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const nodes = [...pending]; pending.clear();
        if (s.value === 1) return;
        for (const node of nodes) if (node.isConnected !== false) s.scan(node);
      });
    };
    s.observe = root => {
      if (s.roots.has(root)) return;
      s.roots.add(root);
      for (const event of ['play','playing','loadedmetadata','canplay','emptied']) root.addEventListener(event,onMedia,true);
      const observer = new MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'attributes') enqueue(record.target.closest?.('video,audio') || record.target);
          else for (const node of record.addedNodes) enqueue(node);
        }
      });
      observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','crossorigin']});
    };
    s.scan = root => {
      if (root instanceof HTMLMediaElement) s.hook(root);
      if (root.shadowRoot) { s.observe(root.shadowRoot); s.scan(root.shadowRoot); }
      for (const el of root.querySelectorAll?.('*') || []) {
        if (el instanceof HTMLMediaElement) s.hook(el);
        if (el.shadowRoot) { s.observe(el.shadowRoot); s.scan(el.shadowRoot); }
      }
    };
    s.observe(document);
    // Discover roots attached to existing hosts when their controls are used.
    document.addEventListener('pointerover', e => {
      if (s.value === 1) return;
      for (const node of e.composedPath()) if (node.shadowRoot) enqueue(node);
    }, {capture:true,passive:true});
  }
  s.value = GAIN;
  if (s.value !== 1) s.scan(document);
  s.route();
  if (s.ctx?.state === 'suspended') s.ctx.resume().catch(() => {});
  return s.count;
})();
