// CrazyGames build: `npm run build:crazygames` → dist-crazygames/ (zip its contents to upload).
// `npm run build:crazygames:preview` → the same game with pretend ads and no SDK, for trying the ad flow anywhere.
import { defineConfig, loadEnv } from 'vite';
// @ts-ignore -- @types/node is not installed; Vite runs this file in Node
import { readdirSync, rmSync } from 'node:fs';

declare const process: { env: Record<string, string | undefined> }; // Node global; @types/node is not installed

const SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';
// Web-build files that have no place in the CrazyGames upload (nothing registers them there).
const WEB_ONLY = ['sw.js', 'manifest.webmanifest'];

/** Removes Finder junk from the upload folder (public/.DS_Store would otherwise be copied by Vite). */
function removeDsStore(dir: string) {
  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const path = dir + '/' + e.name;
    if (e.isDirectory()) removeDsStore(path);
    else if (e.name === '.DS_Store') rmSync(path, { force: true });
  }
}

export default defineConfig(({ mode }) => {
  // Same sources Vite uses for import.meta.env: .env files in crazygames/ plus the shell, so a stray .env can't slip past the checks.
  const env = { ...loadEnv(mode, 'crazygames', 'VITE_'), ...process.env };
  const mock = env.VITE_CG_MOCK_ADS === '1';
  // The build sent to CrazyGames must never carry the dev panel (it grants items and changes odds).
  if (env.VITE_DEVTOOLS === '1' && !mock) throw new Error('VITE_DEVTOOLS=1 is only allowed in the mock-ads preview build');
  let outDir = '';
  return {
    root: 'crazygames',
    publicDir: '../public',
    base: './', // CrazyGames requires relative paths
    define: { __WEB_BUILD__: 'false' }, // Station Week and Rush Hour ship in this build; the flag only names the web shell
    plugins: [{
      name: 'crazygames-build',
      configResolved(c: { root: string; build: { outDir: string } }) { outDir = c.build.outDir.startsWith('/') ? c.build.outDir : c.root + '/' + c.build.outDir; },
      transformIndexHtml: (html: string) => html.replace('<!--CRAZYGAMES_SDK-->', mock ? '' : SDK_TAG)
        .replace('<title>Parcelwood</title>', mock ? '<title>Parcelwood (test ads)</title>' : '<title>Parcelwood</title>'),
      closeBundle() { for (const f of WEB_ONLY) rmSync(outDir + '/' + f, { force: true }); removeDsStore(outDir); },
    }],
    build: {
      outDir: mock ? '../dist-crazygames-preview' : '../dist-crazygames',
      emptyOutDir: true,
      target: 'es2020',
    },
    server: { fs: { allow: ['..'] } },
  };
});
