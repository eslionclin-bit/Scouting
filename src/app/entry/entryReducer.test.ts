import { describe, expect, it } from 'vitest';
import {
  entryReducer,
  initialEntryState,
  isReadyToCommit,
  toActionDraft,
  type EntryEvent,
  type EntryState,
} from './entryReducer';

function run(state: EntryState, ...events: EntryEvent[]): EntryState {
  return events.reduce(entryReducer, state);
}

describe('entryReducer', () => {
  it('loopt de volgorde wie → wat → waar → hoe af', () => {
    const afterPlayer = entryReducer(initialEntryState('us'), { kind: 'player', playerId: 'p1' });
    expect(afterPlayer.step).toBe('type');

    const afterType = entryReducer(afterPlayer, { kind: 'type', type: 'attack' });
    expect(afterType.step).toBe('zone');
    expect(isReadyToCommit(afterType)).toBe(false);

    // Bij onze aanval komen er twee vragen bij: waarheen, en tempo plus blok.
    const afterZone = entryReducer(afterType, { kind: 'zoneFrom', zone: 4 });
    expect(afterZone.step).toBe('target');

    const afterTarget = entryReducer(afterZone, { kind: 'zoneTo', zone: 5 });
    expect(afterTarget.step).toBe('attack');

    const afterTempo = entryReducer(afterTarget, { kind: 'tempo', tempo: 'quick' });
    expect(afterTempo.step).toBe('attack');

    const afterBlock = entryReducer(afterTempo, { kind: 'blockers', blockers: 2 });
    expect(afterBlock.step).toBe('quality');
    expect(toActionDraft(afterBlock, 'perfect')).toStrictEqual({
      team: 'us',
      type: 'attack',
      quality: 'perfect',
      playerId: 'p1',
      zoneFrom: 4,
      zoneTo: 5,
      tempo: 'quick',
      blockers: 2,
    });
  });

  it('laat tempo en blok overslaan', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'attack' },
      { kind: 'zoneFrom', zone: 4 },
      { kind: 'skipAttack' },
    );

    expect(state.step).toBe('quality');
    expect(toActionDraft(state, 'error')).toMatchObject({ tempo: null, blockers: null });
  });

  it('geeft tempo en blok alleen mee bij een aanval', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'dig' },
      { kind: 'skipZone' },
    );

    expect(state.step).toBe('quality');
    expect(toActionDraft(state, 'good')).toMatchObject({ tempo: null, blockers: null });
  });

  it('gaat vanuit de kwalificatie terug naar de aanvalsvraag', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'attack' },
      { kind: 'zoneFrom', zone: 4 },
      { kind: 'blockers', blockers: 1 },
      { kind: 'back' },
    );

    expect(state.step).toBe('attack');
    expect(state.blockers).toBeNull();
    expect(state.zoneFrom).toBe(4);
  });

  it('rekent een onbekende speler als gemaakte keuze', () => {
    const state = run(
      initialEntryState('them'),
      { kind: 'player', playerId: null },
      { kind: 'type', type: 'reception' },
    );
    expect(state.playerChosen).toBe(true);
    expect(state.step).toBe('quality');
    expect(isReadyToCommit(state)).toBe(true);
  });

  it('laat de zone bij een aanval niet overslaan', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'attack' },
      { kind: 'skipZone' },
    );
    expect(state.step).toBe('zone');
  });

  it('laat de zone bij een verdediging wel overslaan', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'dig' },
      { kind: 'skipZone' },
    );
    expect(state.step).toBe('quality');
    expect(isReadyToCommit(state)).toBe(true);
  });

  it('slaat de zonestap over bij een pass', () => {
    const state = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'reception' },
    );
    expect(state.step).toBe('quality');
  });

  it('zet na een service de pass van de tegenpartij als verwachting klaar', () => {
    const state = entryReducer(initialEntryState('us'), {
      kind: 'committed',
      last: { team: 'us', type: 'serve', quality: 'good' },
    });
    // Het team klopt en de verwachting staat klaar, maar de invoerder kiest zelf.
    expect(state).toMatchObject({ team: 'them', suggestion: 'reception', step: 'player', type: null });
  });

  it('zet bij een nieuwe rally de service van de winnaar klaar', () => {
    const state = entryReducer(initialEntryState('us'), {
      kind: 'rallyStarted',
      servingTeam: 'them',
    });
    expect(state).toMatchObject({ team: 'them', suggestion: 'serve', step: 'player' });
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
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'dig' },
      { kind: 'team', team: 'them' },
    );
    expect(state).toMatchObject({ team: 'them', playerId: null, playerChosen: false, step: 'player' });
  });

  it('gaat stap voor stap terug en wist wat bij die stap hoort', () => {
    const ready = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'serve' },
      { kind: 'zoneFrom', zone: 1 },
    );

    const backToZone = entryReducer(ready, { kind: 'back' });
    expect(backToZone).toMatchObject({ step: 'zone', zoneFrom: null });

    const backToType = entryReducer(backToZone, { kind: 'back' });
    expect(backToType).toMatchObject({ step: 'type', type: null });

    const backToPlayer = entryReducer(backToType, { kind: 'back' });
    expect(backToPlayer).toMatchObject({ step: 'player', playerId: null, playerChosen: false });

    // Verder terug dan de eerste stap bestaat niet.
    expect(entryReducer(backToPlayer, { kind: 'back' })).toStrictEqual(backToPlayer);
  });

  it('springt terug naar een eerdere stap zonder de invoer te wissen', () => {
    const ready = run(
      initialEntryState('us'),
      { kind: 'player', playerId: 'p1' },
      { kind: 'type', type: 'serve' },
      { kind: 'zoneFrom', zone: 1 },
    );
    const jumped = entryReducer(ready, { kind: 'goTo', step: 'player' });
    expect(jumped).toMatchObject({ step: 'player', playerId: 'p1', type: 'serve', zoneFrom: 1 });
  });
});

