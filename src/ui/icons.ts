// Swaps system emoji for drawn icons wherever they appear in rendered text.
// Works on any text the app renders, including translated strings and data tables, so the source keeps its emoji.
// Raster icons (public/icons/*.webp) are the original hand-painted set; public/icons/*.svg are new line-art icons
// drawn in the same cream-and-ink palette. Every emoji the UI can show must have an entry here (tests/no-emoji.test.ts).
import './icons.css';

export const ICONS: Record<string, string> = {
  // currency, stamps and navigation (hand-painted WebP)
  '🪙': 'coin', '✨': 'shard', '💎': 'gem', '💠': 'gem', '♥': 'heart',
  '📮': 'station', '📫': 'station', '🏘': 'town', '🏘️': 'town', '📒': 'album', '🏪': 'shop', '🏬': 'shop',
  '👤': 'account', '🔊': 'sound-on', '🔇': 'sound-off', '🌐': 'globe',
  '🔒': 'lock', '🎁': 'gift', '📦': 'parcel', '💌': 'stamp', '✉': 'mail', '✉️': 'mail',
  '🏠': 'house', '🏡': 'house',

  // interface chrome
  '📌': 'pin', '📖': 'book', '🎨': 'art', '🎯': 'target', '🎉': 'party',
  '❔': 'unknown', '❓': 'unknown', '📋': 'clipboard', '🔍': 'search', '⏱': 'clock', '⏱️': 'clock',
  '🕰️': 'clock', '♻️': 'recycle', '♻': 'recycle', '🔧': 'wrench', '✂️': 'scissors', '✂': 'scissors',
  '🏆': 'trophy', '🖋': 'pen', '📝': 'pen', '🏅': 'medal', '🎖️': 'medal', '🎖': 'medal',
  '🤝': 'handshake', '↗': 'arrow-up', '↙': 'arrow-down', '↩': 'back', '↩️': 'back',
  '⏭': 'next', '▶': 'play', '⛔': 'no-entry', '⏸': 'pause', '👀': 'eyes', '💡': 'bulb',
  '👆': 'point-up', '➡️': 'arrow-right', '➡': 'arrow-right', '📅': 'calendar', '🗓️': 'calendar', '🗓': 'calendar',

  // sounds, tools and weather
  '⚖️': 'scale', '⚖': 'scale', '🩻': 'xray', '👂': 'ear', '☕': 'coffee', '💨': 'wind',
  '📄': 'paper', '🪨': 'rock', '💧': 'drop', '🎲': 'die', '⚙️': 'gear', '⚙': 'gear',
  '🔑': 'key', '🗝️': 'key', '🎐': 'bell', '🐭': 'mouse', '⭐': 'star', '🌧️': 'rain', '🌧': 'rain',
  '🕯️': 'candle', '🕯': 'candle', '🔥': 'candle', '🚚': 'truck', '📯': 'horn',

  // status marks (rush results and the miss tile)
  '⬛': 'tile', '⬜': 'mark-none', '🟥': 'mark-bad', '🟨': 'mark-warn', '🟩': 'mark-good',

  // parcels, street repairs and keepsakes
  '🍜': 'soup', '🍙': 'soup', '🥘': 'soup', '🍲': 'soup', '🍮': 'soup', '🥟': 'soup', '🧀': 'soup',
  '🥤': 'drop', '🥛': 'drop', '❄️': 'drop', '🍯': 'drop', '💦': 'drop',
  '🍿': 'basket', '🧺': 'basket', '👜': 'basket', '👛': 'basket', '👝': 'basket',
  '🍞': 'wheat', '🥖': 'wheat',
  '✈️': 'paper', '🪀': 'wheel', '🎠': 'wheel', '🌀': 'wheel', '🎡': 'wheel', '🛞': 'wheel',
  '🚲': 'bike', '🦆': 'bird', '🐓': 'bird', '🐸': 'bug', '🐝': 'bug', '🤖': 'gear',
  '🪁': 'wind', '🧲': 'pin',
  '🌱': 'leaf', '🌿': 'leaf', '🪴': 'leaf', '🌵': 'leaf',
  '🧤': 'handshake', '🎃': 'citrus', '🍋': 'citrus', '🍐': 'cherry',
  '🏮': 'lamp', '🛎️': 'bell', '🔔': 'bell', '🎀': 'ribbon',
  '🪑': 'armchair', '🛋️': 'sofa', '⛱️': 'umbrella', '🌷': 'flower', '🌻': 'flower',
  '🪧': 'signpost', '🚪': 'door', '🗺️': 'map', '🏁': 'flag', '🎏': 'flag',
  '🧦': 'footprints', '🧷': 'pin', '🧼': 'bubbles', '🖼️': 'picture', '🎻': 'musician',
  '🚂': 'train', '🍎': 'apple', '🫖': 'coffee', '⌚': 'clock', '🕊️': 'bird',

  // faces are placeholders until the residents are painted; the window colour still tells them apart
  '👵': 'face', '👴': 'face', '🧑': 'face', '🍳': 'face', '🚴': 'face', '👯': 'face',
  '👩': 'face', '🌾': 'face', '🙂': 'face', '🧓': 'face', '🧩': 'puzzle', '🧑‍🍳': 'face', '👩‍🌾': 'face',
};

