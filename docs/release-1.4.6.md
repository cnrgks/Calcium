- Fixed a main-process error when a tab is closed externally while the auto-hidden sidebar is finishing its close animation. Destroyed views are removed from the logical tab model before deferred layout can reuse them.
- Detached view ownership before intentional close/sleep operations, preserved sleeping tabs and prevented stale view events from mutating replacement views.
- Added regression coverage for native active-tab closure, extension bulk removal during sidebar animation and sleep/wake behavior.
- Windows release builds now start automatically when package.json is pushed to main. Published versions remain immutable.

Windows x64 installer: **Calcium-Setup-1.4.6.exe**. SHA-256 checksums are included in SHA256SUMS.txt.
