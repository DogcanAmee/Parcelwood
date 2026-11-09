// Web Share (M1): native share sheet on phones, clipboard fallback elsewhere.
import { describe, expect, it, vi } from 'vitest';
import { createWebShare } from '../src/web/share';

const doc = { title: 'Parcelwood' } as Document;

function nav(opts: { share?: (d: unknown) => Promise<void>; writeText?: (t: string) => Promise<void> }) {
  return {
    share: opts.share,
    clipboard: opts.writeText ? { writeText: opts.writeText } : undefined,
  } as unknown as Navigator;
}

describe('web share', () => {
  it('uses the native share sheet when the browser has it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copied = vi.fn().mockResolvedValue(undefined);
    const r = await createWebShare(nav({ share, writeText: copied }), doc).share('hello', 'https://example.test/');
    expect(r).toBe('sent');
    expect(share).toHaveBeenCalledWith({ title: 'Parcelwood', text: 'hello', url: 'https://example.test/' });
    expect(copied).not.toHaveBeenCalled();
  });

  it('a closed share sheet is cancelled, not copied', async () => {
    const share = vi.fn().mockRejectedValue({ name: 'AbortError' });
    const copied = vi.fn().mockResolvedValue(undefined);
    const r = await createWebShare(nav({ share, writeText: copied }), doc).share('hello');
    expect(r).toBe('cancelled');
    expect(copied).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when sharing fails or is missing', async () => {
    const copied = vi.fn().mockResolvedValue(undefined);
    const r1 = await createWebShare(nav({ share: () => Promise.reject(new Error('nope')), writeText: copied }), doc).share('one', 'https://example.test/x');
    expect(r1).toBe('copied');
    expect(copied).toHaveBeenCalledWith('one\nhttps://example.test/x');

    const r2 = await createWebShare(nav({ writeText: copied }), doc).share('two');
    expect(r2).toBe('copied');
  });

  it('reports cancelled when the clipboard is unavailable or blocked', async () => {
    expect(await createWebShare(nav({}), doc).share('x')).toBe('cancelled');
    expect(await createWebShare(nav({ writeText: () => Promise.reject(new Error('denied')) }), doc).share('x')).toBe('cancelled');
  });
});
