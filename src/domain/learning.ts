/**
 * Onthouden wat de app zag en wat u er zelf van vond.
 *
 * Dit is het bestand dat er nog niet was, en waardoor elke ingevoerde
 * wedstrijd tot nu toe als leerstof verdampte. De app rekent tijdens het
 * zoeken van alles uit — hoe lang een rally duurde, hoe druk het was, welke
 * kant de scheidsrechter aanwees — en gooide dat daarna weg. Uw antwoord bij
 * elke rally is precies het juiste antwoord bij die getallen. Samen zijn ze
 * leerstof; apart zijn ze niets.
 *
 * Er wordt hier nog niet geleerd. Er wordt bewaard, en er wordt geteld hoe
 * vaak het voorstel klopte — want zonder die meting is elke volgende stap
 * gokwerk.
 */

import type { Side, Team } from './referee';

/** Wat de app zag bij één rally, vóór u iets zei. */
export interface RallyObservation {
  /** Seconden vanaf het begin van de opname. */
  at: number;
  duration: number;
  serveWhistle: number | null;
  endWhistle: number | null;
  peakEnergy: number;
  meanEnergy: number;
  bursts: number;
  /** De momenten waarop de bal geraakt werd, in seconden vanaf het begin. */
  contacts: number[];
  /** Hoeveel arm er links en rechts uitstak in de pauze erna. */
  armLeft: number;
  armRight: number;
  direction: Side | null;
  ourSide: Side;
  suggested: Team | null;
}

/**
 * Wat u ervan vond.
 *
 * 'replay' is er niet voor niets bij. Bij een dubbele fout, of als er een bal
 * van het veld ernaast in rolt, wordt de rally overgespeeld en valt er géén
 * punt. Zonder dat antwoord telt de app zo'n rally mee als punt en klopt de
 * stand de rest van de set niet meer.
 */
export type Answer = 'us' | 'them' | 'replay' | 'none';

export interface LearnRow extends RallyObservation {
  answer: Answer;
  /** Waardoor de rally volgens de app eindigde, op het moment van antwoorden. */
  ending?: string;
  answeredAt: string;
}

export interface Agreement {
  /** Hoeveel rally's u beantwoordde. */
  answered: number;
  /** Waarvan de app er zelf een voorstel bij had. */
  suggested: number;
  /** En hoe vaak dat voorstel het uwe was. */
  agreed: number;
}

export function agreementOf(rows: readonly LearnRow[]): Agreement {
  let answered = 0;
  let suggested = 0;
  let agreed = 0;
  for (const row of rows) {
    // Overgespeelde rally's tellen niet mee: daar had de app geen voorstel voor
    // en kán hij er ook geen hebben — hij weet niet dat er niet gespeeld werd.
    if (row.answer !== 'us' && row.answer !== 'them') continue;
    answered += 1;
    if (row.suggested === null) continue;
    suggested += 1;
    if (row.suggested === row.answer) agreed += 1;
  }
  return { answered, suggested, agreed };
}

/**
 * De meting in één zin, of niets.
 *
 * Onder de tien beoordeelde rally's zegt een percentage meer dan het weet, en
 * dan hoort er niets te staan. Liever geen cijfer dan een cijfer waar u iets
 * op gaat baseren.
 */
export function summarise(agreement: Agreement): string | null {
  const { answered, suggested, agreed } = agreement;
  if (suggested < 10) return null;
  const share = Math.round((agreed / suggested) * 100);
  const onleesbaar = answered - suggested;
  return (
    `Het voorstel van de scheidsrechter klopte bij ${agreed} van de ${suggested} rally’s (${share}%).` +
    (onleesbaar > 0 ? ` Bij ${onleesbaar} andere was hij niet te lezen.` : '')
  );
}

/** Een rij samenstellen uit wat de app zag en wat u antwoordde. */
export function rowFor(observation: RallyObservation, answer: Answer, now = new Date()): LearnRow {
  return { ...observation, answer, answeredAt: now.toISOString() };
}
