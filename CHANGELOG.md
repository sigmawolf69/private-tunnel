# Changelog

## 2026-10-03

- Verified standalone GitHub Pages workflow: root package-lock.json, root npm ci, generated Pages base path, and dist-only upload.
- Removed the obsolete main.jsx entry; main.tsx is the active typed entry point.
- Removed the broken npm test command pointing to backend tests outside this repository. TypeScript validation is available through npm run typecheck and every build.
- Updated deployment instructions for D:\dev\private-tunnel.
## 0.3.0 — 2026-10-03

- Integrated a copy of the Comfy dashboard into the GitHub Pages frontend after encrypted login.
- Added 30-minute in-memory sessions, logout, and serialized encrypted calls to the Python gateway.
- Added loopback-only Comfy route allowlisting, encrypted log polling, thumbnails and 512 KiB media chunks (256 MiB file cap).
- Preserved existing Comfy source, JSON files and config.py. No real generation jobs were submitted during verification.
- Added isolated gateway and browser transport tests; see COMFY-INTEGRATION.md for commands and limits.