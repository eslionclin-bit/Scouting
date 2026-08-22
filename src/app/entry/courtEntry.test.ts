import { describe, expect, it } from 'vitest';
import {
  courtEntryReducer,
  expectedNext,
  initialCourtState,
  toCourtDraft,
  type CourtSelection,
} from './courtEntry';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import { isFrontZone, OPPONENT_GRID } from '../../domain/zones';

const ONS: CourtSelection = { team: 'us', playerId: 'p9', playerNumber: 9, zone: 4 };
const HUN: CourtSelection = { team: 'them', playerId: null, playerNumber: null, zone: 5 };

describe('veldinvoer', () => {
  it('legt met één tik wie, welke kant en welke zone vast', () => {
    const state = courtEntryReducer(initialCourtState('us', 'attack'), {
      kind: 'select',
      selection: ONS,
    });

    expect(toCourtDraft(state, 'perfect')).toStrictEqual({
      team: 'us',
      type: 'attack',
      quality: 'perfect',
      playerId: 'p9',
      playerNumber: 9,
      zoneFrom: 4,
    });
  });

  it('geeft niets terug zolang er niets is aangetikt', () => {
    expect(toCourtDraft(initialCourtState('us', 'serve'), 'perfect')).toBeNull();
  });

  it('schuift het actietype mee als je de andere ploeg aantikt', () => {
    // De app verwacht onze service; jij tikt de tegenstander aan. Dan gaat het
    // om hun pass, niet om hun service.
    const state = courtEntryReducer(initialCourtState('us', 'serve'), {
      kind: 'select',
      selection: HUN,
    });

    expect(state.type).toBe('reception');
    expect(state.expectedTeam).toBe('them');
  });

  it('laat een zelfgekozen actietype met rust', () => {
    const chosen = courtEntryReducer(initialCourtState('us', 'serve'), {
      kind: 'type',
      type: 'block',
    });
    const state = courtEntryReducer(chosen, { kind: 'select', selection: HUN });

    expect(state.type).toBe('block');
  });

  it('kiest de plek achter de achterlijn bij een service', () => {
    const selected = courtEntryReducer(initialCourtState('us', 'serve'), {
      kind: 'select',
      selection: { ...ONS, zone: 6 },
    });
    const state = courtEntryReducer(selected, { kind: 'serveSpot', zone: 1 });

    expect(toCourtDraft(state, 'good')?.zoneFrom).toBe(1);
  });

  describe('wat de app verwacht', () => {
    const serve = { team: 'us', type: 'serve', quality: 'good' } as const;

    it('begint met de service van de serverende ploeg', () => {
      expect(expectedNext(undefined, 'them', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'them',
        type: 'serve',
      });
    });

    it('verwacht na een service de pass van de andere kant', () => {
      expect(expectedNext(serve, 'us', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'them',
        type: 'reception',
      });
    });

    it('slaat onze eigen set-up over tenzij je hem wilt', () => {
      const pass = { team: 'us', type: 'reception', quality: 'good' } as const;

      expect(expectedNext(pass, 'them', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'us',
        type: 'attack',
      });
      expect(expectedNext(pass, 'them', { ...DEFAULT_SETTINGS, askSetup: true })).toStrictEqual({
        team: 'us',
        type: 'set',
      });
    });

    it('vraagt de verdediging van de tegenstander niet nog eens na onze aanval', () => {
      // Onze aanval was goed maar geen punt: de rally gaat door. Wat hun
      // verdediging deed staat al in die kwalificatie, dus het volgende dat
      // ertoe doet is hun aanval.
      const attack = { team: 'us', type: 'attack', quality: 'good' } as const;

      expect(expectedNext(attack, 'us', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'them',
        type: 'attack',
      });
      expect(
        expectedNext(attack, 'us', { ...DEFAULT_SETTINGS, opponentDetail: 'volledig' }),
      ).toStrictEqual({ team: 'them', type: 'dig' });
    });

    it('vraagt hun pass alleen op het niveau waar die bij hoort', () => {
      expect(expectedNext(serve, 'us', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'them',
        type: 'reception',
      });
      expect(
        expectedNext(serve, 'us', { ...DEFAULT_SETTINGS, opponentDetail: 'kern' }),
      ).toStrictEqual({ team: 'them', type: 'attack' });
    });

    it('valt na een punt terug op de service', () => {
      const kill = { team: 'them', type: 'attack', quality: 'perfect' } as const;
      expect(expectedNext(kill, 'them', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'them',
        type: 'serve',
      });
    });
  });
});

describe('de helft van de tegenstander', () => {
  it('zet hun voorlijn tegen het net en spiegelt links en rechts', () => {
    // Hun helft staat boven het net en wordt van de andere kant bekeken. Rij 0
    // is dus hun achterlijn (van ons af), rij 1 staat aan het net. En hun zone
    // 4 — hun linksvoor — staat voor ons rechts.
    expect(OPPONENT_GRID.map((row) => [...row])).toStrictEqual([
      [1, 6, 5],
      [2, 3, 4],
    ]);

    const atNet = OPPONENT_GRID[1]!;
    expect(atNet.every((zone) => isFrontZone(zone))).toBe(true);
  });
});
