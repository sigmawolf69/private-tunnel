# Deploy this UI as the GitHub repository root

This standalone UI repository is D:\dev\private-tunnel. Commit .github/workflows/deploy-pages.yml, package.json, package-lock.json, tsconfig.json, vite.config.js, index.html and src/ at this repository root. There is no nested ui/ folder. The old main.jsx entry has been removed; index.html uses src/main.tsx.

In GitHub Settings → Pages → Build and deployment, set Source to GitHub Actions. Do not use Deploy from a branch to serve these source files. The workflow builds TypeScript/React and uploads only dist/. Remove or disable any old workflow that uploads the repository root. It runs on main; change that branch if needed, or run it manually.

The source index.html references /src/main.tsx, which is for Vite to compile. The deployed index.html must reference /REPO/assets/...js (or /assets/...js for a root/custom-domain site). A request for /src/main.jsx or /src/main.tsx means the wrong HTML is being served. Do not fix that by publishing raw TSX: browsers cannot execute it directly.

Verify the green Deploy UI to GitHub Pages run is for your latest commit, then open its github-pages environment URL. If a custom hostname differs from that URL, check which host is serving it before changing cache settings. The API tunnel does not serve the frontend.

The workflow derives the asset base path from the GitHub Pages configuration. For a local production test run npm ci, npm run build, then npm run preview. The typecheck runs during every build.

Select your public.pem manually in the deployed UI and use the HTTPS API tunnel URL. Set the gateway config.json origin to the deployed UI origin, without the repository path. Keep all private secrets outside this UI repository.

Run npm run typecheck for TypeScript validation. The backend integration tests belong to the separate gateway project; this UI repository does not reference ../tests. A successful local build does not change GitHub Pages settings or push your changes.
