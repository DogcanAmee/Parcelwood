// @vitest-environment jsdom
// Drawn icons replace UI emoji in rendered text, including text added or changed later.
import { describe, expect, it } from 'vitest';
import { iconize, installIcons } from '../src/ui/icons';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('icons', () => {
  it('replaces emoji inside text and keeps the surrounding words', () => {
    const el = document.createElement('p');
    el.textContent = '+5 🪙 · 2 ✨ left';
    iconize(el);
    const imgs = [...el.querySelectorAll('img.ico')] as HTMLImageElement[];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['icons/coin.webp', 'icons/shard.webp']);
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['', '']);
    expect(el.textContent).toBe('+5  · 2  left');
  });

  it('replaces every emoji in the drawn set, including new SVG icons, and leaves option text alone', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span>🏘️</span><span>🎯</span><select><option>🌐 English</option></select>';
    iconize(el);
    expect(el.querySelectorAll('img.ico-town').length).toBe(1);
    const target = el.querySelector('img.ico-target') as HTMLImageElement;
    expect(target.getAttribute('src')).toBe('icons/target.svg');
    expect(el.textContent).not.toContain('🎯');
    expect(el.querySelector('option')!.textContent).toBe('🌐 English');
  });

  it('strips emoji from accessible labels and tooltips', () => {
    const el = document.createElement('div');
    el.innerHTML = '<button aria-label="普通 · 用 20 ✨ 兑换" title="♥ 2/3">x</button>';
    iconize(el);
    const b = el.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('普通 · 用 20 兑换');
    expect(b.getAttribute('title')).toBe('2/3');
  });

  it('maps joined people sequences as a whole', () => {
    const el = document.createElement('div');
    el.textContent = '🧑‍🍳 👩‍🌾';
    iconize(el);
    const imgs = [...el.querySelectorAll('img.ico-face')] as HTMLImageElement[];
    expect(imgs).toHaveLength(2);
    expect(el.textContent).toBe(' ');
  });

  it('keeps swapping after re-renders and textContent updates', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const observer = installIcons(root);
    root.innerHTML = '<button id="mute">🔊</button>';
    await flush();
    expect(root.querySelector('#mute img')!.getAttribute('src')).toBe('icons/sound-on.webp');
    root.querySelector('#mute')!.textContent = '🔇';
    await flush();
    expect(root.querySelector('#mute img')!.getAttribute('src')).toBe('icons/sound-off.webp');
    observer.disconnect();
  });
});
