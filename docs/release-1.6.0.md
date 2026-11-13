# Calcium 1.6.0

- Remove forced website darkening from Settings and Chromium startup flags, and clear the obsolete preference from existing profiles.
- Prevent application updates from overwriting the development Electron runtime.
- Redirect installer paths that point into the development runtime to the normal per-user installation folder.
- Make the development launcher use workspace source when a stale packaged application is left in the Electron runtime folder.
- Add regression checks for the removed setting and the development update boundary.
