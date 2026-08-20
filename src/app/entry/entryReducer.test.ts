import { describe, expect, it } from 'vitest';
import {
  entryReducer,
  initialEntryState,
  isReadyToCommit,
  toActionDraft,
  type EntryState,
} from './entryReducer';

function run(state: EntryState, ...events: Parameters<typeof entryReducer>[1][]): EntryState {
  return events.reduce(entryReducer, state);
}

describe('entryReducer', () => {
  it('loopt de volgorde speler → zone → kwalificatie af', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'type', type: 'attack' },
      { kind: 'player', playerId: 'p1' },
    );
    expect(state.step).toBe('zone');
    expect(isReadyToCommit(state)).toBe(false);

    const withZone = entryReducer(state, { kind: 'zoneFrom', zone: 4 });
    expect(withZone.step).toBe('quality');
    expect(isReadyToCommit(withZone)).toBe(true);
    expect(toActionDraft(withZone, 'perfect')).toStrictEqual({
      team: 'us',
      type: 'attack',
      quality: 'perfect',
      playerId: 'p1',
      zoneFrom: 4,
      zoneTo: null,
    });
  });

  it('laat de zone bij een aanval niet overslaan', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'type', type: 'attack' },
      { kind: 'player', playerId: 'p1' },
      { kind: 'skipZone' },
    );
    expect(state.step).toBe('zone');
  });

  it('laat de zone bij een verdediging wel overslaan', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'type', type: 'dig' },
      { kind: 'player', playerId: 'p1' },
      { kind: 'skipZone' },
    );
    expect(state.step).toBe('quality');
    expect(isReadyToCommit(state)).toBe(true);
  });

  it('slaat de zonestap over bij een receptie', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'type', type: 'reception' },
      { kind: 'player', playerId: 'p1' },
    );
    expect(state.step).toBe('quality');
  });

  it('zet na een opslag de receptie van de tegenpartij klaar', () => {
    const state = entryReducer(initialEntryState('us'), {
      kind: 'committed',
      last: { team: 'us', type: 'serve', quality: 'good' },
    });
    expect(state).toMatchObject({ team: 'them', type: 'reception', step: 'player' });
  });

  it('zet bij een nieuwe rally de opslag van de winnaar klaar', () => {
    const state = entryReducer(initialEntryState('us'), {
      kind: 'rallyStarted',
      servingTeam: 'them',
    });
    expect(state).toMatchObject({ team: 'them', type: 'serve', step: 'player' });
  });

  it('begint na een beëindigende actie weer bij nul', () => {
    const state = entryReducer(initialEntryState('us'), {
      kind: 'committed',
      last: { team: 'us', type: 'attack', quality: 'error' },
    });
    expect(state).toStrictEqual(initialEntryState('us'));
  });

  it('laat bij een teamwissel de spelerselectie los', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'type', type: 'dig' },
      { kind: 'player', playerId: 'p1' },
      { kind: 'team', team: 'them' },
    );
    expect(state).toMatchObject({ team: 'them', playerId: null, type: 'dig', step: 'player' });
  });

  it('gaat stap voor stap terug', () => {
    const ready = run(
      initialEntryState('us'),
      { kind: 'type', type: 'serve' },
      { kind: 'player', playerId: 'p1' },
      { kind: 'zoneFrom', zone: 1 },
    );
    const backToZone = entryReducer(ready, { kind: 'back' });
    expect(backToZone).toMatchObject({ step: 'zone', zoneFrom: null });

    const backToPlayer = entryReducer(backToZone, { kind: 'back' });
    expect(backToPlayer).toMatchObject({ step: 'player', playerId: null });

    const backToType = entryReducer(backToPlayer, { kind: 'back' });
    expect(backToType).toMatchObject({ step: 'type', type: null });
    expect(entryReducer(backToType, { kind: 'back' })).toStrictEqual(backToType);
  });
});
