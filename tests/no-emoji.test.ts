// @vitest-environment jsdom
// Locks the art pass: system emoji never reach the rendered UI. Every emoji used by UI code must have a drawn
// replacement in src/ui/icons.ts, and iconizing the UI strings must remove them all, in every language.
import { describe, expect, it } from 'vitest';
import { ICONS, iconize } from '../src/ui/icons';
import { UI, CONTENT } from '../src/i18n/strings';
import { TOWN_UI } from '../src/i18n/town';
import { BOARD_UI } from '../src/i18n/board';
import { SOCIAL_UI } from '../src/i18n/social';
import { STORY_UI } from '../src/i18n/story';
import { STREET_UI } from '../src/i18n/street';
import { V2_UI } from '../src/i18n/v2';
import { weekText } from '../src/week/strings';
import { rushText } from '../src/rush/strings';

const EMOJI = /\p{Extended_Pictographic}\uFE0F?/gu;
const hasEmoji = (s: string) => { EMOJI.lastIndex = 0; return EMOJI.test(s); };

function flatten(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => flatten(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => flatten(v, out));
  return out;
}

describe('no system emoji in the UI', () => {
  it('has a drawn replacement for every emoji used by UI code', () => {
    const files = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const source = Object.entries(files)
      .filter(([path]) => !path.endsWith('/ui/icons.ts'))
      .map(([, text]) => text).join('\n');
    const missing = [...new Set(source.match(EMOJI) || [])].filter(e => !Object.prototype.hasOwnProperty.call(ICONS, e));
    expect(missing).toEqual([]);
  });

  it('removes every emoji from the translated UI strings', () => {
    const strings = flatten([
      UI, CONTENT, TOWN_UI, BOARD_UI, SOCIAL_UI, STORY_UI, STREET_UI, V2_UI,
      ['en', 'zh', 'es'].map(l => weekText(l)),
      ['en', 'zh', 'es'].map(l => rushText(l)),
    ]);
    const el = document.createElement('div');
    for (const s of strings) {
      el.textContent = s;
      iconize(el);
      expect(hasEmoji(el.textContent || '')).toBe(false);
    }
  });

  it('renders iconized screen markup without emoji in text or accessible labels', () => {
    // Catches text that bypasses the translated strings (inline templates in the screens).
    const el = document.createElement('section');
    el.innerHTML = '<h2>📌 3/6</h2><span class="hearts">♥ 2/3</span><span class="mark">⬛</span><span>🧑‍🍳</span>';
    iconize(el);
    expect(hasEmoji(el.textContent || '')).toBe(false);
    for (const node of [el, ...el.querySelectorAll('*')]) {
      for (const attr of ['aria-label', 'title', 'alt']) {
        const v = node.getAttribute(attr);
        if (v) expect(hasEmoji(v)).toBe(false);
      }
    }
  });
});
