'use strict';
// Starts Calcium as "Calcium.exe" in development mode.
// With plain electron.exe, Task Manager showed "Electron" and the Electron icon.
// Calcium.exe is copied into the Electron folder once, with its name and icon changed (refreshed when Electron changes).
// In the installer build (npm run dist:win) electron-builder already does this.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

require('./prepare-security');
const root = path.join(__dirname, '..');
const electronExe = require('electron');            // path to node_modules/electron/dist/electron.exe
let exe = electronExe;

if (process.platform === 'win32') {
  const dir = path.dirname(electronExe);
  const target = path.join(dir, 'Calcium.exe');
  const stampFile = target + '.surum';
  const icon = path.join(root, 'build', 'icon.ico');
  const stamp = [fs.statSync(electronExe).size, fs.statSync(electronExe).mtimeMs, fs.statSync(icon).mtimeMs].join('|');
  try {
    if (!fs.existsSync(target) || !fs.existsSync(stampFile) || fs.readFileSync(stampFile, 'utf8') !== stamp) {
      console.log('Preparing Calcium.exe (one time)...');
      const ResEdit = require('resedit');
      const pe = ResEdit.NtExecutable.from(fs.readFileSync(electronExe), { ignoreCert: true });
      const res = ResEdit.NtExecutableResource.from(pe);
      // Icon
      const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
      const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icon));
      const g = groups[0] || { id: 1, lang: 1033 };
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, ico.icons.map((i) => i.data));
      // Name shown in Task Manager
      const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
      if (vi) {
        const langs = vi.getAllLanguagesForStringValues();
        for (const l of langs.length ? langs : [{ lang: 1033, codepage: 1200 }]) {
          vi.setStringValues(l, { FileDescription: 'Calcium', ProductName: 'Calcium', InternalName: 'Calcium', OriginalFilename: 'Calcium.exe', CompanyName: 'Calcium' });
        }
        vi.outputToResourceEntries(res.entries);
      }
      res.outputResource(pe);
      fs.writeFileSync(target, Buffer.from(pe.generate()));
      fs.writeFileSync(stampFile, stamp);
    }
    exe = target;
  } catch (e) {
    console.warn('Could not prepare Calcium.exe, starting with Electron:', e.message);
  }
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Electron prioritizes resources/app.asar over the source path argument. A
// packaged app left in the engine directory would silently run stale code.
const bundledApp = path.join(path.dirname(electronExe), 'resources', 'app.asar');
if (fs.existsSync(bundledApp)) {
  fs.renameSync(bundledApp, bundledApp + '.dev-backup-' + Date.now());
  console.log('Disabled stale bundled app; starting workspace source.');
}
console.log('Calcium dev source:', root);
const child = spawn(exe, [root, ...process.argv.slice(2)], { stdio: 'inherit', env, windowsHide: false });
child.on('close', (code) => process.exit(code || 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (!child.killed) child.kill(sig); });
