# DogeUB

DogeUB is a customizable hub for apps, games, bookmarks, and browser tools. The interface includes searchable app and game catalogs, saved links, appearance settings, and a private browsing view for self-hosted deployments.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Create a production build with `npm run build`. Run it with `node server.js`. The Node server supplies the Bare and Wisp services used by private browsing. Set `PORT` to change its listening port. The optional `BARE=false` setting disables the Bare endpoint. `MASQR=true` enables the optional Masqr access check. Set `MASQR_COOKIE_SECRET` to a long random value and configure `MASQR_LICENSE_SERVER_URL` when using it.

## ChatGPT Sites

ChatGPT Sites can host the static DogeUB interface, apps, games, bookmarks, and settings. Sites Workers do not provide the persistent Node process or raw TCP sockets required by DogeUB's Bare/Wisp private browser. The hosted build displays this limitation on the browsing page. Use the Node deployment above to run that feature.

The app catalog is bundled in `src/data/apps.json`, so builds do not fetch executable configuration from an external catalog server. The Node server provides DuckDuckGo autocomplete and proxies catalog artwork from DogeUB's existing asset host. Sites builds load that artwork directly from the same host. App and game destinations remain externally hosted and follow their own content and privacy policies.

## Dependencies and attribution

The project uses React, Vite, Tailwind CSS, Headless UI, Lucide, Zustand, JSZip, MercuryWorkshop Scramjet/Wisp/Bare modules, and TitaniumNetwork Ultraviolet. See the package manifests and each dependency's license for terms. The source is licensed under AGPL-3.0-or-later. Keep the accompanying `LICENSE` file with redistributed copies.