/** Icon names that are SVG (everything else uses the hand-painted WebP files). */
const RASTER = new Set(['coin', 'shard', 'gem', 'heart', 'station', 'town', 'album', 'shop', 'account',
  'sound-on', 'sound-off', 'globe', 'lock', 'gift', 'parcel', 'stamp']);

const keys = Object.keys(ICONS).sort((a, b) => b.length - a.length);
const PATTERN = new RegExp('(' + keys.join('|') + ')\uFE0F?', 'gu');
const ANY_EMOJI = /\p{Extended_Pictographic}\uFE0F?/gu;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'SELECT', 'TITLE', 'INPUT']);

// Screen-reader labels and tooltips cannot hold an image. Strip emoji there instead, so names stay emoji-free.
const LABEL_ATTRS = ['aria-label', 'title', 'alt', 'placeholder'];
function cleanAttrs(el: Element): void {
  for (const name of LABEL_ATTRS) {
    const value = el.getAttribute(name);
    if (!value) continue;
    ANY_EMOJI.lastIndex = 0;
    if (!ANY_EMOJI.test(value)) continue;
    ANY_EMOJI.lastIndex = 0;
    const next = value.replace(ANY_EMOJI, ' ').replace(/\s+/g, ' ').trim();
    if (next) el.setAttribute(name, next); else el.removeAttribute(name);
  }
}

function iconImg(doc: Document, emoji: string): HTMLImageElement {
  const name = ICONS[emoji];
  const img = doc.createElement('img');
  img.className = 'ico ico-' + name;
  img.src = 'icons/' + name + (RASTER.has(name) ? '.webp' : '.svg');
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  return img;
}

function swapText(node: Text): void {
  const text = node.data;
  PATTERN.lastIndex = 0;
  if (!PATTERN.test(text)) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.isContentEditable) return;
  const doc = node.ownerDocument;
  const frag = doc.createDocumentFragment();
  let last = 0;
  PATTERN.lastIndex = 0;
  for (let m = PATTERN.exec(text); m; m = PATTERN.exec(text)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(iconImg(doc, m[1]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  node.replaceWith(frag);
}

export function iconize(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) { swapText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE && SKIP.has((root as Element).tagName)) return;
  const doc = root.ownerDocument ?? (root as Document);
  if (root.nodeType === Node.ELEMENT_NODE) cleanAttrs(root as Element);
  for (const el of (root as ParentNode).querySelectorAll('[aria-label],[title],[alt],[placeholder]')) cleanAttrs(el);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) found.push(n as Text);
  found.forEach(swapText);
}

export function installIcons(root: HTMLElement = document.body): MutationObserver {
  iconize(root);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') swapText(r.target as Text);
      else if (r.type === 'attributes') cleanAttrs(r.target as Element);
      else r.addedNodes.forEach(iconize);
    }
  });
  observer.observe(root, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: LABEL_ATTRS,
  });
  return observer;
}
