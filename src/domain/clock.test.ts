import { describe, expect, it } from 'vitest';
import { compareRev, HybridClock, parse } from './clock';

describe('HybridClock', () => {
  it('loopt altijd op, ook als de wandklok stilstaat', () => {
    const clock = new HybridClock('device-a', () => 1_000);
    const revs = [clock.tick(), clock.tick(), clock.tick()];
    expect(revs).toStrictEqual([...revs].sort());
    expect(new Set(revs).size).toBe(3);
  });

  it('loopt op zodra de wandklok verspringt', () => {
    let now = 1_000;
    const clock = new HybridClock('device-a', () => now);
    const first = clock.tick();
    now = 5_000;
    const second = clock.tick();
    expect(compareRev(second, first)).toBe(1);
    expect(parse(second)?.counter).toBe(0);
  });

  it('gaat na een sprong achteruit in de wandklok niet terug in revisie', () => {
    let now = 10_000;
    const clock = new HybridClock('device-a', () => now);
    const first = clock.tick();
    now = 3_000; // tablet die zijn tijd corrigeert
    const second = clock.tick();
    expect(compareRev(second, first)).toBe(1);
  });

  it('neemt een gezien revisie van een ander apparaat over', () => {
    const local = new HybridClock('device-a', () => 1_000);
    const remote = new HybridClock('device-b', () => 9_000);
    const remoteRev = remote.tick();

    local.observe(remoteRev);
    const next = local.tick();
    expect(compareRev(next, remoteRev)).toBe(1);
  });

  it('gebruikt het device-id als tiebreak bij gelijke tijd', () => {
    const a = new HybridClock('device-a', () => 1_000).tick();
    const b = new HybridClock('device-b', () => 1_000).tick();
    expect(compareRev(a, b)).toBe(-1);
    expect(compareRev(b, a)).toBe(1);
    expect(compareRev(a, a)).toBe(0);
  });
});
