# nutub

nutub is a customizable hub for apps, games, bookmarks, and browser tools. The interface includes searchable app and game catalogs, saved links, appearance settings, and a private browsing view for self-hosted deployments.

nutub is based on the DogeUB project. Original license and attribution notices remain in place.

## Startup behavior

Opening the app in an about:blank tab is enabled by default. The setting respects an explicit off choice. If the browser blocks automatic popups, use the Open about:blank button or allow popups for the site. The original page stays open. The embedded app does not reopen itself. Run the startup checks with `node --test tests/about-blank.test.mjs`.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Create a production build with `npm run build`. The legacy `node server.js` command binds to localhost by default for development. Use `backend/Dockerfile` for a public deployment with authentication and network restrictions. The Node server supplies the Bare and Wisp services used by private browsing. Set `PORT` to change its listening port. The optional `BARE=false` setting disables the Bare endpoint. `MASQR=true` enables the optional Masqr access check. Set `MASQR_COOKIE_SECRET` to a long random value and configure `MASQR_LICENSE_SERVER_URL` when using it.

## ChatGPT Sites

The main nutub app stays on ChatGPT Sites. Its Private Browser embeds the real browser runtime from a separate Node backend. That origin serves Ultraviolet/Scramjet service workers, runtime assets, and authenticated Wisp WebSockets. It keeps the original browser tabs, address bar, navigation, and refresh controls.

Build the Sites shell with `SITES_HOSTED=true VITE_PROXY_BACKEND_URL=https://your-backend.example npm run build`. The endpoint is public configuration, not a password. Never place secrets in a `VITE_*` variable. The backend password belongs only in the hosting provider's private environment settings.

See [Private Browser deployment and verification](docs/PRIVATE_BROWSER_DEPLOYMENT.md) for the Docker, Render, Railway, and VPS setup, security controls, test evidence, and pending live checks. Backend deployment and an actual HTTPS endpoint are required before browsing can work.

The app catalog is bundled in `src/data/apps.json`, so builds do not fetch executable configuration from an external catalog server. The Node server provides DuckDuckGo autocomplete and proxies catalog artwork from nutub's existing asset host. Sites builds load that artwork directly from the same host. App and game destinations remain externally hosted and follow their own content and privacy policies.

## Dependencies and attribution

The project uses React, Vite, Tailwind CSS, Headless UI, Lucide, Zustand, JSZip, MercuryWorkshop Scramjet/Wisp/Bare modules, and TitaniumNetwork Ultraviolet. See the package manifests and each dependency's license for terms. The source is licensed under AGPL-3.0-or-later. Keep the accompanying `LICENSE` file with redistributed copies.

The browser tab uses the Google Classroom title and favicon at the site owner's request. The favicon is copied from https://ssl.gstatic.com/classroom/favicon.png. Google Classroom and its icon are trademarks of Google. This application is not affiliated with Google.
