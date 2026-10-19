# Private Browser deployment and verification

## Current status

The frontend/backend code is prepared, with the local checks below passing. **Live browsing is not verified and is not operational until a backend is deployed and connected.** No Render or Railway account is connected in this environment. There is no assigned backend URL. The Site must not be reported as a working proxy from the local checks below.

## Components

| Component | Runtime and responsibility |
| --- | --- |
| Main app | ChatGPT Sites, Vite static build. Apps, games, bookmarks, settings, startup behavior, nutub branding, Google Classroom browser-tab title and favicon. |
| Embedded browser runtime | External Node 22 container, built from the same source. Original Tabs, Omnibox, Viewer and Menu, Ultraviolet/Scramjet service workers, JavaScript and WebAssembly assets. |
| Network transport | External authenticated `/wisp/` secure WebSocket. Multiplexes public TCP connections for HTTP/HTTPS and WebSocket traffic. TLS to target sites remains in libcurl. |
| Authentication | Backend password form inside the browser frame, opaque server-side sessions, HttpOnly Secure SameSite=None Partitioned cookies, 8-hour expiry and explicit logout. |

The browser runtime is deliberately on the backend origin. Service workers must control their own origin, the browser UI must inspect its own rewritten frames, and the Wisp connection needs its same-origin session cookie. Putting only an external Wisp URL into the previous Sites build would leave runtime assets missing, initialization skipped, and authentication unresolved.

Sites Workers cannot host the existing persistent Node TCP sockets, Node Wisp server, or optional legacy Bare HTTP server. The new backend exposes the Wisp protocol actually used by libcurl. It does not expose the unused legacy Bare `/seal/` API. The existing root `server.js` remains a legacy localhost development entrypoint. Both Dockerfiles use the secured backend entrypoint.

## Deploy the backend

### Render

Use this repository's `cleanup/sites-deployment` branch and root `render.yaml`. It builds `backend/Dockerfile` from repository root, exposes `/healthz`, uses a free service, and disables automatic deployments. Render supports HTTP and WebSocket traffic on the same web service.

Set `PROXY_PASSWORD` in Render's private environment settings to at least 20 characters. Generate a value with `openssl rand -base64 32`. Do not paste it into chat, commit it, or pass it as a Docker build argument.

`FRONTEND_ORIGINS` is already set to `https://dogeub.basicpuppy5.chatgpt.site`. The backend uses Render's assigned `RENDER_EXTERNAL_URL` as its public origin. Set `PUBLIC_ORIGIN` only to override it for a custom HTTPS hostname.

Wait for a successful deployment and a healthy `/healthz` response before connecting the Site. The Render plugin must be connected before this environment can create the service. Free instances can sleep and restart. Restarts invalidate sessions and require signing in again.

### Railway

Create a service from repository root and the same branch. Select `backend/railway.json` as the configuration file. Generate a public HTTPS domain, set `PUBLIC_ORIGIN` to that exact origin, and set private `PROXY_PASSWORD` and `FRONTEND_ORIGINS`. Railway needs an account connection and an authorized service plan. The backend must remain a single instance since sessions are in memory.

### VPS

```bash
docker build -f backend/Dockerfile -t nutub-browser .
# Create backend/.env from backend/.env.example and fill in private values.
docker run --rm --env-file backend/.env -p 127.0.0.1:8080:8080 nutub-browser
```

Put a TLS reverse proxy in front of the container. For example, Caddy's site block can use `reverse_proxy 127.0.0.1:8080`. Expose only HTTPS publicly. The reverse proxy must preserve Host and WebSocket upgrades. Do not publish the container's plaintext port to the internet. Apply an egress firewall denying internal, metadata, and non-web destinations as defense in depth.

### Connect the Sites frontend

Build the main app from the same revision:

```bash
SITES_HOSTED=true VITE_PROXY_BACKEND_URL=https://ASSIGNED-BACKEND-HOST npm run build
```

`VITE_PROXY_BACKEND_URL` must contain only an HTTPS origin, without credentials, query, fragment, or path. Publish the generated `dist` with the existing `.openai/hosting.json`. This is a Vite build variable. Updating only a production runtime variable cannot alter an already-built static bundle.

Open the actual Site, select **Private Browser**, and enter the backend access password inside the embedded login form. The browser runs inside nutub. There is no external-tab substitute. A health probe checks the configured backend. The connection message appears on a network, response, or origin-policy failure. Missing configuration is labeled as setup pending, not misreported as a server outage.

## Security controls

