<p align="center"><img src="icon.png" alt="Calcium" width="112"></p>
<h1 align="center">Calcium</h1>
<p align="center">A bare bones browser.</p>

A minimal Windows browser built on Electron / castLabs Chromium. Available in English and Turkish. New profiles follow the system language: Turkish for Turkish systems, English for all others. Language can be changed in Settings.

## Features

- Vertical tabs and a grid of pinned tabs. Ctrl+D pins the current tab.
- Deferred background tabs, automatic session restore and gradual tab sleeping under memory pressure.
- Automatic sleeping preserves edited forms, media permissions, captures and downloads; sites can be excluded from sleeping.
- Built-in uBlock Origin, lightweight Calcium tracker protection and local malicious-domain filtering.
- System, light and dark themes, with optional pitch black.
- Centered downloads and task-manager windows, with compact history.
- Site-data cleanup that can preserve protected sign-in sessions.
- Chrome Web Store extensions, image hover zoom and per-tab volume boost.
- Full-page F11 fullscreen and optional download location prompts.

New installs enable vertical tabs, pitch black and the new-tab search prompt. Sidebar auto-hide is on. Bookmarks, tab audio controls and download notifications are disabled.

## Download

Get **Calcium-Setup-1.3.5.exe** from the [latest release](https://github.com/cnrgks/Calcium/releases/latest).
Install new versions manually using the setup. Calcium has its own installation identity and profile folder; it does not replace Mondium or share its profile.

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

See [security notes](docs/security-hardening.md). uBlock is not a complete security boundary; engine updates require a new build. Private windows use uBO network filtering without the full cosmetic/scriptlet pipeline. This release is not Windows Authenticode signed. Widevine VMP signing is unavailable, so some DRM services may not play.

## License and acknowledgements

[GPL-3.0](LICENSE). See [NOTICE](NOTICE.md) for original project attribution. Built with [Electron](https://www.electronjs.org/), [castLabs ECS](https://github.com/castlabs/electron-releases), [uBlock Origin](https://github.com/gorhill/uBlock) and [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell). Not affiliated with Google or Chromium.
