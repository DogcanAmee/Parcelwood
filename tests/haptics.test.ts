// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vibrate } from '../src/ui/haptics';

const buzz = vi.fn();

function setUserActivation(hasBeenActive: boolean | undefined) {
  Object.defineProperty(navigator, 'userActivation', {
    value: hasBeenActive === undefined ? undefined : { hasBeenActive },
    configurable: true,
  });
}

beforeEach(() => {
  buzz.mockReset();
  Object.defineProperty(navigator, 'vibrate', { value: buzz, configurable: true, writable: true });
});

afterEach(() => {
  setUserActivation(undefined);
});

describe('haptics', () => {
  it('does not call vibrate before the first user gesture (Chrome logs a warning)', () => {
    setUserActivation(false);
    vibrate(30);
    expect(buzz).not.toHaveBeenCalled();
  });

  it('calls vibrate after a user gesture', () => {
    setUserActivation(true);
    vibrate([30, 40, 30]);
    expect(buzz).toHaveBeenCalledWith([30, 40, 30]);
  });

  it('keeps the old behaviour where userActivation is missing', () => {
    setUserActivation(undefined);
    vibrate(30);
    expect(buzz).toHaveBeenCalledWith(30);
  });
});
