import { describe, expect, it } from 'vitest';
import { cleanShareUrl } from '../src/platform/url';

describe('share url', () => {
  it('keeps the game page and drops every preview or session parameter', () => {
    expect(cleanShareUrl({ origin: 'https://example.test', pathname: '/parcelwood/' }))
      .toBe('https://example.test/parcelwood/');
    expect(cleanShareUrl({ origin: 'https://example.test', pathname: '/' }))
      .toBe('https://example.test/');
  });
});
