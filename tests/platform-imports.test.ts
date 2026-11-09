// The game rules and the UI must not know a host SDK or a platform implementation.
// Every platform is assembled in its entry file; src/platform/types.ts is the only shared contract.
import { describe, expect, it } from 'vitest';

const FILES = import.meta.glob(['../src/ui/**/*.ts', '../src/core/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FORBIDDEN = [
  { name: 'Discord SDK', pattern: /@discord\/embedded-app-sdk/ },
  { name: 'Supabase SDK', pattern: /@supabase\/supabase-js/ },
  { name: 'CrazyGames implementation', pattern: /\bsrc\/crazygames(?:\/|$)|(?:^|\/)crazygames(?:\/|$)/ },
  { name: 'Discord implementation', pattern: /\bsrc\/discord(?:\/|$)|(?:^|\/)discord(?:\/|$)/ },
  { name: 'native implementation', pattern: /\bsrc\/native(?:\/|$)|(?:^|\/)native(?:\/|$)/ },
  { name: 'web payment implementation', pattern: /\bsrc\/web-pay(?:\/|$)|(?:^|\/)web-pay(?:\/|$)/ },
];

/** import, export-from and dynamic import specifiers. Type-only imports count too. */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const staticRe = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) out.push(match[1]);
  }
  return out;
}

describe('platform import guard', () => {
  it('src/ui and src/core never import a platform SDK or implementation', () => {
    const problems: string[] = [];
    for (const [file, source] of Object.entries(FILES)) {
      for (const spec of importSpecifiers(source)) {
        const hit = FORBIDDEN.find(f => f.pattern.test(spec));
        if (hit) problems.push(`${file} imports ${spec} (${hit.name})`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('src/core imports nothing from src/platform', () => {
    const problems: string[] = [];
    for (const [file, source] of Object.entries(FILES)) {
      if (!file.includes('/src/core/')) continue;
      for (const spec of importSpecifiers(source)) {
        if (/(?:^|\/)platform\//.test(spec)) problems.push(`${file} imports ${spec}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
