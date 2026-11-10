# Calcium 1.5.0

- History suggestions now show the page favicon with a small history badge behind its upper-right corner.
- Background tabs now resolve script-generated page titles, including video titles, before releasing their temporary muted renderer. Generic site names no longer count as resolved page titles.
- Title loading is limited to three concurrent jobs and 20 seconds per page; selecting or closing a tab cancels its pending title request.
