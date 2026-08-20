/**
 * Hybride logische klok (HLC).
 *
 * Waarom niet gewoon Date.now(): twee tablets in een sporthal lopen gerust een
 * paar seconden uiteen, en een tablet die offline staat kan zelfs achteruit
 * lopen. Een HLC combineert de wandklok met een teller, zodat de uitkomst:
 *   - altijd monotoon oploopt binnen één apparaat,
 *   - lexicografisch sorteerbaar is als string,
 *   - deterministisch te vergelijken is tussen apparaten (device-id als tiebreak).
 *
 * Formaat: `<millis, 15 cijfers>-<teller, 5 cijfers>-<device-id>`
 */

export interface HlcState {
  millis: number;
  counter: number;
}

const MILLIS_WIDTH = 15;
const COUNTER_WIDTH = 5;
const MAX_COUNTER = 99999;

export class HybridClock {
  private millis = 0;
  private counter = 0;

  constructor(
    private readonly deviceId: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Nieuwe revisie voor een lokale schrijfactie. */
  tick(): string {
    const wall = this.now();
    if (wall > this.millis) {
      this.millis = wall;
      this.counter = 0;
    } else {
      this.counter = Math.min(this.counter + 1, MAX_COUNTER);
    }
    return format(this.millis, this.counter, this.deviceId);
  }

  /**
   * Verwerk een revisie die van een ander apparaat binnenkomt, zodat onze
   * volgende lokale revisie gegarandeerd nieuwer is dan wat we al gezien hebben.
   */
  observe(remoteRev: string): void {
    const remote = parse(remoteRev);
    if (!remote) return;
    const wall = this.now();
    const maxMillis = Math.max(wall, this.millis, remote.millis);

    if (maxMillis === this.millis && maxMillis === remote.millis) {
      this.counter = Math.min(Math.max(this.counter, remote.counter) + 1, MAX_COUNTER);
    } else if (maxMillis === this.millis) {
      this.counter = Math.min(this.counter + 1, MAX_COUNTER);
    } else if (maxMillis === remote.millis) {
      this.counter = Math.min(remote.counter + 1, MAX_COUNTER);
    } else {
      this.counter = 0;
    }
    this.millis = maxMillis;
  }

  state(): HlcState {
    return { millis: this.millis, counter: this.counter };
  }

  restore(state: HlcState): void {
    this.millis = state.millis;
    this.counter = state.counter;
  }
}

function format(millis: number, counter: number, deviceId: string): string {
  return `${String(millis).padStart(MILLIS_WIDTH, '0')}-${String(counter).padStart(COUNTER_WIDTH, '0')}-${deviceId}`;
}

export function parse(rev: string): (HlcState & { deviceId: string }) | null {
  const millisPart = rev.slice(0, MILLIS_WIDTH);
  const counterPart = rev.slice(MILLIS_WIDTH + 1, MILLIS_WIDTH + 1 + COUNTER_WIDTH);
  const deviceId = rev.slice(MILLIS_WIDTH + COUNTER_WIDTH + 2);
  const millis = Number(millisPart);
  const counter = Number(counterPart);
  if (!Number.isFinite(millis) || !Number.isFinite(counter) || deviceId === '') return null;
  return { millis, counter, deviceId };
}

/**
 * Vergelijk twee revisies. > 0 betekent dat `a` nieuwer is.
 * Omdat het formaat vaste breedtes heeft, is dit gewoon een stringvergelijking.
 */
export function compareRev(a: string, b: string): number {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}
