'use strict';
// A terminal/test runner may close its output pipe while Electron is still
// running. Logging to that pipe must not produce a main-process error dialog.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on('error', error => { if (error.code !== 'EPIPE') throw error; });
}
/*
 * Calcium - lightweight, privacy-focused browser (Electron / Chromium engine)
 *  - NO required Google account / sync / sign-in
 *  - Telemetry, crash reports, Safe Browsing, translation, spellcheck downloads are OFF
 *  - Always-on ad/tracker blocker (uBlock Origin filter lists)
 *  - Google is the default search; Google cookies/data are cleared on exit
 *  - WebHID / WebUSB / Web Serial / Web Bluetooth: for browser-based device firmware sites
 *  - From Thorium: DoH, DNT+GPC, parallel downloads, HEVC, bookmarks bar, home button,
 *    reload menu (normal / hard / clear cache), full URL display, force dark pages
 */
const {
  app, nativeImage, BrowserWindow, BaseWindow, WebContentsView, session, ipcMain, Menu, clipboard,
  dialog, shell, nativeTheme, net, Notification, webFrameMain, webContents, screen
} = require('electron');
// castLabs Electron (Widevine DRM). Not in stock Electron; in that case we run without DRM.
const { components } = require('electron');
const I18N = require('./i18n');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pathToFileURL } = require('url');
const { createThreatProtection } = require('./threat-protection');
const {createCalciumProtection,cleanTrackingUrl}=require('./calcium-protection');
const {siteOfHost}=require('./site-data');
const { readResponseBytes, assertImageLimits } = require('./bounded-fetch');
const { createSiteData } = require('./site-data');
const bookmarkImport = require('./bookmark-import');
const {createDevicePolicy,normalizedOrigin}=require('./device-policy');
const {memoryPressure,chooseSleepTabs}=require('./memory-policy');
const os=require('os');
const {createWorkQueue}=require('./bounded-work-queue');
const {readBoundedJson}=require('./bounded-json');
const {UI_FONTS,validUiFont,uiFontFamily}=require('./ui-fonts');
const {contextMenuModel}=require('./context-menu-model');
const customShortcuts=require('./custom-shortcuts');

// Separate profile folder for tests: does not touch the user's running Calcium or data (single-instance lock is per folder too)
if (process.env.CALCIUM_PROFILE) app.setPath('userData', process.env.CALCIUM_PROFILE);
else app.setPath('userData',path.join(app.getPath('appData'),'Calcium'));

// Extension support (Chrome Web Store + chrome.* APIs). If it fails to load, the browser keeps working without extensions.
let ECE = null, CWS = null, extensions = null;
try { ({ ElectronChromeExtensions: ECE } = require('electron-chrome-extensions')); } catch (e) { console.warn('Extension library missing:', e.message); }
try { CWS = require('./vendor/secure-web-store'); } catch (e) { console.warn('Web Store library missing:', e.message); }

const isMac = process.platform === 'darwin';

// The ad blocker library leaves an unhandled rejection when it cannot run a script in a closed frame.
// Harmless; silenced so it doesn't flood the terminal, other errors still show.
process.on('unhandledRejection', (e) => {
  if (e && /Script failed to execute/.test(e.message || '')) return;
  console.error('Unhandled rejection:', e);
});

// ---------------------------------------------------------------- Persistent settings
const SETTINGS_FILE = path.join(app.getPath('userData'), 'ayarlar.json');
const DEFAULTS = {
  searchEngine: 'google',
  calciumProtection:true,calciumAllowedSites:[],
  forceDarkPages: false,
  strictIsolation: true,    // true = every site in its own process like Chrome (much more RAM); false = only login/payment/protected sites isolated
  clearGoogleOnExit: false,  // when on, Google cookies/site data are cleared on exit (signs out of Google)
  keepLogins: true,          // keep site logins across restarts (session cookies are made persistent)
  theme: 'sistem',
  uiFont:'default',
  firstRunDone: false,
  updatePromptDismissed:false,updatePromptOfferedVersion:'',
  siteCommands:[],textReplacements:[],
  shortcuts: [],             // favorites on the new tab page {title, url, icon}
  bookmarksEnabled: false,
  bookmarks: [],
  sitePerms: {},             // "origin|permission" -> true/false
  deviceGrants: [],          // {type, origin, vendorId, productId, serialNumber}
  unpackedExtensions: [],    // extensions loaded from a folder
  disabledExtensions: [],    // disabled extensions {id, path}: files kept, not loaded (no RAM)
  hiddenExtensions: [],      // extension IDs whose toolbar icon is hidden
  hoverZoom: true,           // built-in image hover zoom (Imagus-like), on by default
  tabAudio: false,            // speaker icon on tabs + click to mute (both gone when off)
  memorySaver:true, sleepExcludedSites:[],
  sleepTabs: true,           // put unused background tabs to sleep (after sleepMinutes)
  newTabPrompt: true,        // Centered search for new tabs and address-bar focus
  verticalTabs: true,       // vertical tabs (sidebar on the left)
  verticalWidth: 240,        // vertical sidebar width (px); at its narrowest only icons
  verticalAutoHide: true,
  language: 'auto',         // UI language: 'auto' (Windows language) | 'tr' | 'en'
  pitchBlack: true,         // pure black in dark theme
  protectedSites: [],        // Protected Sites: cookies and site data not cleared on cleanup (registrable domain)
  clearPrefs: { range: 'all', history: true, downloads: false, cookies: true, cache: false, protect: true },   // last choice in the clear-data dialog   // auto-hide mode: sidebar hidden, opens at the same width when the mouse hits the left edge (Ctrl+S)
  restoreSession: true,      // previous tabs come back (asleep) on startup
  sleepMinutes: 10,          // background tabs are put to sleep after this many minutes
  askDownloadLocation: true,
  downloadNotify: false       // Windows notification when a download finishes
};
const SLEEP_CHOICES = [5, 10, 30, 60];
let settings = { ...DEFAULTS };
{const stored=readBoundedJson(SETTINGS_FILE,8*1024*1024,null);if(stored&&typeof stored==='object'&&!Array.isArray(stored))settings={...DEFAULTS,...stored};}
// Follow the OS language until the user explicitly changes it in Settings.
if(!['auto','tr','en'].includes(settings.language))settings.language='auto';
if(!validUiFont(settings.uiFont))settings.uiFont='default';
if (!settings.isolationSecurityMigration) { settings.strictIsolation=true;settings.isolationSecurityMigration=true; }
if(!Array.isArray(settings.calciumAllowedSites))settings.calciumAllowedSites=[];
if(!Array.isArray(settings.sleepExcludedSites))settings.sleepExcludedSites=[];
if(!Array.isArray(settings.deviceGrants))settings.deviceGrants=[];
settings.siteCommands=customShortcuts.normalizeRules('site',settings.siteCommands);settings.textReplacements=customShortcuts.normalizeRules('text',settings.textReplacements);
settings.updatePromptDismissed=settings.updatePromptDismissed===true;
if(typeof settings.updatePromptOfferedVersion!=='string'||settings.updatePromptOfferedVersion.length>32)settings.updatePromptOfferedVersion='';
settings.bookmarksEnabled=false;settings.tabAudio=false;settings.downloadNotify=false;
settings.restoreSession=true;delete settings.adblockEngine;delete settings.checkUpdates;delete settings.newtabTitle;
if(!['sistem','acik','koyu'].includes(settings.theme))settings.theme=['gece','orman','murdum'].includes(settings.theme)?'koyu':'acik';
let saveTimer = null;
function saveSettings(now = false) {
  clearTimeout(saveTimer);
  const write = () => { try { fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) { console.warn('Could not save settings:', e.message); } };
  if (now) write(); else saveTimer = setTimeout(write, 300);
}
// Application updates are opt-in to download/install; startup only reads release metadata.
const appUpdates=require('./app-updates').createAppUpdates({
 currentVersion:app.getVersion(),cacheDir:path.join(app.getPath('userData'),'updates'),
 canInstall:app.isPackaged&&process.platform==='win32'&&process.arch==='x64',
 readPreferences:()=>settings,savePreferences:patch=>{Object.assign(settings,patch);saveSettings(true);},
 launchInstaller:async(file,digest)=>{
  // Close only after the themed native installer acknowledges readiness.
  await require('./app-updates').launchWindowsInstaller(file,digest,{appPath:process.execPath});
  setTimeout(()=>app.quit(),100);
 },onChange:()=>publishAppUpdates()
});
let updateStartupScheduled=false;
function scheduleUpdateCheck(){
 if(updateStartupScheduled||!settings.firstRunDone||!app.isPackaged||process.platform!=='win32'||process.env.CALCIUM_TEST_MODE)return;
 updateStartupScheduled=true;setTimeout(()=>appUpdates.check({manual:false}),1000).unref();
}
function appUpdateData(){
 const s=appUpdates.snapshot();
 const errors={check:'Güncellemeler denetlenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.',manifest:'Bu sürüm için doğrulanmış kurulum dosyası bulunamadı.',integrity:'Kurulum dosyası doğrulanamadı. Dosya çalıştırılmadı.',download:'Güncelleme tamamlanamadı. Tekrar deneyebilirsin.',launch:'Güncelleme başlatılamadı. Calcium kapatılmadı. Tekrar deneyebilirsin.',unsupported:'Bu kurulumda otomatik yükleme kullanılamıyor. Sürüm sayfasından indirebilirsin.'};
 const labels={idle:'Yeni sürümleri buradan denetleyebilirsin.',checking:'Güncellemeler denetleniyor…',current:'Calcium güncel.',available:T('Yeni sürüm')+': '+s.version,downloading:T('Güncelleme indiriliyor…')+(uiLang()==='en'?' '+s.progress+'%':' %'+s.progress),installing:'Kurulum başlatılıyor…',launched:'Kurulum başlatıldı.'};
 return {...s,message:s.status==='error'?T(errors[s.error]||errors.download):T(labels[s.status]||labels.idle)};
}
function closeUpdateNotice(w){
 const view=w.updateNotice;if(!view)return;w.updateNotice=null;
 try{w.win?.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close();}catch{}
}
function layoutUpdateNotice(w){
 if(!w?.win||!w.updateNotice)return;
 const {width,height}=w.win.getContentBounds(),top=inWin(w,()=>vertical()?TOOLBAR+(hasBookmarks()?BOOKMARKS:0)+(findOpen?FINDBAR:0):uiHeight())+8;
 const current=w===W,open=current?overlayOpen:w.overlayOpen,kind=current?overlayKind:w.overlayKind;
 const blockingOverlay=open&&!['side','sidedrag','tabdrag'].includes(kind);
 const visible=!blockingOverlay&&!w.win.isFullScreen()&&!(current?htmlFullscreen:w.htmlFullscreen)&&height-top>120;
 w.updateNotice.setVisible(visible);w.updateNotice.setBounds({x:Math.max(6,width-372),y:top,width:Math.min(360,width-12),height:Math.min(190,Math.max(1,height-top-6))});
 if(visible)w.win.contentView.addChildView(w.updateNotice);
}
function publishAppUpdates(){
 const state=appUpdateData();const owner=windows.find(w=>w.updateNotice)||lastWin(true);
 for(const w of windows){
  if(!state.notice||w!==owner||w.incognito){closeUpdateNotice(w);}else if(!w.updateNotice){
   const view=w.updateNotice=new WebContentsView({webPreferences:{session:mainSes,preload:path.join(__dirname,'page-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,spellcheck:false}});
   view.setBackgroundColor('#00000000');view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',event=>event.preventDefault());
   view.webContents.loadFile(path.join(__dirname,'update-notice.html'));w.win.contentView.addChildView(view);
  }
  layoutUpdateNotice(w);
  for(const tab of w.tabs){if(tab.view&&pageKind(tab.url)==='settings')try{tab.view.webContents.send('page-update',{changed:'app-update',updateState:state});}catch{}}
  if(w.updateNotice&&!w.updateNotice.webContents.isDestroyed())w.updateNotice.webContents.send('page-update',{updateState:state});
 }
}

// Once on old installs: the user wanted site logins to persist; Google clearing is turned off
if (!settings.keepLoginsSet) { settings.clearGoogleOnExit = false; settings.keepLogins = true; settings.keepLoginsSet = true; saveSettings(true); }
// Nov 2026: image zoom is now on by default (turned on once, since old installs have "off" saved in the file)
if (!settings.hoverZoomOnSet) { settings.hoverZoom = true; settings.hoverZoomOnSet = true; saveSettings(true); }
// The old "Never" (0 min) choice is now a separate key
if (!SLEEP_CHOICES.includes(settings.sleepMinutes)) { if (settings.sleepMinutes === 0) settings.sleepTabs = false; settings.sleepMinutes = 10; }
const SIDE_MIN = 56;    // narrowest: tab icons only
const sideWidth = (winWidth) => Math.round(Math.max(SIDE_MIN, Math.min(settings.verticalWidth || 240, Math.max(SIDE_MIN, Math.min(560, (winWidth || 1280) * 0.6)))));

const SEARCH_ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?pws=0&udm=14&q=' }, // pws=0: non-personalized, udm=14: no AI overview
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
  yandex: { name: 'Yandex', url: 'https://yandex.com.tr/search/?text=' }
};
const searchUrl = () => (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google).url;

const NEWTAB_BASE = pathToFileURL(path.join(__dirname, 'newtab.html')).href;
const newtabUrl = () => NEWTAB_BASE + '#' + encodeURIComponent(searchUrl());
const isNewtab = (u) => typeof u === 'string' && u.split('#')[0] === NEWTAB_BASE;
const WELCOME_URL = pathToFileURL(path.join(__dirname, 'welcome.html')).href;
const HISTORY_URL = pathToFileURL(path.join(__dirname, 'history.html')).href;
const DOWNLOADS_URL = pathToFileURL(path.join(__dirname, 'downloads.html')).href;
const SETTINGS_URL = pathToFileURL(path.join(__dirname, 'settings.html')).href;
const UPDATE_NOTICE_URL=pathToFileURL(path.join(__dirname,'update-notice.html')).href;
const SECURITY_URL = pathToFileURL(path.join(__dirname, 'securitywarning.html')).href;
const TASKS_URL = pathToFileURL(path.join(__dirname, 'taskmanager.html')).href;
const EXTENSIONS_URL = pathToFileURL(path.join(__dirname, 'extensions.html')).href;
const baseOf = (u) => (typeof u === 'string' ? u.split('#')[0].split('?')[0] : '');
// Short names shown in and typeable into the address bar
const PAGE_ALIASES = {
  'calcium://tasks': TASKS_URL, 'calcium://task-manager': TASKS_URL,
  'calcium://history': HISTORY_URL, 'calcium://gecmis': HISTORY_URL,
  'calcium://downloads': DOWNLOADS_URL, 'calcium://indirilenler': DOWNLOADS_URL,
  'calcium://settings': SETTINGS_URL, 'calcium://ayarlar': SETTINGS_URL,
  'calcium://extensions': EXTENSIONS_URL, 'calcium://uzantilar': EXTENSIONS_URL,
  // Legacy aliases keep internal pages in older saved sessions accessible.
  'mondium://tasks': TASKS_URL, 'mondium://task-manager': TASKS_URL,
  'mondium://history': HISTORY_URL, 'mondium://gecmis': HISTORY_URL,
  'mondium://downloads': DOWNLOADS_URL, 'mondium://indirilenler': DOWNLOADS_URL,
  'mondium://settings': SETTINGS_URL, 'mondium://ayarlar': SETTINGS_URL,
  'mondium://extensions': EXTENSIONS_URL, 'mondium://uzantilar': EXTENSIONS_URL
};
function pageKind(u) {
  const b = baseOf(u);
  if (b === SECURITY_URL) return 'security';
  if (b === UPDATE_NOTICE_URL) return 'update-notice';
  if (b === TASKS_URL) return 'tasks';
  if (b === HISTORY_URL) return 'history';
  if (b === DOWNLOADS_URL) return 'downloads';
  if (b === SETTINGS_URL) return 'settings';
  if (b === EXTENSIONS_URL) return 'extensions';
  if (b === WELCOME_URL) return 'welcome';
  return isNewtab(u) ? 'newtab' : null;
}
const isInternal = (u) => !!pageKind(u);
function displayUrl(u) {
  const k = pageKind(u);
  if (k === 'security') return 'calcium://security';
  if (k === 'tasks') return 'calcium://tasks';
  if (k === 'history') return 'calcium://history';
  if (k === 'downloads') return 'calcium://downloads';
  if (k === 'settings') return 'calcium://settings';
  if (k === 'extensions') return 'calcium://extensions';
  return k ? '' : (u || '');
}

// ---------------------------------------------------------------- History and download list (this computer only)
const HISTORY_FILE = path.join(app.getPath('userData'), 'gecmis.json');
const DOWNLOADS_FILE = path.join(app.getPath('userData'), 'indirilenler.json');
const HISTORY_MAX = 5000, HISTORY_DAYS = 90, DOWNLOADS_MAX = 100;
function readJsonArray(f) { const a=readBoundedJson(f,16*1024*1024,[]);return Array.isArray(a)?a:[]; }
let history = readJsonArray(HISTORY_FILE).filter((h) => h && typeof h.url === 'string' && h.t > Date.now() - HISTORY_DAYS * 864e5).slice(0,HISTORY_MAX);
const listTimers = {};
function writeList(f, data, now) {
  clearTimeout(listTimers[f]);
  const json = () => JSON.stringify(data());
  if (now) { try { fs.writeFileSync(f, json()); } catch (e) { console.warn('Could not write:', f, e.message); } return; }
  listTimers[f] = setTimeout(() => { fsp.writeFile(f, json()).catch((e) => console.warn('Could not write:', f, e.message)); }, 2000);
}
const saveHistory = (now = false) => writeList(HISTORY_FILE, () => history, now);
const saveDownloads = (now = false) => writeList(DOWNLOADS_FILE, () => downloads.filter((d) => !d.incognito).map(({ item, ...d }) => d), now);
const SEARCH_HISTORY_FILE=path.join(app.getPath('userData'),'aramalar.json');
let searchHistory=readJsonArray(SEARCH_HISTORY_FILE).filter(h=>h&&typeof h.query==='string'&&h.query.length<=1024&&h.t>Date.now()-90*864e5).slice(0,500);
const saveSearchHistory=(now=false)=>writeList(SEARCH_HISTORY_FILE,()=>searchHistory,now);
function recordSearch(query){
 if(!query||query.length>1024)return;const list=W.incognito?(W.searchHistory||(W.searchHistory=[])):searchHistory;
 const key=query.toLocaleLowerCase('tr'),next=[{query,t:Date.now()},...list.filter(h=>h.query.toLocaleLowerCase('tr')!==key)].slice(0,500);
 if(W.incognito)W.searchHistory=next;else{searchHistory=next;saveSearchHistory();}
}
ipcMain.handle('calcium-text-shortcuts',e=>{
 const tab=byWcId.get(e.sender.id);if(!tab||e.sender.session!==tab.w.ses||!/^https?:/i.test(e.senderFrame?.url||''))return null;
 return {rules:settings.textReplacements,script:require('./text-expansion').installTextExpansion.toString()};
});
ipcMain.on('calcium-zoom-wheel',(event,direction)=>{
 const tab=byWcId.get(event.sender.id);if(!tab||event.senderFrame!==event.sender.mainFrame||![1,-1].includes(direction))return;
 setPageZoom(event.sender,direction);
});
function broadcastTextShortcuts(){for(const t of allTabs())if(t.view&&!t.view.webContents.isDestroyed())t.view.webContents.send('calcium-text-shortcuts-changed',settings.textReplacements);}

// Session: URLs of open tabs. Local pages are stored by short name (calcium://...) so they open even if the folder moves.
const SESSION_FILE = path.join(app.getPath('userData'), 'oturum.json');
// Incognito windows are not saved. When the last normal window closes (or on quit) the last snapshot is kept.
let lastSessionData = null, quitting = false;
function sessionData() {
  saveCtx();
  const ws = windows.filter((w) => !w.incognito);
  if (!ws.length || quitting && lastSessionData) return lastSessionData;
  lastSessionData = { windows: ws.map((w) => {
    const list = [];
    let active = 0;
    for (const t of w.tabs) {
      const k = pageKind(t.url);
      if (k === 'newtab' || k === 'welcome' || k === 'security' || !t.url) continue;
      if (t.id === w.activeId) active = list.length;
      list.push({ url: k ? displayUrl(t.url) : t.url, title: t.title || '', favicon: t.favicon || null, iconColor: t.iconColor || null, pinned: !!t.pinned, muted: !!t.muted });
    }
    return { active, tabs: list };
  }).filter((x) => x.tabs.length) };
  return lastSessionData;
}
const saveSession = (now = false) => writeList(SESSION_FILE, sessionData, now);

// ------------------------------------------- UI language (i18n.js). Turkish source; English comes from the dictionary.
// 'auto': Turkish if the Windows language is Turkish, otherwise English. Chromium's own language (Accept-Language sent
// to sites, built-in PDF viewer) is set at startup from the chosen language; UI changes apply immediately.
let uiLangCache = null;
function uiLang() {
  if (uiLangCache) return uiLangCache;
  if (settings.language === 'tr' || settings.language === 'en') return (uiLangCache = settings.language);
  let sys = '';
  try { sys = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()[0]) || app.getSystemLocale() || app.getLocale() || ''; } catch {}
  return (uiLangCache = /^tr(?:[-_]|$)/i.test(sys) ? 'tr' : 'en');
}
const T = (text) => I18N.translate(text, uiLang());
// UI text in scripts injected into pages (reader mode, image zoom): single-quoted strings are translated
const localizeSrc = (src) => (uiLang() === 'tr' ? src : src.replace(/'([^'\\\n]*)'/g, (m, x) => { const t = T(x); return t === x ? m : JSON.stringify(t); }));
ipcMain.handle('calcium-ui-font',(e)=>{
 const from=e.senderFrame?.url||'';
 const trusted=!!pageKind(from)||windows.some(w=>w.ui?.webContents===e.sender);
 return trusted?uiFontFamily(settings.uiFont):null;
});
function broadcastUiFont(){
 const family=uiFontFamily(settings.uiFont);
 for(const wc of webContents.getAllWebContents()){
  if(wc.isDestroyed())continue;
  if(pageKind(wc.getURL())||windows.some(w=>w.ui?.webContents===wc))wc.send('calcium-ui-font',family);
 }
}
ipcMain.on('calcium-lang', (e) => { e.returnValue = uiLang(); });
app.commandLine.appendSwitch('lang',uiLang()==='tr'?'tr':'en-US');
// Native menus, dialogs and notifications in the chosen language
const trMenu = (list) => list.map((it) => ({ ...it, ...(it.label ? { label: T(it.label) } : {}), ...(Array.isArray(it.submenu) ? { submenu: trMenu(it.submenu) } : {}) }));
const trOpts = (o) => (o && typeof o === 'object' ? {
  ...o,
  ...(o.title ? { title: T(o.title) } : {}), ...(o.message ? { message: T(o.message) } : {}), ...(o.detail ? { detail: T(o.detail) } : {}),
  ...(o.checkboxLabel ? { checkboxLabel: T(o.checkboxLabel) } : {}), ...(Array.isArray(o.buttons) ? { buttons: o.buttons.map(T) } : {}),
  ...(Array.isArray(o.filters) ? { filters: o.filters.map((f) => ({ ...f, name: T(f.name) })) } : {})
} : o);
for (const k of ['showMessageBox', 'showMessageBoxSync', 'showOpenDialog', 'showOpenDialogSync', 'showSaveDialog', 'showSaveDialogSync']) {
  const orig = dialog[k];
  if (typeof orig === 'function') dialog[k] = (w, o) => (o === undefined ? orig.call(dialog, trOpts(w)) : orig.call(dialog, w, trOpts(o)));
}

// ------------------------------------------- Privacy + performance command-line switches
const cl = app.commandLine;
// Let V8 return temporary startup/compilation memory sooner when the renderer
// becomes idle. Keep its normal heap sizes and JIT; do not force periodic GCs.
// Verified against the pinned Electron engine. Respect explicit CLI tuning.
const existingJsFlags=cl.getSwitchValue('js-flags');
if(!/--gc-memory-reducer-start-delay-ms(?:=|\s)/.test(existingJsFlags))cl.appendSwitch('js-flags',[existingJsFlags,'--gc-memory-reducer-start-delay-ms=10000'].filter(Boolean).join(' '));
[
  // Note: 'disable-background-networking' and 'disable-component-update' are NOT used:
  // both block downloading/updating the Widevine DRM module (Netflix, Exxen, BluTV, Spotify...).
  // Electron has no background services like Safe Browsing, translation or sync anyway.
  'disable-domain-reliability',
  'disable-breakpad', 'disable-default-apps',
  'disable-sync', 'no-pings', 'no-default-browser-check', 'no-first-run',
  'process-per-site'
].forEach((s) => cl.appendSwitch(s));
cl.appendSwitch('enable-features', [
  'ParallelDownloading',            // Thorium: parallel downloads
  'PlatformHEVCDecoderSupport',     // Thorium: HEVC/H.265 (if hardware supports it)
  ...(settings.forceDarkPages ? ['WebContentsForceDark'] : [])
].join(','));
cl.appendSwitch('disable-features', [
  'BackForwardCache', 'SpareRendererForSitePerProcess', 'Translate', 'TranslateUI', 'MediaRouter',
  'OptimizationHints', 'AutofillServerCommunication',
  'BrowsingTopics', 'Fledge', 'InterestGroupStorage', 'PrivacySandboxAdsAPIs',
  'AttributionReportingCrossAppWeb', 'DialMediaRouteProvider',
  'WebAuthenticationConditionalUI', 'WebAuthenticationPasskeysUI'   // passkey popups
].join(','));
// Disable Chromium's automatic page-translation prompts in every session.
app.commandLine.appendSwitch('disable-translate');
// RAM: full site isolation puts every third-party iframe in its own process (measured: 6 sites, 21 processes, 4.6 GB
// working set; off: 8 processes, 2.8 GB). Partial isolation like Android Chrome: general sites share processes, login,
// payment and protected sites (where you sign in) still get their own. Settings > Privacy > full isolation.
const ISOLATED_ORIGINS = ['https://accounts.google.com', 'https://login.microsoftonline.com', 'https://login.live.com', 'https://appleid.apple.com',
  'https://github.com', 'https://paypal.com', 'https://facebook.com', 'https://x.com', 'https://discord.com', 'https://web.whatsapp.com'];
if (settings.strictIsolation) cl.appendSwitch('site-per-process');
if (!settings.strictIsolation) {
  cl.appendSwitch('disable-site-isolation-trials');
  const prot = (Array.isArray(settings.protectedSites) ? settings.protectedSites : []).filter((x) => /^[a-z0-9.-]+$/i.test(x) && x.includes('.')).map((x) => 'https://' + x);
  cl.appendSwitch('isolate-origins', [...new Set([...ISOLATED_ORIGINS, ...prot])].join(','));
}
cl.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_interface_only');

// The browser's unmodified, original identity (with the Electron and app name suffixes).
// Google sign-in ONLY works with this (see below).
const ORIGINAL_UA = app.userAgentFallback;

// For all other sites, make the User-Agent look like regular Chrome
app.userAgentFallback = app.userAgentFallback
  .replace(/\s?Electron\/\S+/i, '')
  .replace(new RegExp('\\s?' + app.getName().replace(/[^\w]/g, '\\$&') + '\\/\\S+', 'i'), '');

if (!app.requestSingleInstanceLock()) { app.quit(); }

// ---------------------------------------------------------------- Google sign-in fix
// Google rejects browsers that look exactly like "plain Chrome" but aren't real Chrome after the email step,
// saying "This browser or app may not be secure". Spoofing Firefox is caught too.
// Measured working approach: on sign-in pages use the browser's own, unmodified identity
// (Chrome version + app name + Electron suffixes). Client hints (Sec-CH-UA) are left alone.
// Source: github.com/stablyai/orca/issues/11518 (Sep 2026, 12/12 measurements)
const LOGIN_UA = ORIGINAL_UA;
const GOOGLE_LOGIN_HOST = /^accounts\.(google|youtube)\.[a-z.]+$/i;
const isGoogleLogin = (u) => { try { return GOOGLE_LOGIN_HOST.test(new URL(u).hostname); } catch { return false; } };
// Google search: disable AI Overviews. udm=14 = web results only.
const GOOGLE_HOST = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/i;
function noAiUrl(u) {
  try {
    const x = new URL(u);
    if (!GOOGLE_HOST.test(x.hostname) || x.pathname !== '/search') return null;
    if (x.searchParams.has('udm') || x.searchParams.has('tbm')) return null;   // leave images, news etc. tabs alone
    x.searchParams.set('udm', '14');
    return x.href;
  } catch { return null; }
}

// Load a URL with the right identity (User-Agent) before navigating. Chromium does not change the UA
// of a navigation already started, so we set it BEFORE going to the sign-in page and reload from scratch.
function prepareUrl(wc, url) {
  const fixed = noAiUrl(url) || url;
  const ua = isGoogleLogin(fixed) ? LOGIN_UA : app.userAgentFallback;
  if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
  return { url: fixed, ua };
}

function attachLoginFix(wc) {
  const reroute = (e, url) => {
    if (!url) return;
    const needsUa = isGoogleLogin(url) && wc.getUserAgent() !== LOGIN_UA;
    const fixed = noAiUrl(url);
    if (!needsUa && !fixed) return;
    e.preventDefault();
    const p = prepareUrl(wc, fixed || url);
    wc.loadURL(p.url, { userAgent: p.ua }).catch(() => {});
  };
  wc.on('will-navigate', (e, url) => reroute(e, e.url || url));
  wc.on('will-redirect', (e, url, _inPlace, isMainFrame) => {
    const main = typeof e.isMainFrame === 'boolean' ? e.isMainFrame : isMainFrame;
    if (main) reroute(e, e.url || url);
  });
  // After sign-in, switch back to the normal Chrome identity for later pages
  wc.on('did-start-navigation', (e) => {
    if (!e.isMainFrame || !e.url || e.isSameDocument) return;
    if (!isGoogleLogin(e.url) && wc.getUserAgent() === LOGIN_UA) wc.setUserAgent(app.userAgentFallback);
  });
}

// ---------------------------------------------------------------- State
let win = null, ui = null, ses = null, mainSes = null;
let findOpen = false, htmlFullscreen = false, overlayOpen = false, overlayKind = null;
const TAB_STRIP = 42, TOOLBAR = 46, BOOKMARKS = 32, FINDBAR = 40;
let tabs = [];
const byWcId = new Map();
const downloads = readJsonArray(DOWNLOADS_FILE)
  .filter((d) => d && d.file && d.id).slice(0,DOWNLOADS_MAX)
  .map((d) => (d.state === 'progressing' ? { ...d, state: 'interrupted', paused: false } : d));
let activeId = null, nextId = 1;

// ---------------------------------------------------------------- Windows
// Each window has its own tabs, UI, session (a separate in-memory session for incognito) and state.
// The rest of the code works with "current window" variables (win, ui, ses, tabs, activeId...); at the start
// of each event useWin() switches to that event's window. Safe in single-threaded JS as long as there is no await.
const windows = [];
let W = null, nextWinId = 1;
function saveCtx() { if (W) Object.assign(W, { activeId, findOpen, htmlFullscreen, overlayOpen, overlayKind, pushTimer }); }
function useWin(w) {
  if (!w || w === W || !windows.includes(w)) return W;
  saveCtx();
  W = w;
  ({ win, ui, ses, tabs, activeId, findOpen, htmlFullscreen, overlayOpen, overlayKind, closedTabs, pushTimer } = w);
  return w;
}
const downloadPanels=new Map(),taskPanels=new Map();
const winOfWc = (wc) => { const t = wc && !wc.isDestroyed() ? byWcId.get(wc.id) : null; return t ? t.w : windows.find(w=>w.updateNotice?.webContents===wc) || [...downloadPanels,...taskPanels].find(([,p])=>p.webContents===wc)?.[0] || null; };
const allTabs = () => windows.flatMap((w) => w.tabs);
// Run a job in another window, then switch back to the previous one
function inWin(w, fn) {
  const prev = W;
  useWin(w);
  try { return fn(); } finally { if (prev && windows.includes(prev)) useWin(prev); }
}
const forEachWin = (fn) => { for (const w of [...windows]) inWin(w, () => fn(w)); };
const lastWin = (normalOnly) => windows.filter((w) => !normalOnly || !w.incognito).sort((a, b) => b.focusedAt - a.focusedAt)[0] || null;

const uiHeight = () => (htmlFullscreen ? 0
  : (settings.firstRunDone?TAB_STRIP:0) + TOOLBAR + (hasBookmarks() ? BOOKMARKS : 0) + (findOpen ? FINDBAR : 0));

// ---------------------------------------------------------------- uBlock Origin: the only blocking engine
const UBO_DIR=path.join(__dirname,'vendor','ublock').replace(/app\.asar(?=[\\/])/,'app.asar.unpacked');
let uboId=null,eceReadyResolve,mainBlockResolve;
const eceReady=new Promise(r=>eceReadyResolve=r),mainBlockReady=new Promise(r=>mainBlockResolve=r);
const uboLoads=new WeakMap(),uboErrors=new WeakMap(),privateContent=new WeakMap();
const bridgeFor=w=>w.incognito?null:extensions;
const uboPage=p=>uboId?`chrome-extension://${uboId}/${p}`:null;
function ensureUBlock(target){
 if(uboLoads.has(target))return uboLoads.get(target);
 const job=(async()=>{
  if(process.env.CALCIUM_NO_UBO)return false;
  await eceReady;
  if(!fs.existsSync(path.join(UBO_DIR,'manifest.json')))throw Error('uBlock Origin files are missing');
  if(target!==mainSes){
   if(!await ensureUBlock(mainSes))throw Error('uBlock Origin is unavailable');
   const background=()=>webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.session===mainSes&&w.getURL().startsWith(uboPage('background.html')));
   const content=require('./private-content').attachPrivateContent({ses:target,getBackground:background,ipcMain,preloadPath:path.join(__dirname,'private-content-preload.js')});
   privateContent.set(target,content);
   await require('./private-ubo').attachPrivateUBlock(target,background,webContents,content.prepare);
   // A cosmetic adapter failure must not remove the already working network filter.
   try{await background().executeJavaScript(content.install);}catch(error){console.warn('Private cosmetic filtering:',error.message);}
   return true;
  }
  try{target.registerPreloadScript({id:'calcium-mv2-bridge',type:'frame',filePath:path.join(__dirname,'mv2-bridge.js')});}catch{}
  const api=target.extensions||target;
  const ext=await Promise.race([api.loadExtension(UBO_DIR,{allowFileAccess:false}),timeout(20000).then(()=>{throw Error('uBlock Origin load timed out')})]);
  if(target===mainSes)uboId=ext.id;
  const started=Date.now();let ready=false;
  while(Date.now()-started<10000){const bg=webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.session===target&&w.getURL().startsWith(`chrome-extension://${ext.id}/background.html`));if(bg){try{ready=await Promise.race([bg.executeJavaScript('!!(self.µBlock && self.µBlock.readyToFilter)'),timeout(500)]);if(ready)break;}catch{}}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw Error('uBlock Origin filters are not ready');
  // Electron's extension API does not reliably enforce blocking webRequest listeners.
  // Run network decisions through the loaded uBO engine; cosmetics stay in the extension.
  await require('./private-ubo').attachPrivateUBlock(target,uboBackground,webContents);
  const background=uboBackground();if(background)await background.executeJavaScript("if(!µBlock.userSettings.autoUpdate)µBlock.changeUserSettings('autoUpdate',true);").catch(()=>{});
  console.log('uBlock Origin '+ext.version+' ready'+(target===mainSes?'':' (private)'));return true;
 })().catch(error=>{uboErrors.set(target,error.message);console.error('uBlock Origin:',error.message);return false});
 uboLoads.set(target,job);return job;
}
async function startBlocking(){await ensureUBlock(mainSes);mainBlockResolve();forEachWin(()=>pushState());}
function uboBackground(){return uboId?webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.session===mainSes&&w.getURL().startsWith(uboPage('background.html'))):null;}
async function forceUpdateFilters(){
 const bg=uboBackground();const results=await Promise.allSettled([calciumProtection.refresh({force:true}),threatProtection.refresh(),bg?bg.executeJavaScript("µBlock.scheduleAssetUpdater({now:true,auto:true,fetchDelay:1000}).then(()=>true)"):Promise.resolve(false)]);
 notifyPages('settings');return {ok:results.every(r=>r.status==='fulfilled'&&r.value===true)};
}

