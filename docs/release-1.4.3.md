- Hardened Chrome Web Store origin checks and verified installed extension permissions against the installation approval. Extension updates that request additional capabilities are held back; reinstall from the store to review and accept those permissions.
- Restricted website and extension navigation to prevent unsafe local-file, internal-page and cross-extension opening. Applied navigation protections to nested popup windows.
- External application requests now require a fresh confirmation showing the protocol. Unsupported protocols are blocked by default.
- Removed automatic third-party storage access. Embedded services may request confirmation; delegated top-level storage access is blocked.
- Removed the feature that extended session-cookie lifetimes to 30 days. Site-issued persistent cookies and previously extended cookies are retained until expiry or manual clearing.
- Added confirmation before opening risky downloads and Windows Internet-zone marking. Restricted internal page bridges and scripts, bounded store icon downloads, and stopped distributing text-replacement values to every page at startup.
- Pinned release workflow actions and prevented replacement of published versions and force-moving release tags.

Includes Windows x64, Intel macOS and Apple Silicon macOS packages with SHA-256 checksums. Packages remain unsigned; macOS builds are not notarized. Independent update signatures remain outstanding. See [the remediation notes](https://github.com/cnrgks/Calcium/blob/v1.4.3/docs/pentest-remediation.md) for compatibility changes and validation limits.
