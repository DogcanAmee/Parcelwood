// Shared haptics. Browsers block navigator.vibrate until the page has seen a real user gesture and log a
// "Blocked call to navigator.vibrate because user hasn't tapped" warning on every call before that.
// Skip the call until then. Where userActivation is missing, keep the old behaviour (call and let the
// platform ignore it).
export type VibratePattern = number | number[];

function userActivated(): boolean {
  try {
    const ua = navigator.userActivation;
    if (!ua) return true;
    return !!ua.hasBeenActive;
  } catch {
    return true;
  }
}

export function vibrate(pattern: VibratePattern): void {
  try {
    if (!userActivated()) return;
    if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}