describe('op wie er geserveerd is', () => {
  function afterServeSpot() {
    let state = initialEntryState('us');
    state = entryReducer(state, { kind: 'player', playerId: 'p-4' });
    state = entryReducer(state, { kind: 'type', type: 'serve' });
    return entryReducer(state, { kind: 'zoneFrom', zone: 1 });
  }

  it('vraagt na de serveerplek waar de bal aankwam', () => {
    expect(afterServeSpot().step).toBe('target');
  });

  it('gaat na die tik door naar de kwalificatie', () => {
    const state = entryReducer(afterServeSpot(), { kind: 'zoneTo', zone: 5 });
    expect(state).toMatchObject({ step: 'quality', zoneFrom: 1, zoneTo: 5 });
  });

  it('laat zich overslaan, want soms zie je het niet', () => {
    const state = entryReducer(afterServeSpot(), { kind: 'zoneTo', zone: null });
    expect(state).toMatchObject({ step: 'quality', zoneTo: null });
  });

  it('vraagt het niet bij hun service', () => {
    // Waar zij naartoe serveren is onze eigen pass, en die kwalificeren we zelf.
    let state = initialEntryState('them');
    state = entryReducer(state, { kind: 'player', playerId: null });
    state = entryReducer(state, { kind: 'type', type: 'serve' });
    expect(entryReducer(state, { kind: 'zoneFrom', zone: 1 }).step).toBe('quality');
  });

  it('gaat met terug netjes van kwalificatie naar doel naar plek', () => {
    let state = entryReducer(afterServeSpot(), { kind: 'zoneTo', zone: 5 });
    state = entryReducer(state, { kind: 'back' });
    expect(state).toMatchObject({ step: 'target', zoneTo: null, zoneFrom: 1 });
    state = entryReducer(state, { kind: 'back' });
    expect(state.step).toBe('zone');
  });
});

describe('een aanval vanuit het achterveld', () => {
  function attackFrom(zone: 1 | 2 | 3 | 4 | 5 | 6) {
    let state = initialEntryState('us');
    state = entryReducer(state, { kind: 'player', playerId: 'p-9' });
    state = entryReducer(state, { kind: 'type', type: 'attack' });
    return entryReducer(state, { kind: 'zoneFrom', zone });
  }

  it('zet het tempo zelf op achter', () => {
    // Stond ze achterin, dan ís het een achteraanval. Welke — pipe vanaf 6, of
    // vanaf 1 of 5 — volgt uit de zone, dus daar is geen extra vraag voor nodig.
    expect(attackFrom(6).tempo).toBe('back');
    expect(attackFrom(1).tempo).toBe('back');
    expect(attackFrom(5).tempo).toBe('back');
  });

  it('laat het tempo bij een aanval aan het net wel open', () => {
    expect(attackFrom(4).tempo).toBeNull();
    expect(attackFrom(3).tempo).toBeNull();
  });
});
