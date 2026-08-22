/**
 * Heen en terug: exporteren op het ene apparaat, inlezen op het andere.
 *
 * De kern van deze test is niet dat er data binnenkomt, maar dat er niets
 * dubbel komt te staan en dat verse invoer niet wordt overschreven door een
 * ouder bestand. Dat zijn de twee manieren waarop een import stil schade doet.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { toMatchJson } from '../export/json';
import { openTestStore, seedMatch } from '../test/factory';
import { MatchFileError, parseMatchFile, toChanges } from './matchFile';

describe('een wedstrijdbestand inlezen', () => {
  let source: ScoutingStore;
  let target: ScoutingStore;

  beforeEach(async () => {
    source = await openTestStore('tablet');
    target = await openTestStore('telefoon');
  });

  afterEach(() => {
    source.close();
    target.close();
  });

  /** Een wedstrijdje met één rally erin, geëxporteerd als tekst. */
  async function exported(): Promise<{ text: string; matchId: string }> {
    const fixture = await seedMatch(source);
    const rally = await source.rallies.start({
      setId: fixture.set.id,
      servingTeam: 'us',
    });
    await source.actions.append({
      rallyId: rally.id,
      team: 'us',
      playerId: fixture.players[0]!.id,
      type: 'serve',
      zoneFrom: 1,
      quality: 'perfect',
    });
    const bundle = await loadMatchBundle(source, fixture.match.id);
    return { text: toMatchJson(bundle), matchId: fixture.match.id };
  }

  it('zet de wedstrijd met dezelfde id op het andere apparaat', async () => {
    const { text, matchId } = await exported();
    const summary = await target.imports.importMatchFile(text);

    expect(summary.matchId).toBe(matchId);
    expect(summary.existed).toBe(false);
    expect(summary.opponent).toBe('VC Tegenpartij');
    expect(summary.applied).toBeGreaterThan(0);

    const bundle = await loadMatchBundle(target, matchId);
    expect(bundle.ownTeam?.name).toBe('Onze ploeg');
    expect(bundle.players).toHaveLength(3);
    expect(bundle.sets[0]?.rallies[0]?.actions).toHaveLength(1);
  });

  it('levert bij tweemaal hetzelfde bestand één wedstrijd op', async () => {
    const { text } = await exported();
    await target.imports.importMatchFile(text);
    const again = await target.imports.importMatchFile(text);

    expect(again.existed).toBe(true);
    expect(again.applied).toBe(0);
    expect(await target.matches.list()).toHaveLength(1);
    expect(await target.teams.list()).toHaveLength(2);
  });

  it('overschrijft nieuwere invoer op dit apparaat niet met een ouder bestand', async () => {
    const { text, matchId } = await exported();
    await target.imports.importMatchFile(text);

    // Op het ontvangende apparaat gaat iemand verder met dezelfde wedstrijd.
    await target.matches.update(matchId, { notes: 'hier verder gegaan' });
    await target.imports.importMatchFile(text);

    expect((await target.matches.get(matchId))?.notes).toBe('hier verder gegaan');
  });

  it('neemt uit een nieuwer bestand de wijziging wel over', async () => {
    const { text, matchId } = await exported();
    await target.imports.importMatchFile(text);

    await source.matches.update(matchId, { notes: 'op de tablet aangevuld' });
    const bundle = await loadMatchBundle(source, matchId);
    await target.imports.importMatchFile(toMatchJson(bundle));

    expect((await target.matches.get(matchId))?.notes).toBe('op de tablet aangevuld');
  });

  it('zegt in gewone taal wat er mis is met een verkeerd bestand', () => {
    expect(() => parseMatchFile('speler;actie\n4;serve')).toThrow(MatchFileError);
    expect(() => parseMatchFile('{"format":"iets anders"}')).toThrow(/niet uit deze app/);
    expect(() =>
      parseMatchFile('{"format":"volley-scouting-match","formatVersion":99}'),
    ).toThrow(/nieuwere versie/);
  });

  it('zet alles uit het bestand om, van ploeg tot actie', async () => {
    const { text } = await exported();
    const changes = toChanges(parseMatchFile(text));
    const entities = new Set(changes.map((change) => change.entity));

    expect(entities).toContain('teams');
    expect(entities).toContain('players');
    expect(entities).toContain('matches');
    expect(entities).toContain('sets');
    expect(entities).toContain('rallies');
    expect(entities).toContain('actions');
  });
});
