/**
 * Scoutingprotocol: de kwalificatiecriteria, letterlijk afgeleid uit
 * `scoutingprotocol.docx`.
 *
 * Dit is bewust data en geen tekst in een component: de criteria voeden straks
 * de tooltips bij de kwalificatieknoppen (projectbrief §4-A), maar ook de
 * uitlegteksten in het dashboard en eventuele exports. Eén bron, dus één
 * waarheid — de belangrijkste voorwaarde voor consistente invoer.
 *
 * Wijzig deze teksten niet halverwege een seizoen: dan zijn eerdere en latere
 * data niet meer vergelijkbaar (protocol, §"Praktisch advies").
 */

import type { ActionType, Quality, TeamSide } from './types';

export const PROTOCOL_VERSION = '1.0.0';

/**
 * Wat de invoerder op de knop ziet. De termen komen uit de zaal, niet uit het
 * protocoldocument: dat schrijft 'opslag', 'receptie' en 'toets', maar niemand
 * zegt dat langs de lijn. De codes eronder (`serve`, `reception`, `set`) blijven
 * ongewijzigd, dus eerder ingevoerde wedstrijden blijven gewoon kloppen.
 */
export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  serve: 'Service',
  reception: 'Pass',
  set: 'Set-up',
  attack: 'Aanval',
  block: 'Blok',
  dig: 'Verdediging',
};

export const QUALITY_LABELS: Record<Quality, string> = {
  perfect: 'Perfect',
  good: 'Goed',
  poor: 'Matig',
  error: 'Fout',
};

export const TEAM_SIDE_LABELS: Record<TeamSide, string> = {
  us: 'Wij',
  them: 'Tegenstander',
};

/**
 * Kleurcodering van de kwalificaties (projectbrief §4-A: groen, lichtgroen,
 * oranje, rood). De exacte waarden zijn gecontroleerd op onderscheidbaarheid,
 * ook bij kleurenblindheid; het paar lichtgroen/oranje ligt daarbij op de
 * ondergrens, dus een kwalificatiekleur staat in de app nooit zonder tekst.
 * De waarden zelf staan in `app/styles.css`.
 */
export const QUALITY_COLORS: Record<Quality, string> = {
  perfect: 'var(--quality-perfect)',
  good: 'var(--quality-good)',
  poor: 'var(--quality-poor)',
  error: 'var(--quality-error)',
};

/** Numerieke waarde, handig voor gemiddelden in het analysedashboard. */
export const QUALITY_SCORE: Record<Quality, number> = {
  perfect: 3,
  good: 2,
  poor: 1,
  error: 0,
};

/** Het algemene principe achter elke kwalificatie, ongeacht actietype. */
export const GENERAL_PRINCIPLES: Record<Quality, string> = {
  perfect:
    'Het beste mogelijke gevolg: geeft de volgende speler alle opties, of levert direct een punt op.',
  good: 'Bruikbaar, de aanval of opbouw kan normaal doorgaan, met lichte beperking.',
  poor: 'De volgende speler moet improviseren: minder opties, geforceerde keuze, of de bal blijft wel in het spel.',
  error:
    'De rally eindigt direct in het nadeel van het eigen team: bal uit, in het net, of punt voor de tegenstander.',
};

export interface QualityCriterion {
  /** Het objectieve, telbare gevolg waaraan je de kwalificatie afmeet. */
  criterion: string;
  /** Voorbeeld uit het protocol, bedoeld om twijfel snel weg te nemen. */
  example: string;
}

export type ActionCriteria = Record<Quality, QualityCriterion>;

/**
 * Receptie en verdediging delen in het protocol één tabel: beide zijn het
 * ontvangen van een bal van de tegenstander.
 */
const RECEPTION_CRITERIA: ActionCriteria = {
  perfect: {
    criterion:
      'Bal komt exact op de ideale plek voor de spelverdeler (meestal net-midden), alle opties open.',
    example: 'Perfecte pass richting positie 2-3.',
  },
  good: {
    criterion: 'Bal blijft speelbaar voor een reguliere aanval, lichte afwijking in richting.',
    example: 'Pass iets breed maar spelverdeler kan alsnog kiezen.',
  },
  poor: {
    criterion:
      'Bal blijft in het spel maar dwingt tot een noodoplossing (hoge bal, geen snelle aanval mogelijk).',
    example: 'Pass moet met twee handen omhoog gewerkt worden.',
  },
  error: {
    criterion: 'Bal wordt niet bereikt of direct verloren (grond, uit, terug over net).',
    example: 'Bal valt tussen twee spelers in.',
  },
};

