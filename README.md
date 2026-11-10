<p align="center"><img src="icon.png" alt="Calcium" width="112"></p>
<h1 align="center">Calcium</h1>
<p align="center">A bare bones browser.</p>

Calcium is a minimal browser for Windows and macOS, built on Electron and castLabs Chromium. It takes a debloated approach to browsing: a simple interface, no required account or sync, and telemetry and crash reporting turned off. Available in English and Turkish.

## Features

- Vertical tabs with an auto-hiding sidebar and a grid of pinned tabs. Ctrl+D pins the current tab.
- Session restore and sleeping background tabs to reduce memory use. Tabs with edited forms, media permissions, active captures or downloads stay awake.
- Built-in uBlock Origin, tracker protection and local malicious-domain filtering.
- Built-in image hover zoom as an Imagus alternative, plus a per-tab volume booster. No extra extensions needed for either.
- Chrome Web Store extension support.
- A simplified downloads interface, browsing history and task manager.
- Optional Tab Vault (Sekme Kasası), off by default in Settings → Tools: select tabs from the toolbar popup, save and close them into named groups, then restore individual links or entire groups at `calcium://saved-tabs`. Includes search, inline group naming, individual trash recovery and plain-text import/export (URL | title, with blank lines between groups). Legacy JSON imports remain supported. Pinned tabs and private windows are excluded. Turning it off preserves saved groups.
- System, light and dark themes, with a pitch-black option for dark mode.
- Custom site commands such as `!y nature videos` and text replacements such as `#address`. Add your own rules in Settings; no commands are enabled by default.
- Address suggestions drawn only from your previous searches, plus per-tab zoom with Ctrl+scroll and a one-click reset.
- Site controls for keeping tabs awake and protecting sign-in cookies. Private windows can reopen their own closed tabs until the window closes.

By default, vertical tabs, sidebar auto-hide, pitch black and the new-tab search prompt are enabled. The interface stays minimal with no bookmarks bar, tab audio controls or download notifications.

## Download

Get the Windows installer or macOS disk image from the [latest release](https://github.com/cnrgks/Calcium/releases/latest). Installed Windows builds can check and update from Settings → About Calcium. Startup offers a new release once; choosing Later stops further prompts until you choose to update. macOS builds link to the release page for manual installation.

## Development

Node.js 22.12+, with Windows 10/11 or macOS. Build each package on its target OS.

```sh
npm ci
npm start
npm run test:security
npm run test:electron
npm run dist:win
```

The installer is written to `dist/`. Build commands do not publish automatically.

## Security and compatibility

See the [security notes](docs/security-hardening.md) for details. Engine updates require a new build. Private windows include network blocking, cosmetic CSS and scriptlets in the main document; some advanced and subframe filters remain limited. Packages are unsigned; macOS builds are not notarized. Widevine VMP signing is unavailable, so some DRM services may not play. Extension compatibility varies; see the [validation notes](docs/release-validation.md).

## License and acknowledgements

[GPL-3.0](LICENSE). See [NOTICE](NOTICE.md) for original project attribution. Built with [Electron](https://www.electronjs.org/), [castLabs ECS](https://github.com/castlabs/electron-releases), [uBlock Origin](https://github.com/gorhill/uBlock) and [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell). Not affiliated with Google or Chromium.
