/**
 * Waardoor een rally eindigde.
 *
 * Elke rally eindigt door precies één handeling, en de regels bepalen welke dat
 * kunnen zijn. Twee dingen zijn genoeg om de meeste uit elkaar te houden, en de
 * app heeft ze allebei: **hoeveel aanrakingen** er waren, en **hoe lang na de
 * laatste aanraking er gefloten werd**.
 *
 * Dat tweede is het scherpst, en het is precies wat een scheidsrechter doet
 * zonder erbij na te denken. Bij een dubbele of gedragen bal fluit hij óp het
 * contact — de bal hangt dan nog in de lucht. Bij een aanval fluit hij pas als
 * de bal de vloer raakt, een seconde later. Dat verschil van een seconde is
 * meetbaar geworden nu de aanrakingen op een honderdste bekend zijn.
 *
 * Wat hier niet gebeurt: alles in een hokje duwen. Er is een uitkomst
 * 'onduidelijk', en die hoort er te zijn. Twintig rally's die de app niet durft
 * te benoemen zijn beter dan twintig verzonnen aanvallen in de seizoenscijfers.
 */

import type { TeamSide } from './types';

export type Ending =
  /** Eén aanraking: de service besliste hem, als ace of als fout. */
  | 'service'
  /** Twee: de service kwam over, de ontvangst niet verder. */
  | 'pass'
  /** Er werd gefloten terwijl de bal nog in de lucht was. */
  | 'techniek'
  /** Drie of meer aanrakingen, en de fluit kwam pas toen de bal lag. */
  | 'aanval'
  | 'onduidelijk';

export interface EndingReading {
  ending: Ending;
  /** Waarom, in gewone taal. Elk oordeel moet na te lopen zijn. */
  because: string;
  /**
   * De preciezere naam, als bekend is wie de rally won.
   *
   * Een service die de rally beslist is een ace of een servicefout, en dat
   * verschil zit niet in het beeld maar in de uitslag: won de serverende ploeg,
   * dan was het een ace.
   */
  named: string;
}

export interface EndingInput {
  /** De momenten waarop de bal geraakt werd, in seconden. */
  contacts: readonly number[];
  /** Het fluitsignaal waarmee de rally werd afgefloten. */
  endWhistle: number | null;
  /** Wie er serveerde, als dat bekend is. */
  servedBy?: TeamSide | null;
  /** Wie de rally won, als dat al ingevuld is. */
  wonBy?: TeamSide | null;
}

export interface EndingOptions {
  /**
   * Korter dan dit na de laatste aanraking betekent: gefloten op het contact.
   *
   * Een bal die van setshoogte valt doet er ruim een halve seconde over, en een
   * aanval die op de vloer slaat komt daar nog bij. Onder de zes tienden kán de
   * fluit dus niet over een gevallen bal gaan.
   */
  onContactSeconds?: number;
}

const DEFAULTS: Required<EndingOptions> = { onContactSeconds: 0.6 };

/** Van 'service besliste hem' naar 'ace' of 'servicefout'. */
function nameFor(ending: Ending, input: EndingInput): string {
  const { servedBy, wonBy } = input;
  const known = servedBy != null && wonBy != null;
  switch (ending) {
    case 'service':
      if (!known) return 'de service besliste hem';
      return servedBy === wonBy ? 'ace' : 'servicefout';
    case 'pass':
      if (!known) return 'de ontvangst besliste hem';
      return servedBy === wonBy ? 'passfout' : 'servicefout na een aanraking';
    case 'techniek':
      return 'technische fout';
    case 'aanval':
      if (!known) return 'de aanval besliste hem';
      return 'aanval';
    default:
      return 'niet te zeggen';
  }
}

export function endingOf(input: EndingInput, options: EndingOptions = {}): EndingReading {
  const { onContactSeconds } = { ...DEFAULTS, ...options };
  const { contacts, endWhistle } = input;

  const geef = (ending: Ending, because: string): EndingReading => ({
    ending,
    because,
    named: nameFor(ending, input),
  });

  if (contacts.length === 0) {
    return geef('onduidelijk', 'geen aanrakingen gehoord');
  }

  const last = contacts[contacts.length - 1]!;
  const gap = endWhistle === null ? null : endWhistle - last;

  // Gefloten terwijl de bal nog in de lucht was. Dat kan geen gevallen bal
  // zijn, dus ging het over de aanraking zelf: dubbel, gedragen, of vier keer.
  if (gap !== null && gap >= 0 && gap < onContactSeconds && contacts.length >= 2) {
    return geef(
      'techniek',
      `er werd ${gap.toFixed(1).replace('.', ',')} seconde na de laatste aanraking gefloten — ` +
        'de bal was toen nog in de lucht',
    );
  }

  if (contacts.length === 1) {
    return geef('service', 'één aanraking: verder is er niemand aan te pas gekomen');
  }
  if (contacts.length === 2) {
    return geef('pass', 'twee aanrakingen: de service kwam over, daarna hield het op');
  }

  if (gap === null) {
    return geef('onduidelijk', `${contacts.length} aanrakingen, maar geen eindfluit gehoord`);
  }
  return geef(
    'aanval',
    `${contacts.length} aanrakingen, en de fluit kwam ${gap.toFixed(1).replace('.', ',')} seconde ` +
      'later — tijd genoeg voor een bal die valt',
  );
}