- Requires a strong server-only password and HTTPS configuration at startup.
- Password verification uses scrypt and constant-time comparison.
- Exact host validation, login/logout Origin validation, exact frame-ancestor allowlist, and exact CORS allowlist for health probes. No wildcard credential access.
- Every Wisp upgrade requires an unexpired server session, the exact `/wisp/` route, and the backend's own Origin.
- Session cookies are opaque, HttpOnly, Secure, host-scoped and partitioned. No password, provider token, or session cookie is embedded in the frontend or exposed through the settings bridge.
- Five login attempts per minute per native socket peer. HTTP request, upgrade, stream, packet and traffic limits. Forwarded IP headers are not trusted. A provider's shared ingress peer can make these limits stricter across users.
- At most 64 sessions, 32 Wisp connections globally, 4 per session, 48 streams per connection, and 12 per target host. Inbound WebSocket messages are at most 1 MiB, traffic at most 32 MiB per minute per connection. Wisp's output buffer is capped at 2 MiB before backpressure.
- Only TCP ports 80 and 443. UDP, SMTP, SSH and arbitrary non-web ports are not supported.
- Blocks private, loopback, metadata, link-local, multicast, reserved, CGNAT, IPv4-mapped private IPv6, and non-global IPv6 destinations. Rejects mixed public/private DNS answers and internal hostname suffixes.
- Resolves and validates each outbound connection, then passes the checked IP directly to `net.createConnection`. A second DNS resolution cannot swap a checked hostname to an internal address during connection.
- A wrapper enforces stream counts and rejects reused stream IDs. It avoids the installed Wisp version's broken per-host iteration over its stream object.
- The settings bridge validates parent origin and frame identity. It transfers selected appearance settings, bookmarks and quick links, excluding Wisp overrides, passwords, tokens and startup control. Bookmark/quick-link edits flow back to the main app.
- No advertising, tracking, affiliate, Discord promotion, or promotional backend integration was added. Required source and license links remain.

## Verification evidence

Local checks cover destination filtering, DNS rebinding/mixed-answer rejection, port validation, HTTP authentication and CSRF, secure cookie flags, request limits, actual Wisp WebSocket handshake, rejection of a loopback Wisp stream, logout revocation, backend endpoint validation, settings filtering, URL codec consistency, and browser tab/history/refresh state. These do not prove browser rendering or live deployment behavior.

```bash
node --test backend/test/*.test.mjs tests/*.test.mjs
npm audit --omit=dev --prefix backend
PROXY_RUNTIME=true SITES_HOSTED=false npm run build
SITES_HOSTED=true npm run build
```

Verified locally on October 19, 2026:

| Check | Result |
| --- | --- |
| Automated tests | 40 passed, 0 failed. Includes real local HTTP and Wisp sockets plus pure state/DOM checks. |
| Backend dependency installation | Independent production `npm ci` passed. |
| Backend production dependency audit | 0 known vulnerabilities reported. |
| Browser runtime production build | Passed; required JS, service workers and WASM assets present. |
| Sites frontend production build | Passed. No backend URL is configured yet. |
| Container image build | Not run, Docker unavailable. |
| Live websites, target cookies, resource rendering, redirects and WebSocket echo through the actual Site | Not run, backend deployment/account connection required. |

The browser runtime and Sites frontend are separate builds. The runtime build includes `/eggs`, `/libcurl`, `/baremux`, `/portal`, `/sw.js`, and `/s_sw.js`. Proxy initialization waits for service-worker activation before loading a URL. The codecs now use the same stable key, so encoded URLs do not change across dates or origins. The old error-page reload loop was removed.

A Docker executable is not installed here, so the complete container image was not built locally. Managed browser QA is unavailable through the supported Sites preview workflow. The native HTTP/WebSocket checks run real local sockets, not a browser engine.

## Required live acceptance checks, all pending

| Check | Required evidence |
| --- | --- |
| Several HTTPS sites | Open example.com, Wikipedia and MDN inside the actual deployed Site. Record outcome for each. |
| Resources and links | Images, styles, scripts, redirects and normal links load in the frame. |
| Controls | Address entry, new/close/switch tab, back, forward and refresh work against loaded pages. |
| Sessions | A controlled site's cookie survives navigation and refresh, stays isolated across browser profiles, and does not expose backend auth cookies. |
| WebSockets | A controlled HTTPS WebSocket echo page connects through Wisp and exchanges messages. |
| Security | Unauthenticated upgrades fail, non-allowlisted origins fail, private IPv4/IPv6 and metadata targets fail, session logout/expiry stops transport. |
| Storage and startup | Embedded login works in Chrome, Firefox and Safari, and through the configured about:blank startup flow. |
| Failures | Stop the backend, verify a genuine connection error, restart, sign in again, and verify recovery. |
| Source match | Compare deployed backend revision and frontend Site source SHA with the reviewed GitHub tree. |

## Compatibility limits

These are expected restrictions, not tested per-site results. Datacenter IP reputation, anti-bot checks, DRM/EME, WebAuthn, service-worker-heavy sites, browser security headers, media codecs and proxy rewriting gaps can prevent a destination from working. Do not evade site bot challenges. No destination has been claimed as working in this deployment yet.

Browsers that block partitioned third-party cookies or service workers in embedded contexts can prevent login or rewriting. Such failures require browser/site storage permission or an architectural adjustment after live evidence. They must not be hidden behind a mock page or external-tab workaround. WebRTC/UDP and destinations on ports other than 80/443 are intentionally blocked. TCP streams close after 90 seconds without traffic.

## References

- https://render.com/docs/websocket
- https://render.com/docs/environment-variables
- https://render.com/docs/blueprint-spec
- https://github.com/MercuryWorkshop/libcurl-transport
- Installed `@mercuryworkshop/wisp-js` 0.3.3 source, `src/server/{filter,net,connection}.mjs`.
