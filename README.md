<p align="center"><img src="icon.png" alt="Calcium" width="112"></p>
<h1 align="center">Calcium</h1>
<p align="center">A bare bones browser.</p>

Calcium is a minimal Windows browser built on Electron and castLabs Chromium. It takes a debloated approach to browsing: a simple interface, no required account or sync, and telemetry and crash reporting turned off. Available in English and Turkish.

## Features

- Vertical tabs with an auto-hiding sidebar and a grid of pinned tabs. Ctrl+D pins the current tab.
- Session restore and sleeping background tabs to reduce memory use. Tabs with edited forms, media permissions, active captures or downloads stay awake.
- Built-in uBlock Origin, tracker protection and local malicious-domain filtering.
- Built-in image hover zoom as an Imagus alternative, plus a per-tab volume booster. No extra extensions needed for either.
- Chrome Web Store extension support.
- A simplified downloads interface, browsing history and task manager.
- System, light and dark themes, with a pitch-black option for dark mode.

By default, vertical tabs, sidebar auto-hide, pitch black and the new-tab search prompt are enabled. The interface stays minimal with no bookmarks bar, tab audio controls or download notifications.

## Download

Get **Calcium-Setup-1.3.6.exe** from the [latest release](https://github.com/cnrgks/Calcium/releases/latest). To update, download and run the latest setup.

## Development

Node.js 22.12+ and Windows 10/11.

```sh
npm ci
npm start
npm run test:security
npm run test:electron
npm run dist:win
```

The installer is written to `dist/`. Build commands do not publish automatically.

## Security and compatibility

See the [security notes](docs/security-hardening.md) for details. Engine updates require a new build. Private windows use uBlock Origin network filtering without its full cosmetic filtering and scriptlet support. The Windows installer is not Authenticode signed. Widevine VMP signing is unavailable, so some DRM services may not play.

## License and acknowledgements

[GPL-3.0](LICENSE). See [NOTICE](NOTICE.md) for original project attribution. Built with [Electron](https://www.electronjs.org/), [castLabs ECS](https://github.com/castlabs/electron-releases), [uBlock Origin](https://github.com/gorhill/uBlock) and [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell). Not affiliated with Google or Chromium.
