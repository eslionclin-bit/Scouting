import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { filterActions, toActionRows, toRallyRows } from './rows';
import { statsByPlayer, statsByRotation, statsByType, summarize, zoneTally } from './stats';
import type { ActionType, Quality, TeamSide, Zone } from '../domain/types';

interface Entry {
  team: TeamSide;
  type: ActionType;
  quality: Quality;
  player?: number;
  zoneFrom?: Zone;
}

describe('analyse', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;
  let bundle: MatchBundle;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);

    // Vijf rally's met een herkenbaar patroon: onze nummer 9 slaat alles vanaf
    // zone 4, en maakt daar één punt en één fout. Rally 3 verliezen we, zodat de
    // tegenstander gaat serveren en rally 4 een echte sideout is.
    const rallies: Entry[][] = [
      [
        { team: 'us', type: 'serve', quality: 'good', player: 4, zoneFrom: 1 },
        { team: 'them', type: 'reception', quality: 'good' },
        { team: 'them', type: 'attack', quality: 'error', zoneFrom: 4 },
      ],
      [{ team: 'us', type: 'serve', quality: 'perfect', player: 4, zoneFrom: 1 }],
      [{ team: 'us', type: 'serve', quality: 'error', player: 4, zoneFrom: 1 }],
      [
        { team: 'them', type: 'serve', quality: 'good', zoneFrom: 5 },
        { team: 'us', type: 'reception', quality: 'perfect', player: 7 },
        { team: 'us', type: 'set', quality: 'good', player: 4 },
        { team: 'us', type: 'attack', quality: 'perfect', player: 9, zoneFrom: 4 },
      ],
      [
        { team: 'us', type: 'serve', quality: 'good', player: 9, zoneFrom: 1 },
        { team: 'them', type: 'reception', quality: 'poor' },
        { team: 'them', type: 'set', quality: 'poor' },
        { team: 'them', type: 'attack', quality: 'poor', zoneFrom: 2 },
        { team: 'us', type: 'dig', quality: 'good', player: 7 },
        { team: 'us', type: 'set', quality: 'good', player: 4 },
        { team: 'us', type: 'attack', quality: 'error', player: 9, zoneFrom: 4 },
      ],
    ];

    const byNumber = new Map(fixture.players.map((player) => [player.number, player.id]));
    for (const entries of rallies) {
      const rally = await store.rallies.start({ setId: fixture.set.id });
      for (const entry of entries) {
        await store.actions.append({
          rallyId: rally.id,
          team: entry.team,
          type: entry.type,
          quality: entry.quality,
          playerId: entry.player ? (byNumber.get(entry.player) ?? null) : null,
          zoneFrom: entry.zoneFrom ?? null,
        });
      }
      // De uitslag volgt uit de laatste actie; die is in elke rally beëindigend.
      await store.rallies.complete(rally.id);
    }

    bundle = await loadMatchBundle(store, fixture.match.id);
  });

  afterEach(() => store.close());

  it('slaat de wedstrijd plat tot één rij per actie, met set en rotatie erbij', () => {
    const rows = toActionRows(bundle);
    expect(rows).toHaveLength(16);
    expect(rows[0]?.setNumber).toBe(1);
    expect(rows.every((row) => row.rotation !== null)).toBe(true);
  });

  it('filtert op team, speler en actietype', () => {
    const rows = toActionRows(bundle);
    const number9 = fixture.players.find((player) => player.number === 9)!;

    const attacks = filterActions(rows, { team: 'us', type: 'attack' });
    expect(attacks).toHaveLength(2);
    expect(filterActions(rows, { playerId: number9.id })).toHaveLength(3);
  });

  it('rekent rendement en foutpercentage per actietype', () => {
    const rows = toActionRows(bundle);
    const ours = statsByType(filterActions(rows, { team: 'us' }));

    // Vier opslagen: één ace, twee goed, één fout. Rendement dus nul.
    expect(ours.serve.total).toBe(4);
    expect(ours.serve.pointPct).toBe(0.25);
    expect(ours.serve.errorPct).toBe(0.25);
    expect(ours.serve.efficiency).toBe(0);

    // Twee aanvallen: één punt, één fout — rendement nul.
    expect(ours.attack.total).toBe(2);
    expect(ours.attack.efficiency).toBe(0);

    // Bij een receptie hoort geen puntpercentage: die levert nooit direct een punt op.
    expect(ours.reception.pointPct).toBeNull();
    expect(ours.reception.positivePct).toBe(1);
  });

  it('vat een selectie samen op de vierpuntsschaal', () => {
    const rows = filterActions(toActionRows(bundle), { team: 'them' });
    const stats = summarize(rows);
    expect(stats.total).toBe(6);
    expect(stats.counts.error).toBe(1);
    expect(stats.averageScore).toBeGreaterThan(0);
    expect(stats.averageScore).toBeLessThan(3);
  });

  it('geeft cijfers per speler, ook voor spelers zonder acties', () => {
    const rows = toActionRows(bundle);
    const perPlayer = statsByPlayer(rows, bundle.players);

    const nine = perPlayer.find((entry) => entry.number === 9)!;
    expect(nine.byType.attack.total).toBe(2);
    expect(nine.byType.attack.counts.perfect).toBe(1);
    expect(nine.byType.attack.counts.error).toBe(1);

    expect(perPlayer.map((entry) => entry.number)).toStrictEqual([4, 7, 9]);
  });

  it('telt de zoneverdeling voor de heatmap, per team apart', () => {
    const rows = toActionRows(bundle);

    const ourAttacks = zoneTally(filterActions(rows, { team: 'us', type: 'attack' }));
    expect(ourAttacks.total).toBe(2);
    expect(ourAttacks.counts[4]).toBe(2);
    expect(ourAttacks.percentages[4]).toBe(1);

    const theirAttacks = zoneTally(filterActions(rows, { team: 'them', type: 'attack' }));
    expect(theirAttacks.counts[4]).toBe(1);
    expect(theirAttacks.counts[2]).toBe(1);
    expect(theirAttacks.max).toBe(1);
  });

  it('rekent per rotatie het sideout-percentage', () => {
    const rotations = statsByRotation(toRallyRows(bundle));
    const total = rotations.reduce((sum, entry) => sum + entry.rallies, 0);
    expect(total).toBe(5);

    // Rally 4 begon met opslag van de tegenstander en werd door ons gewonnen:
    // een geslaagde sideout, waarna wij doordraaien naar rotatie 2.
    const withReceive = rotations.find((entry) => entry.receiveRallies > 0)!;
    expect(withReceive.sideoutPct).toBe(1);
    expect(rotations.map((entry) => entry.rotation)).toStrictEqual([1, 2]);
    expect(rotations.every((entry) => entry.pointsFor + entry.pointsAgainst === entry.rallies)).toBe(true);
  });
});
