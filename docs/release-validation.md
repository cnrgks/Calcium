# 1.3.7 validation

## OneTab compatibility follow-up

OneTab 2.24 was tested from its original installed files in an isolated temporary
profile. Its main page completed loading, the toolbar popup passed the initial
permission screen and displayed tab selection/storage controls, and Options
rendered. Calcium no longer advertises Chrome's unavailable `favicon` endpoint;
OneTab uses its own favicon fallback. Extensions declaring `tabGroups` can query
Calcium's empty group collection (`TAB_GROUP_ID_NONE: -1`), matching its flat tab
model. Creating or restoring native Chrome tab groups remains unsupported.

The regression fixture runs with `node tools/run-electron-tests.cjs test-extension-compat.cjs`.
Set `CALCIUM_ONETAB_DIR` to an installed OneTab directory to include the real
extension smoke test. It copies extension files into the disposable test profile
and never reads or changes the user's saved OneTab data.

Security unit tests cover CRX verification, bounded downloads, protection rules, permission/session isolation, private filtering, closed logging pipes, updater boundaries and custom shortcut validation.

Electron integration tests cover startup, extension tab registration, centered address editing, tab layout and drag behavior, sleeping, task manager, overlay scrollbars, private document filtering, update offers and Settings controls. The custom-input test uses Chromium input events to verify text expansion, excluded login/password fields, rejected synthetic input, Ctrl+wheel zoom, reset, English site controls, the awake badge and private-window-only closed-tab restoration.

The official Bitwarden Chrome extension 2026.10.2 was loaded into an isolated temporary profile. Its sign-in screen rendered and a test login form remained usable. No account, vault, real credentials, biometric/native-messaging integration or unlocked-vault autofill was tested. Electron reports unsupported extension permissions and transient extension messaging errors; this is a basic compatibility smoke test, not a full compatibility guarantee.

Text replacements work in the address input and ordinary web text/search/URL/telephone fields, textareas and contenteditable text. Password, payment, OTP and sign-in forms are excluded. They require trusted typing followed by Space, Tab or Enter; pasted or page-generated text is not expanded. Email inputs are excluded because Chromium does not expose their caret selection API.

Only submitted address-bar searches enter suggestions. Visited URLs, bookmarks and remote suggestions are excluded. Search entries are bounded to 500 and removed when browsing history is cleared. Private search entries and closed-tab lists stay in their own window's memory and are discarded on close.

Windows installer launches were checked with a mocked process boundary; a real in-place installer upgrade was not exercised. Packaged application startup, Settings, the custom-rule editor, the updater controls, Node isolation and clean shutdown passed on Windows x64, Intel macOS and Apple Silicon macOS runners. A full interactive macOS session was not tested. Packages are unsigned and macOS builds are not notarized. DRM service playback is not guaranteed without castLabs VMP signing.

The final five-minute soak completed 57 samples and eight tab cycles across three windows. Local wake latency was 60.3 ms median and 61.8 ms p95. Forms, synthetic media and downloads remained protected from simulated pressure. Test-tab sharing could not start in this environment and is not counted as passing. A full two-hour soak has not been completed. See [the soak harness](soak-benchmark.md).

## 1.3.9 Windows updater follow-up

The earlier mocked handoff missed a real launch failure. The native installer lifecycle test now actually installs 1.0.0 of a uniquely identified fixture, starts the production update handoff from an Electron parent, verifies the visible updating label and GUI responsiveness, waits for shutdown, upgrades to 1.0.1 and checks the relaunched executable's version. The target contains spaces and an apostrophe; a stale registry location is also injected. Test installation/profile/registry identities are separate from Calcium and are removed afterward. The full test uses the production NSIS path/theme/readiness code, with tiny fixture payloads rather than the user's browser installation. Signed-package/antivirus behavior remains outside its scope.
