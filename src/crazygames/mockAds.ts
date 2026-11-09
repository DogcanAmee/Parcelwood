// Pretend ads for the test build (npm run build:crazygames:preview). Never part of the build sent to CrazyGames.
// A rewarded ad runs 5 seconds and can be closed early (no reward), so both paths can be tried.
import type { AdResult, AdService } from '../platform/types';

export function createMockAds(doc: Document = document, seconds = { rewarded: 5, midgame: 3 }): AdService {
  function play(type: 'rewarded' | 'midgame', onStart: () => void): Promise<AdResult> {
    return new Promise(resolve => {
      const el = doc.createElement('div');
      el.className = 'mock-ad';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      let left = seconds[type];
      const draw = () => {
        el.innerHTML = '<div class="mock-ad-box"><div class="mock-ad-tag">TEST AD · 模拟广告</div>' +
          '<div class="mock-ad-kind">' + (type === 'rewarded' ? 'Rewarded · 激励广告' : 'Break · 插屏广告') + '</div>' +
          '<div class="mock-ad-count">' + left + '</div>' +
          (type === 'rewarded' ? '<button type="button" class="btn ghost slim" data-mock-close>Close early (no reward) · 提前关闭（不给奖励）</button>' : '') + '</div>';
      };
      const finish = (r: AdResult) => { clearInterval(iv); el.remove(); resolve(r); };
      draw();
      doc.body.appendChild(el);
      onStart();
      const iv = setInterval(() => { left--; if (left <= 0) finish('rewarded'); else draw(); }, 1000);
      el.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-mock-close]')) finish('failed'); });
    });
  }
  return {
    available: () => true,
    rewarded: onStart => play('rewarded', onStart),
    midgame: onStart => play('midgame', onStart),
  };
}