ipcMain.on('calcium-form-dirty',(e)=>{
 const tab=byWcId.get(e.sender.id);
 if(tab&&e.sender.session===tab.w.ses&&/^https?:/i.test(e.senderFrame?.url||''))tab.formDirty=true;
});
ipcMain.on('calcium-link-title', (e, data) => {
  e.returnValue=false;const tab=byWcId.get(e.sender.id);
  if(!tab || e.sender.session!==tab.w.ses || !/^https?:/i.test(e.senderFrame?.url||'') || !data || typeof data.url!=='string'||typeof data.title!=='string')return;
  try {if(!/^https?:$/.test(new URL(data.url).protocol))return;}catch{return;}
  const title=data.title.replace(/\s+/g,' ').trim().slice(0,300);if(title){tab.linkTitleHint={url:data.url,title,at:Date.now()};e.returnValue=true;}
});
ipcMain.on('calcium-zoom-download', (e, url) => {
  const tab = byWcId.get(e.sender.id);
  if (!settings.hoverZoom || !tab || !tab.view || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  if (!/^https?:/i.test(e.sender.getURL())) return;
  e.sender.downloadURL(url);
});
ipcMain.on('calcium-edge-px', (e) => { e.returnValue = 60; });
// Auto-hide mode: the sidebar opens when the mouse reaches the page's left edge (reported by page-preload)
ipcMain.on('calcium-edge', (e) => {
  const w = winOfWc(e.sender);
  if (!w || !settings.verticalTabs || !settings.verticalAutoHide) return;
  useWin(w);
  if (activeTab() && activeTab().view && activeTab().view.webContents === e.sender) openSide();
});
// At startup we briefly wait for the blocker so first requests don't slip through. The wait must NEVER lock the user:
// at most 3 s, and once it has elapsed (or the blocker is ready) we never wait again. (It used to wait up to 15 s per
// navigation: if the blocker hung, Enter in the address bar seemed to "do nothing".)
let mainBlockSettled = false;
mainBlockReady.then(() => { mainBlockSettled = true; });
setTimeout(() => { mainBlockSettled = true; }, 12000);
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
const threatProtection = createThreatProtection({root:__dirname,profile:app.getPath('userData')});
const calciumProtection=createCalciumProtection({root:__dirname,profile:app.getPath('userData')});
function calciumSite(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?siteOfHost(u.hostname):null;}catch{return null;}}
function calciumEnabledFor(url){const site=calciumSite(url);return !!site&&settings.calciumProtection!==false&&!settings.calciumAllowedSites.includes(site);}
function toggleCalciumSite(url){const site=calciumSite(url);if(!site)return;const i=settings.calciumAllowedSites.indexOf(site);if(i>=0)settings.calciumAllowedSites.splice(i,1);else settings.calciumAllowedSites.push(site);saveSettings();notifyPages('settings');}

const blockedNavigations = new Map(), trustedThreatHosts = new WeakMap(), navigationEpoch = new WeakMap();
function showThreatWarning(wc,url){
 const tab=byWcId.get(wc.id);if(!tab)return false;
 if(trustedThreatHosts.get(tab.w)?.has(hostOf(url))||!threatProtection.isBlocked(url))return false;
 navigationEpoch.set(wc,(navigationEpoch.get(wc)||0)+1);
 blockedNavigations.set(wc.id,url);wc.loadURL(SECURITY_URL).catch(()=>{});return true;
}
async function go(wc, url) {
  if(calciumEnabledFor(url))url=cleanTrackingUrl(url);
  const epoch=(navigationEpoch.get(wc)||0)+1;navigationEpoch.set(wc,epoch);
  if(showThreatWarning(wc,url))return;
  if (!url.startsWith('file:')) {
    if (wc.session === mainSes) { if (!mainBlockSettled) await Promise.race([mainBlockReady, timeout(3000)]); }
    else await Promise.race([ensureUBlock(wc.session), timeout(3000)]);
  }
  if (wc.isDestroyed() || navigationEpoch.get(wc)!==epoch) return;
  const p = prepareUrl(wc, url);
  wc.loadURL(p.url, { userAgent: p.ua }).catch(() => {});
}

