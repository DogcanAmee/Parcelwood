// Build for the Discord Activity: npx vite build --config discord/vite.config.ts  ->  discord/dist/
// Separate from the web build (vite.config.ts), which stays unchanged and never includes the Discord SDK.
import { defineConfig, type Plugin } from 'vite';
// @ts-ignore -- @types/node is not installed; Vite runs this file in Node
import { rmSync } from 'node:fs';

declare const process: { env: Record<string, string | undefined> }; // Node global; @types/node is not installed

if (process.env.VERCEL_ENV === 'production' && process.env.VITE_DEVTOOLS === '1') {
  throw new Error('VITE_DEVTOOLS=1 is not allowed in a production build');
}
if (process.env.VERCEL_ENV === 'production' && process.env.VITE_DISCORD_PREVIEW === '1') {
  throw new Error('VITE_DISCORD_PREVIEW=1 is not allowed in a production build');
}

const root = decodeURIComponent(new URL('..', import.meta.url).pathname);

// The page is discord/index.html in the source; Discord loads "/", so publish it as index.html.
// The legal pages discord/legal/<name>.html are published as /<name>/index.html (served at /privacy and /terms).
const htmlToRoot: Plugin = {
  name: 'discord-html-to-root',
  enforce: 'post',
  generateBundle(_o, bundle) {
    const page = bundle['discord/index.html'];
    if (page) { page.fileName = 'index.html'; delete bundle['discord/index.html']; bundle['index.html'] = page; }
    for (const name of ['privacy', 'terms']) {
      const legal = bundle[`discord/legal/${name}.html`];
      if (legal) { legal.fileName = `${name}/index.html`; delete bundle[`discord/legal/${name}.html`]; bundle[`${name}/index.html`] = legal; }
    }
  },
};

// npm run dev:discord: serve the Discord page at "/" too (the project root's index.html is the web game),
// so a tunnel opened inside Discord loads this build.
const devRoot: Plugin = {
  name: 'discord-dev-root',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url?.startsWith('/?') || req.url === '/index.html') req.url = '/discord/index.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
      next();
    });
  },
};

// public/ also holds the web build's service worker and manifest. The Activity never registers them,
// so the upload leaves them out (the icons and item art in public/ still ship).
const webOnlyFiles: Plugin = {
  name: 'discord-drop-web-only',
  closeBundle() {
    for (const f of ['sw.js', 'manifest.webmanifest']) rmSync(root + 'discord/dist/' + f, { force: true });
  },
};

export default defineConfig({
  root,
  base: '/',
  envDir: root + 'discord',
  define: { __WEB_BUILD__: 'false' }, // Station Week and Rush Hour ship in the Activity; the flag only names the web shell
  plugins: [htmlToRoot, devRoot, webOnlyFiles],
  build: {
    outDir: root + 'discord/dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        index: root + 'discord/index.html',
        privacy: root + 'discord/legal/privacy.html',
        terms: root + 'discord/legal/terms.html',
      },
    },
  },
});
