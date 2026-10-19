import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, copyFile, mkdir } from 'node:fs/promises';
import react from '@vitejs/plugin-react-swc';
import vitePluginBundleObfuscator from 'vite-plugin-bundle-obfuscator';
import { logging, server as wisp } from '@mercuryworkshop/wisp-js/server';
import { createBareServer } from '@tomphttp/bare-server-node';
import { bareModulePath } from '@mercuryworkshop/bare-as-module3';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { baremuxPath } from 'bare-mux-fork/node';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
import dotenv from 'dotenv';

dotenv.config();
const useBare = process.env.BARE === 'true';
const sitesHosted = process.env.SITES_HOSTED === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
logging.set_level(logging.NONE);
let bare;

Object.assign(wisp.options, {
  dns_method: 'resolve',
  dns_servers: ['1.1.1.3', '1.0.0.3'],
  dns_result_order: 'ipv4first',
});

const routeRequest = (req, resOrSocket, head) => {
  if (req.url?.startsWith('/wisp/')) return wisp.routeRequest(req, resOrSocket, head);
  if (bare.shouldRoute(req))
    return head ? bare.routeUpgrade(req, resOrSocket, head) : bare.routeRequest(req, resOrSocket);
};

const obf = {
  enable: true,
  autoExcludeNodeModules: true,
  threadPool: false,
  options: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'mangled',
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayEncoding: [],
    stringArrayCallsTransform: false,
    stringArrayThreshold: 0.5,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    ignoreImports: true,
  },
};

function copyProxyAssets() {
  const targets = [
    { source: libcurlPath, destination: 'libcurl' },
    { source: baremuxPath, destination: 'baremux' },
    { source: scramjetPath, destination: 'eggs' },
    ...(useBare ? [{ source: bareModulePath, destination: 'baremod' }] : []),
    {
      source: uvPath,
      destination: 'portal',
      files: ['uv.handler.js', 'uv.client.js', 'uv.bundle.js', 'uv.sw.js'],
    },
  ];

  return {
    name: 'copy-proxy-assets',
    apply: 'build',
    async closeBundle() {
      if (sitesHosted) return;
      const output = resolve(__dirname, 'dist');
      for (const target of targets) {
        const destination = resolve(output, target.destination);
        await mkdir(destination, { recursive: true });
        if (target.files) {
          await Promise.all(
            target.files.map((name) =>
              copyFile(resolve(target.source, name), resolve(destination, name)),
            ),
          );
        } else {
          await cp(target.source, destination, { recursive: true, force: true });
        }
      }
    },
  };
}

export default defineConfig(({ command }) => {
  const environment = command === 'serve' ? 'dev' : 'stable';

  return {
    base: '/',
    plugins: [
      react(),
      vitePluginBundleObfuscator(obf),
      copyProxyAssets(),
      {
        name: 'server',
        apply: 'serve',
        configureServer(server) {
          bare = createBareServer('/seal/');
          server.httpServer?.on('upgrade', (req, sock, head) => routeRequest(req, sock, head));
          server.middlewares.use((req, res, next) => routeRequest(req, res) || next());
        },
      },
      {
        name: 'search',
        apply: 'serve',
        configureServer(s) {
          s.middlewares.use('/return', async (req, res) => {
            const q = new URL(req.url, 'http://x').searchParams.get('q');
            try {
              const r = q && (await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}`));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(r ? await r.json() : { error: 'query parameter?' }));
            } catch {
              res.end(JSON.stringify({ error: 'request failed' }));
            }
          });
        },
      },
    ].filter(Boolean),
    build: {
      target: 'es2022',
      reportCompressedSize: false,
      esbuild: {
        legalComments: 'none',
        treeShaking: true,
      },
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          entryFileNames: '[hash].js',
          chunkFileNames: 'chunks/[name].[hash].js',
          assetFileNames: 'assets/[hash].[ext]',
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return;
            const m = id.split('node_modules/')[1];
            const pkg = m.startsWith('@') ? m.split('/').slice(0, 2).join('/') : m.split('/')[0];
            if (/react-router|react-dom|react\b/.test(pkg)) return 'react';
            if (/^@mui\//.test(pkg) || /^@emotion\//.test(pkg)) return 'mui';
            if (/lucide/.test(pkg)) return 'icons';
            if (/nprogress/.test(pkg)) return 'progress';
            return 'vendor';
          },
        },
        treeshake: {
          moduleSideEffects: 'no-external',
        },
      },
      minify: 'esbuild',
      sourcemap: false,
    },
    css: {
      modules: {
        generateScopedName: '[name]__[local]___[hash:base64:5]',
      },
    },
    server: {
      proxy: {
        '/assets/img': {
          target: 'https://dogeub-assets.pages.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/assets\/img/, '/img'),
        },
        '/assets-fb': {
          target: 'https://dogeub-assets.pages.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/assets-fb/, '/img/server'),
        },
      },
    },
    define: {
      __ENVIRONMENT__: JSON.stringify(environment),
      'import.meta.env.VITE_SITES_HOSTED': process.env.SITES_HOSTED === 'true',
    },
  };
});
