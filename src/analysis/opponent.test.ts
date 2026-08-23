import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { buildOpponentDossier, MIN_SAMPLE } from './opponent';
import type { Quality, Team, TeamSide, Zone } from '../domain/types';

describe('opponent-dossier', () => {
  let store: ScoutingStore;
  let ownTeam: Team;
  let opponent: Team;

  beforeEach(async () => {
    store = await openTestStore();
    ownTeam = await store.teams.create({ name: 'Onze ploeg', isOwnTeam: true });
    opponent = await store.teams.findOrCreateOpponent('VC Tegenpartij');
  });

  afterEach(() => store.close());

  /**
   * Zet een wedstrijd neer waarin de tegenstander een vast patroon laat zien:
   * `attacks` aanvallen vanuit de opgegeven zones, met een deel fout.
   */
  async function playMatch(options: {
    date: string;
    attacks: Zone[];
    attackErrors?: number;
    weakReceptions?: number;
    receptions?: number;
    setsUs?: number;
  }): Promise<MatchBundle> {
    const match = await store.matches.create({
      date: options.date,
      ownTeamId: ownTeam.id,
      opponentTeamId: opponent.id,
      homeAway: 'home',
      status: 'finished',
    });
    const set = await store.sets.start({ matchId: match.id, startingServe: 'them' });

    let index = 0;
    for (const zone of options.attacks) {
      const rally = await store.rallies.start({ setId: set.id });
      const isError = index < (options.attackErrors ?? 0);
      await store.actions.append({
        rallyId: rally.id,
        team: 'them',
        type: 'attack',
        quality: isError ? 'error' : 'good',
        zoneFrom: zone,
      });
      await store.rallies.complete(rally.id, isError ? 'us' : 'them');
      index++;
    }

    for (let i = 0; i < (options.receptions ?? 0); i++) {
      const rally = await store.rallies.start({ setId: set.id });
      await store.actions.append({
        rallyId: rally.id,
        team: 'them',
        type: 'reception',
        quality: i < (options.weakReceptions ?? 0) ? 'poor' : 'good',
      });
      await store.rallies.complete(rally.id, 'us');
    }

    return loadMatchBundle(store, match.id);
  }

  it('telt het onderlinge verleden over meerdere wedstrijden', async () => {
    const first = await playMatch({ date: '2026-09-12', attacks: [4, 4, 3] });
    const second = await playMatch({ date: '2026-11-01', attacks: [2, 2] });

    const dossier = buildOpponentDossier([first, second], opponent.id, opponent.name);

    expect(dossier.matches).toHaveLength(2);
    // Nieuwste eerst: zo zoekt een coach zijn wedstrijden.
    expect(dossier.matches[0]?.date).toBe('2026-11-01');
    expect(dossier.totalActions).toBe(5);
    expect(dossier.wins + dossier.losses).toBe(2);
  });

  it('telt de aanvalszones over alle wedstrijden bij elkaar op', async () => {
    const first = await playMatch({ date: '2026-09-12', attacks: [4, 4, 4, 2] });
    const second = await playMatch({ date: '2026-11-01', attacks: [4, 4, 3] });

    const dossier = buildOpponentDossier([first, second], opponent.id, opponent.name);

    expect(dossier.attackZones.counts[4]).toBe(5);
    expect(dossier.attackZones.total).toBe(7);
    expect(dossier.attackZones.percentages[4]).toBeCloseTo(5 / 7);
  });

  it('zwijgt zolang er te weinig waarnemingen zijn', async () => {
    // Vier aanvallen, allemaal uit zone 4: een sterk ogend patroon op te weinig
    // data. Daar hoort geen bevinding uit te komen.
    const bundle = await playMatch({ date: '2026-09-12', attacks: [4, 4, 4, 4] });

    const dossier = buildOpponentDossier([bundle], opponent.id, opponent.name);

    expect(dossier.attackZones.percentages[4]).toBe(1);
    expect(dossier.findings).toStrictEqual([]);
    expect(dossier.advice).toStrictEqual([]);
  });

  it('meldt een aanvalsvoorkeur zodra er genoeg is gezien', async () => {
    const attacks: Zone[] = [
      ...Array.from<unknown, Zone>({ length: 9 }, () => 4),
      ...Array.from<unknown, Zone>({ length: 3 }, () => 2),
      3,
    ];
    const bundle = await playMatch({ date: '2026-09-12', attacks });

    const dossier = buildOpponentDossier([bundle], opponent.id, opponent.name);
    const finding = dossier.findings.find((entry) => entry.code === 'attack_zone_concentration');

    expect(finding).toBeDefined();
    expect(finding?.text).toContain('69%');
    expect(finding?.text).toContain('aanvallen komen uit');
    expect(finding?.text).toContain('zone 4');
    // De bevinding draagt zelf waarop hij berust.
    expect(finding?.sample).toBe(13);
    expect(finding?.sample).toBeGreaterThanOrEqual(MIN_SAMPLE);
  });

  it('koppelt aan elke bevinding een advies dat ernaar terugverwijst', async () => {
    const bundle = await playMatch({
      date: '2026-09-12',
      attacks: Array.from<unknown, Zone>({ length: 14 }, () => 4),
      attackErrors: 4,
    });

    const dossier = buildOpponentDossier([bundle], opponent.id, opponent.name);

    expect(dossier.findings.map((entry) => entry.code)).toContain('attack_errors');
    expect(dossier.advice.length).toBeGreaterThan(0);
    for (const advice of dossier.advice) {
      // Geen advies zonder telling erachter.
      expect(dossier.findings.some((finding) => finding.text === advice.because)).toBe(true);
    }
  });

  it('herkent een kwetsbare receptie', async () => {
    const bundle = await playMatch({
      date: '2026-09-12',
      attacks: [],
      receptions: 16,
      weakReceptions: 7,
    });

    const dossier = buildOpponentDossier([bundle], opponent.id, opponent.name);
    const finding = dossier.findings.find((entry) => entry.code === 'reception_weak');

    expect(finding?.text).toContain('44%');
    expect(dossier.advice.some((entry) => entry.text.includes('Druk zetten'))).toBe(true);
  });

  it('laat wedstrijden tegen een andere tegenstander buiten beschouwing', async () => {
    const ours = await playMatch({ date: '2026-09-12', attacks: [4, 4] });

    const other = await store.teams.findOrCreateOpponent('VC Anders');
    const otherMatch = await store.matches.create({
      date: '2026-10-01',
      ownTeamId: ownTeam.id,
      opponentTeamId: other.id,
      homeAway: 'away',
    });
    const otherBundle = await loadMatchBundle(store, otherMatch.id);

    const dossier = buildOpponentDossier([ours, otherBundle], opponent.id, opponent.name);
    expect(dossier.matches).toHaveLength(1);
  });
});

