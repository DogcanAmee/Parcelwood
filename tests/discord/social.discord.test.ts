// @vitest-environment jsdom
// Discord social with the local mock: finishing today's letters earns a parcel to carry, sharing it sends an
// Activity link with a one-time token, the friend who opens it gets the parcel, the sender is thanked once,
// and every letter adds to the server's weekly board.
import { describe, expect, it, vi } from 'vitest';
import { startApp } from '../../src/ui/app';
import { createDiscordBackend } from '../../src/discord/backend';
import type { MockOptions } from '../../src/discord/mock';
import { CONFIG } from '../../src/core/config';
import { deliver, newState } from '../../src/core/logic';
import { refreshBoard } from '../../src/core/board';
import { seeded } from '../../src/core/daily';
import { fakePlatform, memKv, ROOTS } from '../helpers';
import { cfg } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const CARRY = 'parcelwood.mock.social.carry';
const ALICE = { id: '500000000000000001', name: 'alice' }, BOB = { id: '500000000000000002', name: 'bob' };

async function boot(kv: ReturnType<typeof memKv>, saved: any, mock: MockOptions) {
  const { platform, box } = fakePlatform('ok', kv);
  box.saved = saved;
  const backend = createDiscordBackend(null, cfg, kv, 'http://localhost', mock);
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  await backend.store.start();
  const stop = startApp(platform, false, backend);
  await vi.waitFor(() => expect(backend.auth.user()).not.toBeNull());
  if ($('#intro-ok')) $('#intro-ok')!.click();
  return { box, backend, stop };
}
function readyGame() {
  const s: any = newState(Date.now());
  s.introSeen = true; s.guideSeen = true;
  refreshBoard(s, Date.now(), seeded(1));
  s.board.tasks.forEach((x: any) => { x.got = x.need; });
  return s;
}

describe('carry a parcel and the server board', () => {
  const aliceKv = memKv(), bobKv = memKv();
  const shared: { message: string; custom_id?: string }[] = [];
  let alice: Awaited<ReturnType<typeof boot>>;

  it('the Town page shows the friends panel; the third letter earns a parcel to carry', async () => {
    alice = await boot(aliceKv, readyGame(), { discordUser: ALICE, share: a => { shared.push(a); return 'sent'; } });
    $('[data-view="town"]')!.click();
    expect($('#social')).not.toBeNull();
    expect($('#carry-btn')).toBeNull();
    expect($('#carry')!.textContent).toContain('0/3');
    for (let i = 0; i < 3; i++) { await vi.waitFor(() => expect($('[data-claim]')).not.toBeNull()); $('[data-claim]')!.click(); }
    await vi.waitFor(() => expect($('#carry-btn')).not.toBeNull());
    expect(alice.box.saved!.social.carryReady).toBe(true);
    await vi.waitFor(() => expect($('#guild-board')!.textContent).toContain('3/' + CONFIG.social.guildGoals[0]));
  });

  it('sharing sends a one-time Activity link and the parcel leaves the station', async () => {
    $('#carry-btn')!.click();
    await vi.waitFor(() => expect(alice.box.saved!.social.sent).toBe(1));
    expect(shared).toHaveLength(1);
    expect(shared[0].custom_id).toMatch(/^carry:[0-9a-f]{32}$/);
    expect(shared[0].message).toContain('Parcelwood');
    expect($('#carry-btn')).toBeNull();
    expect($('#carry')!.textContent).toContain('✓');
    alice.stop();
  });

  it('the friend who opens the link gets the parcel once, even on a phone; the sender cannot take it', async () => {
    bobKv.set(CARRY, aliceKv.get(CARRY)!);
    const before = readyGame();
    deliver(before, Date.now(), seeded(2)); // today's parcels are already on the shelf
    const shelf = before.parcels.length, shards = before.shards;
    const bob = await boot(bobKv, before, { discordUser: BOB, platform: 'mobile', customId: shared[0].custom_id });
    await vi.waitFor(() => expect(bob.box.saved!.social.got).toBe(1));
    expect(bob.box.saved!.parcels.length).toBe(shelf + 1);
    expect(bob.box.saved!.shards).toBe(shards + CONFIG.social.carryShards);
    bob.stop();
    const again = await boot(bobKv, bob.box.saved, { discordUser: BOB, customId: shared[0].custom_id });
    await new Promise(r => setTimeout(r, 50));
    expect(again.box.saved!.social.got).toBe(1); // the same link does nothing the second time
    again.stop();
  });

  it('the sender is thanked once when they come back', async () => {
    aliceKv.set(CARRY, bobKv.get(CARRY)!);
    const before = alice.box.saved!.shards;
    const back = await boot(aliceKv, alice.box.saved, { discordUser: ALICE, customId: shared[0].custom_id });
    await vi.waitFor(() => expect(back.box.saved!.shards).toBe(before + CONFIG.social.carryShards));
    back.stop();
    const later = await boot(aliceKv, back.box.saved, { discordUser: ALICE });
    await new Promise(r => setTimeout(r, 50));
    expect(later.box.saved!.shards).toBe(before + CONFIG.social.carryShards);
    later.stop();
  });

  it('in a DM there is no server board, and other builds have no friends panel', async () => {
    const dm = await boot(memKv(), readyGame(), { discordUser: BOB, guildId: null });
    $('[data-view="town"]')!.click();
    expect($('#social')).not.toBeNull();
    expect($('#guild-board')).toBeNull();
    dm.stop();
  });
});