// ---------------------------------------------------------------- Google data cleanup
const GOOGLE_DOMAIN = /(^|\.)google(\.[a-z]{2,3}){1,2}$/i;
async function clearGoogleData() {
  const ses = mainSes;
  if (!ses) return;
  try {
    const cookies = await ses.cookies.get({});
    await Promise.all(cookies
      .filter((c) => GOOGLE_DOMAIN.test((c.domain || '').replace(/^\./, '')))
      .map((c) => ses.cookies.remove(`${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path || '/'}`, c.name).catch(() => {})));
    for (const origin of ['https://www.google.com', 'https://www.google.com.tr', 'https://google.com']) {
      await ses.clearStorageData({ origin, storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'] }).catch(() => {});
    }
    await ses.cookies.flushStore().catch(() => {});
  } catch (e) { console.warn('Could not clear Google data:', e.message); }
}

// ---------------------------------------------------------------- Keep logins
// Many sites keep logins in "session cookies" (no expiry date). They are deleted when the browser closes
// and you must sign in again on every start. Chrome keeps them when "continue where you left off" is on; here
// they are turned into 30-day persistent cookies on exit (and every 15 minutes, against crashes). All stays on this computer.
const KEEP_DAYS = 30;
async function keepSessionCookies() {
  const ses = mainSes;
  if (!ses || !settings.keepLogins) return 0;
  const exp = Math.floor(Date.now() / 1000) + KEEP_DAYS * 86400;
  let n = 0;
  try {
    const list = await ses.cookies.get({});
    await Promise.all(list.filter((c) => c.session && c.domain).map((c) => {
      const host = c.domain.replace(/^\./, '');
      const d = { url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`, name: c.name, value: c.value,
        path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly, expirationDate: exp };
      if (!c.hostOnly) d.domain = c.domain;
      if (c.sameSite && c.sameSite !== 'unspecified') d.sameSite = c.sameSite;
      return ses.cookies.set(d).then(() => { n++; }, () => {});
    }));
    await ses.cookies.flushStore().catch(() => {});
  } catch (e) { console.warn('Could not keep sessions:', e.message); }
  return n;
}

// ---------------------------------------------------------------- Session
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const hostOf = (u) => { try { return new URL(u).host; } catch { return u || ''; } };

// ---------------------------------------------------------------- Permission bubble (like Chrome)
// Bubble below the left of the address bar: "<site> wants to: [icon] Know your location  [Block] [Allow]".
// Multiple requests in the same window are asked in turn. No extra window/process; drawn in the UI layer.
const PERM_TEXT = {
  geolocation: { icon: 'location', text: 'Konumunuzu bilmek' },
  notifications: { icon: 'bell', text: 'Bildirim göstermek' },
  'display-capture': { icon: 'screen', text: 'Ekranınızı görmek' },
  openExternal: { icon: 'open', text: 'Bilgisayarınızdaki bir uygulamayı açmak' },
  media: { icon: 'camera', text: 'Kameranızı kullanmak' }
};
function mediaText(details) {
  const t = (details && details.mediaTypes) || [];
  const rows = [];
  if (t.includes('video') || !t.length) rows.push({ icon: 'camera', text: 'Kameranızı kullanmak' });
  if (t.includes('audio')) rows.push({ icon: 'mic', text: 'Mikrofonunuzu kullanmak' });
  return rows;
}
// The "It can:" list from Chrome's add-extension dialog
function extPermissionRows(m) {
  m = m || {};
  const perms = new Set([...(m.permissions || []), ...(m.optional_permissions || [])].filter((p) => typeof p === 'string'));
  const hosts = new Set([...(m.host_permissions || []), ...(m.permissions || []).filter((p) => /[:/*]/.test(p))]);
  for (const cs of m.content_scripts || []) for (const x of cs.matches || []) hosts.add(x);
  const rows = [];
  const all = [...hosts].some((h) => h === '<all_urls>' || /^(\*|https?):\/\/\*\/\*$/.test(h));
  if (all || perms.has('debugger')) rows.push({ icon: 'globe', text: 'Tüm web sitelerindeki verilerinizi okuyup değiştirebilir' });
  else if (hosts.size) {
    const names = [...new Set([...hosts].map((h) => h.replace(/^[^:]+:\/\//, '').replace(/^\*\./, '').replace(/\/.*$/, '')).filter(Boolean))];
    const more = names.length - 4;
    rows.push({ icon: 'globe', text: T('Şu sitelerdeki verilerinizi okuyup değiştirebilir:') + ' ' + names.slice(0, 4).join(', ') + (more > 0 ? (uiLang() === 'en' ? ` and ${more} more ${more === 1 ? 'site' : 'sites'}` : ` ve ${more} site daha`) : '') });
  }
  const map = [
    ['history', 'Tarama geçmişinizi okuyup değiştirebilir'], ['tabs', 'Tarama geçmişinizi okuyabilir'],
    ['bookmarks', 'Yer işaretlerinizi okuyup değiştirebilir'], ['downloads', 'İndirmelerinizi yönetebilir'],
    ['clipboardRead', 'Kopyaladığınız verileri okuyabilir'], ['clipboardWrite', 'Kopyala-yapıştır verilerini değiştirebilir'],
    ['geolocation', 'Konumunuzu bilebilir'], ['notifications', 'Bildirim gösterebilir'],
    ['management', 'Uygulamalarınızı, uzantılarınızı ve temalarınızı yönetebilir'], ['tabCapture', 'Ekranınızın içeriğini yakalayabilir'],
    ['desktopCapture', 'Ekranınızın içeriğini yakalayabilir'], ['privacy', 'Gizlilik ayarlarınızı değiştirebilir'],
    ['proxy', 'Ağ trafiğinizi başka sunucuya yönlendirebilir'], ['nativeMessaging', 'Bilgisayarınızdaki uygulamalarla iletişim kurabilir'],
    ['userScripts', 'Sayfalarda kendi betiklerini çalıştırabilir']
  ];
  const seen = new Set();
  for (const [p, text] of map) if (perms.has(p) && !seen.has(text) && !(p === 'tabs' && perms.has('history'))) { seen.add(text); rows.push({ icon: 'check', text }); }
  if (!rows.length) rows.push({ icon: 'check', text: 'Özel izin gerektirmiyor' });
  return rows;
}
const prompts = [];   // { id, w, data, resolve, shown }
let promptSeq = 1;
function askPrompt(data) {
  return new Promise((resolve) => {
    const p = { id: promptSeq++, w: W, data, resolve, shown: false };
    prompts.push(p);
    if (!prompts.some((x) => x !== p && x.w === p.w)) showPrompt(p);
  });
}
function showPrompt(p) {
  inWin(p.w, () => {
    if (!win || !ui) { settlePrompt(p, 'dismiss'); return; }
    if (overlayOpen) closeOverlay(false);
    p.shown = true;
    overlayOpen = true;
    overlayKind = 'prompt';
    raiseUi();
    layout();
    ui.webContents.focus();
    send('prompt-open', { id: p.id, ...p.data });
  });
}
function settlePrompt(p, answer) {
  const i = prompts.indexOf(p);
  if (i < 0) return;
  prompts.splice(i, 1);
  p.resolve(answer);
  if (!p.w.win) return;
  inWin(p.w, () => {
    send('prompt-close');
    if (overlayKind === 'prompt') { overlayOpen = false; overlayKind = null; layout(); }
    const next = prompts.find((x) => x.w === p.w);
    if (next) showPrompt(next); else withActive((wc) => wc.focus());
  });
}
function answerPrompt(arg) {
  const p = prompts.find((x) => x.id === (arg && arg.id));
  if (p) settlePrompt(p, arg.answer === 'ok' ? 'ok' : arg.answer === 'cancel' ? 'cancel' : 'dismiss');
}

// Incognito session: no "persist:" prefix, so nothing is kept on disk. Shared by all incognito windows;
// everything in it is cleared when the last one closes.
let incognitoSes = null;
const incognitoPerms = {};
function getIncognitoSession() {
  if (!incognitoSes) { incognitoSes = session.fromPartition('calcium-gizli'); setupSession(incognitoSes, true); }
  return incognitoSes;
}
function endIncognito() {
  if (!incognitoSes || windows.some((w) => w.incognito)) return;
  devicePolicies.get(incognitoSes)?.clear();
  privateContent.get(incognitoSes)?.clear();
  for(const key of iconColors.keys())if(key.startsWith('private:'))iconColors.delete(key);
  incognitoSes.clearStorageData().catch(() => {});
  incognitoSes.clearCache().catch(() => {});
  for (const k of Object.keys(incognitoPerms)) delete incognitoPerms[k];
  for (let i = downloads.length - 1; i >= 0; i--) if (downloads[i].incognito && downloads[i].state !== 'progressing') downloads.splice(i, 1);
}

function setupSession(ses = mainSes, incognito = false) {
  ses.registerPreloadScript({id:'calcium-scrollbar',type:'frame',filePath:path.join(__dirname,'overlay-scrollbar.js')});
  ses.setSpellCheckerEnabled(false);
  ses.setUserAgent(app.userAgentFallback);

  // Thorium: DNT + Global Privacy Control on by default
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const tab=byWcId.get(details.webContentsId),topUrl=tab?.view?.webContents.getURL()||tab?.url;
    if(tab&&calciumEnabledFor(topUrl)&&calciumProtection.shouldBlock(details.url,topUrl,details.resourceType)){tab.blocked=(tab.blocked||0)+1;inWin(tab.w,()=>schedulePush());cb({cancel:true});return;}
    if(details.resourceType==='mainFrame' && threatProtection.isBlocked(details.url)){const tab=byWcId.get(details.webContentsId);if(!trustedThreatHosts.get(tab?.w)?.has(hostOf(details.url))){cb({cancel:true});return;}}
    details.requestHeaders['DNT'] = '1';
    if (isGoogleLogin(details.url)) details.requestHeaders['User-Agent'] = LOGIN_UA;
    details.requestHeaders['Sec-GPC'] = '1';
    cb({ requestHeaders: details.requestHeaders });
  });

  // ---- Site permissions (like Chrome: the decision is remembered)
  const alwaysAllow = new Set([
    'fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock',
    // Needed by video players: DRM (EME), cookie access for embedded players, audio output selection
    'mediaKeySystem', 'storage-access', 'top-level-storage-access', 'speaker-selection', 'persistent-storage'
  ]);
  const deviceKinds = new Set(['hid', 'usb', 'serial', 'bluetooth']);
  // Like Chrome, the decision is asked in a bubble below the address bar (askPermission). Allow / Block are
  // remembered; closing (x) or clicking outside only denies this once. In incognito, decisions are not persisted.
  const perms = incognito ? incognitoPerms : settings.sitePerms;
  const known = (key) => (key in perms ? perms[key] : key in settings.sitePerms && settings.sitePerms[key] === false ? false : undefined);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (alwaysAllow.has(permission) || deviceKinds.has(permission)) return cb(true);
    if (!Object.hasOwn(PERM_TEXT,permission)) return cb(false);
    const origin = normalizedOrigin(details?.requestingUrl || wc?.getURL());
    if(!origin)return cb(false);
    const key = origin + '|' + permission;
    const finish=allowed=>{if(allowed&&['media','display-capture'].includes(permission)){const tab=byWcId.get(wc?.id);if(tab)tab.mediaPermission=true;}cb(allowed);};
    const k = known(key);
    if (k !== undefined) return finish(k);
    const w = winOfWc(wc);
    if (!w) return cb(false);
    useWin(w);
    const want = permission === 'media' ? mediaText(details) : PERM_TEXT[permission];
    askPrompt({ host: hostOf(origin), title: `${hostOf(origin)} şunu istiyor:`, rows: [].concat(want), ok: 'İzin ver', cancel: 'Engelle', kind: 'perm' }).then((r) => {
      if (r !== 'dismiss') { perms[key] = r === 'ok'; if (!incognito) saveSettings(); }
      finish(r === 'ok');
    });
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => {
    if (alwaysAllow.has(permission) || deviceKinds.has(permission)) return true;
    origin=normalizedOrigin(origin);if(!origin)return false;
    if(!Object.hasOwn(PERM_TEXT,permission))return false;
    const k = known(origin + '|' + permission);
    if(k===true&&['media','display-capture'].includes(permission)){const tab=byWcId.get(_wc?.id);if(tab)tab.mediaPermission=true;}
    if (k !== undefined) return k;
    return false;
  });

  setupDevices(ses, incognito);
  if (incognito) ensureUBlock(ses);   // the main session is decided by startBlocking()

  // Ask for every download, starting in the configured Downloads folder.
  ses.on('will-download', (_e, item, wc) => {
    const ow = winOfWc(wc);
    if(threatProtection.isBlocked(item.getURL()) && !trustedThreatHosts.get(ow)?.has(hostOf(item.getURL()))){item.cancel();if(wc)showThreatWarning(wc,item.getURL());return;}
    if (ow) useWin(ow);
    const dir = app.getPath('downloads');
    const ext = path.extname(item.getFilename());
    const base = path.basename(item.getFilename(), ext);
    let file = path.join(dir, path.basename(item.getFilename())), n = 1;
    while (fs.existsSync(file)) file = path.join(dir, `${base} (${n++})${ext}`);
    const options = { defaultPath: file, properties: ['showOverwriteConfirmation', 'createDirectory'] };
    // Electron owns the asynchronous save dialog; do not block the main process.
    if(settings.askDownloadLocation!==false)item.setSaveDialogOptions(options);else item.setSavePath(file);
    const d = {
      tabId:byWcId.get(wc?.id)?.id,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: path.basename(file), file,
      url: item.getURL(), t: Date.now(), received: 0, total: item.getTotalBytes(), state: 'progressing', paused: false, item,
      ...(incognito ? { incognito: true } : {})
    };
    downloads.unshift(d);
    if (downloads.length > DOWNLOADS_MAX) downloads.length = DOWNLOADS_MAX;
    item.on('updated', (_ev, state) => {
      const selected=item.getSavePath();if(selected){d.file=selected;d.name=path.basename(selected);}
      d.state = state; d.paused = item.isPaused(); d.received = item.getReceivedBytes(); d.total = item.getTotalBytes();
      forEachWin(() => schedulePush()); notifyPages('downloads');
    });
    item.once('done', (_ev, state) => {
      const selected=item.getSavePath();if(selected){d.file=selected;d.name=path.basename(selected);}
      if(state==='cancelled'&&!selected){const index=downloads.indexOf(d);if(index>=0)downloads.splice(index,1);}
      d.state = state; d.paused = false; d.received = item.getReceivedBytes(); d.item = null;
      saveDownloads(); forEachWin(() => pushState()); notifyPages('downloads');
      if (state === 'completed') notifyDownload(d);
    });
    saveDownloads(); forEachWin(() => pushState()); notifyPages('downloads');
  });
}

// The notification object is kept until clicked (otherwise garbage collection loses the click event)
const liveNotes = new Set();
function notifyDownload(d) {
  if (!settings.downloadNotify || !Notification.isSupported()) return;
  const n = new Notification({ title: T('İndirme tamamlandı'), body: d.name, icon: path.join(__dirname, 'icon.png'), silent: true });
  const drop = () => liveNotes.delete(n);
  n.on('click', () => { drop(); shell.showItemInFolder(d.file); });
  n.on('close', drop);
  liveNotes.add(n);
  setTimeout(drop, 60e3);
  n.show();
}

// ---------------------------------------------------------------- Device support (WebHID / WebUSB / Serial / Bluetooth)
// Used by sites like ATK, VIA, Razer/Logitech web drivers, Arduino web uploader, ESP web flasher.
const devicePolicies = new Map();
const hex4 = (n) => (typeof n === 'number' ? n.toString(16).padStart(4, '0') : String(n || '').replace(/^0x/i, '')).toUpperCase();

const KIND_LABEL = { hid: 'HID cihazı', usb: 'USB cihazı', serial: 'seri bağlantı noktası', bluetooth: 'Bluetooth cihazı' };
const hidInfo = (d) => ({ id: d.deviceId, name: d.name || 'Bilinmeyen HID cihazı', detail: `VID ${hex4(d.vendorId)} · PID ${hex4(d.productId)}`, raw: d });
const usbInfo = (d) => ({ id: d.deviceId, name: [d.manufacturerName, d.productName].filter(Boolean).join(' ') || 'Bilinmeyen USB cihazı', detail: `VID ${hex4(d.vendorId)} · PID ${hex4(d.productId)}`, raw: d });
const serialInfo = (p) => ({ id: p.portId, name: p.displayName || p.portName || 'Seri bağlantı noktası', detail: [p.portName, p.vendorId ? `VID ${hex4(p.vendorId)} · PID ${hex4(p.productId)}` : ''].filter(Boolean).join(' · '), raw: p });
const btInfo = (d) => ({ id: d.deviceId, name: d.deviceName || 'Bilinmeyen cihaz (' + d.deviceId + ')', detail: d.deviceId, raw: d });

// Device chooser: a bubble below the address bar, like in Chrome.
// No extra window/process; drawn in the existing UI layer.
let chooser = null;
function openChooser(kind, origin, list, wc) {
  if (chooser) finishChooser(null);
  const ow = winOfWc(wc);
  if (ow) useWin(ow);
  return new Promise((resolve) => {
    chooser = { kind, origin, devices: new Map(), resolve, w: W };
    for (const d of list) chooser.devices.set(d.id, d);
    if (!win || !ui) { finishChooser(null); return; }
    overlayOpen = true;
    overlayKind = 'chooser';
    raiseUi();
    layout();
    ui.webContents.focus();
    send('chooser-open', chooserData());
  });
}
function finishChooser(id) {
  const c = chooser;
  if (!c) return;
  chooser = null;
  const entry = id ? c.devices.get(id) || null : null;
  c.resolve(entry);
  if (c.w) useWin(c.w);
  if (overlayKind === 'chooser') closeOverlay();
}
function chooserData() {
  return {
    kind: chooser.kind, label: KIND_LABEL[chooser.kind], host: hostOf(chooser.origin),
    devices: [...chooser.devices.values()].map(({ id, name, detail }) => ({ id, name, detail }))
  };
}
function pushChooser() { if (chooser) inWin(chooser.w, () => send('chooser-data', chooserData())); }
const chooserAdd = (kind, d) => { if (chooser && chooser.kind === kind && d.id) { chooser.devices.set(d.id, d); pushChooser(); } };
const chooserRemove = (kind, id) => { if (chooser && chooser.kind === kind) { chooser.devices.delete(id); pushChooser(); } };

function frameOrigin(details, fallbackWc) {
  const u = (details && details.frame && details.frame.url) || (fallbackWc && !fallbackWc.isDestroyed() && fallbackWc.getURL()) ||
    '';
  return originOf(u);
}

const wcOfFrame = (f) => { try { return f ? webContents.fromFrame(f) : null; } catch { return null; } };
function setupDevices(ses, incognito = false) {
  const policy=createDevicePolicy({incognito,getSaved:()=>settings.deviceGrants,save:g=>{settings.deviceGrants.push(g);saveSettings();}});
  devicePolicies.set(ses,policy);
  // ---- WebHID (ATK, VIA, gaming mouse/keyboard software)
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const origin = frameOrigin(details);
    openChooser('hid', origin, (details.deviceList || []).map(hidInfo), wcOfFrame(details.frame)).then((entry) => {
      const allowed=entry&&policy.grant('hid', origin, entry.raw, entry.id);
      callback(allowed ? entry.id : '');
    });
  });
  ses.on('hid-device-added', (_e, details) => details && details.device && chooserAdd('hid', hidInfo(details.device)));
  ses.on('hid-device-removed', (_e, details) => details && details.device && chooserRemove('hid', details.device.deviceId));

  // ---- WebUSB
  ses.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    const origin = frameOrigin(details);
    openChooser('usb', origin, (details.deviceList || []).map(usbInfo), wcOfFrame(details.frame)).then((entry) => {
      const allowed=entry&&policy.grant('usb', origin, entry.raw, entry.id);
      callback(allowed ? entry.id : undefined);
    });
  });
  ses.on('usb-device-added', (_e, device) => device && chooserAdd('usb', usbInfo(device)));
  ses.on('usb-device-removed', (_e, device) => device && chooserRemove('usb', device.deviceId));

  // ---- Web Serial (Arduino / ESP32 web uploaders)
  ses.on('select-serial-port', (event, portList, wc, callback) => {
    event.preventDefault();
    const origin = frameOrigin(null, wc);
    openChooser('serial', origin, (portList || []).map(serialInfo), wc).then((entry) => {
      const allowed=entry&&policy.grant('serial', origin, entry.raw, entry.id);
      callback(allowed ? entry.id : '');
    });
  });
  ses.on('serial-port-added', (_e, port) => port && chooserAdd('serial', serialInfo(port)));
  ses.on('serial-port-removed', (_e, port) => port && chooserRemove('serial', port.portId));

  // ---- Previously allowed devices (remembered across page reloads / browser restarts)
  ses.setDevicePermissionHandler((details) => {
    return policy.allows(details);
  });

  // ---- Bluetooth pairing (PIN confirmation)
  if (typeof ses.setBluetoothPairingHandler === 'function') {
    ses.setBluetoothPairingHandler((details, callback) => {
      if (details.pairingKind === 'confirm' || details.pairingKind === 'confirmPin') {
        dialog.showMessageBox(win, {
          type: 'question', buttons: ['Eşleştir', 'İptal'], defaultId: 0, cancelId: 1,
          message: details.pairingKind === 'confirmPin' ? `Cihazda şu PIN görünüyor mu? ${details.pin}` : 'Bluetooth cihazı eşleştirilsin mi?'
        }).then((r) => callback({ confirmed: r.response === 0 })).catch(() => callback({ confirmed: false }));
      } else {
        dialog.showMessageBox(win, { type: 'warning', message: 'Bu cihaz PIN girişi istiyor. Önce Windows Bluetooth ayarlarından eşleştirin.' });
        callback({ confirmed: false });
      }
    });
  }
}

// Web Bluetooth selection comes through webContents
function attachBluetooth(wc) {
  let pending = null;
  wc.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    const list = (devices || []).map(btInfo);
    if (pending) { list.forEach((d) => chooserAdd('bluetooth', d)); return; }
    pending = callback;
    openChooser('bluetooth', originOf(wc.getURL()), list, wc).then((entry) => {
      const cb = pending; pending = null;
      cb(entry ? entry.id : '');
    });
  });
}

// ---------------------------------------------------------------- Tabs
// ECE observes each added tab by activating it, even when Calcium requested a background tab.
// Registration must not drive browser selection; restore ECE's active tab afterwards.
let extensionTabRegistrationDepth = 0;
function registerExtensionTab(wc, w) {
  const bridge=bridgeFor(w);if(!bridge)return;
  const selectedId = w === W ? activeId : w.activeId;
  const selected = w.tabs.find((t) => t.id === selectedId);
  extensionTabRegistrationDepth++;
  try {
    bridge.addTab(wc,w.win);
    if (selected && selected.view) bridge.selectTab(selected.view.webContents);
  } finally { extensionTabRegistrationDepth--; }
}
function toUrl(input) {
  const s = (input || '').trim();
  if (!s) return newtabUrl();
  const hashAt = s.indexOf('#');   // section links like calcium://settings#korunan
  const alias = PAGE_ALIASES[(hashAt < 0 ? s : s.slice(0, hashAt)).toLowerCase().replace(/\/+$/, '')];
  if (alias) return hashAt < 0 ? alias : alias + '#' + encodeURIComponent(s.slice(hashAt + 1));
  if (/^(https?|file|about|data|view-source|chrome-extension|blob):/i.test(s)) return s;   // extension pages are URLs too
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return 'http://' + s;
  if (!/\s/.test(s) && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
  return searchUrl() + encodeURIComponent(s);
}

function createView(tab) {
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      spellcheck: false, backgroundThrottling: true, session: ses, plugins: true,   // plugins: built-in PDF viewer
      preload: path.join(__dirname, 'page-preload.js')
    }
  });
  view.setBackgroundColor((effectiveTheme().page) || (nativeTheme.shouldUseDarkColors ? '#202124' : '#ffffff'));
  const wc = view.webContents;
  if (!tab.w) tab.w = W;
  // This tab's events always run in the context of its own window
  const on = (ev, fn) => wc.on(ev, (...args) => { useWin(tab.w); return fn(...args); });
  wc.setWebRTCIPHandlingPolicy('default_public_interface_only');
  tab.view = view;
  tab.wcId = wc.id;
  byWcId.set(wc.id, tab);
  if (tab.pinned && tab.favicon) updateIconColor(tab);
  if (tab.muted) wc.setAudioMuted(true);
  attachBluetooth(wc);
  attachLoginFix(wc);
  if (bridgeFor(tab.w)) { try { registerExtensionTab(wc, tab.w); } catch (e) { console.warn(e.message); } }

  wc.setWindowOpenHandler(({ url, disposition }) => {
    useWin(tab.w);
    if(showThreatWarning(wc,url))return {action:'deny'};
    const background = disposition === 'background-tab';
    if (disposition === 'new-window' && !background) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, webPreferences: { sandbox: true } }
      };
    }
    newTab(url, background, tab.id);
    return { action: 'deny' };
  });
  on('will-navigate',(event,url)=>{if(showThreatWarning(wc,event.url||url))event.preventDefault();});
  on('will-redirect',(event,url)=>{if(showThreatWarning(wc,event.url||url))event.preventDefault();});
  on('did-create-window', (child, details) => {
    if (child.setMenu) child.setMenu(null);
    const cwc = child.webContents;
    attachLoginFix(cwc);                         // "Sign in with Google" popups
    const u = (details && details.url) || cwc.getURL();
    if (isGoogleLogin(u)) { cwc.setUserAgent(LOGIN_UA); cwc.loadURL(u, { userAgent: LOGIN_UA }).catch(() => {}); }
  });

  on('page-title-updated', (_e, title) => {
    tab.title = title;
    if (tab.hist && tab.hist.url === wc.getURL() && tab.hist.title !== title) { tab.hist.title = title; saveHistory(); notifyPages('history'); }
    schedulePush();
  });
  on('page-favicon-updated', (_e, icons) => {
    if(tab.favicon!==icons?.[0])tab.iconColor=null;
    const icon=icons?.[0];tab.favicon=typeof icon==='string'&&icon.length<=180*1024?icon:null;
    if (tab.pinned) updateIconColor(tab);
    if (tab.hist && tab.favicon && tab.hist.url === wc.getURL() && tab.hist.favicon !== tab.favicon) { tab.hist.favicon = tab.favicon; saveHistory(); }
    const bm = settings.bookmarks.find((b) => b.url === tab.url);
    if (bm && tab.favicon && bm.favicon !== tab.favicon) { bm.favicon = tab.favicon; saveSettings(); }
    schedulePush();
  });
  on('did-start-loading', () => { tab.loading = true; schedulePush(); });
  on('did-stop-loading', () => { tab.loading = false; if (!tab.pendingNavigation) tab.url = wc.getURL() || tab.url; schedulePush(); });
  on('did-start-navigation', (e) => {
    if (e.isMainFrame && !e.isSameDocument) { navigationEpoch.set(wc,(navigationEpoch.get(wc)||0)+1); tab.blocked = 0; tab.favicon = null; tab.iconColor=null; }
  });
  on('did-navigate', (_e, url, code) => { tab.formDirty=false;tab.mediaPermission=false;tab.url = url; if (!code || code < 400) recordVisit(tab, url, wc); pushState(); });
  on('did-navigate-in-page', (_e, url, isMain, frameProcessId, frameRoutingId) => {
    if(tab.w.incognito){try{wc.sendToFrame([frameProcessId,frameRoutingId],'calcium-private-content-refresh');}catch{}}
    if (!isMain) return;
    tab.url = url;
    if (!tab.hist || tab.hist.url.split('#')[0] !== url.split('#')[0]) recordVisit(tab, url, wc);   // single-page sites like YouTube
    pushState();
  });
  on('did-fail-load', (_e, code, _desc, _url, isMain) => {
    if (isMain && code !== -3) { tab.title = 'Sayfa açılamadı'; pushState(); }
  });
  on('audio-state-changed', (e) => { tab.audible = e.audible; schedulePush(); });
  on('dom-ready', () => { if (settings.hoverZoom) applyHoverZoom(wc); });
  // While volume boost is on, apply it to newly loaded pages and embedded players too
  on('did-frame-finish-load', (_e, isMain, pid, rid) => {
    if(!isMain){
      const frame=webFrameMain.fromId(pid,rid);
      if(frame&&/^(https?:|about:)/.test(frame.url)){
        const install=require('./overlay-scrollbar').installOverlayScrollbars.toString();
        frame.executeJavaScript(`(${install})(css=>{const sheet=new CSSStyleSheet();sheet.replaceSync(css);document.adoptedStyleSheets=[...document.adoptedStyleSheets,sheet];})`).catch(()=>{});
      }
    }
    if ((tab.volume || 100) === 100) return;
    applyVolume(wc, isMain ? null : webFrameMain.fromId(pid, rid), tab.volume);
  });
  on('render-process-gone', () => { tab.title = 'Sayfa çöktü - yenileyin'; tab.loading = false; pushState(); });
  wc.setZoomMode('manual');wc.setZoomFactor(tab.zoomFactor||1);
  on('zoom-changed',(event,direction)=>{event.preventDefault();setPageZoom(wc,direction==='in'?1:-1);});
  on('before-input-event', (e, input) => { if (handleShortcut(input)) e.preventDefault(); });
  on('context-menu', (_e, p) => showContextMenu(wc, p));
  on('found-in-page', (_e, r) => send('found', { active: r.activeMatchOrdinal, total: r.matches }));
  on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); });
  on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); });
  const wcId = wc.id;
  on('destroyed', () => { if (byWcId.get(wcId) === tab) byWcId.delete(wcId);blockedNavigations.delete(wcId); });
  return view;
}

// The same URL on the same day is kept as one row (moved to the top). Reloads and waking tabs add no new entry.
function recordVisit(tab, url, wc) {
  if (!/^https?:/i.test(url || '') || (tab.w && tab.w.incognito)) return;   // incognito does not write history
  if (tab.hist && tab.hist.url === url && history.includes(tab.hist)) return;
  const now = Math.max(Date.now(), history.length ? history[0].t + 1 : 0);   // t is also the ID: must be unique
  const dayStart = new Date().setHours(0, 0, 0, 0);
  let e = null;
  for (let i = 0; i < history.length && history[i].t >= dayStart; i++) {
    if (history[i].url === url) { e = history.splice(i, 1)[0]; break; }
  }
  if (!e) e = { url, title: '', t: now };
  e.t = now;
  const title = wc && !wc.isDestroyed() ? wc.getTitle() : '';
  if (title && title !== url && !/^https?:/i.test(title)) e.title = title;
  history.unshift(e);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  tab.hist = e;
  saveHistory();
  notifyPages('history');
}

// Previous session: tabs come back asleep (using no memory), only the active one is loaded.
function restoreSession() {
  let data = null;
  data=readBoundedJson(SESSION_FILE,16*1024*1024,null);if(!data)return false;
  const wins = data && Array.isArray(data.windows) ? data.windows : data && Array.isArray(data.tabs) ? [data] : [];   // old format: single window
  let any = false;
  for (const entry of wins.slice(0, 20)) {
    if (any) createWindow();
    if (restoreWindow(entry)) any = true;
  }
  return any;
}
function restoreWindow(data) {
  const list = data && Array.isArray(data.tabs) ? data.tabs.filter((x) => x && typeof x.url === 'string' && x.url) : [];
  for (const x of list.slice(0, 100)) {
    tabs.push({
      id: nextId++, w: W, view: null, url: toUrl(x.url), title: String(x.title || hostOf(x.url)).slice(0, 300),
      favicon: typeof x.favicon === 'string'&&x.favicon.length<=180*1024 ? x.favicon : null, iconColor: /^#[0-9a-f]{6}$/i.test(x.iconColor || '') ? x.iconColor : null, loading: false, lastActive: Date.now(),
      blocked: 0, audible: false, pinned: !!x.pinned, muted: settings.tabAudio&&!!x.muted
    });
  }
  if (!tabs.length) return false;
  orderPinned();
  for (const t of tabs) if (t.pinned && t.favicon) updateIconColor(t);
  const a = Math.min(Math.max(Number(data.active) || 0, 0), tabs.length - 1);
  activateTab(tabs[a].id);
  return true;
}

// History / downloads: switch to its tab if open, open in place if on a new tab page, else a new tab
function openPage(url) {
  if(baseOf(url)===DOWNLOADS_URL){showDownloadsPanel();return;}
  if(baseOf(url)===TASKS_URL){showTaskManager();return;}
  if (W && W.incognito) {
    const n = lastWin(true);
    if (n) { useWin(n); n.win.focus(); } else createWindow();
  }
  const ex = tabs.find((t) => baseOf(t.url) === baseOf(url));
  if (ex) { activateTab(ex.id); return; }
  const t = activeTab();
  if (t && t.view && isNewtab(t.url)) { t.url = url; go(t.view.webContents, url); return; }
  newTab(url);
}

// Pinned tabs always on the left (sort is stable, the rest keep their order)
const orderPinned = () => tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

// Fetch only the HTML title for deferred tabs: no renderer, scripts, images or media.
const titleQueue = [];
let titleJobs = 0;
function queueTabTitle(tab) {
  if (!/^https?:/i.test(tab.url) || threatProtection.isBlocked(tab.url)) return;
  const known = settings.bookmarks.find((b) => b.url === tab.url) || history.find((h) => h.url === tab.url);
  if (known && known.title) { tab.title = known.title; return; }
  if(titleQueue.length>=128||titleQueue.includes(tab))return;
  titleQueue.push(tab);
  drainTabTitles();
}
function drainTabTitles() {
  while (titleJobs < 3 && titleQueue.length) {
    const tab = titleQueue.shift();
    if (!tab.w.tabs.includes(tab) || (tab.view && !tab.pendingNavigation)) continue;
    titleJobs++;
    readTabTitle(tab).finally(() => { titleJobs--; drainTabTitles(); });
  }
}
async function readTabTitle(tab) {
  const controller = new AbortController();
  tab.titleRequest = controller;
  const timer = setTimeout(() => controller.abort(), 6000);
  const url = tab.url;
  let reader;
  try {
    const response = await tab.w.ses.fetch(url, { signal: controller.signal });
    if (!response.ok || !/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) return;
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '', bytes = 0, match;
    while (bytes < 256 * 1024) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      html += decoder.decode(chunk.value, { stream: true });
      match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
      if (match || /<\/head\s*>/i.test(html)) break;
    }
    if (match && tab.url === url && tab.w.tabs.includes(tab) && (!tab.view || tab.pendingNavigation)) {
      const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
      tab.title = match[1].replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (all, n, named) => {
        if (named) return entities[named.toLowerCase()];
        const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
      }).replace(/\s+/g, ' ').trim().slice(0, 300) || tab.title;
      if (windows.includes(tab.w)) inWin(tab.w, () => pushState());
    }
  } catch {} finally {
    if (reader) reader.cancel().catch(() => {});
    controller.abort(); clearTimeout(timer);
    if (tab.titleRequest === controller) tab.titleRequest = null;
  }
}

function newTab(url, background = false, openerId = null, at = -1, requireView = false) {
  const tab = {
    id: nextId++, w: W, view: null, url: toUrl(url), title: 'Yeni Sekme', favicon: null,
    loading: false, lastActive: Date.now(), blocked: 0, audible: false, pinned: false, muted: false
  };
  const openerIdx = openerId ? tabs.findIndex((t) => t.id === openerId) : -1;
  if (at >= 0) tabs.splice(Math.min(at, tabs.length), 0, tab);
  else if (openerIdx >= 0) tabs.splice(openerIdx + 1, 0, tab); else tabs.push(tab);
  orderPinned();
  // Background links are URL records only; title metadata is fetched without a renderer or media.
  // chrome.tabs.create requires a WebContents ID, so keep its background view blank until selected.
  if (background && activeId !== null) {
    tab.title = isInternal(tab.url) ? 'Yeni Sekme' : hostOf(tab.url);
    if (requireView) { tab.pendingNavigation = true; createView(tab); }
    const opener=getTab(openerId);const hint=opener?.linkTitleHint;
    if(hint && hint.url===tab.url && Date.now()-hint.at<2000){tab.title=hint.title;opener.linkTitleHint=null;}else queueTabTitle(tab);
  }
  if (!background || activeId === null) activateTab(tab.id); else pushState();
  return tab;
}

const getTab = (id) => tabs.find((t) => t.id === id);
const activeTab = () => getTab(activeId);

function activateTab(id) {
  if (!win) return;
  const tab = getTab(id);
  if (!tab || !win) return;
  const prev = activeTab();
  if (prev && prev !== tab) {
    prev.lastActive = Date.now();
    if (prev.view) { try { win.contentView.removeChildView(prev.view); } catch {} }
    if (findOpen) closeFind();
  }
  activeId = id;
  if (tab.titleRequest) tab.titleRequest.abort();
  tab.lastActive = Date.now();
  if (!tab.view) { createView(tab); go(tab.view.webContents, tab.url); }
  else if (tab.pendingNavigation) { tab.pendingNavigation = false; go(tab.view.webContents, tab.url); }
  const keepSide = overlayOpen && overlayKind === 'side';
  if (overlayOpen && !keepSide) closeOverlay();
  win.contentView.addChildView(tab.view);
  if (W) W.uiAbove = false;
  if (keepSide || W.sideClosing) raiseUi();
  if (keepSide) W.sideHoldUntil = Date.now() + 500;
  layout();
  tab.view.webContents.focus();
  if (bridgeFor(W)) { try { bridgeFor(W).selectTab(tab.view.webContents); } catch {} }
  pushState();
}

function destroyView(tab) {
  iconQueue.cancel(tab);
  for(let i=titleQueue.length-1;i>=0;i--)if(titleQueue[i]===tab)titleQueue.splice(i,1);
  if(tab.titleRequest)tab.titleRequest.abort();
  if (!tab.view) return;
  if (win) { try { win.contentView.removeChildView(tab.view); } catch {} }
  const wc = tab.view.webContents;
  byWcId.delete(tab.wcId);
  try { if (typeof wc.close === 'function') wc.close(); else wc.destroy(); } catch {}
  tab.view = null;
}

// Closed tabs (reopened with Ctrl+Shift+T). Only the URL is kept, so memory cost is negligible.
let closedTabs = [];
function rememberClosed(tab, index) {
  let u = tab.url;
  try { if (tab.view && !tab.pendingNavigation && !tab.view.webContents.isDestroyed()) u = tab.view.webContents.getURL() || u; } catch {}
  const k = pageKind(u);
  if (!u || k === 'newtab' || k === 'welcome') return;
  closedTabs.unshift({ url: k ? displayUrl(u) : u, title: tab.title || u, favicon: tab.favicon || null, index, pinned: !!tab.pinned });
  if (closedTabs.length > 25) closedTabs.length = 25;
}
function reopenClosed(n = 0) {
  const c = closedTabs.splice(n, 1)[0];
  if (!c) return;
  const t = newTab(c.url, false, null, c.index);
  if (c.pinned) { t.pinned = true; orderPinned(); pushState(); }
}
const iconColors = new Map(), iconQueue=createWorkQueue({concurrency:3,capacity:128});
function runIconJob(fn,tab){return iconQueue.run(fn,{owner:tab,valid:()=>windows.includes(tab.w)&&tab.w.tabs.includes(tab)});}
async function updateIconColor(tab) {
  if (!tab.pinned || !tab.favicon || !/^(https?:|data:image\/)/i.test(tab.favicon)) return;
  const url = tab.favicon;
  const cacheKey=(tab.w.incognito?'private:':'main:')+url;
  let pendingColor=iconColors.get(cacheKey);
  if (!pendingColor) {
    const job = runIconJob(async (signal) => {
      if(!windows.includes(tab.w)||!tab.w.tabs.includes(tab)||!tab.pinned||tab.favicon!==url)return null;
      try {
        let image, imageData;
        if (url.startsWith('data:image/')) {
          if (url.length > 180 * 1024) return null;
          imageData = url;
          const encoded=url.split(',')[1];if(/;base64,/i.test(url))assertImageLimits(Buffer.from(encoded,'base64'));
          image = nativeImage.createFromDataURL(url);
        } else {
          const r = await tab.w.ses.fetch(url, { signal: AbortSignal.any([signal,AbortSignal.timeout(4000)]), credentials: 'include' });
          if (!r.ok || Number(r.headers.get('content-length')) > 128 * 1024) return null;
          const bytes = await readResponseBytes(r,128*1024);
          imageData = 'data:' + (r.headers.get('content-type') || 'image/x-icon').split(';')[0] + ';base64,' + Buffer.from(bytes).toString('base64');
          assertImageLimits(Buffer.from(bytes));
          image = nativeImage.createFromBuffer(Buffer.from(bytes));
        }
        let pixels;
        if (!image.isEmpty()) pixels = image.resize({ width: 20, height: 20 }).toBitmap();
        else if (tab.w.ui && !tab.w.ui.webContents.isDestroyed()) {
          // Chromium can decode favicon formats (ICO/SVG) that nativeImage cannot.
          const rgba = await tab.w.ui.webContents.executeJavaScript('(' + (async (src) => {
            const image = new Image(); image.src = src; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20;
            const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, 20, 20);
            return Array.from(context.getImageData(0, 0, 20, 20).data);
          }).toString() + ')(' + JSON.stringify(imageData) + ')');
          pixels = Buffer.from(rgba);
          for (let i=0; i<pixels.length; i+=4) { const r=pixels[i]; pixels[i]=pixels[i+2]; pixels[i+2]=r; }
        } else return null;
        const buckets = new Map(),neutral=new Map();
        for (let i = 0; i < pixels.length; i += 4) {
          const b = pixels[i], g = pixels[i+1], r = pixels[i+2], alpha = pixels[i+3] / 255;
          const hi = Math.max(r,g,b), lo = Math.min(r,g,b), saturation = hi ? (hi-lo)/hi : 0;
          if(alpha>=.5&&hi>=45){const v=Math.round((r+g+b)/3/16)*16;neutral.set(v,(neutral.get(v)||0)+alpha);}
          if (alpha < .5 || hi < 45 || saturation < .2) continue;
          const key = [r>>5,g>>5,b>>5].join(','); const v = buckets.get(key) || { weight:0,r:0,g:0,b:0 };
          const weight = saturation * alpha; v.weight += weight; v.r += r*weight; v.g += g*weight; v.b += b*weight; buckets.set(key,v);
        }
        const c = [...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];
        if(c)return '#'+[c.r,c.g,c.b].map(v=>Math.round(v/c.weight).toString(16).padStart(2,'0')).join('');
        const gray=[...neutral].sort((a,b)=>b[1]-a[1])[0];return gray?'#'+Math.max(96,Math.min(224,gray[0])).toString(16).padStart(2,'0').repeat(3):'#808080';
      } catch { return null; }
    },tab);
    pendingColor=job;iconColors.set(cacheKey, job); if (iconColors.size > 128) iconColors.delete(iconColors.keys().next().value);
  }
  const color = await pendingColor;
  if (!color && iconColors.get(cacheKey)===pendingColor) iconColors.delete(cacheKey); // A failed icon request must not lock the tab to the fallback color.
  if (tab.favicon === url && tab.w.tabs.includes(tab)) { if (color) tab.iconColor = color; if (windows.includes(tab.w)) inWin(tab.w, () => pushState()); }
}
function revealPinChange() {
  if (!vertical() || !settings.verticalAutoHide) return;
  clearTimeout(W.sideCloseTimer); W.sideClosing = false;
  openSide(); W.sideHoldUntil = Date.now() + 1400;
}
function togglePin(id) {
  const t = getTab(id);
  if (!t) return;
  t.pinned = !t.pinned;
  if (t.pinned) updateIconColor(t);
  const i = tabs.indexOf(t);
  tabs.splice(i, 1);
  const firstFree = tabs.filter((x) => x.pinned).length;
  tabs.splice(firstFree, 0, t);    // pinned: to the end of pinned tabs; unpinned: to the start of unpinned ones
  pushState();
}
function toggleMute(id) {
  const t = getTab(id);
  if (!t || !settings.tabAudio) return;
  t.muted = !t.muted;
  if (t.view) t.view.webContents.setAudioMuted(t.muted);
  pushState();
}
// ---------------------------------------------------------------- Volume boost (per tab)
// Does what Volume Booster extensions do in Chrome, without tabCapture: volume.js routes the page's
// video/audio elements through a gain node. Runs in an isolated world in the main frame (site can't interfere),
// and inside the frame for embedded frames (iframe players). The value is kept per tab, also while asleep.
const VOLUME_STEPS = [25, 50, 75, 100, 150, 200, 300, 400, 600];   // tab context menu
const VOLUME_MAX = 600;
let VOLUME_JS = null;
function applyVolume(wc, frame, pct) {
  if (!wc || wc.isDestroyed() || !/^https?:/i.test(wc.getURL())) return;
  if (!VOLUME_JS) VOLUME_JS = fs.readFileSync(path.join(__dirname, 'volume.js'), 'utf8');   // read on first use
  const code = `{ const GAIN = ${pct / 100};\n${VOLUME_JS}\n}`;   // block scope: avoids "already defined" errors when run again
  if (frame) { frame.executeJavaScript(code, true).catch(() => {}); return; }
  wc.executeJavaScriptInIsolatedWorld(1013, [{ code }], true).catch(() => {});
  for (const f of wc.mainFrame ? wc.mainFrame.framesInSubtree : []) {
    if (f !== wc.mainFrame && /^https?:/i.test(f.url)) f.executeJavaScript(code, true).catch(() => {});
  }
}
// ---------------------------------------------------------------- Image zoom (built-in, Imagus-like)
// When enabled, hoverzoom.js is injected into every page in an isolated world (1014); site code can't see or break it.
// When disabled it is removed from open pages too. No extra process, extension or background work.
let ZOOM_JS = null;
function applyHoverZoom(wc, on = settings.hoverZoom) {
  if (!wc || wc.isDestroyed() || !/^https?:/i.test(wc.getURL())) return;
  if (!on) { wc.executeJavaScriptInIsolatedWorld(1014, [{ code: "{ const z = window[Symbol.for('calcium.zoom')]; if (z) z.off(); }" }]).catch(() => {}); return; }
  if (!ZOOM_JS) ZOOM_JS = localizeSrc(fs.readFileSync(path.join(__dirname, 'hoverzoom.js'), 'utf8'));
  wc.executeJavaScriptInIsolatedWorld(1014, [{ code: ZOOM_JS }]).catch(() => {});
}
function setFeature(key, on) {
  settings[key] = on;
  saveSettings();
  if (key === 'hoverZoom') for (const t of allTabs()) if (t.view) applyHoverZoom(t.view.webContents, on);
  forEachWin(() => pushState());
}
function setVolume(id, pct) {
  const t = getTab(id);
  pct = Math.round(Number(pct));
  if (!t || !Number.isFinite(pct) || pct < 0 || pct > VOLUME_MAX) return;
  t.volume = pct;
  if (t.view) applyVolume(t.view.webContents, null, pct);
  schedulePush();
}

function moveActiveTab(dir) {
  const i = tabs.findIndex((t) => t.id === activeId), j = i + dir;
  if (i < 0 || j < 0 || j >= tabs.length || !!tabs[j].pinned !== !!tabs[i].pinned) return;
  [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
  pushState();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  rememberClosed(tabs[i], i);
  const [tab] = tabs.splice(i, 1);
  if (tab.titleRequest) tab.titleRequest.abort();
  destroyView(tab);
  if (tabs.length === 0) { if (win) win.close(); return; }
  if (activeId === id) { activeId = null; activateTab(tabs[Math.min(i, tabs.length - 1)].id); }
  else pushState();
}

function sleepTab(id) {
  const tab = allTabs().find((t) => t.id === Number(id));
  if (!tab || !tab.view) return false;
  useWin(tab.w);
  if (activeId === tab.id) {
    const next = tabs.find((t) => t !== tab);
    if (!next) return false;
    activateTab(next.id);
  }
  if (tab.titleRequest) tab.titleRequest.abort();
  if (!tab.pendingNavigation) tab.url = tab.view.webContents.getURL() || tab.url;
  destroyView(tab); tab.pendingNavigation = false; tab.loading = false; tab.audible = false;
  pushState(); return true;
}
function sleepIdleTabs(force = false, memory) {
  if(force!==true&&!settings.sleepTabs)return;
  memory=memory||{total:os.totalmem(),free:os.freemem()};
  const pressure=force!==true&&settings.memorySaver!==false&&memoryPressure(memory);
  const list=allTabs().map(t=>{
    const wc=t.view?.webContents;
    let captured=false;try{captured=!!wc?.isBeingCaptured();}catch{}
    return {tab:t,live:!!wc,active:t.id===(t.w===W?activeId:t.w.activeId),pending:t.pendingNavigation,loading:t.loading,audible:t.audible,
      lastActive:t.lastActive,protected:!!(t.formDirty||t.mediaPermission||captured||settings.sleepExcludedSites.includes(calciumSite(t.url))||downloads.some(d=>d.tabId===t.id&&d.state==='progressing'))};
  });
  const plan=chooseSleepTabs(list,{timeoutMs:settings.sleepMinutes*60000,pressure,force:force===true});
  const changed=new Set();
  for(const {tab:t} of plan){
    inWin(t.w,()=>{if(!t.view)return;const u=t.view.webContents.getURL();if(u)t.url=u;destroyView(t);t.pendingNavigation=false;t.loading=false;t.audible=false;changed.add(t.w);});
  }
  for(const w of changed)inWin(w,()=>pushState());
}

// ---------------------------------------------------------------- Bookmarks
function isBookmarked(url) { return !!url && settings.bookmarks.some((b) => b.url === url); }
function toggleBookmark() {
  if (settings.bookmarksEnabled === false) return;
  const t = activeTab();
  if (!t || isInternal(t.url)) return;
  const i = settings.bookmarks.findIndex((b) => b.url === t.url);
  if (i >= 0) settings.bookmarks.splice(i, 1);
  else settings.bookmarks.push({ url: t.url, title: t.title || hostOf(t.url), favicon: t.favicon || null });
  bookmarksChanged();
}
function hasBookmarks() { return settings.bookmarksEnabled !== false && settings.bookmarks.length > 0; }
function bookmarksChanged(now = false) {
  saveSettings(now);
  forEachWin(() => { layout(); pushState(); });
  notifyPages('settings');
}

// ---------------------------------------------------------------- Layout and UI state
const vertical = () => !!settings.verticalTabs && !htmlFullscreen;
function layout() {
  if (!win || !ui) return;
  const fullscreen=htmlFullscreen||win.isFullScreen();ui.setVisible(!fullscreen);
  if(fullscreen&&W?.updateNotice)W.updateNotice.setVisible(false);
  if(fullscreen){const {width,height}=win.getContentBounds();ui.setBounds({x:0,y:0,width,height:0});const t=activeTab();if(t?.view){t.view.setBounds({x:0,y:0,width,height});win.contentView.addChildView(t.view);if(W)W.uiAbove=false;}return;}
  const { width, height } = win.getContentBounds();
  const t = activeTab();
  if (vertical()) {
    // Vertical: the UI covers the whole window and sits BEHIND the page (top bars + left sidebar stay visible).
    // In auto-hide mode the page is full width; when the sidebar opens the UI is raised and slides over the page.
    const top = TOOLBAR + (hasBookmarks() ? BOOKMARKS : 0) + (findOpen ? FINDBAR : 0);
    const sw = !settings.firstRunDone||settings.verticalAutoHide ? 0 : sideWidth(width);
    ui.setBounds({ x: 0, y: 0, width, height });
    if (t && t.view) {
      t.view.setBounds({ x: sw, y: top, width: Math.max(0, width - sw), height: Math.max(0, height - top) });
      if (!overlayOpen && W && !W.sideClosing && W.uiAbove) { win.contentView.addChildView(t.view); W.uiAbove = false; }   // page back on top
    }
    layoutUpdateNotice(W);return;
  }
  const h = uiHeight();
  ui.setBounds({ x: 0, y: 0, width, height: overlayOpen ? height : h });
  if (t && t.view) t.view.setBounds({ x: 0, y: h, width, height: Math.max(0, height - h) });
  layoutUpdateNotice(W);
}
// Bring the UI to the top (menus, bubbles, revealed sidebar)
function raiseUi() { win.contentView.addChildView(ui); if (W) W.uiAbove = true; }

// ---------- Vertical tabs
function setVerticalTabs(on) {
  settings.verticalTabs = !!on;
  saveSettings();
  forEachWin(() => { if (overlayOpen) closeOverlay(false); paintFrame(); layout(); pushState(); });
  broadcastPages();
}
function animateSideLayout() {
  const w = W;
  clearTimeout(w.sideCloseTimer);
  w.sideClosing = true;
  raiseUi();
  layout(); pushState();
  w.sideCloseTimer = setTimeout(() => {
    if (!windows.includes(w) || w.win.isDestroyed()) return;
    inWin(w, () => { w.sideClosing = false; layout(); });
  }, 220);
}
function toggleAutoHide() {
  if (!settings.verticalTabs) return;
  settings.verticalAutoHide = !settings.verticalAutoHide;
  saveSettings();
  forEachWin(() => {
    if (overlayKind === 'side') { overlayOpen = false; overlayKind = null; send('side-reveal', false); }
    animateSideLayout();
  });
  notifyPages('settings');
}
// In auto-hide mode the sidebar opens when the mouse hits the left edge (focus stays on the page)
function openSide() {
  if (!win || !ui || !vertical() || !settings.verticalAutoHide || overlayOpen || W.sideClosing) return;
  clearTimeout(W.sideCloseTimer);
  W.sideClosing = false;
  overlayOpen = true;
  overlayKind = 'side';
  raiseUi();
  layout();
  send('side-reveal', true);
  W.sideHoldUntil = Date.now() + 500;
  const w = W;
  clearInterval(w.sideWatch);
  w.sideWatch = setInterval(() => {
    if (!windows.includes(w) || w.win.isDestroyed()) { clearInterval(w.sideWatch); return; }
    inWin(w, () => {
      if (!overlayOpen || overlayKind !== 'side') { clearInterval(w.sideWatch); return; }
      if (w.tabDragging || w.sideKeyboardFocus) return;
      const p = screen.getCursorScreenPoint(), b = win.getContentBounds();
      const x = p.x - b.x, y = p.y - b.y;
      const top = TOOLBAR + (hasBookmarks() ? BOOKMARKS : 0) + (findOpen ? FINDBAR : 0);
      const inside = x >= 0 && x <= sideWidth(b.width) + 8 && y >= top && y < b.height;
      if (inside) w.sideHoldUntil = Date.now() + 250;
      else if (Date.now() >= w.sideHoldUntil) closeOverlay(false);
    });
  }, 50);
}

function send(ch, data) { if (ui && !ui.webContents.isDestroyed()) ui.webContents.send(ch, data); }

let pushTimer = null;
function schedulePush() {
  if (pushTimer || !W) return;
  const w = W;   // the timer runs later; it must send that window's state
  pushTimer = setTimeout(() => inWin(w, () => { pushTimer = null; pushState(); }), 150);
}

function pushState() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (!win) return;
  const t = activeTab();
  const wc = t && t.view ? t.view.webContents : null;
  const nav = wc && wc.navigationHistory;
  const active = downloads.filter((d) => d.state === 'progressing');
  const recv = active.reduce((a, d) => a + d.received, 0), tot = active.reduce((a, d) => a + (d.total || 0), 0);
  win.setTitle((t ? `${t.title} - ` : '') + (W.incognito ? 'Calcium (Gizli)' : 'Calcium'));
  send('state', {
    onboarding:!settings.firstRunDone,
    tabs: tabs.map((x) => ({
      id: x.id, title: x.title, favicon: x.favicon, loading: x.loading && !!x.view,
      sleepExcluded:settings.sleepExcludedSites.includes(calciumSite(x.url)),
      iconColor: x.iconColor || null, sleeping: !x.view || !!x.pendingNavigation, audible: x.audible, pinned: !!x.pinned, muted: !!x.muted, volume: x.volume || 100
    })),
    activeId,
    activeWcId: wc ? wc.id : -1,
    theme: W.incognito ? INCOGNITO_THEME : themeVars(),
    incognito: !!W.incognito,
    tabAudio: !!settings.tabAudio,
    newTabPrompt: settings.newTabPrompt !== false,
    textReplacements:settings.textReplacements,
    vertical: vertical(), autoHide: !!settings.verticalAutoHide, sideWidth: sideWidth(win.getContentBounds().width), sideMin: SIDE_MIN,
    sideOpen: overlayOpen && (overlayKind === 'side' || overlayKind === 'sidedrag'), sideEdge: 60,
    ubo: !!uboId && !W.incognito,
    windows: windows.length,
    extSupport: !!extensions && !W.incognito,
    hiddenExt: settings.hiddenExtensions,
    zoom:wc?Math.round(wc.getZoomFactor()*100):Math.round((t?.zoomFactor||1)*100),
    volume: t ? (t.volume || 100) : 100,
    canVolume: !!t && /^https?:/i.test(t.url),
    url: t ? displayUrl(t.url) : '',
    loading: t ? t.loading : false,
    canBack: wc ? (nav ? nav.canGoBack() : wc.canGoBack()) : false,
    canForward: wc ? (nav ? nav.canGoForward() : wc.canGoForward()) : false,
    blocked: t ? t.blocked : 0,
    blockerReady: !!uboId,
    findOpen,
    bookmarked: t ? isBookmarked(t.url) : false,
    canBookmark: settings.bookmarksEnabled !== false && !!t && !isInternal(t.url),
    bookmarks: hasBookmarks() ? barItems() : [],
    bookmarksEnabled: settings.bookmarksEnabled !== false,
    bookmarksBar: hasBookmarks(),
    fullUrl: true,
    searchName: (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google).name,
    downloads: { any: downloads.length > 0, active: active.length, progress: tot ? recv / tot : (active.length ? -1 : 1) }
  });
  saveSession();
}

const withActive = (fn) => { const t = activeTab(); if (t && t.view) fn(t.view.webContents, t); };
const goBack = () => withActive((wc) => (wc.navigationHistory ? wc.navigationHistory.goBack() : wc.goBack()));
const goForward = () => withActive((wc) => (wc.navigationHistory ? wc.navigationHistory.goForward() : wc.goForward()));
const goHome = () => withActive((wc, t) => { t.url = newtabUrl(); go(wc, t.url); });
function setPageZoom(wc,direction){
 const tab=byWcId.get(wc.id);if(!tab||wc.isDestroyed())return;
 const current=Math.round(wc.getZoomFactor()*100),next=direction===0?100:Math.max(25,Math.min(500,Math.round(current/10)*10+(direction>0?10:-10)));
 wc.setZoomFactor(next/100);tab.zoomFactor=next/100;inWin(tab.w,()=>schedulePush());
}
const zoom=direction=>withActive(wc=>setPageZoom(wc,direction));

function focusUrl(search = false) {
  if (settings.newTabPrompt !== false) { openSearchPrompt('address', search ? '' : displayUrl(activeTab()?.url || '')); return; }
  if (ui) { ui.webContents.focus(); send('focus-url', { search }); }
}
function findStep(forward) { if (!findOpen) openFind(); else send('find-step', forward); }
async function openFileDialog() {
  const r = await dialog.showOpenDialog(win, { title: 'Dosya aç', properties: ['openFile'], filters: [
    { name: 'Web sayfaları ve belgeler', extensions: ['html', 'htm', 'pdf', 'svg', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mp3'] },
    { name: 'Tüm dosyalar', extensions: ['*'] }] });
  if (!r.canceled && r.filePaths[0]) newTab(pathToFileURL(r.filePaths[0]).href, false, activeId);
}
function openFind() { findOpen = true; layout(); pushState(); ui.webContents.focus(); send('focus-find'); }
function closeFind() {
  findOpen = false;
  withActive((wc) => wc.stopFindInPage('clearSelection'));
  layout(); pushState();
  withActive((wc) => wc.focus());
}

// Only previously submitted search terms are suggested. No URL/bookmark/network completion.
function omniSuggest(text){return customShortcuts.suggestions(W.incognito?(W.searchHistory||[]):searchHistory,text);}
function navigateInput(input,{newTab:makeTab=false,background=false,closePrompt=false}={}){
 const resolved=customShortcuts.resolveInput(input,{siteCommands:settings.siteCommands,textReplacements:settings.textReplacements,searchUrl:searchUrl()});
 if(resolved.kind==='text'){send('input-expanded',{value:resolved.value});return;}
 if(closePrompt)closeOverlay(false);
 if(resolved.query)recordSearch(resolved.query);
 if(makeTab)newTab(resolved.url,background,activeId);else openUrl(resolved.url);
}
function openSearchPrompt(kind = 'newtab', value = '') {
  if (settings.newTabPrompt === false) { if (kind === 'newtab') { newTab(''); focusUrl(); } return; }
  if (!win || !ui || overlayKind === 'prompt') return;
  // Refocusing an already open prompt must not clear an in-progress query.
  if (overlayOpen && overlayKind === kind) return;
  if (overlayOpen) closeOverlay(false);
  overlayOpen = true; overlayKind = kind;
  raiseUi(); layout(); ui.webContents.focus();
  send('newtab-prompt', { kind, value, searchName: (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google).name });
}
function openOmni() {
  if (!win || !ui || (overlayOpen && overlayKind === 'omni')) return;
  if (overlayOpen) closeOverlay(false);
  overlayOpen = true;
  overlayKind = 'omni';
  raiseUi();
  layout();
}

function openUrl(url, where) {
  if (where === 'tab') newTab(url, true, activeId);
  else {
    const t = activeTab();
    if (!t) { newTab(url); return; }
    t.url = toUrl(url);
    if (!t.view) { activateTab(t.id); return; }   // sleeping tab: activateTab creates the view and loads t.url
    go(t.view.webContents, t.url);
    t.view.webContents.focus();
  }
}

ipcMain.on('ui', (e, cmd, arg) => {
  const w = windows.find((x) => x.ui && x.ui.webContents === e.sender);
  if (!w) return;
  useWin(w);
  switch (cmd) {
    case 'navigate': if(typeof arg==='string'&&arg.trim())navigateInput(arg); break;
    case 'back': goBack(); break;
    case 'forward': goForward(); break;
    case 'reload': withActive((wc) => wc.reload()); break;
    case 'zoom-wheel': if(arg===1||arg===-1)zoom(arg); break;
    case 'zoom-reset': zoom(0);break;
    case 'site-setting': updateSiteControl(arg);break;
    case 'site-dependencies': confirmSiteDependencies(arg);break;
    case 'stop': withActive((wc) => wc.stop()); break;
    case 'home': goHome(); break;
    case 'new-tab': openSearchPrompt(); break;
    case 'address-focus': if (overlayKind !== 'newtab') openSearchPrompt('address', typeof arg === 'string' ? arg : displayUrl(activeTab()?.url || '')); break;
    case 'prompt-answer': answerPrompt(arg); break;
    case 'side-reveal': openSide(); break;
    case 'side-focus': W.sideKeyboardFocus=arg===true; if(W.sideKeyboardFocus)openSide();else W.sideHoldUntil=Date.now()+250; break;
    case 'side-hide': break; // Native cursor tracking owns sidebar dismissal.
    case 'tab-drag-start': W.tabDragging = true; if (!overlayOpen) { overlayOpen = true; overlayKind = 'tabdrag'; raiseUi(); layout(); } break;
    case 'tab-drag-end': W.tabDragging = false; W.sideHoldUntil = Date.now() + 500; if (overlayKind === 'tabdrag') closeOverlay(false); break;
    case 'side-drag-start':   // width drag: UI is raised so it keeps getting events even when the mouse moves over the page
      if (vertical() && !settings.verticalAutoHide && !overlayOpen) { overlayOpen = true; overlayKind = 'sidedrag'; raiseUi(); layout(); }
      break;
    case 'side-width': {
      const v = Math.round(Number(arg));
      if (!Number.isFinite(v)) break;
      settings.verticalWidth = Math.max(SIDE_MIN, Math.min(560, v));
      forEachWin(() => layout());
      break;
    }
    case 'side-drag-end': saveSettings(); if (overlayKind === 'sidedrag') closeOverlay(false); forEachWin(() => pushState()); break;
    case 'toggle-autohide': toggleAutoHide(); break;
    case 'close-tab': closeTab(arg); break;
    case 'activate': activateTab(arg); break;
    case 'find': withActive((wc) => { if (arg.text) wc.findInPage(arg.text, { forward: arg.forward !== false, findNext: !!arg.next }); else wc.stopFindInPage('clearSelection'); }); break;
    case 'find-close': closeFind(); break;
    case 'menu': openOverlay(arg); break;
    case 'menu-close': closeOverlay(true, true); break;
    case 'restore-ui-focus': if (!overlayOpen && win?.isFocused()) ui.webContents.focus(); break;
    case 'chooser-select': finishChooser(arg); break;
    case 'context-action': runContextAction(arg); break;
    case 'menu-action': menuAction(arg && arg.id, arg && arg.arg); break;
    case 'shield': showShieldMenu(arg); break;
    case 'site-menu': showSiteMenu(arg); break;
    case 'downloads': showDownloadsMenu(arg); break;
    case 'tab-menu': showTabMenu(arg); break;
    case 'reload-menu': showReloadMenu(arg); break;
    case 'bookmark-toggle': toggleBookmark(); break;
    case 'bookmark-open': if (settings.bookmarksEnabled === false) break; if (arg && arg.url) openUrl(arg.url, arg.newTab ? 'tab' : null); break;
    case 'bookmark-menu': showBookmarkMenu(arg); break;
    case 'bookmark-folder': showBookmarkFolder(arg); break;
    case 'bookmark-folder-menu': showBookmarkFolderMenu(arg); break;
    case 'move-tab': {
      const from = tabs.findIndex((t) => t.id === arg.id);
      if (from >= 0) { const [t] = tabs.splice(from, 1); tabs.splice(Math.max(0, Math.min(arg.to, tabs.length)), 0, t); orderPinned(); pushState(); }
      break;
    }
    case 'mute': toggleMute(arg); break;
    case 'pin': togglePin(arg); break;
    case 'omni-query': {
      const r = omniSuggest(arg);
      send('omni-results', { q: String(arg || ''), ...r });
      if (r.items.length) openOmni(); else if (overlayKind === 'omni') closeOverlay(false);
      break;
    }
    case 'omni-close': if (overlayKind === 'omni') closeOverlay(false); break;
    case 'newtab-query': if ((overlayKind === 'newtab' || overlayKind === 'address') && typeof arg === 'string') send('newtab-results', { q:arg, ...omniSuggest(arg) }); break;
    case 'newtab-submit': if ((overlayKind === 'newtab' || overlayKind === 'address') && typeof arg === 'string' && arg.trim()) {
      const sameTab = overlayKind === 'address';
      navigateInput(arg.trim(),{newTab:!sameTab,closePrompt:true});
    } break;
    case 'newtab-cancel': if (overlayKind === 'newtab' || overlayKind === 'address') closeOverlay(); break;
    case 'navigate-tab': if(typeof arg==='string'&&arg.trim())navigateInput(arg,{newTab:true}); break;
  }
});

// ---------------------------------------------------------------- Shortcuts
function handleShortcut(input, fromUi = false) {
  if (input.type && input.type !== 'keyDown') return false;
  const ctrl = isMac ? input.meta : input.control;
  const k = (input.key || '').toLowerCase();
  // The UI owns nested menus, suggestions and focus restoration before dismissal.
  if (k === 'escape' && overlayOpen && fromUi && overlayKind !== 'side') return false;
  if (k === 'escape' && htmlFullscreen) { withActive((wc) => wc.executeJavaScript('document.exitFullscreen && document.exitFullscreen()').catch(() => {})); return true; }
  if (k === 'escape' && overlayOpen) { closeOverlay(); return true; }
  if (k === 'escape' && findOpen) { closeFind(); return true; }
  if (ctrl && input.shift && k === 't') { reopenClosed(); return true; }
  if (ctrl && input.shift && k === 'n') { newWindow(true); return true; }               // new incognito window
  if (ctrl && k === 'n') { newWindow(false); return true; }                              // new window
  if (ctrl && k === 't') { openSearchPrompt(); return true; }
  if (ctrl && input.shift && (k === 'w' || k === 'q')) { if (win) win.close(); return true; }
  if ((ctrl && k === 'w') || (ctrl && k === 'f4')) { if (activeId) closeTab(activeId); return true; }
  if (ctrl && (k === 'pagedown' || k === 'pageup')) {
    if (input.shift) { moveActiveTab(k === 'pagedown' ? 1 : -1); return true; }
    const i = tabs.findIndex((t) => t.id === activeId), n = tabs.length;
    if (n > 1) activateTab(tabs[(i + (k === 'pagedown' ? 1 : n - 1)) % n].id);
    return true;
  }
  if (ctrl && (k === 'e' || k === 'k')) { focusUrl(true); return true; }
  if ((input.alt && (k === 'f' || k === 'e')) || k === 'f10' && !input.shift) { send('open-menu'); return true; }
  if (ctrl && input.shift && k === 'delete') { clearData(); return true; }
  if (ctrl && !input.shift && k === 'u') { withActive((wc) => newTab('view-source:' + wc.getURL(), false, activeId)); return true; }
  // Ctrl+S: toggle auto-hide mode with vertical tabs (user request); save page is Ctrl+Shift+S
  if (ctrl && !input.shift && k === 's') { if (settings.verticalTabs) toggleAutoHide(); else withActive((wc) => saveAs(wc)); return true; }
  if (ctrl && input.shift && k === 's') { withActive((wc) => saveAs(wc)); return true; }
  if (ctrl && !input.shift && k === 'o') { openFileDialog(); return true; }
  if ((ctrl && k === 'g') || k === 'f3') { findStep(!input.shift); return true; }
  if (ctrl && input.shift && (k === 'j' || k === 'c')) { withActive((wc) => (wc.isDevToolsOpened() ? wc.devToolsWebContents && wc.devToolsWebContents.focus() : wc.openDevTools())); return true; }
  if (k === 'f9') { withActive((wc) => toggleReader(wc)); return true; }
  if (k === 'escape' && !input.shift && !ctrl) { const t = activeTab(); if (t && t.loading && t.view) t.view.webContents.stop(); return false; }
  if ((ctrl && k === 'l') || (input.alt && k === 'd') || k === 'f6') { focusUrl(); return true; }
  if (ctrl && k === 'f') { openFind(); return true; }
  if (ctrl && k === 'p') { withActive((wc) => wc.print()); return true; }
  if (input.shift && k === 'escape') { showTaskManager(); return true; }
  if (ctrl && k === 'd') { if (settings.bookmarksEnabled === false) { togglePin(activeId); revealPinChange(); } else toggleBookmark(); return true; }
  if ((ctrl && k === 'r') || k === 'f5') { withActive((wc) => (input.shift || ctrl && k === 'f5' ? wc.reloadIgnoringCache() : wc.reload())); return true; }
  if (input.alt && k === 'home') { goHome(); return true; }
  if (k === 'f11') { win.setFullScreen(!win.isFullScreen()); return true; }
  if (ctrl && k === 'tab') {
    const i = tabs.findIndex((t) => t.id === activeId), n = tabs.length;
    if (n > 1) activateTab(tabs[(i + (input.shift ? n - 1 : 1)) % n].id);
    if (vertical() && settings.verticalAutoHide) { openSide(); W.sideHoldUntil = Date.now() + 1200; }
    return true;
  }
  if (input.alt && k === 'arrowleft') { goBack(); return true; }
  if (input.alt && k === 'arrowright') { goForward(); return true; }
  if (ctrl && (k === '+' || k === '=')) { zoom(0.5); return true; }
  if (ctrl && k === '-') { zoom(-0.5); return true; }
  if (ctrl && k === '0') { zoom(0); return true; }
  if (k === 'f12' || (ctrl && input.shift && k === 'i')) { withActive((wc) => wc.toggleDevTools()); return true; }
  if (ctrl && !input.shift && k === 'j') { openPage(DOWNLOADS_URL); return true; }
  if (ctrl && !input.shift && k === 'h') { openPage(HISTORY_URL); return true; }
  if (ctrl && /^[1-9]$/.test(k)) {
    const idx = k === '9' ? tabs.length - 1 : Number(k) - 1;
    if (tabs[idx]) activateTab(tabs[idx].id);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- Menus
// Menu clicks arrive later; another window may be current by then, so we switch back to the menu's window
function bindMenu(items) {
  const w = W;
  const wrap = (list) => list.map((it) => ({
    ...it,
    ...(it.label ? { label: T(it.label) } : {}),
    ...(typeof it.click === 'function' ? { click: (...a) => { useWin(w); return it.click(...a); } } : {}),
    ...(Array.isArray(it.submenu) ? { submenu: wrap(it.submenu) } : {})
  }));
  return wrap(items);
}
let contextMenuToken=0;
function popupBrowserMenu(items,pos,target=ui?.webContents){
 const native=Menu.buildFromTemplate(bindMenu(items));
 if(settings.uiFont==='default')return native.popup({window:win,...(pos?{x:Math.round(pos.x||0),y:Math.round(pos.y||0)}:{})});
 const owner=W,token=++contextMenuToken,actions=new Map();let id=0;
 const resumeSearch=target===ui?.webContents&&['newtab','address'].includes(overlayKind)?overlayKind:null;
 const model=contextMenuModel(native,item=>{const key=++id;actions.set(key,item);return {token,id:key};});
 if(!pos){const point=screen.getCursorScreenPoint(),bounds=win.getContentBounds();pos={x:point.x-bounds.x,y:point.y-bounds.y};}
 openOverlay({kind:'context',...pos,data:{items:model,restoreUi:target===ui?.webContents,resumeSearch}});
 owner.contextMenu={token,actions,target,native,resumeSearch};
}
function runContextAction(arg){
 const context=W?.contextMenu;if(!context||context.token!==arg?.token)return;
 const item=context.actions.get(arg.id);if(!item||!item.enabled)return;
 const owner=W,target=context.target;
 closeOverlay(false, true);if(!target||target.isDestroyed())return;
 target.focus();
 const roles={undo:'undo',redo:'redo',cut:'cut',copy:'copy',paste:'paste',pasteandmatchstyle:'pasteAndMatchStyle',selectall:'selectAll',delete:'delete'};
 const role=roles[String(item.role).toLowerCase()];
 if(role&&typeof target[role]==='function'){target[role]();return;}
 if(item.type==='checkbox')item.checked=!item.checked;
 if(item.type==='radio')item.checked=true;
 if(typeof item.click==='function')item.click(item,owner.win,{shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,triggeredByAccelerator:false});
}
const popAt=(items,pos)=>popupBrowserMenu(items,pos);
const acc = (s) => (isMac ? s.replace('Ctrl', 'Cmd') : s);
const hint = (s) => ({ accelerator: acc(s), registerAccelerator: false });

function setSetting(key, value, needsRestart) {
  settings[key] = value;
  saveSettings(true);
  forEachWin(() => pushState());
  if (!needsRestart) return;
  dialog.showMessageBox(win, {
    type: 'question', buttons: ['Şimdi yeniden başlat', 'Sonra'], defaultId: 0, cancelId: 1,
    message: 'Bu ayar tarayıcı yeniden başlatılınca uygulanır.'
  }).then((r) => { if (r.response === 0) { app.relaunch(); app.quit(); } });
}

// ---------------------------------------------------------------- Chrome-style menu (drawn in the UI layer, no extra process)
function openOverlay(arg) {
  if (!win || !ui || overlayKind === 'prompt') return;
  if (chooser) finishChooser(null);
  overlayOpen = true;
  overlayKind = 'menu';
  raiseUi();
  layout();
  ui.webContents.focus();
  send('menu-open', { kind: (arg && arg.kind) || 'main', anchor: arg || {}, data: ['context','site'].includes(arg?.kind)?arg.data:menuData() });
}
function closeOverlay(refocus = true, resumeContext = false) {
  if (!overlayOpen) return;
  overlayOpen = false;
  const kind = overlayKind;
  const resumeSearch=resumeContext?W?.contextMenu?.resumeSearch:null;
  if(W){W.contextMenu=null;W.siteDependencies=null;}
  overlayKind = null;
  if (kind === 'chooser' && chooser) finishChooser(null);   // clicked outside: cancel
  if (kind === 'side') {
    W.sideKeyboardFocus=false;
    // The revealed sidebar slides back left as it came; the UI stays on top until the animation ends
    send('side-reveal', false);
    const w = W;
    clearInterval(w.sideWatch);
    w.sideClosing = true;
    clearTimeout(w.sideCloseTimer);
    w.sideCloseTimer = setTimeout(() => { if (windows.includes(w) && !w.win.isDestroyed()) inWin(w, () => { w.sideClosing = false; layout(); }); }, 220);
    if(refocus)withActive(wc=>wc.focus());
    return;
  }
  if(resumeSearch){overlayOpen=true;overlayKind=resumeSearch;raiseUi();}
  layout();
  send('menu-closed', { refocus, resumeSearch });
  if(resumeSearch){if(refocus)ui.webContents.focus();return;}
  if (kind === 'sidedrag') send('side-reveal', false);
  if (kind === 'prompt') {   // clicked outside / Esc: deny this once
    const p = prompts.find((x) => x.w === W && x.shown);
    if (p) { settlePrompt(p, 'dismiss'); return; }
  }
  if (refocus && kind !== 'omni') withActive((wc) => wc.focus());
}

function zoomPercent() {
  let z = 100;
  withActive((wc) => { z = Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100); });
  return z;
}

function menuData() {
  const t = activeTab();
  return {
    bookmarksEnabled: settings.bookmarksEnabled !== false,
    zoom: zoomPercent(),
    volume: (activeTab() && activeTab().volume) || 100,
    volumeMax: VOLUME_MAX,
    fullscreen: !!(win && win.isFullScreen()),
    bookmarked: t ? isBookmarked(t.url) : false,
    canBookmark: !!t && !isInternal(t.url),
    bookmarksBar: hasBookmarks(),
    bookmarks: settings.bookmarks.map((b, i) => ({ i, title: b.title || b.url, favicon: b.favicon, path: b.path })).filter((b) => !b.path || !b.path.length).slice(0, 40),
    bookmarkFolders: bookmarkGroups().map((g) => g.name),
    engine: settings.searchEngine,
    theme: settings.theme,
    themes: Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name })),
    engines: Object.entries(SEARCH_ENGINES).map(([key, e]) => ({ key, name: e.name })),
    extSupport: !!extensions && !W.incognito,
    webStore: !!CWS,
    extensions: W.incognito ? [] : listExtensions(),
    closed: closedTabs.slice(0, 8).map((c, i) => ({ i, title: c.title, favicon: c.favicon })),
    canRead: (() => { const t = activeTab(); return !!t && /^https?:/i.test(t.url); })(),
    incognito: !!W.incognito,
    version: app.getVersion()
  };
}

function menuAction(id, arg) {
  const refresh = () => send('menu-data', menuData());
  switch (id) {
    case 'new-tab': openSearchPrompt(); break;
    case 'new-window': newWindow(false); break;
    case 'new-incognito': newWindow(true); break;
    case 'downloads': openPage(DOWNLOADS_URL); break;
    case 'history': openPage(HISTORY_URL); break;
    case 'settings': openPage(SETTINGS_URL+(arg?'#'+encodeURIComponent(arg):'')); break;
    case 'reopen': reopenClosed(Number(arg) || 0); break;
    case 'reader': withActive((wc) => toggleReader(wc)); break;
    case 'pip': withActive((wc) => pictureInPicture(wc)); break;
    case 'bookmark-toggle': toggleBookmark(); break;
    case 'bookmarks-import': if (settings.bookmarksEnabled === false) break; openSettingsAt('yer-isaretleri'); break;
    case 'bookmark-open': { if (settings.bookmarksEnabled === false) break; const b = settings.bookmarks[arg]; if (b) openUrl(b.url); break; }
    case 'zoom-in': zoom(0.5); refresh(); break;
    case 'zoom-out': zoom(-0.5); refresh(); break;
    case 'zoom-reset': zoom(0); refresh(); break;
    case 'vol-set': { const t = activeTab(); if (t) setVolume(t.id, arg); break; }
    case 'extensions-page': openPage(EXTENSIONS_URL); break;
    case 'ext-hide': if (arg && typeof arg.id === 'string') setExtensionHidden(arg.id, !!arg.hidden); refresh(); break;
    case 'fullscreen': win.setFullScreen(!win.isFullScreen()); break;
    case 'print': withActive((wc) => wc.print()); break;
    case 'find': openFind(); break;
    case 'task-manager': showTaskManager(); break;
    case 'clear-data': clearData(); break;
    case 'devtools': withActive((wc) => wc.toggleDevTools()); break;
    case 'device-grants': showDeviceGrants(); break;
    case 'update-filters': forceUpdateFilters(); break;
    case 'engine': if (SEARCH_ENGINES[arg]) { setSetting('searchEngine', arg); broadcastPages(); } break;
    case 'theme': if (THEMES[arg]) { settings.theme = arg; saveSettings(); applyTheme(); refresh(); } break;
    case 'web-store': newTab('https://chromewebstore.google.com/category/extensions', false); break;
    case 'ext-load': loadUnpackedDialog(); break;
    case 'ext-options': { const e = listExtensions().find((x) => x.id === arg); if (e && e.optionsUrl) newTab(e.optionsUrl); break; }
    case 'ext-remove': removeExtension(arg); break;
    case 'about': dialog.showMessageBox(win, {
      message: 'Calcium ' + app.getVersion(),
      detail: `${uiLang() === 'en' ? 'Engine' : 'Motor'}: Chromium ${process.versions.chrome}\nElectron ${process.versions.electron}\n\n${T('Google hesabı gerekmez, telemetri yok, reklam engelleyici her zaman açık.')}`
    }); break;
    case 'quit': app.quit(); break;
  }
}

// ---------------------------------------------------------------- Task manager (how much RAM each tab uses)
const MB = (kb) => Math.round(kb / 1024);
function showTaskManager(){return showInternalPanel(TASKS_URL,'Görev yöneticisi',taskPanels,1000,640);}
function taskManagerData() {
  const metrics = app.getAppMetrics();
  const byPid = new Map(metrics.map((m) => [m.pid,m]));
  const groups = new Map(); const assigned = new Set();
  const memory = (m) => m && m.memory ? m.memory.privateBytes || m.memory.workingSetSize || 0 : 0;
  const add = (key,label,row) => { if(!groups.has(key))groups.set(key,{key,label,rows:[],memory:0,cpu:0});const g=groups.get(key);g.rows.push(row);if(!row.shared){g.memory+=row.memory;g.cpu+=row.cpu;} };
  for (const t of allTabs()) {
    const sleeping = !t.view || !!t.pendingNavigation;
    const pid = sleeping ? null : t.view.webContents.getOSProcessId();
    const m = byPid.get(pid), shared = pid != null && assigned.has(pid);
    if(pid!=null)assigned.add(pid);
    add('tabs','Sekmeler',{id:t.id,title:(t.w.incognito?'(Gizli) ':'')+(t.title||t.url),icon:t.favicon||null,pid,sleeping,shared,memory:sleeping||shared?0:memory(m),cpu:sleeping||shared?0:(m?.cpu?.percentCPUUsage||0),canSleep:!sleeping && !(t.w===W && t.id===activeId),tab:true});
  }
  const uiPids = new Set(windows.filter(w=>w.ui&&!w.ui.webContents.isDestroyed()).map(w=>w.ui.webContents.getOSProcessId()));
  const processes = webContents.getAllWebContents();
  for(const m of metrics){
    if(assigned.has(m.pid))continue;
    const hosts = processes.filter(wc=>!wc.isDestroyed()&&wc.getOSProcessId()===m.pid);
    const extension = hosts.find(wc=>wc.getURL().startsWith('chrome-extension:'));
    const key = uiPids.has(m.pid)?'ui':extension?'extensions':m.type==='Browser'?'browser':m.type==='GPU'?'gpu':m.type==='Utility'?'utility':'ui';
    const names={ui:'Arayüz',extensions:'Uzantılar',browser:'Tarayıcı',gpu:'GPU',utility:'Yardımcı süreçler'};
    const title=extension?(extension.getTitle()||hostOf(extension.getURL())):m.name||m.serviceName||names[key];
    add(key,names[key],{id:'process-'+m.pid,title,pid:m.pid,memory:memory(m),cpu:m.cpu?.percentCPUUsage||0,shared:false,tab:false});
  }
  return {total:metrics.reduce((n,m)=>n+memory(m),0),groups:[...groups.values()],at:Date.now()};
}

// ---------------------------------------------------------------- Extensions
const extApi = () => (mainSes && mainSes.extensions && typeof mainSes.extensions.getAllExtensions === 'function' ? mainSes.extensions : mainSes);

// Extension info (name, description, icon). Read from files; cached per version.
const extInfoCache = new Map();
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function extInfo(id, dir, manifest) {
  const m = manifest || readJson(path.join(dir, 'manifest.json'));
  if (!m) return null;
  const key = dir + '|' + m.version;
  if (extInfoCache.has(key)) return extInfoCache.get(key);
  // Localized __MSG_name__ strings: Turkish, then default locale, then English (in priority order)
  let msgs = null;
  const msg = (v) => {
    if (typeof v !== 'string' || !/^__MSG_\w+__$/.test(v)) return v || '';
    if (!msgs) {
      msgs = {};
      for (const l of [m.default_locale, 'en', 'tr'].filter(Boolean)) Object.assign(msgs, readJson(path.join(dir, '_locales', l, 'messages.json')) || {});
      msgs = Object.fromEntries(Object.entries(msgs).map(([k, x]) => [k.toLowerCase(), x && x.message]));
    }
    return msgs[v.slice(6, -2).toLowerCase()] || '';
  };
  let icon = null;
  const icons = m.icons || {};
  // Smallest icon of at least 48 px, otherwise the largest
  const size = Object.keys(icons).map(Number).filter((n) => n > 0).sort((x, y) => (y >= 48) - (x >= 48) || (x >= 48 ? x - y : y - x))[0];
  if (size) {
    try {
      const f = path.join(dir, String(icons[size]).replace(/^\//, ''));
      const ext = path.extname(f).slice(1).toLowerCase();
      const buf = fs.readFileSync(f);
      if (buf.length < 300e3) icon = `data:image/${ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext || 'png'};base64,${buf.toString('base64')}`;
    } catch {}
  }
  const opt = (m.options_ui && m.options_ui.page) || m.options_page;
  const info = {
    id, name: msg(m.name) || msg(m.short_name) || id, version: m.version || '', description: msg(m.description),
    icon, optionsUrl: opt ? `chrome-extension://${id}/${opt.replace(/^\//, '')}` : null,
    hasAction: !!(m.action || m.browser_action), theme: !!m.theme
  };
  extInfoCache.set(key, info);
  return info;
}
const storeExtDir = () => path.join(app.getPath('userData'), 'Extensions');
const isStoreDir = (p) => !!p && path.resolve(p).toLowerCase().startsWith(path.resolve(storeExtDir()).toLowerCase() + path.sep);
const isDisabledPath = (p) => settings.disabledExtensions.some((d) => path.resolve(d.path) === path.resolve(p));
// All loaded and disabled extensions (disabled ones are not loaded, so their info is read from files)
function listExtensions() {
  if (!mainSes) return [];
  const out = [];
  try {
    for (const e of extApi().getAllExtensions()) {
      const i = e && extInfo(e.id, e.path, e.manifest);
      if (i && !i.theme) out.push({ ...i, enabled: true, hidden: settings.hiddenExtensions.includes(e.id), unpacked: !isStoreDir(e.path) && e.id !== uboId, builtin: e.id === uboId });
    }
  } catch {}
  for (const d of settings.disabledExtensions) {
    if (out.some((x) => x.id === d.id)) continue;
    const i = extInfo(d.id, d.path);
    if (i && !i.theme) out.push({ ...i, enabled: false, hidden: settings.hiddenExtensions.includes(d.id), unpacked: !isStoreDir(d.path) });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'tr'));
}
async function loadExt(dir) {
  const e = await extApi().loadExtension(dir, { allowFileAccess: false });
  if (e && e.manifest && e.manifest.manifest_version === 3 && e.manifest.background && e.manifest.background.service_worker) {
    mainSes.serviceWorkers.startWorkerForScope(`chrome-extension://${e.id}`).catch(() => {});
  }
  return e;
}
// Installed from the Web Store: newest of the Extensions/<id>/<version>/ folders; disabled ones are skipped
async function loadStoreExtensions() {
  let ids = [];
  try { ids = fs.readdirSync(storeExtDir(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return; }
  for (const id of ids) {
    if (settings.disabledExtensions.some((d) => d.id === id)) continue;
    const base = path.join(storeExtDir(), id);
    let vers = [];
    try { vers = fs.readdirSync(base).filter((v) => fs.existsSync(path.join(base, v, 'manifest.json'))); } catch {}
    vers.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    if (!vers.length) continue;
    try { if (!extApi().getExtension(id)) await loadExt(path.join(base, vers[vers.length - 1])); } catch (e) { console.warn('Could not load extension:', id, e.message); }
  }
}
async function setExtensionEnabled(id, on) {
  if (id && id === uboId) return;   // built-in
  if (on) {
    const d = settings.disabledExtensions.find((x) => x.id === id);
    if (!d) return;
    try { await loadExt(d.path); } catch (e) { dialog.showMessageBox(win, { type: 'error', message: 'Uzantı açılamadı', detail: e.message }); return; }
    settings.disabledExtensions = settings.disabledExtensions.filter((x) => x.id !== id);
  } else {
    let e = null; try { e = extApi().getExtension(id); } catch {}
    if (!e) return;
    settings.disabledExtensions = settings.disabledExtensions.filter((x) => x.id !== id).concat({ id, path: e.path });
    try { extApi().removeExtension(id); } catch {}
  }
  saveSettings(true);
  extensionsChanged();
}
function setExtensionHidden(id, hidden) {
  settings.hiddenExtensions = settings.hiddenExtensions.filter((x) => x !== id);
  if (hidden) settings.hiddenExtensions.push(id);
  saveSettings();
  extensionsChanged();
}
function extensionsChanged() { forEachWin(() => pushState()); notifyPages('extensions'); notifyPages('settings'); }

async function setupExtensions() {
  const ses = mainSes;
  if (ECE) {
    // chrome.userScripts, missing in Electron (for extensions like Imagus Reborn), see user-scripts.js.
    // Must be set up BEFORE the extension library: the library freezes the chrome object after adding its own APIs.
    try { require('./user-scripts').setupUserScripts({ ses, storeFile: path.join(app.getPath('userData'), 'kullanici-betikleri.json') }); }
    catch (e) { console.warn('Could not start user script support:', e.message); }
    try {
      extensions = new ECE({
        license: 'GPL-3.0',
        session: ses,
        createTab: async (details) => {
          // If an extension wants to reopen its own page (e.g. its options) that is already open in a tab, don't open
          // a new tab, switch to the existing one. Otherwise the same page piles up on every start (session restore + extension).
          const u = details.url || '';
          const same = /^chrome-extension:/i.test(u) && allTabs().find((x) => x.url.split('#')[0] === u.split('#')[0]);
          useWin(same ? same.w : lastWin(true));
          if (same) {
            if (details.active !== false || !same.view) activateTab(same.id);
            if (same.view) {
              // The restored tab may have opened before the extension was ready and errored: reload it
              same.url = u; go(same.view.webContents, u);
              return [same.view.webContents, win];
            }
          }
          const t = newTab(u, details.active === false, activeId, -1, true);
          return [t.view.webContents, win];
        },
        selectTab: (wc) => { if (extensionTabRegistrationDepth || !wc || wc.isDestroyed()) return; const t = byWcId.get(wc.id); if (t) { useWin(t.w); activateTab(t.id); } },
        // The library also calls this for closed/slept tabs; only close live tabs the extension asked for
        removeTab: (wc) => { if (!wc || wc.isDestroyed()) return; const t = byWcId.get(wc.id); if (t && t.w && t.w.win) { useWin(t.w); closeTab(t.id); } },
        createWindow: async (details) => { useWin(lastWin(true)); [].concat(details.url || '').forEach((u) => newTab(u)); return win; },
        removeWindow: () => {}
      });
      ECE.handleCRXProtocol(ses);
      for (const t of allTabs()) if (t.view && !t.w.incognito) { try { registerExtensionTab(t.view.webContents, t.w); } catch {} }
      forEachWin((w) => { if (!w.incognito && activeTab() && activeTab().view) { try { extensions.selectTab(activeTab().view.webContents); } catch {} } });
    } catch (e) {
      console.warn('Could not start extension support:', e.message);
      extensions = null;
    }
  }
  eceReadyResolve();
  if (CWS) {
    try {
      await CWS.installChromeWebStore({
        session: ses,
        loadExtensionOptions: { allowFileAccess: false },
        loadExtensions: false,     // we load them ourselves: disabled extensions are skipped
        // Like Chrome: a bubble below the address bar lists what the extension can do
        beforeInstall: async (details) => {
          const ow = details.frame ? winOfWc(wcOfFrame(details.frame)) : lastWin(true);
          if (!ow) return { action: 'deny' };
          useWin(ow);
          let icon = null;
          try { icon = details.icon && !details.icon.isEmpty() ? details.icon.resize({ width: 32, height: 32 }).toDataURL() : null; } catch {}
          const r = await askPrompt({
            title: `"${details.localizedName}" eklensin mi?`, icon, rows: extPermissionRows(details.manifest),
            note: 'Her uzantı arka planda çalışır ve biraz RAM kullanır.', ok: 'Uzantı ekle', cancel: 'İptal', kind: 'ext'
          });
          return { action: r === 'ok' ? 'allow' : 'deny' };
        },
        afterInstall: () => extensionsChanged(),
        afterUninstall: () => extensionsChanged()
      });
    } catch (e) { console.warn('Could not start Web Store support:', e.message); }
  }
  await loadStoreExtensions();
  for (const dir of settings.unpackedExtensions) {
    if (isDisabledPath(dir)) continue;
    try { await loadExt(dir); } catch (e) { console.warn('Could not load extension:', dir, e.message); }
  }
  pushState();
}

async function loadUnpackedDialog() {
  const r = await dialog.showOpenDialog(win, { title: 'Uzantı klasörünü seç (manifest.json olan klasör)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return;
  const dir = r.filePaths[0];
  try {
    await loadExt(dir);
    if (!settings.unpackedExtensions.includes(dir)) { settings.unpackedExtensions.push(dir); saveSettings(true); }
    extensionsChanged();
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: 'Uzantı yüklenemedi', detail: e.message });
  }
}

async function removeExtension(id) {
  if (id && id === uboId) return;   // built-in
  const e = listExtensions().find((x) => x.id === id);
  if (!e) return;
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Kaldır', 'İptal'], defaultId: 1, cancelId: 1, message: `"${e.name}" kaldırılsın mı?`, detail: 'Uzantının dosyaları ve ayarları silinir.' });
  if (r.response !== 0) return;
  let ext = null;
  try { ext = extApi().getExtension(id); } catch {}
  const dis = settings.disabledExtensions.find((x) => x.id === id);
  const extPath = ext && ext.path ? ext.path : dis ? dis.path : '';
  try {
    if (ext) extApi().removeExtension(id);
    if (isStoreDir(extPath)) {
      if (CWS && CWS.uninstallExtension) await CWS.uninstallExtension(id, { session: mainSes });
      else fs.rmSync(path.join(storeExtDir(), id), { recursive: true, force: true });
    }
  } catch (err) {
    dialog.showMessageBox(win, { type: 'error', message: 'Kaldırılamadı', detail: err.message });
  }
  settings.unpackedExtensions = settings.unpackedExtensions.filter((d) => !extPath || path.resolve(d) !== path.resolve(extPath));
  settings.disabledExtensions = settings.disabledExtensions.filter((x) => x.id !== id);
  settings.hiddenExtensions = settings.hiddenExtensions.filter((x) => x !== id);
  saveSettings(true);
  extensionsChanged();
}

function showDeviceGrants() {
  const g = settings.deviceGrants;
  if (!g.length&&![...devicePolicies.values()].some(p=>p.size)) { dialog.showMessageBox(win, { message: 'Hiçbir siteye cihaz izni verilmemiş.' }); return; }
  dialog.showMessageBox(win, {
    type: 'info', buttons: ['Tümünü kaldır', 'Kapat'], defaultId: 1, cancelId: 1,
    message: 'Cihaz izinleri',
    detail: g.map((x) => `${hostOf(x.origin)}  →  ${x.name || KIND_LABEL[x.type]} (${KIND_LABEL[x.type]})`).join('\n')
  }).then((r) => {
    if (r.response !== 0) return;
    settings.deviceGrants = [];
    for(const policy of devicePolicies.values())policy.clear();
    saveSettings(true);
    for(const ses of devicePolicies.keys())if(typeof ses.resetPermissions==='function'){try{ses.resetPermissions();}catch{}}
  });
}

function clearHistoryAndDownloads() {
  history = [];
  for (const t of tabs) t.hist = null;
  for (let i = downloads.length - 1; i >= 0; i--) if (downloads[i].state !== 'progressing') downloads.splice(i, 1);
  saveHistory(true); saveDownloads(true);
  pushState(); notifyPages('history'); notifyPages('downloads');
}

// Ctrl+Shift+Delete and other entry points: the "Clear browsing data" dialog on the settings page (in a normal window)
function clearData() { openSettingsAt('temizle'); }
function openSettingsAt(hash) {
  if (W && W.incognito) { const n = lastWin(true); if (n) { useWin(n); n.win.focus(); } else createWindow(); }
  const ex = tabs.find((t) => baseOf(t.url) === SETTINGS_URL);
  if (ex) {
    activateTab(ex.id);
    if (ex.view) ex.view.webContents.executeJavaScript(`location.hash = ''; location.hash = '#${hash}'; void 0`).catch(() => {});
  } else if (activeTab() && activeTab().view && isNewtab(activeTab().url)) {
    const t = activeTab(); t.url = SETTINGS_URL + '#' + hash; go(t.view.webContents, t.url);
  } else newTab(SETTINGS_URL + '#' + hash);
}

// ---------------------------------------------------------------- Protected Sites + selective cleanup (site-data.js)
const siteData = createSiteData({
  getSession: () => mainSes,
  getProtected: () => (Array.isArray(settings.protectedSites) ? settings.protectedSites.slice() : []),
  setProtected: (list) => { settings.protectedSites = list; saveSettings(true); notifyPages('settings'); },
  openTabUrls: () => allTabs().filter((t) => !t.w || !t.w.incognito).map((t) => t.url),
  // Hidden temporary view, not attached to a window, for CDP commands (main session)
  makeDebugTarget: async () => {
    const v = new WebContentsView({ webPreferences: { session: mainSes, sandbox: true, contextIsolation: true } });
    await v.webContents.loadURL('about:blank').catch(() => {});
    return { debugger: v.webContents.debugger, close: () => { try { v.webContents.close(); } catch {} } };
  }
});
const RANGE_MS = { hour: 3600e3, day: 864e5, week: 7 * 864e5, month: 28 * 864e5 };
async function runClear(opts) {
  const o = {
    range: RANGE_MS[opts.range] ? opts.range : 'all',
    history: !!opts.history, downloads: !!opts.downloads, cookies: !!opts.cookies, cache: !!opts.cache, protect: opts.protect !== false
  };
  settings.clearPrefs = o; saveSettings();
  const cutoff = o.range === 'all' ? 0 : Date.now() - RANGE_MS[o.range];
  const out = { history: 0, downloads: 0, cache: null, site: null, notes: [] };
  // History and download list: independent of protection, by time range
  if (o.history) {
    const n = history.length;
    history = history.filter((h) => h.t < cutoff);
    out.history = n - history.length;
    for (const t of allTabs()) if (t.hist && !history.includes(t.hist)) t.hist = null;
    searchHistory=searchHistory.filter(h=>h.t<cutoff);saveSearchHistory(true);
    saveHistory(true); notifyPages('history');
  }
  if (o.downloads) {
    for (let i = downloads.length - 1; i >= 0; i--) if (downloads[i].state !== 'progressing' && (downloads[i].t || 0) >= cutoff) { downloads.splice(i, 1); out.downloads++; }
    saveDownloads(true); notifyPages('downloads');
  }
  if (o.cookies) {
    out.site = await siteData.clear({ cookies: true, siteData: true, protect: o.protect, range: o.range });
    notifyPages('settings');
  }
  // The HTTP cache can't be safely split per site (key is top-level site + resource URL): only "all", by explicit choice
  if (o.cache) {
    if (o.range !== 'all') out.notes.push('Önbellek temizlenmedi: motor önbellekte zaman aralığını desteklemiyor. Önbelleği temizlemek için "Tüm zamanlar"ı seçin.');
    else { try { await mainSes.clearCache(); out.cache = 'requested'; } catch (e) { out.notes.push('Önbellek temizlenemedi: ' + e.message); } }
  }
  forEachWin(() => pushState());
  return out;
}

// Site controls live in the browser UI, anchored to the site identity button.
function siteControlData(tab){
 const site=calciumSite(tab?.url);if(!site)return null;
 return {tabId:tab.id,site,display:siteData.displaySite(site),private:!!tab.w.incognito,sleepExcluded:settings.sleepExcludedSites.includes(site),protected:settings.protectedSites.includes(site),deps:W.siteDependencies?.site===site?W.siteDependencies.deps:[]};
}
function showSiteMenu(pos){const tab=activeTab(),data=siteControlData(tab);if(!data)return;openOverlay({kind:'site',...(pos||{}),data});}
function updateSiteControl(arg){
 const tab=getTab(arg?.tabId),site=calciumSite(tab?.url);if(!site||arg.site!==site||typeof arg.on!=='boolean')return;
 if(arg.key==='sleep'){settings.sleepExcludedSites=arg.on?[...new Set([...settings.sleepExcludedSites,site])]:settings.sleepExcludedSites.filter(s=>s!==site);saveSettings(true);forEachWin(()=>pushState());notifyPages('settings');}
 if(arg.key==='cookies'&&!W.incognito){const result=siteData.setSite(site,arg.on);W.siteDependencies=result.deps?.length?{site,deps:result.deps}:null;}
 if(overlayKind==='menu')send('menu-data',siteControlData(tab));
}
function confirmSiteDependencies(arg){
 const pending=W.siteDependencies,tab=activeTab();if(!pending||calciumSite(tab?.url)!==pending.site)return;
 W.siteDependencies=null;if(arg===true&&!W.incognito)for(const dep of pending.deps)siteData.setSite(dep.site,true);
 if(overlayKind==='menu')send('menu-data',siteControlData(tab));
}
// Thorium: right-click menu on the reload button
function showReloadMenu(pos) {
  popAt([
    { label: 'Normal yeniden yükleme', ...hint('Ctrl+R'), click: () => withActive((wc) => wc.reload()) },
    { label: 'Sert yeniden yükleme', ...hint('Ctrl+Shift+R'), click: () => withActive((wc) => wc.reloadIgnoringCache()) },
    { label: 'Önbelleği boşalt ve sert yeniden yükle', click: async () => { await ses.clearCache(); withActive((wc) => wc.reloadIgnoringCache()); } }
  ], pos);
}

function showShieldMenu(pos) {
  const t = activeTab();
  popAt([
    {label:'Bu sitede Calcium koruması',type:'checkbox',checked:calciumEnabledFor(t?.url),enabled:!!calciumSite(t?.url),click:()=>{toggleCalciumSite(t.url);t.view?.webContents.reload();}},
    { label: uboId ? 'uBlock Origin: AÇIK' : 'Reklam engelleyici yükleniyor...', enabled: false },
    { label: `${(t && hostOf(t.url)) || 'Bu sayfa'}: ${t ? t.blocked : 0} reklam/izleyici engellendi`, enabled: false },
    { type: 'separator' },
    { label: 'Filtre listelerini şimdi güncelle', click: forceUpdateFilters }
  ], pos);
}

// ---------------------------------------------------------------- Bookmark folders (imported) and import
// The data model stays a flat list: an imported bookmark has path = ['Google Chrome', 'Is', ...]. On the bar path[0]
// shows as a single folder button; clicking it opens a native menu with its subfolders.
// Scanning other browsers' files (and copying Firefox's database) is cached for a minute: the settings page
// reloads its data on every settings change and must not rescan each time.
let bmSrcCache = null;
function bmSources() {
  if (!bmSrcCache || Date.now() - bmSrcCache.t > 60e3) bmSrcCache = { t: Date.now(), list: bookmarkImport.listSources() };
  return bmSrcCache.list;
}
function barItems() {
  const out = [], seen = new Set();
  settings.bookmarks.forEach((b, i) => {
    if (b.path && b.path.length) {
      const g = b.path[0];
      if (seen.has(g)) return;
      seen.add(g);
      out.push({ folder: g, count: settings.bookmarks.filter((x) => x.path && x.path[0] === g).length });
    } else out.push({ i, url: b.url, title: b.title, favicon: b.favicon });
  });
  return out;
}
function bookmarkGroups() {
  const m = new Map();
  for (const b of settings.bookmarks) if (b.path && b.path.length) m.set(b.path[0], (m.get(b.path[0]) || 0) + 1);
  return [...m].map(([name, count]) => ({ name, count }));
}
const menuLabel = (s) => String(s || '').slice(0, 70).replace(/&/g, '&&');
function folderMenuItems(group) {
  const root = { dirs: new Map(), items: [] };
  for (const b of settings.bookmarks) {
    if (!b.path || b.path[0] !== group) continue;
    let n = root;
    for (const d of b.path.slice(1)) { if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), items: [] }); n = n.dirs.get(d); }
    n.items.push(b);
  }
  const build = (n) => [
    ...[...n.dirs].map(([name, c]) => ({ label: menuLabel(name), submenu: build(c) })),
    ...(n.dirs.size && n.items.length ? [{ type: 'separator' }] : []),
    ...n.items.slice(0, 500).map((b) => ({ label: menuLabel(b.title || b.url), click: () => openUrl(b.url) }))
  ];
  const items = build(root);
  return items.length ? items : [{ label: '(boş)', enabled: false }];
}
function showBookmarkFolder(arg) {
  if (settings.bookmarksEnabled === false) return;
  if (!arg || typeof arg.folder !== 'string') return;
  popAt(folderMenuItems(arg.folder), arg);
}
function showBookmarkFolderMenu(arg) {
  if (settings.bookmarksEnabled === false) return;
  if (!arg || typeof arg.folder !== 'string') return;
  const g = arg.folder;
  popAt([
    { label: 'Tümünü yeni sekmelerde aç', click: () => { const l = settings.bookmarks.filter((b) => b.path && b.path[0] === g).slice(0, 30); for (const b of l) newTab(b.url, true, activeId); } },
    { label: 'Yer işaretlerini yönet...', click: () => openSettingsAt('yer-isaretleri') },
    { type: 'separator' },
    { label: `"${menuLabel(g)}" klasörünü sil`, click: () => removeBookmarkGroup(g) }
  ], arg);
}
function removeBookmarkGroup(g) {
  const n = settings.bookmarks.length;
  settings.bookmarks = settings.bookmarks.filter((b) => !(b.path && b.path[0] === g));
  bookmarksChanged();
  return { removed: n - settings.bookmarks.length };
}
// Skipped if the URL already exists; folder name is the browser name (if it exists, new items are added to it)
function addImported(items, group) {
  if (!Array.isArray(items)) return { error: 'Yer işaretleri okunamadı.' };
  const have = new Set(settings.bookmarks.map((b) => b.url));
  let added = 0, skipped = 0;
  for (const it of items) {
    if (have.has(it.url)) { skipped++; continue; }
    have.add(it.url);
    settings.bookmarks.push({ url: it.url, title: it.title, favicon: null, path: [group, ...(it.path || [])] });
    added++;
  }
  bookmarksChanged(true);
  return { added, skipped, group };
}
async function importBookmarksHtml() {
  const r = await dialog.showOpenDialog(win, { title: 'Yer işareti dosyasını seçin', properties: ['openFile'], filters: [{ name: 'Yer işaretleri (HTML)', extensions: ['html', 'htm'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const items = bookmarkImport.readHtmlFile(r.filePaths[0]);
  if (!items) return { error: 'Dosya okunamadı.' };
  if (!items.length) return { error: 'Dosyada yer işareti bulunamadı.' };
  return addImported(items, 'HTML dosyası');
}

function showBookmarkMenu(arg) {
  if (settings.bookmarksEnabled === false) return;
  const b = settings.bookmarks[arg.index];
  if (!b) return;
  popAt([
    { label: 'Aç', click: () => openUrl(b.url) },
    { label: 'Yeni sekmede aç', click: () => openUrl(b.url, 'tab') },
    { label: 'Adresi kopyala', click: () => clipboard.writeText(b.url) },
    { type: 'separator' },
    { label: 'Sola taşı', enabled: arg.index > 0, click: () => { settings.bookmarks.splice(arg.index - 1, 0, settings.bookmarks.splice(arg.index, 1)[0]); saveSettings(); pushState(); } },
    { label: 'Sağa taşı', enabled: arg.index < settings.bookmarks.length - 1, click: () => { settings.bookmarks.splice(arg.index + 1, 0, settings.bookmarks.splice(arg.index, 1)[0]); saveSettings(); pushState(); } },
    { label: 'Sil', click: () => { settings.bookmarks.splice(arg.index, 1); bookmarksChanged(); } }
  ], arg);
}

function fmtBytes(b) { return b > 1 << 30 ? (b / (1 << 30)).toFixed(1) + ' GB' : b > 1 << 20 ? (b / (1 << 20)).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

function showDownloadsMenu(){return showDownloadsPanel();}
function showDownloadsPanel(){return showInternalPanel(DOWNLOADS_URL,'İndirilenler',downloadPanels,740,580);}
function showInternalPanel(url,title,panels,preferredWidth,preferredHeight){
 const owner=W;if(!owner||owner.win.isDestroyed())return;
 const existing=panels.get(owner);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return existing;}
 const bounds=owner.win.getBounds(),work=screen.getDisplayMatching(bounds).workArea;
 const width=Math.min(preferredWidth,work.width-32),height=Math.min(preferredHeight,work.height-48);
 const x=Math.max(work.x,Math.min(work.x+work.width-width,Math.round(bounds.x+(bounds.width-width)/2)));
 const y=Math.max(work.y,Math.min(work.y+work.height-height,Math.round(bounds.y+(bounds.height-height)/2)));
 const panel=new BrowserWindow({parent:owner.win,modal:true,skipTaskbar:true,show:false,frame:false,width,height,x,y,minWidth:360,minHeight:300,title:T(title),icon:path.join(__dirname,'icon.png'),backgroundColor:effectiveTheme().page,autoHideMenuBar:true,webPreferences:{session:owner.ses,preload:path.join(__dirname,'page-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 panels.set(owner,panel);
 const navigate=url=>{if(/^https?:/i.test(url))inWin(owner,()=>newTab(url));panel.close();};
 panel.webContents.setWindowOpenHandler(({url})=>{navigate(url);return {action:'deny'};});
 const pageUrl=baseOf(url);
 panel.webContents.on('will-navigate',(e,url)=>{if(baseOf(url)!==pageUrl){e.preventDefault();navigate(url);}});
 // Enable and focus the owner before Windows destroys the modal HWND. Otherwise
 // Windows can briefly activate the previously focused external application.
 const restoreOwner=()=>{if(!quitting&&owner.win&&!owner.win.isDestroyed()&&owner.win.isVisible()){owner.win.setEnabled(true);owner.win.moveTop();owner.win.focus();}};
 panel.on('close',restoreOwner);
 panel.once('ready-to-show',()=>panel.show());panel.on('closed',()=>{panels.delete(owner);restoreOwner();});panel.loadURL(url+'?popup=1');return panel;
}

function showTabMenu(arg) {
  const t = getTab(arg.id);
  if (!t) return;
  const idx = tabs.indexOf(t);
  popAt([
    { label: 'Yeni sekme', click: () => openSearchPrompt() },
    { type: 'separator' },
    { label: 'Yenile', enabled: !!t.view, click: () => t.view && t.view.webContents.reload() },
    {label:'Bu siteyi otomatik uyutma',type:'checkbox',checked:settings.sleepExcludedSites.includes(calciumSite(t.url)),enabled:!!calciumSite(t.url),click:()=>{const site=calciumSite(t.url);if(!site)return;settings.sleepExcludedSites=settings.sleepExcludedSites.includes(site)?settings.sleepExcludedSites.filter(x=>x!==site):[...settings.sleepExcludedSites,site];saveSettings(true);forEachWin(()=>pushState());notifyPages('settings');}},
    { label: 'Sekmeyi uyut', enabled: !!t.view && (t.id !== activeId || tabs.length > 1), click: () => sleepTab(t.id) },
    { label: 'Kopyala', click: () => newTab(t.url, false, t.id) },
    { label: t.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', click: () => togglePin(t.id) },
    ...(settings.tabAudio ? [{ label: t.muted ? 'Sitenin sesini aç' : 'Sitenin sesini kapat', click: () => toggleMute(t.id) }] : []),
    { label: settings.verticalTabs ? 'Yatay sekmelere geç' : 'Dikey sekmelere geç', click: () => setVerticalTabs(!settings.verticalTabs) },
    ...(settings.verticalTabs ? [{ label: 'Kenar çubuğunu otomatik gizle', type: 'checkbox', checked: !!settings.verticalAutoHide, ...hint('Ctrl+S'), click: () => toggleAutoHide() }] : []),
    ...([{ label: 'Ses seviyesi (%' + (t.volume || 100) + ')', enabled: /^https?:/i.test(t.url), submenu: VOLUME_STEPS.map((v) => ({
      label: '%' + v + (v === 100 ? ' (normal)' : ''), type: 'radio', checked: (t.volume || 100) === v, click: () => setVolume(t.id, v)
    })) }]),
    ...(settings.bookmarksEnabled === false ? [] : [{ label: 'Yer işareti koy', enabled: !isNewtab(t.url) && !isBookmarked(t.url), click: () => { settings.bookmarks.push({ url: t.url, title: t.title, favicon: t.favicon }); bookmarksChanged(); } }]),
    { type: 'separator' },
    { label: 'Kapat', click: () => closeTab(t.id) },
    { label: 'Diğer sekmeleri kapat', enabled: tabs.length > 1, click: () => tabs.filter((x) => x !== t).map((x) => x.id).forEach(closeTab) },
    { label: 'Sağdaki sekmeleri kapat', enabled: idx < tabs.length - 1, click: () => tabs.slice(idx + 1).map((x) => x.id).forEach(closeTab) },
    { type: 'separator' },
    { label: 'Kapatılan sekmeyi yeniden aç', ...hint('Ctrl+Shift+T'), enabled: closedTabs.length > 0, click: () => reopenClosed() }
  ], arg);
}

function showContextMenu(wc, p) {
  const items = [];
  if (p.linkURL) {
    items.push({ label: 'Bağlantıyı yeni sekmede aç', click: () => newTab(p.linkURL, true, activeId) });
    items.push({ label: 'Bağlantıyı farklı kaydet...', click: () => wc.downloadURL(p.linkURL) });
    items.push({ label: 'Bağlantı adresini kopyala', click: () => clipboard.writeText(p.linkURL) });
    items.push({ type: 'separator' });
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push({ label: 'Resmi yeni sekmede aç', click: () => newTab(p.srcURL, true, activeId) });
    items.push({ label: 'Resmi kaydet', click: () => wc.downloadURL(p.srcURL) });
    items.push({ label: 'Resmi kopyala', click: () => wc.copyImageAt(p.x, p.y) });
    items.push({ label: 'Resim adresini kopyala', click: () => clipboard.writeText(p.srcURL) });
    items.push({ type: 'separator' });
  }
  if (p.isEditable) {
    items.push({ role: 'undo', label: 'Geri al' }, { role: 'redo', label: 'Yinele' }, { type: 'separator' },
      { role: 'cut', label: 'Kes' }, { role: 'copy', label: 'Kopyala' }, { role: 'paste', label: 'Yapıştır' },
      { role: 'selectAll', label: 'Tümünü seç' });
  } else if (p.selectionText) {
    const s = p.selectionText.trim();
    const name = (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google).name;
    items.push({ role: 'copy', label: 'Kopyala' });
    items.push({ label: `${name} ile "${s.length > 24 ? s.slice(0, 24) + '...' : s}" ara`, click: () => newTab(searchUrl() + encodeURIComponent(s), false, activeId) });
  } else if (p.mediaType === 'video' || p.mediaType === 'audio') {
    const f = p.mediaFlags || {};
    if (p.mediaType === 'video') items.push({ label: 'Resim içinde resim', click: () => pictureInPicture(wc, p.frame, p.x, p.y) });
    items.push({ label: 'Döngü', type: 'checkbox', checked: !!f.isLooping, click: () => mediaToggle(wc, p.frame, p.x, p.y, 'loop') });
    items.push({ label: 'Denetimleri göster', type: 'checkbox', checked: !!f.isControlsVisible, click: () => mediaToggle(wc, p.frame, p.x, p.y, 'controls') });
    if (p.srcURL && /^https?:/i.test(p.srcURL)) items.push({ label: p.mediaType === 'video' ? 'Videoyu farklı kaydet...' : 'Sesi farklı kaydet...', click: () => wc.downloadURL(p.srcURL) });
  } else if (!p.linkURL && p.mediaType !== 'image') {
    const nav = wc.navigationHistory;
    items.push({ label: 'Geri', enabled: nav ? nav.canGoBack() : wc.canGoBack(), click: goBack });
    items.push({ label: 'İleri', enabled: nav ? nav.canGoForward() : wc.canGoForward(), click: goForward });
    items.push({ label: 'Yeniden yükle', click: () => wc.reload() });
    items.push({ type: 'separator' });
    items.push({ label: 'Farklı kaydet...', click: () => saveAs(wc) });
    items.push({ label: 'Yazdır...', click: () => wc.print() });
    items.push({ label: 'Sayfa kaynağını görüntüle', click: () => newTab('view-source:' + wc.getURL(), false, activeId) });
    if (/^https?:/i.test(wc.getURL())) items.push({ label: 'Okuma modu', accelerator: 'F9', registerAccelerator: false, click: () => toggleReader(wc) });
  }
  if (extensions) {
    try {
      const extItems = extensions.getContextMenuItems(wc, p) || [];
      if (extItems.length) items.push({ type: 'separator' }, ...extItems);
    } catch {}
  }
  if(calciumSite(wc.getURL()))items.push({type:'separator'},{label:'Bu sitede Calcium koruması',type:'checkbox',checked:calciumEnabledFor(wc.getURL()),click:()=>{toggleCalciumSite(wc.getURL());wc.reload();}});
  items.push({ type: 'separator' }, { label: 'İncele', click: () => wc.inspectElement(p.x, p.y) });
  const bounds=byWcId.get(wc.id)?.view?.getBounds()||{x:0,y:0};
  popupBrowserMenu(items,{x:bounds.x+p.x,y:bounds.y+p.y},wc);
}

// ---------------------------------------------------------------- Video: picture-in-picture
// In-page expression that finds the video at the clicked point; otherwise a playing one, then the largest.
function findMediaJs(x, y, audio = false) {
  const tags = audio ? "['VIDEO', 'AUDIO']" : "['VIDEO']";
  const hit = Number.isFinite(x) && Number.isFinite(y)
    ? `document.elementsFromPoint(${x}, ${y}).find((e) => ${tags}.includes(e.tagName))` : 'null';
  const all = `[...document.querySelectorAll('${audio ? 'video, audio' : 'video'}')]`;
  return `(${hit} || ${all}.sort((a, b) => (a.paused - b.paused) || (b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight))[0] || null)`;
}
async function pictureInPicture(wc, frame, x, y) {
  if (!wc || wc.isDestroyed()) return;
  const code = `(async () => {
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'kapandi'; }
    const v = ${findMediaJs(x, y)};
    if (!v) return '';
    v.disablePictureInPicture = false;
    await v.requestPictureInPicture();
    return 'acik';
  })()`;
  // First the clicked frame, then all frames on the page (for embedded players)
  const frames = [frame, ...(wc.mainFrame ? wc.mainFrame.framesInSubtree : [])].filter(Boolean);
  for (const f of frames) {
    try { if (await f.executeJavaScript(code, true)) return; } catch {}
  }
}
function mediaToggle(wc, frame, x, y, what) {
  const code = `(() => { const v = ${findMediaJs(x, y, true)}; if (v) v.${what} = !v.${what}; })()`;
  (frame || wc.mainFrame).executeJavaScript(code, true).catch(() => {});
}

// ---------------------------------------------------------------- Reader mode
// Shows the page's main text in a clean overlay. No extra process or page; runs in an isolated world,
// so the site's own scripts and security rules (CSP) don't interfere. Calling it again closes it.
let READER_JS = null;
function toggleReader(wc) {
  if (!wc || wc.isDestroyed() || !/^https?:/i.test(wc.getURL())) return;
  if (!READER_JS) READER_JS = localizeSrc(fs.readFileSync(path.join(__dirname, 'reader.js'), 'utf8'));   // read on first use
  wc.executeJavaScriptInIsolatedWorld(1012, [{ code: READER_JS }], true).then((r) => {
    if (r === 'bulunamadi') dialog.showMessageBox(win, { message: 'Bu sayfada okuma modunda gösterilecek bir yazı bulunamadı.' });
  }).catch(() => {});
}

async function saveAs(wc) {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), (wc.getTitle() || 'sayfa').replace(/[\\/:*?"<>|]/g, '_') + '.html') });
  if (!r.canceled && r.filePath) wc.savePage(r.filePath, 'HTMLComplete').catch(() => {});
}

// ---------------------------------------------------------------- Window
// ---------------------------------------------------------------- Themes
// mode: system/light/dark base. Colored themes paint the toolbar, tab strip and new tab page.
const THEMES={sistem:{name:'Sistem',mode:'system'},acik:{name:'Açık',mode:'light'},koyu:{name:'Koyu',mode:'dark'}};
const currentTheme = () => THEMES[settings.theme] || THEMES.sistem;
// Pitch black: with the dark theme or a dark system theme, except colored themes
const PITCH = { frame: '#000000', toolbar: '#000000', card: '#0a0a0a', activeTab: '#0a0a0a', omniHover: '#141414', omni: '#0d0d0d', accent: '#a8c7fa', page: '#000000', menu: '#121212', mode: 'dark' };
function effectiveTheme() {
  const t = currentTheme();
  const dark = t.mode === 'dark' || (t.mode === 'system' && nativeTheme.shouldUseDarkColors);
  return settings.pitchBlack && dark && !t.frame ? PITCH : t;
}

function themeColors() {
  const t = effectiveTheme();
  const dark = nativeTheme.shouldUseDarkColors;
  // toolbar: with vertical tabs the window buttons sit on the toolbar, so the color must match it (same as ui.html --toolbar)
  return { frame: t.frame || (dark ? '#1f1f1f' : '#dfe3e7'), toolbar: t.toolbar || (dark ? '#3c3c3c' : '#ffffff'), symbol: dark ? '#e3e3e3' : '#1f1f1f', dark };
}

function applyTheme() {
  const t = currentTheme();
  nativeTheme.themeSource = t.mode;              // pages' light/dark preference follows this too
  forEachWin(() => { paintFrame(); pushState(); });
  broadcastPages();
}
// Color of the window frame and Windows caption buttons
function paintFrame() {
  if (!win) return;
  const c = W && W.incognito ? { frame: INCOGNITO_THEME.frame, toolbar: INCOGNITO_THEME.toolbar, symbol: '#e3e3e3' } : themeColors();
  try { win.setBackgroundColor(c.frame); } catch {}
  if (!isMac && win.setTitleBarOverlay) { try { win.setTitleBarOverlay({ color: settings.verticalTabs ? c.toolbar : c.frame, symbolColor: c.symbol, height: settings.verticalTabs ? TOOLBAR : TAB_STRIP }); } catch {} }
}

// Incognito windows are always dark (like Chrome)
const INCOGNITO_THEME = { frame: '#202124', toolbar: '#35363a', omni: '#202124', accent: '#8ab4f8', page: '#202124', mode: 'dark' };
function themeVars() {
  const t = effectiveTheme();
  return t.frame ? { frame: t.frame, toolbar: t.toolbar, omni: t.omni, accent: t.accent, page: t.page, mode: t.mode, ...(t.menu ? { menu: t.menu } : {}), ...(t.card ? { card: t.card, activeTab: t.activeTab, omniHover: t.omniHover } : {}) } : null;
}

// ---------------------------------------------------------------- Local pages (new tab + welcome)
const pageData = () => ({
  incognito: !!(W && W.incognito),
  shortcuts: settings.shortcuts.map((s) => ({ title: s.title, url: s.url, icon: s.icon || null })),
  searchUrl: searchUrl(),
  searchName: (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google).name,
  theme: W && W.incognito ? INCOGNITO_THEME : themeVars(),
  themeKey: settings.theme,
  themes: Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, mode: t.mode, frame: t.frame || null, toolbar: t.toolbar || null, accent: t.accent || null }))
});

function broadcastPages() {
  for(const [owner,panel] of [...downloadPanels,...taskPanels])if(!panel.isDestroyed())inWin(owner,()=>panel.webContents.send('page-update',pageData()));
  for (const t of allTabs()) {
    if (!t.view || !isInternal(t.url)) continue;
    inWin(t.w, () => { try { t.view.webContents.send('page-update', pageData()); } catch {} });
  }
}

// Notify the history/downloads page of changes if it is open (throttled)
const notifyTimers = {};
function notifyPages(kind) {
  if (notifyTimers[kind]) return;
  notifyTimers[kind] = setTimeout(() => {
    notifyTimers[kind] = null;
    for (const t of allTabs()) {
      if (!t.view || pageKind(t.url) !== kind) continue;
      inWin(t.w, () => { try { t.view.webContents.send('page-update', { ...pageData(), changed: kind }); } catch {} });
    }
    if(kind==='downloads')for(const [owner,panel] of downloadPanels)if(!panel.isDestroyed())inWin(owner,()=>panel.webContents.send('page-update',{...pageData(),changed:kind}));
  }, kind === 'downloads' ? 300 : kind === 'extensions' ? 100 : 0);
}

function historyList(arg) {
  const q = String((arg && arg.q) || '').toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
  const before = (arg && arg.before) || Infinity;
  const limit = Math.min(Math.max((arg && arg.limit) || 150, 1), 1000);
  const items = [];
  let more = false;
  for (const h of history) {
    if (h.t >= before) continue;
    if (q.length) {
      const hay = ((h.title || '') + ' ' + h.url).toLocaleLowerCase('tr');
      if (!q.every((w) => hay.includes(w))) continue;
    }
    if (items.length >= limit) { more = true; break; }
    items.push({ t: h.t, url: h.url, title: h.title || '', favicon: h.favicon || null });
  }
  return { items, more, total: history.length };
}

const fileIcons = new Map();
async function fileIcon(file) {
  const ext = path.extname(file).toLowerCase();
  const key = ['.exe', '.lnk', '.ico'].includes(ext) ? file : ext || '?';
  if (fileIcons.has(key)) return fileIcons.get(key);
  let url = null;
  try { url = (await app.getFileIcon(file, { size: 'normal' })).toDataURL(); } catch {}
  if (fileIcons.size > 200) fileIcons.clear();
  fileIcons.set(key, url);
  return url;
}

async function downloadsList() {
  return Promise.all(downloads.filter(d=>!d.incognito||W?.incognito).map(async (d) => {
    let exists = true;
    if (d.state === 'completed') exists = await fsp.access(d.file).then(() => true, () => false);
    return {
      id: d.id, name: d.name, url: d.url || '', t: d.t || 0, received: d.received || 0, total: d.total || 0,
      state: d.state, paused: !!d.paused, canResume: !!(d.item && d.item.canResume()), exists,
      icon: d.state === 'completed' && exists ? await fileIcon(d.file) : null
    };
  }));
}

function downloadAction(cmd, id) {
  const d = downloads.find((x) => x.id === id);
  switch (cmd) {
    case 'dl-open': if (d) shell.openPath(d.file); break;
    case 'dl-show': if (d) shell.showItemInFolder(d.file); break;
    case 'dl-cancel': if (d && d.item) d.item.cancel(); break;
    case 'dl-pause': if (d && d.item) d.item.pause(); break;
    case 'dl-resume': if (d && d.item && d.item.canResume()) d.item.resume(); break;
    case 'dl-retry': if (d && d.url && ses) { downloads.splice(downloads.indexOf(d), 1); ses.downloadURL(d.url); } break;
    case 'dl-copy': if (d && d.url) clipboard.writeText(d.url); break;
    case 'dl-remove': if (d && d.state !== 'progressing') downloads.splice(downloads.indexOf(d), 1); break;
    case 'dl-clear': for (let i = downloads.length - 1; i >= 0; i--) if (downloads[i].state !== 'progressing') downloads.splice(i, 1); break;
    case 'dl-folder': shell.openPath(app.getPath('downloads')); break;
  }
  saveDownloads(); pushState(); notifyPages('downloads');
  return { ok: true };
}

const MAX_SHORTCUTS = 12;
function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return null;
  const full = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  try { const x = new URL(full); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : null; } catch { return null; }
}

function settingsData() {
  return {
    calciumProtection:settings.calciumProtection!==false,calciumProtectionStats:calciumProtection.stats(),
    askDownloadLocation:settings.askDownloadLocation!==false,
    newTabPrompt: settings.newTabPrompt !== false,
    bookmarksEnabled: settings.bookmarksEnabled !== false,
    uiFont:settings.uiFont,uiFonts:UI_FONTS.map(({key,name})=>({key,name})),
    theme: settings.theme, themes: Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, mode: t.mode, frame: t.frame || null, accent: t.accent || null })),
    engine: settings.searchEngine, engines: Object.entries(SEARCH_ENGINES).map(([key, x]) => ({ key, name: x.name })),
    bookmarksBar: hasBookmarks(), fullUrl: true, forceDarkPages: settings.forceDarkPages, strictIsolation: settings.strictIsolation, language: uiLang(),
    clearGoogleOnExit: settings.clearGoogleOnExit,
    keepLogins: settings.keepLogins,
    memorySaver:settings.memorySaver!==false,
    sleepMinutes: settings.sleepMinutes, sleepChoices: SLEEP_CHOICES, downloadNotify: settings.downloadNotify,
    downloadsDir: app.getPath('downloads'),
    extSupport: !!extensions, webStore: !!CWS, extCount: listExtensions().length,
    hoverZoom: settings.hoverZoom, tabAudio: settings.tabAudio, sleepTabs: settings.sleepTabs,
    verticalTabs: settings.verticalTabs, verticalAutoHide: settings.verticalAutoHide, sideEdge: 60,
    pitchBlack: settings.pitchBlack, darkActive: effectiveTheme().mode === 'dark' || (effectiveTheme().mode === 'system' && nativeTheme.shouldUseDarkColors),
    uboError:uboErrors.get(mainSes)||null,
    ubo: uboId ? (extApi().getExtension(uboId) || {}).version || '' : null,
      sitePerms: Object.keys(settings.sitePerms).length, deviceGrants: settings.deviceGrants.length,
    version: app.getVersion(), chrome: process.versions.chrome, electron: process.versions.electron,
    siteCommands:settings.siteCommands,textReplacements:settings.textReplacements,
    appUpdate:appUpdateData(),resolvedTheme:W?.incognito?INCOGNITO_THEME:themeVars(),
    widevine: (() => { try { const st = components && components.status(); const w = st && Object.values(st).find((x) => /widevine/i.test(x.title || '')); return w ? w.version : null; } catch { return null; } })()
  };
}
// On language change the UI and Calcium pages are reloaded (translation is applied when a page opens)
function setLanguage(v) {
  if (settings.language === v) return;
  settings.language = v; uiLangCache = null; saveSettings(true);
  setTimeout(() => {
    forEachWin((w) => { if (ui && !ui.webContents.isDestroyed()) ui.webContents.reload(); });
    for (const t of allTabs()) if (t.view && isInternal(t.url) && !t.view.webContents.isDestroyed()) t.view.webContents.reload();
  }, 150);
}
function settingsSet(key, value) {
  const bool = (k) => { if (typeof value !== 'boolean') return false; setSetting(k, value, k === 'forceDarkPages' || k === 'strictIsolation'); return true; };
  switch (key) {
    case 'theme': if (!THEMES[value]) return false; settings.theme = value; saveSettings(); applyTheme(); return true;
    case 'engine': case 'searchEngine': if (!SEARCH_ENGINES[value]) return false; setSetting('searchEngine', value); broadcastPages(); return true;
    case 'sleepMinutes': if (!SLEEP_CHOICES.includes(value)) return false; setSetting('sleepMinutes', value); return true;
    case 'hoverZoom': if (typeof value !== 'boolean') return false; setFeature(key, value); return true;
    case 'bookmarksEnabled': case 'tabAudio': case 'downloadNotify': return false;
    case 'newTabPrompt': return bool(key);
    case 'sleepTabs': case 'memorySaver': return bool(key);
    case 'verticalTabs': if (typeof value !== 'boolean') return false; setVerticalTabs(value); return true;
    case 'uiFont': if(!validUiFont(value))return false;settings.uiFont=value;saveSettings(true);broadcastUiFont();return true;
    case 'language': if (!['tr', 'en'].includes(value)) return false; setLanguage(value); return true;
    case 'pitchBlack': if (typeof value !== 'boolean') return false; settings.pitchBlack = value; saveSettings(); applyTheme(); return true;

    case 'verticalAutoHide': if (typeof value !== 'boolean') return false; if (value !== !!settings.verticalAutoHide) { if (settings.verticalTabs) toggleAutoHide(); else { settings.verticalAutoHide = value; saveSettings(); } } return true;
    case 'calciumProtection': case 'askDownloadLocation': case 'forceDarkPages': case 'strictIsolation': case 'clearGoogleOnExit': case 'keepLogins': return bool(key);
  }
  return false;
}

ipcMain.handle('page', async (e, cmd, arg) => {
  const ow = winOfWc(e.sender);
  if (ow) useWin(ow);
  const from = (e.senderFrame && e.senderFrame.url) || '';
  const kind = pageKind(from);
  if (!kind) throw new Error('izin yok');
  if(kind==='update-notice'){
   if(!ow||ow.updateNotice?.webContents!==e.sender||e.senderFrame!==e.sender.mainFrame)throw Error('izin yok');
   if(cmd==='get')return pageData();
   if(cmd==='app-update-state')return appUpdateData();
   if(cmd==='app-update-later'){appUpdates.later();return {ok:true};}
   if(cmd==='app-update-install'){if(appUpdates.snapshot().canInstall)appUpdates.install();else{appUpdates.clearNotice();inWin(ow,()=>openPage(SETTINGS_URL+'#hakkinda'));}return {ok:true};}
   return null;
  }
  if (kind==='security') {
    const target=blockedNavigations.get(e.sender.id);
    if(cmd==='get')return {...pageData(),blockedHost:target?hostOf(target):null};
    if(cmd==='security-back'){blockedNavigations.delete(e.sender.id);go(e.sender,newtabUrl());return {ok:true};}
    if(cmd==='security-continue'&&target&&ow){if(!trustedThreatHosts.has(ow))trustedThreatHosts.set(ow,new Set());trustedThreatHosts.get(ow).add(hostOf(target));blockedNavigations.delete(e.sender.id);go(e.sender,target);return {ok:true};}
    return null;
  }
  if (cmd === 'get') return pageData();
  if (kind === 'settings') {
    if (settings.bookmarksEnabled === false && /^bm-/.test(cmd)) return { sources: [], groups: [], total: 0, error: 'Yer işaretleri kapalı.' };
    switch (cmd) {
      case 'settings-get': return settingsData();
      case 'shortcut-save': {
       if(e.senderFrame!==e.sender.mainFrame)throw Error('izin yok');
       try{const field=arg?.kind==='site'?'siteCommands':arg?.kind==='text'?'textReplacements':null;if(!field)throw Error('Geçersiz kısayol türü.');settings[field]=customShortcuts.saveRule(arg.kind,settings[field],arg);saveSettings(true);forEachWin(()=>pushState());broadcastTextShortcuts();return {ok:true};}catch(error){return {error:T(error.message)};}
      }
      case 'shortcut-remove': {
       if(e.senderFrame!==e.sender.mainFrame)throw Error('izin yok');const field=arg?.kind==='site'?'siteCommands':arg?.kind==='text'?'textReplacements':null;if(!field)return {error:T('Geçersiz kısayol türü.')};settings[field]=settings[field].filter(r=>r.trigger!==arg.trigger);saveSettings(true);forEachWin(()=>pushState());broadcastTextShortcuts();return {ok:true};
      }
      case 'app-update-check': if(e.senderFrame!==e.sender.mainFrame)throw Error('izin yok');await appUpdates.check();return appUpdateData();
      case 'app-update-install': if(e.senderFrame!==e.sender.mainFrame)throw Error('izin yok');await appUpdates.install();return appUpdateData();
      case 'app-update-release': if(e.senderFrame!==e.sender.mainFrame)throw Error('izin yok');shell.openExternal(require('./app-updates').RELEASE_PAGE);return {ok:true};
      case 'settings-set': { const ok = settingsSet(arg && arg.key, arg && arg.value); notifyPages('settings'); return { ok }; }
      case 'clear-data': clearData(); return { ok: true };
      case 'ps-list': return { sites: siteData.list() };
      case 'ps-add': return siteData.add(String(arg || '').slice(0, 300));
      case 'ps-remove': return siteData.remove(String(arg || ''));
      case 'ps-deps': return { deps: siteData.depsFor(String(arg || '')) };
      case 'sd-inventory': try { return await siteData.inventory(); } catch (err) { return { error: String(err.message || err).slice(0, 200) }; }
      case 'sd-protect': return siteData.setSite(String((arg && arg.site) || ''), !!(arg && arg.on));
      case 'sd-delete-site': { const site = String(arg || ''); if (!siteData.siteOfHost(site)) return { error: 'Geçersiz site' }; const r = await siteData.clear({ cookies: true, siteData: true, protect: false, range: 'all', onlySite: site }); notifyPages('settings'); return r; }
      case 'clear-prefs': return { prefs: settings.clearPrefs, protectedCount: (settings.protectedSites || []).length };
      case 'clear-run': return runClear(arg || {});
      case 'clear-status': return siteData.status();
      case 'bm-sources': return { sources: bmSources(), groups: bookmarkGroups(), total: settings.bookmarks.length };
      case 'bm-import': {
        const src = bmSources().find((x) => x.id === String(arg || ''));
        if (!src) return { error: 'Kaynak bulunamadı.' };
        const items = bookmarkImport.readSourceById(src.id);
        if (!items) return { error: `${src.browser} yer işaretleri okunamadı.` };
        if (!items.length) return { error: `${src.browser} profilinde yer işareti yok.` };
        return addImported(items, src.browser);
      }
      case 'bm-import-html': return importBookmarksHtml();
      case 'bm-group-remove': return removeBookmarkGroup(String(arg || ''));
      case 'site-perms': settings.sitePerms = {}; saveSettings(true); notifyPages('settings'); return { ok: true };
      case 'device-grants': showDeviceGrants(); return { ok: true };
      case 'update-filters': return forceUpdateFilters();
      case 'ubo-dashboard': if (uboId) newTab(uboPage('dashboard.html')); return { ok: true };
      case 'open-downloads-folder': shell.openPath(app.getPath('downloads')); return { ok: true };
      case 'web-store': newTab('https://chromewebstore.google.com/category/extensions', false); return { ok: true };
      case 'ext-load': await loadUnpackedDialog(); notifyPages('settings'); return { ok: true };
      case 'ext-remove': await removeExtension(String(arg)); notifyPages('settings'); return { ok: true };
      case 'open-page': openPage(arg === 'downloads' ? DOWNLOADS_URL : arg === 'extensions' ? EXTENSIONS_URL : HISTORY_URL); return { ok: true };
      case 'task-manager': showTaskManager(); return { ok: true };
    }
    return null;
  }
  if (kind === 'tasks') {
    if(cmd==='task-panel-close'){const panel=ow&&taskPanels.get(ow);if(panel?.webContents===e.sender)panel.close();return {ok:true};}
    if (cmd === 'tasks-list') return taskManagerData();
    if (cmd === 'tasks-sleep') return { ok:sleepTab(arg) };
    if (cmd === 'tasks-sleep-background') { sleepIdleTabs(true); return { ok:true }; }
    if (cmd === 'tasks-activate') { const t=allTabs().find(t=>t.id===Number(arg)); if(t){const panel=ow&&taskPanels.get(ow);if(panel?.webContents===e.sender)panel.close();useWin(t.w);activateTab(t.id);win.focus();}return {ok:!!t}; }
    return null;
  }
  if (kind === 'extensions') {
    const id = String((arg && arg.id) || arg || '');
    switch (cmd) {
      case 'ext-list': return { extSupport: !!extensions, webStore: !!CWS, devMode: !!settings.extDevMode, list: listExtensions() };
      case 'ext-enable': await setExtensionEnabled(id, !!(arg && arg.on)); return { ok: true };
      case 'ext-hide': setExtensionHidden(id, !!(arg && arg.hidden)); return { ok: true };
      case 'ext-remove': await removeExtension(id); return { ok: true };
      case 'ext-options': { const x = listExtensions().find((e) => e.id === id && e.enabled); if (x && x.optionsUrl) newTab(x.optionsUrl); return { ok: true }; }
      case 'ext-load': await loadUnpackedDialog(); return { ok: true };
      case 'ext-devmode': settings.extDevMode = !!arg; saveSettings(); notifyPages('extensions'); return { ok: true };
      case 'web-store': newTab('https://chromewebstore.google.com/category/extensions', false); return { ok: true };
      case 'open-page': openPage(arg === 'settings' ? SETTINGS_URL : HISTORY_URL); return { ok: true };
    }
    return null;
  }
  if (kind === 'history' || kind === 'downloads') {
    if (cmd === 'clear-data') { clearData(); return { ok: true }; }
    if (cmd === 'copy') { clipboard.writeText(String(arg || '').slice(0, 4096)); return { ok: true }; }
    if (cmd === 'open-page') { openPage(arg === 'downloads' ? DOWNLOADS_URL : arg === 'settings' ? SETTINGS_URL : HISTORY_URL); return { ok: true }; }
  }
  if (kind === 'history') {
    switch (cmd) {
      case 'history-list': return historyList(arg);
      case 'history-remove': {
        const del = new Set(Array.isArray(arg) ? arg : []);
        history = history.filter((h) => !del.has(h.t));
        for (const t of tabs) if (t.hist && del.has(t.hist.t)) t.hist = null;
        saveHistory(); notifyPages('history');
        return { ok: true };
      }
      case 'history-clear':
        history = []; for (const t of tabs) t.hist = null;
        saveHistory(true); notifyPages('history');
        return { ok: true };
    }
    return null;
  }
  if (kind === 'downloads') {
    if(cmd==='download-panel-close'){const panel=ow&&downloadPanels.get(ow);if(panel?.webContents===e.sender)panel.close();return {ok:true};}
    if (cmd === 'downloads-list') return downloadsList();
    if (/^dl-/.test(cmd)) return downloadAction(cmd, arg);
    return null;
  }
  switch (cmd) {
    case 'get': return pageData();
    case 'add': case 'edit': {
      const url = normalizeUrl(arg && arg.url);
      if (!url) return { error: 'Geçerli bir adres girin (ör. youtube.com)' };
      const title = String((arg && arg.title) || '').trim().slice(0, 40) || hostOf(url).replace(/^www\./, '');
      let item;
      if (cmd === 'edit' && settings.shortcuts[arg.i]) {
        item = settings.shortcuts[arg.i];
        const changed = item.url !== url;
        item.title = title; item.url = url;
        if (changed) item.icon = null;
      } else {
        if (settings.shortcuts.length >= MAX_SHORTCUTS) return { error: `En fazla ${MAX_SHORTCUTS} kısayol eklenebilir` };
        item = { title, url, icon: null };
        settings.shortcuts.push(item);
      }
      saveSettings();
      broadcastPages();
      if (!item.icon) fetchSiteIcon(url).then((icon) => {
        if (icon && settings.shortcuts.includes(item) && item.url === url) { item.icon = icon; saveSettings(); broadcastPages(); }
      });
      return { ok: true };
    }
    case 'remove': if (settings.shortcuts[arg]) { settings.shortcuts.splice(arg, 1); saveSettings(); broadcastPages(); } return { ok: true };
    case 'move': {
      const { from: a, to: b } = arg || {};
      if (settings.shortcuts[a] && b >= 0 && b < settings.shortcuts.length) {
        settings.shortcuts.splice(b, 0, settings.shortcuts.splice(a, 1)[0]); saveSettings(); broadcastPages();
      }
      return { ok: true };
    }
    case 'theme': if (THEMES[arg]) { settings.theme = arg; saveSettings(); applyTheme(); } return { ok: true };
    case 'welcome-done': {
      settings.firstRunDone = true;
      scheduleUpdateCheck();
      saveSettings(true);forEachWin(()=>{layout();pushState();});
      const t = tabs.find((x) => x.view && x.view.webContents === e.sender);
      if (t) { t.url = newtabUrl(); t.title = 'Yeni Sekme'; go(t.view.webContents, t.url); }
      return { ok: true };
    }
  }
  return null;
});

// Fetches the site's own logo (without third-party services like Google/DuckDuckGo).
// Returns null if none is found; the new tab page shows the first letter instead.
async function fetchSiteIcon(pageUrl) {
  const fetchT = async (u, ms = 7000) => {
    return net.fetch(u, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': app.userAgentFallback } });
  };
  let base;
  try { base = new URL(pageUrl); } catch { return null; }
  const cands = [];
  try {
    const r = await fetchT(base.href);
    if (r.ok && /html/i.test(r.headers.get('content-type') || '')) {
      base = new URL(r.url || base.href);
      const html = (await readResponseBytes(r,400000)).toString('utf8');
      for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
        const tag = m[0];
        const rel = ((tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || tag.match(/\brel\s*=\s*([^\s>]+)/i) || [])[1] || '').toLowerCase();
        if (!rel.includes('icon') || rel.includes('mask-icon')) continue;
        const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || tag.match(/\bhref\s*=\s*([^\s>]+)/i) || [])[1];
        if (!href) continue;
        const size = Number((tag.match(/\bsizes\s*=\s*["']?(\d+)/i) || [])[1] || 0);
        // 64-192 px is best; very large icons waste space
        let score = rel.includes('apple-touch') ? 180 : size || (/\.svg(\?|$)/i.test(href) ? 160 : 32);
        if (score > 256) score = 256 - (score - 256) / 10;
        try { cands.push({ href: new URL(href.replace(/&amp;/g, '&'), base).href, score }); } catch {}
      }
    }
  } catch { /* site didn't load; favicon.ico will be tried */ }
  cands.sort((a, b) => b.score - a.score);
  cands.push({ href: new URL('/favicon.ico', base).href, score: 0 });
  for (const c of cands.slice(0, 4)) {
    try {
      const r = await fetchT(c.href);
      if (!r.ok) continue;
      let type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!type.startsWith('image/')) {
        if (/\.ico(\?|$)/i.test(c.href)) type = 'image/x-icon'; else if (/\.png(\?|$)/i.test(c.href)) type = 'image/png'; else continue;
      }
      const buf = await readResponseBytes(r,300000);
      if (buf.length < 70 || buf.length > 300000) continue;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {}
  }
  return null;
}

function createWindow(opts = {}) {
  const incognito = !!opts.incognito;
  const w = {
    id: nextWinId++, incognito, ses: incognito ? getIncognitoSession() : mainSes, win: null, ui: null,
    tabs: [], closedTabs: [], searchHistory:[], activeId: null, findOpen: false, htmlFullscreen: false, overlayOpen: false, overlayKind: null,
    pushTimer: null, focusedAt: Date.now()
  };
  const from = W;
  windows.push(w);
  useWin(w);
  const c = incognito ? { frame: INCOGNITO_THEME.frame, toolbar: INCOGNITO_THEME.toolbar, symbol: '#e3e3e3' } : themeColors();
  // A new window opens slightly below-right of the previous one. For tests CALCIUM_TEST_DISPLAY: on that display, without stealing focus.
  let bounds = { width: 1280, height: 820 };
  const testDisplay = process.env.CALCIUM_TEST_DISPLAY;
  if (testDisplay != null) {
    const ds = screen.getAllDisplays();
    const d = ds[Math.min(Number(testDisplay) || 0, ds.length - 1)];
    const wa = d.workArea;
    bounds = { x: wa.x + 30 + (windows.length - 1) * 30, y: wa.y + 30 + (windows.length - 1) * 30, width: Math.min(1280, wa.width - 60), height: Math.min(820, wa.height - 60) };
  } else if (from && from.win) {
    const b = from.win.getBounds();
    bounds = { x: b.x + 30, y: b.y + 30, width: b.width, height: b.height };
  }
  win = w.win = new BaseWindow({
    ...bounds, minWidth: 500, minHeight: 320, show: false,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: c.frame, title: incognito ? 'Calcium (Gizli)' : 'Calcium',
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 12, y: 14 } } : { titleBarOverlay: { color: settings.verticalTabs ? c.toolbar : c.frame, symbolColor: c.symbol, height: settings.verticalTabs ? TOOLBAR : TAB_STRIP } })
  });
  if(process.platform==='win32')win.setAppDetails({appId:'org.cnrgks.calcium',appIconPath:app.isPackaged?path.join(process.resourcesPath,'calcium.ico'):path.join(__dirname,'build','icon.ico'),appIconIndex:0,relaunchDisplayName:'Calcium',relaunchCommand:app.isPackaged?'"'+process.execPath+'"':'"'+process.execPath+'" "'+__dirname+'"'});
  if (win.setMenu) win.setMenu(null);

  ui = w.ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'vendor', 'ui-sandbox-preload.js'),
      // Extension icon API is bundled into a sandbox-compatible preload.
      sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, session: w.ses
    }
  });
  ui.setBackgroundColor('#00000000');   // so the page shows behind while a menu is open
  ui.webContents.loadFile(path.join(__dirname, 'ui.html'));
  const uw = ui.webContents;
  uw.on('before-input-event', (e, input) => {
    useWin(w);
    const ctrl = isMac ? input.meta : input.control;
    const k = (input.key || '').toLowerCase();
    if (ctrl && !input.shift && ['c', 'v', 'x', 'a', 'z', 'y'].includes(k)) return;
    if (handleShortcut(input, true)) e.preventDefault();
  });
  uw.setZoomMode('manual');uw.on('zoom-changed',(event,direction)=>{event.preventDefault();inWin(w,()=>zoom(direction==='in'?1:-1));});
  uw.on('context-menu',(_e,p)=>{if(p.isEditable||p.selectionText)inWin(w,()=>showContextMenu(uw,p));});
  uw.on('did-finish-load', () => { useWin(w); pushState(); });
  uw.setWindowOpenHandler(() => ({ action: 'deny' }));
  uw.on('will-navigate', (e) => e.preventDefault());
  win.contentView.addChildView(ui);

  const on = (ev, fn) => win.on(ev, (...a) => { useWin(w); return fn(...a); });
  for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) on(ev, layout);
  on('leave-full-screen', () => { if (htmlFullscreen) { htmlFullscreen = false; layout(); } });
  on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') goBack();
    if (cmd === 'browser-forward') goForward();
  });
  on('focus', () => { w.focusedAt = Date.now(); });
  on('blur', () => { if (overlayOpen && overlayKind !== 'chooser' && overlayKind !== 'prompt') closeOverlay(); });
  on('swipe', (_e, dir) => { if (dir === 'left') goBack(); if (dir === 'right') goForward(); });
  // Save the session while the last normal window closes (it is then removed from the list)
  on('close', () => { if (!incognito && !quitting && windows.filter((x) => !x.incognito).length === 1) saveSession(true); });
  win.on('closed', () => closedWindow(w));
  if (testDisplay != null) win.showInactive(); else win.show();
  layout();
  return w;
}

// Window closed: close the web contents of its tabs and UI (memory), remove it from the list
function closedWindow(w) {
  if(w.incognito){w.closedTabs.length=0;w.searchHistory=[];}
  closeUpdateNotice(w);
  if (W === w) saveCtx();
  for (const t of w.tabs) {
    iconQueue.cancel(t);
    for(let i=titleQueue.length-1;i>=0;i--)if(titleQueue[i]===t)titleQueue.splice(i,1);
    if (t.titleRequest) t.titleRequest.abort();
    if (!t.view) continue;
    byWcId.delete(t.wcId);blockedNavigations.delete(t.wcId);
    try { t.view.webContents.close(); } catch {}
    t.view = null;
  }
  try { if (w.ui && !w.ui.webContents.isDestroyed()) w.ui.webContents.close(); } catch {}
  if (chooser && chooser.w === w) { const c = chooser; chooser = null; c.resolve(null); }
  for (const p of prompts.filter((p) => p.w === w)) settlePrompt(p, 'dismiss');
  w.win = null; w.ui = null;
  windows.splice(windows.indexOf(w), 1);
  if (W === w) {
    W = null;
    win = null; ui = null; tabs = []; activeId = null; closedTabs = [];
    const next = lastWin();
    if (next) useWin(next);
  }
  if (w.incognito) endIncognito();
  if (!windows.length) app.quit();
  else saveSession();
}

// New window (Ctrl+N) and new incognito window (Ctrl+Shift+N): open with the new tab page
function newWindow(incognito) {
  createWindow({ incognito });
  newTab('');
}

// Extension background pages: electron-chrome-extensions adds a 'destroyed' listener per listened event
// (uBO ~15 events). The count is bounded and removed when the page closes; not a leak, just silencing the Node warning.
app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'backgroundPage') wc.setMaxListeners(40); });
app.on('second-instance', (_e, argv) => {
  useWin(lastWin(true) || lastWin());
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const url = urlFromArgs(argv.slice(1));
  if (url) newTab(url);
});
// URL or file passed from Windows (default browser / "Open with"): an http(s) URL or an existing .html/.pdf/.svg/.webp file
function urlFromArgs(args) {
  for (const a of args) {
    if (typeof a !== 'string' || a.startsWith('-')) continue;
    if (/^https?:\/\//i.test(a)) return a;
    if (/\.(html?|pdf|svg|webp)$/i.test(a)) { try { if (fs.statSync(a).isFile()) return pathToFileURL(path.resolve(a)).href; } catch {} }
  }
  return null;
}

app.whenReady().then(async () => {
  // Widevine DRM: downloaded on first run, then updated in the background (does not delay startup)
  if (components && typeof components.whenReady === 'function') {
    const ready = components.whenReady()
      .then(() => console.log('Widevine ready:', JSON.stringify(components.status())))
      .catch((e) => console.warn('Could not load Widevine:', e && e.message));
    await Promise.race([ready, new Promise((r) => setTimeout(r, 5000))]);
  } else {
    console.warn('This Electron build has no Widevine: DRM videos (Netflix, Exxen...) will not play. Install the castLabs build with "npm install".');
  }
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]) : null);

  // Thorium: DNS-over-HTTPS (encrypted DNS queries; falls back to normal automatically on networks that don't support it)
  try {
    app.configureHostResolver({
      secureDnsMode: 'automatic',
      secureDnsServers: ['https://cloudflare-dns.com/dns-query', 'https://dns.quad9.net/dns-query']
    });
  } catch (e) { console.warn('Could not configure DoH:', e.message); }

  if (process.platform === 'win32') app.setAppUserModelId('org.cnrgks.calcium');   // "Calcium" in the taskbar and notifications
  nativeTheme.themeSource = currentTheme().mode;
  mainSes = ses = session.fromPartition('persist:main');
  setupSession(mainSes);
  if (settings.clearGoogleOnExit) await clearGoogleData();   // the previous session may have crashed
  nativeTheme.on('updated', () => { forEachWin(() => { paintFrame(); pushState(); }); broadcastPages(); });
  if(!process.env.CALCIUM_TEST_MODE){const refresh=()=>Promise.allSettled([threatProtection.refresh(),calciumProtection.refresh()]).then(()=>notifyPages('settings'));setTimeout(refresh,30000).unref();setInterval(refresh,12*60*60*1000).unref();}
  createWindow();
  startBlocking();
  setupExtensions();
  const startUrl = urlFromArgs(process.argv.slice(1));
  const restored = settings.firstRunDone && restoreSession();
  useWin(windows[0]);
  if (startUrl) newTab(startUrl);
  else if (!restored) newTab(settings.firstRunDone ? '' : WELCOME_URL);
  scheduleUpdateCheck();
  if(app.isPackaged&&!process.env.CALCIUM_TEST_MODE)appUpdates.cleanup();
  setInterval(sleepIdleTabs, 30e3);
  setInterval(keepSessionCookies, 15 * 60e3);
});

// On quit: write settings, clear Google data
let cleanedUp = false;
app.on('before-quit', (e) => {
  if (cleanedUp) return;
  e.preventDefault();
  cleanedUp = true;
  appUpdates.dispose();
  saveSession(true);
  quitting = true;
  saveSettings(true);
  saveHistory(true);saveSearchHistory(true);
  saveDownloads(true);
  saveSession(true);
  const job = (async () => {
    await keepSessionCookies();
    if (settings.clearGoogleOnExit) await clearGoogleData();
  })();
  Promise.race([job, new Promise((r) => setTimeout(r, 4000))]).finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