describe('wie van de tegenstander slecht past', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);
  });

  afterEach(() => store.close());

  /** Eén ontvangen rally van hen: onze service, hun pass, en een uitslag. */
  async function theirReception(number: number, pass: Quality, wonBy: TeamSide): Promise<void> {
    const rally = await store.rallies.start({ setId: fixture.set.id, servingTeam: 'us' });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    await store.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'reception',
      quality: pass,
      playerNumber: number,
    });
    await store.rallies.complete(rally.id, wonBy);
  }

  it('zet de slechtste passer bovenaan, met haar aantallen erbij', async () => {
    // #38 neemt slecht aan, #3 goed. Allebei ruim boven het minimum.
    for (let i = 0; i < 6; i++) await theirReception(38, 'poor', 'us');
    for (let i = 0; i < 3; i++) await theirReception(38, 'error', 'us');
    for (let i = 0; i < 9; i++) await theirReception(3, 'perfect', 'them');

    const bundle = await loadMatchBundle(store, fixture.match.id);
    const dossier = buildOpponentDossier([bundle], fixture.opponent.id, 'VC Tegenpartij');

    expect(dossier.passers.map((passer) => passer.number)).toStrictEqual([38, 3]);

    const zwak = dossier.passers[0]!;
    expect(zwak).toMatchObject({ receptions: 9, positive: 0, errors: 3 });
    expect(zwak.positivePct).toBe(0);
    expect(dossier.passers[1]?.positivePct).toBe(1);
  });

  it('zwijgt over een speelster met te weinig ballen', async () => {
    // Drie passes is geen oordeel maar een toevalstreffer, en daar hoort geen
    // serveerplan op gebouwd te worden.
    for (let i = 0; i < 3; i++) await theirReception(11, 'error', 'us');

    const bundle = await loadMatchBundle(store, fixture.match.id);
    const dossier = buildOpponentDossier([bundle], fixture.opponent.id, 'VC Tegenpartij');

    expect(dossier.passers).toStrictEqual([]);
  });
});
