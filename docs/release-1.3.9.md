Fixes Windows updates closing Calcium without starting installation.

Rebuilt with startup notification fixes: update checks start about one second after browser startup, and the auto-hide sidebar no longer hides the top-right update card. Opening Settings is not required. Later still suppresses future automatic offers.

- Replaced the PowerShell handoff with a direct, visible native installer.
- Calcium only closes after the installer confirms its progress window is ready.
- The usual compact black installer shows Updating Calcium, waits for the browser to finish closing, installs the update and reopens Calcium.
- Updates explicitly target the running executable's directory, even with a stale registry location.
- Added a real, isolated NSIS install/update/relaunch test, including a responsive update window, correct replacement timing and paths with spaces/apostrophes.

**Affected 1.3.7/1.3.8 users need to run this installer manually once.** Their existing broken handoff cannot reliably start a newer installer. Later updates use the fixed native flow. macOS remains a manual DMG installation.

Packages remain unsigned; macOS builds are not notarized.
