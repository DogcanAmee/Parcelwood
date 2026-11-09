// Art-safe check: the game never asks for an item or portrait image that is missing, too big, the wrong size or not WebP.
// Runs on the files in public/items and public/residents, so a broken export fails here before it reaches a player.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';

const PUBLIC = join(process.cwd(), 'public');
const ITEM_DIR = join(PUBLIC, 'items');
const RESIDENT_DIR = join(PUBLIC, 'residents');
const UI_DIR = join(PUBLIC, 'ui');
const PX = 256;
const CAP = 40 * 1024; // items must stay under 40 kB each
const RESIDENT_CAP = 25 * 1024; // portraits must stay under 25 kB each
const BANNER_CAP = 60 * 1024; // event banners are 750x250 and may be opaque
const GUIDE_CAP = 30 * 1024; // guide poses are 256x256 cutouts
const BANNERS = ['rain', 'powercut', 'moving', 'week'] as const;
const GUIDES = ['point', 'cheer'] as const;
const MOODS = ['normal', 'happy', 'worried'] as const;

interface WebpInfo { width: number; height: number; alpha: boolean }

/** Reads the size and alpha flag from a WebP header without an image library. */
function webpInfo(bytes: Uint8Array): WebpInfo | null {
  if (bytes.length < 30) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = ascii(12, 16);
  if (chunk === 'VP8X') {
    const flags = bytes[20];
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height, alpha: (flags & 0x10) !== 0 };
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height, alpha: ((bits >> 28) & 1) === 1 };
  }
  if (chunk === 'VP8 ') {
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return { width, height, alpha: false };
  }
  return null;
}

function configItems() {
  return CONFIG.series.flatMap(s => s.items);
}
function configDecorPictures() {
  return CONFIG.decor.items.filter(d => d.img).map(d => d.img as string);
}

describe('item art', () => {
  it('every CONFIG image exists as a 256×256 WebP with alpha, under 40 kB', () => {
    const items = configItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.img, item.id).toBeTruthy();
      const img = item.img as string;
      expect(img.startsWith('items/'), img).toBe(true);
      expect(img.endsWith('.webp'), img).toBe(true);
      const file = join(PUBLIC, img);
      expect(existsSync(file), `${img} is missing`).toBe(true);
      const info = webpInfo(readFileSync(file));
      expect(info, `${img} is not a WebP`).not.toBeNull();
      expect(info!.width, `${img} width`).toBe(PX);
      expect(info!.height, `${img} height`).toBe(PX);
      expect(info!.alpha, `${img} lost its alpha`).toBe(true);
      expect(statSync(file).size, `${img} is over 40 kB`).toBeLessThanOrEqual(CAP);
    }
  });

  it('has no orphan files in public/items', () => {
    const wanted = new Set([
      ...configItems().map(i => (i.img as string).slice('items/'.length)),
      ...configDecorPictures().map(img => img.slice('items/'.length)),
    ]);
    const found = readdirSync(ITEM_DIR, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
    expect(found.sort()).toEqual([...wanted].sort());
  });
});

describe('neighbour portrait art', () => {
  it('every resident has all 3 moods as a 256×256 WebP with alpha, under 25 kB', () => {
    expect(CONFIG.residents.length).toBeGreaterThan(0);
    for (const r of CONFIG.residents) {
      for (const mood of MOODS) {
        const rel = `residents/${r.id}-${mood}.webp`;
        const file = join(PUBLIC, rel);
        expect(existsSync(file), `${rel} is missing`).toBe(true);
        const info = webpInfo(readFileSync(file));
        expect(info, `${rel} is not a WebP`).not.toBeNull();
        expect(info!.width, `${rel} width`).toBe(PX);
        expect(info!.height, `${rel} height`).toBe(PX);
        expect(info!.alpha, `${rel} lost its alpha`).toBe(true);
        expect(statSync(file).size, `${rel} is over 25 kB`).toBeLessThanOrEqual(RESIDENT_CAP);
      }
    }
  });

  it('has no orphan files in public/residents', () => {
    const wanted = new Set(CONFIG.residents.flatMap(r => MOODS.map(m => `${r.id}-${m}.webp`)));
    const found = readdirSync(RESIDENT_DIR, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
    expect(found.sort()).toEqual([...wanted].sort());
  });
});


describe('station decor art', () => {
  it('every decor with its own picture is a 256x256 WebP with alpha, under 40 kB', () => {
    const pictures = configDecorPictures();
    expect(pictures).toHaveLength(4);
    for (const rel of pictures) {
      const file = join(PUBLIC, rel);
      expect(existsSync(file), `${rel} is missing`).toBe(true);
      const info = webpInfo(readFileSync(file));
      expect(info, `${rel} is not a WebP`).not.toBeNull();
      expect(info!.width, `${rel} width`).toBe(PX);
      expect(info!.height, `${rel} height`).toBe(PX);
      expect(info!.alpha, `${rel} lost its alpha`).toBe(true);
      expect(statSync(file).size, `${rel} is over 40 kB`).toBeLessThanOrEqual(CAP);
    }
  });
});

describe('event banner and guide art', () => {
  it('has four 750x250 event banners under 60 kB', () => {
    for (const event of BANNERS) {
      const rel = `ui/banner-${event}.webp`;
      const file = join(PUBLIC, rel);
      expect(existsSync(file), `${rel} is missing`).toBe(true);
      const info = webpInfo(readFileSync(file));
      expect(info, `${rel} is not a WebP`).not.toBeNull();
      expect(info!.width, `${rel} width`).toBe(750);
      expect(info!.height, `${rel} height`).toBe(250);
      expect(statSync(file).size, `${rel} is over 60 kB`).toBeLessThanOrEqual(BANNER_CAP);
    }
  });

  it('has two 256x256 transparent guide poses under 30 kB', () => {
    for (const pose of GUIDES) {
      const rel = `ui/guide-${pose}.webp`;
      const file = join(PUBLIC, rel);
      expect(existsSync(file), `${rel} is missing`).toBe(true);
      const info = webpInfo(readFileSync(file));
      expect(info, `${rel} is not a WebP`).not.toBeNull();
      expect(info!.width, `${rel} width`).toBe(PX);
      expect(info!.height, `${rel} height`).toBe(PX);
      expect(info!.alpha, `${rel} lost its alpha`).toBe(true);
      expect(statSync(file).size, `${rel} is over 30 kB`).toBeLessThanOrEqual(GUIDE_CAP);
    }
  });

  it('has no orphan files in public/ui', () => {
    const wanted = new Set([
      ...BANNERS.map(event => `banner-${event}.webp`),
      ...GUIDES.map(pose => `guide-${pose}.webp`),
    ]);
    const found = readdirSync(UI_DIR, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
    expect(found.sort()).toEqual([...wanted].sort());
  });
});