export const PROTOCOL_CRITERIA: Record<ActionType, ActionCriteria> = {
  serve: {
    perfect: {
      criterion: 'Ace: de tegenstander raakt de bal niet of speelt hem niet terug in het veld.',
      example: 'Bal valt direct in het veld na de service.',
    },
    good: {
      criterion: 'De passer kan alle drie de aanvalsopties (links, midden, rechts) nog gebruiken.',
      example: 'Rustige pass op de spelverdeler.',
    },
    poor: {
      criterion:
        'De passer kan nog maar 1 of 2 aanvalsopties gebruiken, of de spelverdeler moet zelf naar de bal toe.',
      example: 'Pass komt ver van de 3-meterlijn terecht.',
    },
    error: {
      criterion: 'Bal in het net of buiten het veld, of overtreding (voetfout, tijd).',
      example: 'Service recht in het net.',
    },
  },
  reception: RECEPTION_CRITERIA,
  dig: RECEPTION_CRITERIA,
  set: {
    perfect: {
      criterion:
        'Alle afgesproken aanvalsopties zijn voor de aanvaller uitvoerbaar op het gewenste tempo.',
      example: 'Snelle, precieze set-up op de midden.',
    },
    good: {
      criterion:
        'Aanvaller kan de bal aanvallen zoals gepland, met kleine aanpassing in timing of positie.',
      example: 'Set-up iets te laag maar de aanval blijft mogelijk.',
    },
    poor: {
      criterion:
        'Aanvaller moet een noodslag maken of een andere aanvalsrichting kiezen dan gepland.',
      example: 'Set-up te dicht bij het net, aanvaller moet aanpassen.',
    },
    error: {
      criterion: 'Bal is niet meer aan te vallen, of overtreding (dubbel, net aangeraakt).',
      example: 'Set-up valt terug over het net.',
    },
  },
  attack: {
    perfect: {
      criterion:
        'Direct punt: bal raakt de grond bij de tegenstander of leidt tot een onverdedigbare bal.',
      example: 'Aanval hard tussen twee verdedigers door.',
    },
    good: {
      criterion:
        'Bal wordt wel verdedigd maar de tegenstander kan er geen aanval van maken (vrije bal terug).',
      example: 'Blok raakt de bal net, tegenstander speelt vrije bal.',
    },
    poor: {
      criterion:
        'Tegenstander houdt de bal in het spel en kan een reguliere tegenaanval opzetten.',
      example: 'Aanval wordt makkelijk opgevangen door verdediging.',
    },
    error: {
      criterion: 'Bal in het net, uit het veld, of geblokt tot puntverlies.',
      example: 'Aanval blijft in het blok hangen aan de eigen kant.',
    },
  },
  block: {
    perfect: {
      criterion: 'Direct punt: bal valt na het block in het veld van de tegenstander.',
      example: 'Bal stuit recht omlaag na het block.',
    },
    good: {
      criterion:
        'Block vertraagt of verandert de bal zodat het eigen team hem nog kan verdedigen.',
      example: "Block 'touch', bal blijft speelbaar voor eigen verdediging.",
    },
    poor: {
      criterion: 'Block heeft geen invloed, bal gaat ongehinderd door.',
      example: 'Spelers springen maar raken de bal niet.',
    },
    error: {
      criterion:
        'Blokfout: bal wordt het eigen veld ingeslagen, of overtreding (netfout, over de middenlijn).',
      example: 'Bal keihard terug in eigen veld via de handen.',
    },
  },
};

/** Eén tooltip-tekst voor een kwalificatieknop. */
export function criterionFor(type: ActionType, quality: Quality): QualityCriterion {
  return PROTOCOL_CRITERIA[type][quality];
}

/** Volledige tooltip-inhoud: algemeen principe + concreet criterium + voorbeeld. */
export function tooltipFor(
  type: ActionType,
  quality: Quality,
): { title: string; principle: string; criterion: string; example: string } {
  const c = criterionFor(type, quality);
  return {
    title: `${ACTION_TYPE_LABELS[type]} — ${QUALITY_LABELS[quality]}`,
    principle: GENERAL_PRINCIPLES[quality],
    criterion: c.criterion,
    example: c.example,
  };
}

/** Vuistregels die overal in de app herhaald mogen worden. */
export const PROTOCOL_RULES = {
  doubt: 'Bij twijfel: kies de lagere kwalificatie.',
  assignment:
    'Een actie hoort bij de speler die de bal als laatste redelijkerwijs kon beïnvloeden. Kon de speler redelijkerwijs iets anders doen? Dan is het zijn actie. Zo nee, dan schuift de kwalificatie naar de actie ervoor.',
  ace: "Was de service onhoudbaar, dan krijgt de service 'perfect' en wordt er géén aparte pass geregistreerd.",
  zoneFrom:
    'Vertrekzone is verplicht bij service en aanval: de zone waar de speler stond op het moment van afzet.',
  zoneTo: 'Landingszone is optioneel — alleen invullen als de tijd het toelaat.',
} as const;
