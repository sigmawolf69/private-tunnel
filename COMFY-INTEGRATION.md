# Comfy Studio over the encrypted gateway

## Files and servers

- `D:\dev\private-tunnel`: standalone GitHub Pages UI. It now includes a copy of the Comfy dashboard's TS/TSX/CSS under `src/studio`.
- `D:\dev\LLM-Experiments\private-tunnel`: Python RSA/AES gateway on port 8787, with `py-api/comfy_bridge.py` forwarding only allowed operations to loopback port 8000.
- `D:\dev\LLM-Experiments\comfy-ui-generator`: original Comfy API and generator. No JSON files or config.py were read or modified during this integration. The local dashboard/API can still run as before.

The GitHub UI is a compiled copy, not an iframe or live proxy of the local Vite development server. Future local frontend changes need to be deliberately ported into src/studio and redeployed.

## Start and deploy

1. Start Comfy Generator Studio as usual. Its API must answer on `http://127.0.0.1:8000`. The local Vite dashboard on 5174 is optional for remote access.
2. In the gateway folder run `python py-api/server.py`. Restart an already running gateway to load the session/adapter changes. Keep your existing key pair, password verifier and GitHub Pages origin configuration.
3. Keep the Cloudflare tunnel pointed at `http://127.0.0.1:8787`, with `/rpc` available for OPTIONS and POST. Do not expose port 8000 or 5174 through that tunnel.
4. Commit and push the changes in `D:\dev\private-tunnel`. The existing GitHub Actions workflow builds the UI and publishes dist. No secrets should be committed.
5. Open GitHub Pages and enter your current HTTPS tunnel origin (without /rpc), matching public.pem and gateway password. If Comfy requires a GENERATOR_API_TOKEN, enter that separate token in the optional Comfy API token field. Alternatively set GENERATOR_API_TOKEN in the gateway process environment; the gateway does not read the Comfy .env or config.py.
6. After login the studio appears: jobs, generation, cancel, logs, library, previews/downloads and the existing Colab relay UI. Your existing API decides which generation operations/options are available.

The demo service on 9000 is not needed for studio operations. Existing legacy status/echo routes still use their configured destinations. Set COMFY_API_PORT before starting the gateway if your real API is on another loopback port. Remote/Colab operations work only if your existing Comfy API relay is configured; its credentials and configuration are unchanged.

## Encryption and sessions

The password is sent only inside the RSA/AES encrypted login request. The gateway returns an encrypted random bearer session token, valid for 30 minutes. The client keeps it in memory and sends it inside subsequent encrypted requests. Refresh, sign-out and session expiry return to login. Restarting the gateway revokes all sessions. Logout immediately clears the browser session and attempts server revocation; if disconnected, server expiry still applies. Maximum 32 active sessions. This is a single-user/shared-password system, not per-user accounts or role-based authorization.

Every request still gets fresh separate request/response AES keys wrapped by the pinned RSA public key. Session tokens, Comfy tokens, paths, job prompts, logs and media bytes stay inside encryption across Cloudflare. Local gateway-to-API HTTP is loopback plaintext. No forward secrecy was added; the custom protocol has not been independently audited. The trusted frontend and key distribution requirements remain.

The browser serializes calls to match the gateway's single-request admission. Gateway limit is 600 RPC calls/minute; password checks remain limited to 30/minute. No browser localStorage/sessionStorage/cookies store credentials. The application does not persist decrypted media intentionally; browser/OS memory and saving a downloaded file remain endpoint responsibilities.

## Media and live updates

- Logs use encrypted polling rather than forwarding an unbounded SSE stream.
- Thumbnails and JSON responses are bounded at 4 MiB. Encrypted input envelopes retain the 1 MiB limit.
- Original image/video downloads use 512 KiB encrypted chunks and assemble a Blob in browser memory, with a 256 MiB per-file cap. Previews start after download completes; this is not progressive video streaming.
- Multi-chunk responses require a stable strong ETag. HTTP Range is used when available. For upstreams without Range support but with Content-Length and ETag, the adapter discards the preceding bytes on each chunk; this is slower. Files changing during download are rejected.
- Colab relay headers may not preserve ETag/Content-Length; large remote media may therefore be refused with an explanatory message. Local job controls and logs are unaffected. Larger files/streaming and uploads are not implemented.

## Validation

UI: `npm run build -- --base=/private-tunnel/` includes TypeScript checking. `node --experimental-strip-types --test tests/transport.test.mjs` (Node 22.18+ or newer) verifies the actual browser crypto/transport against an isolated encrypted mock.

Gateway: `python -m unittest discover -s tests -p test_studio.py` uses disposable keys and a mock Comfy API: password rejection, session login/logout, replay protection, restart invalidation, denied paths, POST forwarding, encrypted chunk reconstruction. It does not run actual generation jobs or import generator config. Production Comfy behavior still depends on the running local API and its environment.

This integration targets the Python gateway. The .NET gateway has not been upgraded with these studio/session operations.
