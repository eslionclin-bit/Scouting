import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { toMatchCsv, CSV_COLUMNS } from './csv';
import { toMatchExport, toMatchJson } from './json';

describe('export', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;
  let bundle: MatchBundle;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);

    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    await store.actions.append({ rallyId: rally.id, team: 'them', type: 'reception', quality: 'poor' });
    await store.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'attack',
      quality: 'error',
      zoneFrom: 4,
      zoneTo: 6,
    });
    await store.rallies.complete(rally.id);
    bundle = await loadMatchBundle(store, fixture.match.id);
  });

  afterEach(() => store.close());

  it('bouwt de wedstrijd op in speelvolgorde', () => {
    expect(bundle.sets).toHaveLength(1);
    const rallies = bundle.sets[0]!.rallies;
    expect(rallies).toHaveLength(1);
    expect(rallies[0]!.actions.map((action) => action.type)).toStrictEqual([
      'serve',
      'reception',
      'attack',
    ]);
    expect(rallies[0]!.rally.wonBy).toBe('us');
  });

  it('exporteert JSON met codes en versies, zonder informatieverlies', () => {
    const payload = toMatchExport(bundle, new Date('2026-09-12T21:00:00Z'));
    expect(payload.format).toBe('volley-scouting-match');
    expect(payload.protocolVersion).toBe('1.0.0');
    expect(payload.exportedAt).toBe('2026-09-12T21:00:00.000Z');

    const parsed = JSON.parse(toMatchJson(bundle)) as typeof payload;
    const action = parsed.sets[0]!.rallies[0]!.actions[2]!;
    expect(action.type).toBe('attack');
    expect(action.quality).toBe('error');
    expect(action.zoneFrom).toBe(4);
    expect(action.zoneTo).toBe(6);
  });

  it('exporteert CSV met één regel per actie en Nederlandse labels', () => {
    const csv = toMatchCsv(bundle);
    const lines = csv.split('\r\n');

    expect(lines[0]!.split(';')).toStrictEqual([...CSV_COLUMNS]);
    expect(lines).toHaveLength(4); // kop + drie acties

    const serve = lines[1]!.split(';');
    expect(serve[CSV_COLUMNS.indexOf('actietype')]).toBe('Service');
    expect(serve[CSV_COLUMNS.indexOf('kwalificatie')]).toBe('Goed');
    expect(serve[CSV_COLUMNS.indexOf('team')]).toBe('Wij');
    expect(serve[CSV_COLUMNS.indexOf('speler')]).toBe('Sanne');
    expect(serve[CSV_COLUMNS.indexOf('rugnummer')]).toBe('4');
    expect(serve[CSV_COLUMNS.indexOf('rally_gewonnen_door')]).toBe('Wij');
  });

  it('ontsnapt velden die het scheidingsteken bevatten', async () => {
    await store.teams.update(fixture.opponent.id, { name: 'VC Tegen; partij' });
    const withTricky = await loadMatchBundle(store, fixture.match.id);
    const line = toMatchCsv(withTricky).split('\r\n')[1]!;
    expect(line).toContain('"VC Tegen; partij"');
    expect(line.split(';')).toHaveLength(CSV_COLUMNS.length + 1); // het veld staat gequote
  });
});
