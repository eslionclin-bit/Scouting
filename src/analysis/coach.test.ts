import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { buildCoachBriefing } from './coach';
import type { Quality, TeamSide, Zone } from '../domain/types';

describe('coachbriefing', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);
  });

  afterEach(() => store.close());

  /** Speelt één rally met één actie, en kent het punt toe. */
  async function rally(options: {
    team: TeamSide;
    type: 'serve' | 'attack' | 'reception';
    quality: Quality;
    wonBy: TeamSide;
    zone?: Zone;
    playerNumber?: number;
  }): Promise<void> {
    const open = await store.rallies.start({ setId: fixture.set.id });
    const player = options.playerNumber
      ? fixture.players.find((entry) => entry.number === options.playerNumber)
      : fixture.players[0];
    await store.actions.append({
      rallyId: open.id,
      team: options.team,
      type: options.type,
      quality: options.quality,
      playerId: options.team === 'us' ? (player?.id ?? null) : null,
      zoneFrom: options.zone ?? (options.type === 'reception' ? null : 1),
    });
    await store.rallies.complete(open.id, options.wonBy);
  }

  async function briefing() {
    return buildCoachBriefing(await loadMatchBundle(store, fixture.match.id));
  }

  it('zwijgt bij een wedstrijd die net begonnen is', async () => {
    await rally({ team: 'us', type: 'serve', quality: 'good', wonBy: 'us' });

    const result = await briefing();
    expect(result.cues).toStrictEqual([]);
    expect(result.talkingPoints).toStrictEqual([]);
    expect(result.pointsUs).toBe(1);
  });

  it('waarschuwt bij drie punten op rij tegen', async () => {
    for (let i = 0; i < 3; i++) {
      await rally({ team: 'us', type: 'serve', quality: 'error', wonBy: 'them' });
    }

    const result = await briefing();
    expect(result.streak).toStrictEqual({ team: 'them', count: 3 });

    const cue = result.cues.find((entry) => entry.code === 'streak_against');
    expect(cue?.tone).toBe('urgent');
    // Een reeks tegen hoort bovenaan te staan, ook als er andere signalen zijn.
    expect(result.cues[0]?.code).toBe('streak_against');
  });

  it('wijst de rotatie aan waarin de sideout hapert', async () => {
    // De set begint met onze service; die verliezen we, daarna serveren zij.
    // Zolang wij niet sideouten blijft de rotatie staan — precies het patroon
    // dat een coach wil zien.
    for (let i = 0; i < 5; i++) {
      await rally({ team: 'them', type: 'attack', quality: 'perfect', wonBy: 'them', zone: 4 });
    }

    const result = await briefing();
    const cue = result.cues.find((entry) => entry.code === 'rotation_sideout');
    expect(cue?.title).toBe('Sideout hapert in R1');
    expect(cue?.detail).toBe('0 van 4 gewonnen op hun service; je staat er nu in.');
    expect(cue?.tone).toBe('urgent');
  });

  it('telt servicefouten van de eigen ploeg', async () => {
    for (let i = 0; i < 3; i++) {
      await rally({ team: 'us', type: 'serve', quality: 'error', wonBy: 'them' });
    }

    const result = await briefing();
    const cue = result.cues.find((entry) => entry.code === 'serve_errors');
    expect(cue?.detail).toContain('3 servicefouten');
  });

  it('wijst het blok naar de zone waar hun aanval vandaan komt', async () => {
    for (let i = 0; i < 6; i++) {
      await rally({ team: 'them', type: 'attack', quality: 'perfect', wonBy: 'them', zone: 4 });
    }
    for (let i = 0; i < 3; i++) {
      await rally({ team: 'them', type: 'attack', quality: 'error', wonBy: 'us', zone: 2 });
    }

    const result = await briefing();
    const cue = result.cues.find((entry) => entry.code === 'their_attack_zone');
    expect(cue?.title).toBe('Blok naar zone 4 (linksvoor)');
    expect(cue?.detail).toBe('6 van 9 aanvallen komen daarvandaan.');
  });

  it('geeft hoogstens drie punten voor de time-out, en alleen wat aandacht vraagt', async () => {
    for (let i = 0; i < 4; i++) {
      await rally({ team: 'us', type: 'serve', quality: 'error', wonBy: 'them' });
    }
    for (let i = 0; i < 8; i++) {
      await rally({ team: 'them', type: 'attack', quality: 'perfect', wonBy: 'them', zone: 4 });
    }

    const result = await briefing();
    expect(result.talkingPoints.length).toBeGreaterThan(0);
    expect(result.talkingPoints.length).toBeLessThanOrEqual(3);
    expect(result.cues.filter((cue) => cue.tone === 'good').map((cue) => cue.title)).not.toContain(
      result.talkingPoints[0],
    );
  });

  it('zegt ook wat er wél loopt', async () => {
    for (let i = 0; i < 8; i++) {
      await rally({
        team: 'us',
        type: 'attack',
        quality: i < 5 ? 'perfect' : 'good',
        wonBy: i < 5 ? 'us' : 'them',
        zone: 4,
      });
    }

    const result = await briefing();
    const cue = result.cues.find((entry) => entry.code === 'attack_running');
    expect(cue?.tone).toBe('good');
    expect(cue?.detail).toBe('5 punten uit 8 aanvallen.');
  });
});

describe('setstand in de briefing', () => {
  it('telt een set die nog loopt niet als gewonnen', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);

    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'attack',
      quality: 'perfect',
      zoneFrom: 4,
    });
    await store.rallies.complete(rally.id);

    const running = buildCoachBriefing(await loadMatchBundle(store, fixture.match.id));
    expect(running.pointsThem).toBe(1);
    expect(running.setsThem).toBe(0);

    await store.sets.finish(fixture.set.id);
    const finished = buildCoachBriefing(await loadMatchBundle(store, fixture.match.id));
    expect(finished.setsThem).toBe(1);

    store.close();
  });
});
