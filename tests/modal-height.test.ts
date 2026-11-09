// The odds dialog is taller than a phone; the modal itself has to scroll, not run past the viewport,
// or its close button ends up off-screen (QA saw this at 390x844).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

describe('modal fits a phone viewport', () => {
  const modalRule = css.split('\n').find(line => line.startsWith('.modal {')) || '';
  const phoneRule = css.split('\n').find(line => line.includes('.modal {') && line.includes('max-height: calc(100dvh - 24px)')) || '';

  it('caps the dialog height to the viewport and scrolls inside it', () => {
    expect(modalRule).toMatch(/max-height:\s*calc\(100dvh - 32px\)/);
    expect(modalRule).toMatch(/overflow-y:\s*auto/);
  });

  it('leaves room for the backdrop padding on phones', () => {
    expect(phoneRule).not.toBe('');
  });
});
