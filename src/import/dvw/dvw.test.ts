import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpretDvw } from './interpret';
import { decodeDvText, decodeDvw, DvwParseError, parseDvw } from './parse';

/**
 * De testbestanden zijn echte wedstrijden uit het openvolley-project (MIT), zie
 * fixtures/dvw/HERKOMST.md. Ze staan hier omdat een parser zonder echte
 * bestanden niets waard is: elk scoutprogramma schrijft net iets anders.
 */
function fixture(name: string): string {
  const path = new URL(`../../../fixtures/dvw/${name}`, import.meta.url);
  return decodeDvw(readFileSync(path).buffer as ArrayBuffer);
}

const FILES = [
  'stuttgart-schwerin-2018.dvw',
  'katowice-bedzin-2019.dvw',
  'hartberg-graz-2020.dvw',
  'braslovce-branik-2015.dvw',
];

describe('DataVolley-bestanden inlezen', () => {
  /**
   * De sterkste controle die er is: het bestand noteert in `[3SET]` zelf de
   * eindstand van elke set. Tellen wij de rally's anders op, dan lezen wij het
   * bestand verkeerd — en dan deugt geen enkel cijfer dat eruit komt.
   */
  it.each(FILES)('komt op dezelfde setstanden uit als het bestand zelf (%s)', (name) => {
    const file = parseDvw(fixture(name));
    const match = interpretDvw(file);

    expect(file.declaredSets.length).toBeGreaterThan(2);
    expect(match.sets.map((set) => `${set.pointsUs}-${set.pointsThem}`)).toStrictEqual(
      file.declaredSets.map((set) => `${set.pointsHome}-${set.pointsVisiting}`),
    );
  });

  it.each(FILES)('weet van elke rally wie serveerde en in welke rotatie (%s)', (name) => {
    const match = interpretDvw(parseDvw(fixture(name)));

    expect(match.rallies.length).toBeGreaterThan(100);
    expect(match.rallies.filter((rally) => rally.servingTeam === null)).toStrictEqual([]);
    expect(match.rallies.filter((rally) => rally.rotationUs === null)).toStrictEqual([]);
  });

  it('leest de wedstrijdgegevens van een Bundesliga-play-off', () => {
    const match = interpretDvw(parseDvw(fixture('stuttgart-schwerin-2018.dvw')));

    expect(match.homeTeam).toBe('Allianz MTV Stuttgart');
    expect(match.visitingTeam).toBe('SSC Palmberg Schwerin');
    expect(match.date).toBe('2018-04-21');
    expect(match.competition).toContain('Bundesliga');
    expect(match.sets).toHaveLength(5);
    expect(match.homePlayers.length).toBeGreaterThan(10);
    expect(match.homePlayers.some((player) => player.role === 'libero')).toBe(true);
  });

  it('vertaalt de codes naar onze begrippen', () => {
    const match = interpretDvw(parseDvw(fixture('braslovce-branik-2015.dvw')));
    const first = match.rallies[0]!;

    // *06SM#~~~18C: thuisploeg, nummer 6, service, ace, vanaf zone 1.
    expect(first.actions[0]).toMatchObject({
      team: 'us',
      playerNumber: 6,
      type: 'serve',
      quality: 'perfect',
      zoneFrom: 1,
    });
    expect(first.wonBy).toBe('us');
    expect(first.servingTeam).toBe('us');

    // a06RM=: de ontvangende ploeg maakt een passfout op diezelfde bal.
    expect(first.actions[1]).toMatchObject({
      team: 'them',
      type: 'reception',
      quality: 'error',
    });
  });

  it('meldt wat het overslaat in plaats van het stil weg te gooien', () => {
    const match = interpretDvw(parseDvw(fixture('hartberg-graz-2020.dvw')));

    // Dit bestand is minder diep gescout: veel punten zonder toegewezen actie.
    const reasons = new Set(match.skipped.map((entry) => entry.reason));
    expect(reasons.has('punt zonder toegewezen actie')).toBe(true);
    expect(match.skipped.every((entry) => entry.line > 0)).toBe(true);
  });

  it('leest de UTF-8-kolommen die DataVolley naast de namen zet', () => {
    expect(decodeDvText('\u000f25065726F766963')).toBe('Perovic');
    expect(decodeDvText('gewone tekst')).toBeNull();
    expect(decodeDvText(undefined)).toBeNull();
  });

  it('weigert een bestand dat geen scoutbestand is', () => {
    expect(() => parseDvw('dit is zomaar een tekstbestand')).toThrow(DvwParseError);
  });
});
