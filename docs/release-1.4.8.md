- Private windows now inherit the opener window's display and normal/maximized/F11 fullscreen mode without changing saved normal-window preferences.
- Fixed scrolling conflicts on dynamic websites such as YouTube by leaving normal website wheel scrolling to Chromium instead of repeatedly changing positions in a renderer animation loop.
- Removed forced smooth-scroll styles from websites, so site positioning and scroll-anchoring corrections remain under the site's control.
- Kept animated scrolling in Calcium's internal pages and the live smooth-scrolling opt-out. Native website scrolling follows system motion preferences.
- Reset queued internal scrolling when direction changes to avoid continuing toward an old target.
- Verified native wheel handling on a real public YouTube watch page and added regression checks for immediate site corrections, reverse input and live setting changes.

Windows x64 installer: **Calcium-Setup-1.4.8.exe**. SHA-256 checksums are included in SHA256SUMS.txt.
