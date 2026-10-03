
## Comfy integration — 2026-10-03

- TypeScript checking and Vite production build passed for the standalone GitHub UI.
- Ten isolated Python settings/ASGI tests passed, including sessions, logout, replay rejection, restart revocation, wrong-password rejection, allowlisted POST forwarding, and encrypted media chunk reconstruction.
- Browser Web Crypto transport test passed: encrypted password login, session-only subsequent requests, serialized calls, binary reconstruction, cancellation and logout.
- Python tests called the real ASGI application directly; the unused Uvicorn import was stubbed in the test runner because the bundled test interpreter does not have Uvicorn. No user virtual environment was used.
- Real Comfy /health returned HTTP 200. No generation jobs were submitted and no protected Comfy JSON/config.py files were accessed.
- Browser preview was denied by the user. Visual click-through and real generation/media verification were not performed.
- Changes are local; the user must restart the Python gateway and push/redeploy the UI. .NET studio/session support is not included.