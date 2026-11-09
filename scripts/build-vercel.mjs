// Vercel build entry. A production deployment is the plain web build, unchanged.
// A Preview deployment also gets the dev tools and the hosted CrazyGames (mock ads) and Discord (mock) builds,
// so QA can play all three from one preview URL. No Supabase settings, no production aliases.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

// Production gets the plain web build. A preview gets that same build with dev tools in one pass
// (dev panel, ?devlv, ?devday and the DEV CLOCK banner), so nothing is built twice.
if (process.env.VERCEL_ENV !== 'preview') {
  run('npm run build');
  process.exit(0);
}
run('npm run build', { VITE_DEVTOOLS: '1' });

// CrazyGames preview: mock ads, no SDK, dev tools on.
run('npm run build:crazygames:preview', { VITE_CG_MOCK_ADS: '1', VITE_DEVTOOLS: '1' });
rmSync('dist/crazygames', { recursive: true, force: true });
cpSync('dist-crazygames-preview', 'dist/crazygames', { recursive: true });

// Discord preview: the local mock (no sign-in, purchases or Supabase), served under /discord/.
run('npx vite build --config discord/vite.config.ts --base /discord/', { VITE_DISCORD_PREVIEW: '1', VITE_DEVTOOLS: '1' });
rmSync('dist/discord', { recursive: true, force: true });
if (!existsSync('discord/dist')) throw new Error('Discord preview build did not produce discord/dist');
cpSync('discord/dist', 'dist/discord', { recursive: true });
