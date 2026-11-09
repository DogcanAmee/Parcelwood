import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> }; // Node global; @types/node is not installed

// A production deploy must never ship the dev panel (it can grant items and change odds).
if (process.env.VERCEL_ENV === 'production' && process.env.VITE_DEVTOOLS === '1') {
  throw new Error('VITE_DEVTOOLS=1 is not allowed in a production build');
}

export default defineConfig({
  // Relative paths so the same build works on Vercel and inside the Capacitor app shell.
  base: './',
  define: { __WEB_BUILD__: 'true' },
  build: {
    outDir: 'dist',
    target: 'es2020',
    // The board's listening room is a second page; the release build keeps it inert unless dev tools are on.
    rollupOptions: { input: { main: 'index.html', audio: 'audio.html' } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
