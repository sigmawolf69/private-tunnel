# Changelog

## 2026-10-03

- Verified standalone GitHub Pages workflow: root package-lock.json, root npm ci, generated Pages base path, and dist-only upload.
- Removed the obsolete main.jsx entry; main.tsx is the active typed entry point.
- Removed the broken npm test command pointing to backend tests outside this repository. TypeScript validation is available through npm run typecheck and every build.
- Updated deployment instructions for D:\dev\private-tunnel.