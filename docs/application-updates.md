# Application updates

Installed Windows x64 builds check the latest stable Calcium GitHub release once, shortly after startup. First-run setup completes before this check is scheduled. Development sessions and tests do not check automatically. There is no periodic update polling.

If a newer release is available, a small view appears at the top right of one normal browser window. It does not take focus, resize the page or block the rest of the window. It hides while a browser menu or fullscreen is open. Private windows do not show it.

**Later** is persistent: it suppresses automatic checks and offers across restarts and later releases. A manual check in Settings does not undo that choice or create a popup. A user-approved installation handoff enables future offers again. A release that has already been offered is not offered repeatedly. A manual check also prevents a delayed startup check from repeating it in the same session.

Settings → About Calcium has **Check for updates** and, when a compatible release is available, **Update**. Only Update downloads executable content. The browser closes when installation starts; the NSIS installer reopens the installed application. Unsupported/development installations offer the fixed GitHub release page instead.

After Update is selected, the same fixed-size card stays visible with streamed download progress. Settings-initiated installations show the card too. It continues through installer preparation; Calcium stays open until the installer confirms readiness. Errors remain in the card with Try again. While an installation job is active, Later/Escape do not dismiss its progress and repeated commands reuse the same job.

## Source and verification

The source is fixed to [cnrgks/Calcium's latest release](https://api.github.com/repos/cnrgks/Calcium/releases/latest). Drafts and prereleases are rejected. Only a strictly newer numeric version and its exact `Calcium-Setup-<version>.exe` asset are accepted. The asset must have an uploaded state, a bounded size and a SHA-256 digest from GitHub's [release asset metadata](https://docs.github.com/en/rest/releases/assets).

Release metadata is limited to 1 MiB and a 15-second deadline. Installer downloads stream to a private staging directory with backpressure, an expected byte count, a 512 MiB ceiling and a ten-minute deadline. Redirects are limited to HTTPS GitHub release hosts. No browser cookies, browsing addresses or profile identifiers are sent. The installer is not launched unless its byte count, SHA-256 and executable header checks pass.

The downloaded installer is hashed again immediately before execution. Calcium starts the native NSIS installer directly, with visible progress and no PowerShell handoff. A random, per-launch 256-bit token ties its readiness file to that launch. Calcium stays open unless the installer acknowledges that its progress window is ready. The installer captures the current browser process handle, waits for normal shutdown on its worker thread, then replaces files. The GUI remains responsive while waiting. Update mode uses the same compact black installer UI with an Updating Calcium label and automatically relaunches the application after success.

The target directory is the directory of the executable being updated. NSIS `/D` is passed last and unquoted, and the custom installation initialization respects it even if a stale registry entry points elsewhere. Ordinary first installs retain the same default directory and installation identity. Recently active staging folders are retained during the handoff so an early restart cannot remove a running installer's files. Readiness/phase files contain no browsing data. No signing credentials, certificate or server secret are embedded.

SHA-256 checks against GitHub metadata establish transport/file consistency with that release. They do not constitute Windows Authenticode signing or protect against a compromised publishing account. The existing unsigned-installer limitation remains.

## Validation and releases

`npm run test:security` covers version/asset rejection, parallel requests, persistent Later behavior, refusal to download on a check, hash/header/redirect rejection, cleanup and the installer handoff boundary. `npm run test:electron` uses a simulated release to exercise Settings, the top-right view, menu/private-window isolation and persistent dismissal. These tests never install a release over the developer's browser.

`npm run test:update:windows` builds and actually installs two small fixture versions using the production NSIS theme, installation-path logic and readiness/wait functions. A unique app ID/GUID and temporary directories isolate it from installed Calcium and user data. It verifies a visible, responsive update window, unchanged files while the Electron parent is alive, real shutdown, replacement, automatic relaunch with the new version, paths with spaces/apostrophes, and a stale registry target. The fixture is then uninstalled. This is an executable NSIS lifecycle test, not a mocked installer launch. It does not test every machine policy, antivirus configuration or a signed installer.

The old 1.3.7/1.3.8 PowerShell-based handoff can fail before it launches any installer. A server-side release cannot repair code that never starts that installer: affected users must install this fix manually once. Subsequent updates use the native flow. Release publication must increment the application version, use the existing Calcium installation identity and finish uploading the installer before announcing the release. Build commands retain `--publish never`.
