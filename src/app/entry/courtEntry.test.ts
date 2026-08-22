import { describe, expect, it } from 'vitest';
import {
  courtEntryReducer,
  expectedNext,
  initialCourtState,
  toCourtDraft,
  type CourtSelection,
} from './courtEntry';
import { DEFAULT_SETTINGS } from '../../domain/settings';

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

    it('slaat de set-up over tenzij je hem wilt', () => {
      const pass = { team: 'them', type: 'reception', quality: 'good' } as const;

      expect(expectedNext(pass, 'us', DEFAULT_SETTINGS)).toStrictEqual({
        team: 'them',
        type: 'attack',
      });
      expect(expectedNext(pass, 'us', { ...DEFAULT_SETTINGS, askSetup: true })).toStrictEqual({
        team: 'them',
        type: 'set',
      });
    });

    it('slaat de pass van de tegenstander over als je dat instelt', () => {
      expect(
        expectedNext(serve, 'us', { ...DEFAULT_SETTINGS, trackOpponentReception: false }),
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
