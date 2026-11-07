# 1.3.7 validation

Security unit tests cover CRX verification, bounded downloads, protection rules, permission/session isolation, private filtering, closed logging pipes, updater boundaries and custom shortcut validation.

Electron integration tests cover startup, extension tab registration, centered address editing, tab layout and drag behavior, sleeping, task manager, overlay scrollbars, private document filtering, update offers and Settings controls. The custom-input test uses Chromium input events to verify text expansion, excluded login/password fields, rejected synthetic input, Ctrl+wheel zoom, reset, English site controls, the awake badge and private-window-only closed-tab restoration.

The official Bitwarden Chrome extension 2026.10.2 was loaded into an isolated temporary profile. Its sign-in screen rendered and a test login form remained usable. No account, vault, real credentials, biometric/native-messaging integration or unlocked-vault autofill was tested. Electron reports unsupported extension permissions and transient extension messaging errors; this is a basic compatibility smoke test, not a full compatibility guarantee.

Text replacements work in the address input and ordinary web text/search/URL/telephone fields, textareas and contenteditable text. Password, payment, OTP and sign-in forms are excluded. They require trusted typing followed by Space, Tab or Enter; pasted or page-generated text is not expanded. Email inputs are excluded because Chromium does not expose their caret selection API.

Only submitted address-bar searches enter suggestions. Visited URLs, bookmarks and remote suggestions are excluded. Search entries are bounded to 500 and removed when browsing history is cleared. Private search entries and closed-tab lists stay in their own window's memory and are discarded on close.

Windows installer launches were checked with a mocked process boundary; a real in-place installer upgrade was not exercised. macOS packages are compiled on a GitHub macOS runner, not runtime-tested on a physical Mac. Packages are unsigned and macOS builds are not notarized. DRM service playback is not guaranteed without castLabs VMP signing.

Short soak runs passed; a full two-hour soak has not been completed. See [the soak harness](soak-benchmark.md).
