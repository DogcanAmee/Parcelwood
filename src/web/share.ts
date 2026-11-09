// Web Share for the web / H5 build. Phones get the native share sheet; desktops and browsers without
// Web Share copy the text instead, so the button always does something useful.
import type { ShareService } from '../platform/types';

type ShareNavigator = Navigator & {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
};

export function createWebShare(nav: ShareNavigator = navigator, doc: Document = document): ShareService {
  return {
    async share(text, url) {
      const data = { title: doc.title || 'Parcelwood', text, ...(url ? { url } : {}) };
      if (typeof nav.share === 'function') {
        try {
          await nav.share(data);
          return 'sent';
        } catch (e) {
          // The player closed the share sheet: no copy, no message.
          if (e && (e as { name?: string }).name === 'AbortError') return 'cancelled';
          // Other share errors fall through to the clipboard.
        }
      }
      const copy = text + (url ? '\n' + url : '');
      try {
        if (!nav.clipboard || typeof nav.clipboard.writeText !== 'function') return 'cancelled';
        await nav.clipboard.writeText(copy);
        return 'copied';
      } catch {
        return 'cancelled';
      }
    },
  };
}
