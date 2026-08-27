/**
 * De ingebouwde oefeningenbank.
 *
 * Deze oefeningen staan in de app zelf, niet in de database. Twee redenen: ze
 * zijn er dus meteen bij een lege installatie, en ze kunnen niet per ongeluk
 * gedeeld of overschreven worden. Wil je er iets aan veranderen, dan maakt de
 * app er een kopie van die van jou is.
 *
 * Elke oefening zegt in `group` hoe hij meeschaalt. Dat is het interessantste
 * veld: 'in drietallen' is `step: 3`, 'twee keer naast elkaar op één veld' is
 * `maxGroups: 2`, en een oefening die zonder spelverdeler niet werkt zegt dat
 * in `roles`.
 */

import { animation, at, ball, builtIn, group, marker, move, phase } from './helpers';
import type { Exercise } from '../domain/types';

/** Veldposities die vaker terugkomen, zodat de animaties op elkaar lijken. */
const ZONE = {
  one: at(7.5, 1.5), // rechtsachter
  five: at(1.5, 1.5), // linksachter
  six: at(4.5, 1), // midden achter
  four: at(1.5, 7.5), // linksvoor
  three: at(4.5, 8), // middenvoor
  two: at(7.5, 7.5), // rechtsvoor
  serve: at(4.5, -1.5), // achter de achterlijn
} as const;

export const BUILT_IN_EXERCISES: Exercise[] = [
  builtIn({
    id: 'ingebouwd-inlopen',
    title: 'Inlopen met bal',
    summary: 'Rustig warmlopen in tweetallen, bal onderling overgooien.',
    description:
      'Twee spelers lopen naast elkaar over de lengte van het veld en gooien de bal onderling over. ' +
      'Elke ronde een opdracht erbij: bovenhands aangooien, onderhands terug, om de beurt een sprint ' +
      'naar de aanvalslijn. Loop niet in een rij achter elkaar maar verspreid over de zaal.',
    goals: ['conditioning', 'technique'],
    level: 1,
    minutes: 10,
    material: ['1 bal per tweetal'],
    group: group({ min: 2, max: 2, step: 2, maxGroups: 8 }),
    slots: ['warmup'],
    coachingPoints: [
      'Rustig beginnen, tempo pas omhoog als iedereen los is.',
      'Bal met twee handen aangooien, niet smijten.',
    ],
    variants: [],
    animation: animation(
      [marker('a', 'player', '1', 1), marker('b', 'player', '2', 2), marker('bal', 'ball')],
      [
        phase('start', 'Naast elkaar inlopen', 1400,
          { a: at(2, 0.5), b: at(4, 0.5), bal: at(2, 0.5) },
          [move('a', at(2, 4)), move('b', at(4, 4)), ball('bal', at(4, 4))],
        ),
        phase('terug', 'Bal heen en weer, tempo omhoog', 1400, {},
          [move('a', at(2, 8)), move('b', at(4, 8)), ball('bal', at(2, 8))],
        ),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-pepperen',
    title: 'Pepperen',
    summary: 'Aanval, verdediging, set-up: met z’n tweeën de bal in de lucht houden.',
    description:
      'Twee spelers tegenover elkaar, een paar meter uit elkaar. Speler A slaat rustig in op speler B, ' +
      'B verdedigt naar zichzelf, zet zichzelf op en slaat terug. Eerst zonder tempo, daarna harder en ' +
      'verder uit elkaar. Tel hardop hoe lang de rally duurt.',
    goals: ['pass', 'defense', 'attack', 'technique'],
    level: 1,
    minutes: 10,
    material: ['1 bal per tweetal'],
    group: group({ min: 2, max: 2, step: 2, maxGroups: 8 }),
    slots: ['warmup', 'core'],
    coachingPoints: [
      'Verdedig naar jezelf, niet meteen terug.',
      'Sta laag met de handen vooruit voordat de bal komt.',
      'Sla in op het lichaam, niet ernaast: dit is samen spelen, niet winnen.',
    ],
    variants: [
      {
        id: 'ingebouwd-pepperen-drie',
        title: 'Pepperen met drie',
        description: 'Eén verdedigt, één zet op, één slaat in; na elke bal doorschuiven.',
        group: group({ min: 3, max: 3, step: 3, maxGroups: 5 }),
      },
    ],
    animation: animation(
      [marker('a', 'player', 'A', 1), marker('b', 'player', 'B', 2), marker('bal', 'ball')],
      [
        phase('aanval', 'A slaat in op B', 900,
          { a: at(3, 7), b: at(3, 2), bal: at(3, 7) },
          [ball('bal', at(3, 2.5), 'attack')],
        ),
        phase('verdediging', 'B verdedigt naar zichzelf', 900, {},
          [ball('bal', at(3.2, 3), 'pass')],
        ),
        phase('setup', 'B zet zichzelf op', 900, {},
          [move('b', at(3.2, 2.6)), ball('bal', at(3.2, 2.8), 'set')],
        ),
        phase('terug', 'B slaat terug op A', 900, {},
          [ball('bal', at(3, 6.5), 'attack')],
        ),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-drietallen-net',
    title: 'Drietallen over het net',
    summary: 'Pass, set-up, bal over: alleen met 3, 6 of 9 spelers per groep.',
    description:
      'Drie spelers aan één kant: een passer, een spelverdeler bij positie 3 en een aanvaller op 4. ' +
      'De trainer of een speler aan de overkant gooit in. Passen op de spelverdeler, set-up naar 4, ' +
      'bal over het net. Na elke bal doorschuiven: passer wordt spelverdeler, spelverdeler wordt ' +
      'aanvaller, aanvaller gaat passen.',
    goals: ['pass', 'set', 'attack'],
    level: 2,
    minutes: 15,
    material: ['ballen', 'net'],
    group: group({ min: 3, max: 9, step: 3, maxGroups: 2 }),
    slots: ['core'],
    coachingPoints: [
      'Pass hoog genoeg: de spelverdeler moet eronder kunnen komen.',
      'Aanvaller loopt in, staat niet te wachten.',
      'Doorschuiven gaat vanzelf — geen gesprekken tussen de ballen door.',
    ],
    variants: [],
    animation: animation(
      [
        marker('passer', 'player', 'P', 1),
        marker('sv', 'player', 'SV', 2),
        marker('aanval', 'player', 'A', 3),
        marker('bal', 'ball'),
      ],
      [
        phase('ingooi', 'Bal komt in vanaf de overkant', 900,
          { passer: ZONE.five, sv: ZONE.three, aanval: at(1.5, 6.5), bal: at(4.5, 12) },
          [ball('bal', at(1.8, 2.2), 'serve')],
        ),
        phase('pass', 'Passen op positie 3', 900, {},
          [ball('bal', at(4.5, 7.6), 'pass')],
        ),
        phase('setup', 'Set-up naar 4', 900, {},
          [ball('bal', at(1.6, 8), 'set'), move('aanval', at(1.5, 7.2))],
        ),
        phase('aanval', 'Aanval over het net', 900, {},
          [ball('bal', at(6.5, 13), 'attack'), move('aanval', at(1.5, 8.2))],
        ),
        phase('doorschuiven', 'Doorschuiven: P → SV → A → P', 900,
          {},
          [move('passer', ZONE.three), move('sv', at(1.5, 7)), move('aanval', ZONE.five)],
        ),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-service-zones',
    title: 'Serveren op zones',
    summary: 'Serveren op een aangewezen vak; punten tellen per serie van tien.',
    description:
      'Alle spelers achter de achterlijn met een bal. Aan de overkant liggen pionnen in de zones 1, 5 ' +
      'en 6. Per serie van tien ballen wordt één zone aangewezen. Raak je de zone, dan een punt; in het ' +
      'net of uit, dan een punt eraf. Wie eindigt boven de vijf?',
    goals: ['serve'],
    level: 1,
    minutes: 12,
    material: ['veel ballen', 'pionnen', 'net'],
    group: group({ min: 2, max: 8, step: 1, maxGroups: 2 }),
    slots: ['core'],
    coachingPoints: [
      'Vaste aanloop en vaste opgooi — dat is het halve werk.',
      'Kies de zone vóór de opgooi, niet tijdens.',
      'Fout in het net telt zwaarder dan uit: dan haalt hij het niet eens.',
    ],
    variants: [
      {
        id: 'ingebouwd-service-druk',
        title: 'Onder druk',
        description: 'Mis je twee achter elkaar, dan de hele groep een sprint over het veld.',
        group: null,
      },
    ],
    animation: animation(
      [
        marker('server', 'player', 'S', 1),
        marker('doel', 'cone', '5'),
        marker('bal', 'ball'),
      ],
      [
        phase('opgooi', 'Vaste aanloop, vaste opgooi', 800,
          { server: ZONE.serve, doel: at(1.5, 15.5), bal: at(4.5, -1.5) },
          [ball('bal', at(4.5, 0.5), 'set')],
        ),
        phase('service', 'Service naar zone 5', 1200, {},
          [ball('bal', at(1.5, 15.5), 'serve'), move('server', at(4.5, 0.5))],
        ),
      ],
      'full',
    ),
  }),

  builtIn({
    id: 'ingebouwd-pass-doel',
    title: 'Passen op doel',
    summary: 'Service ontvangen en op de spelverdeler passen; scoren per pass.',
    description:
      'Twee of drie passers in het veld, één spelverdeler op positie 2/3, de rest serveert aan de ' +
      'overkant. Elke pass krijgt een cijfer: in de handen van de spelverdeler is 3, speelbaar is 2, ' +
      'over het net of niet gepast is 0. Per passer tien ballen, dan wisselen met de servers.',
    goals: ['pass', 'serve'],
    level: 2,
    minutes: 20,
    material: ['veel ballen', 'net'],
    group: group({
      min: 4,
      max: 12,
      step: 1,
      maxGroups: 2,
      roles: [{ position: 'setter', count: 1, required: false }],
    }),
    slots: ['core'],
    coachingPoints: [
      'Sta stil op het moment dat de service geraakt wordt.',
      'Schouders naar het doel draaien, niet met de armen sturen.',
      'Roep wie hem neemt, elke bal opnieuw.',
    ],
    variants: [],
    animation: animation(
      [
        marker('p1', 'player', 'P1', 1),
        marker('p2', 'player', 'P2', 2),
        marker('sv', 'player', 'SV', 3),
        marker('server', 'opponent', 'S'),
        marker('bal', 'ball'),
      ],
      [
        phase('service', 'Service komt', 1100,
          { p1: at(2.5, 3), p2: at(6.5, 3), sv: at(6.8, 8), server: at(4.5, 19.5), bal: at(4.5, 19.5) },
          [ball('bal', at(2.6, 3.4), 'serve')],
        ),
        phase('pass', 'Pass naar de spelverdeler', 1000, {},
          [ball('bal', at(6.8, 8), 'pass'), move('p2', at(6, 3.5))],
        ),
        phase('vangen', 'Spelverdeler vangt en beoordeelt', 700, {}, []),
      ],
      'full',
    ),
  }),

  builtIn({
    id: 'ingebouwd-setup-driehoek',
    title: 'Set-up in de driehoek',
    summary: 'Bovenhands spelen in drietallen, steeds naar de derde.',
    description:
      'Drie spelers in een driehoek van vier meter. Bovenhands overspelen, altijd naar degene die de ' +
      'bal niet net had. Na twintig ballen omdraaien: nu speel je naar degene die je aankijkt en moet ' +
      'de ander erheen lopen.',
    goals: ['set', 'technique'],
    level: 1,
    minutes: 10,
    material: ['1 bal per drietal'],
    group: group({ min: 3, max: 3, step: 3, maxGroups: 5 }),
    slots: ['warmup', 'core'],
    coachingPoints: [
      'Handen op tijd boven het voorhoofd.',
      'Onder de bal komen met de voeten, niet met de armen erheen reiken.',
      'Strek af naar het doel: handen blijven wijzen waar de bal heen ging.',
    ],
    variants: [],
    animation: animation(
      [
        marker('a', 'player', 'A', 1),
        marker('b', 'player', 'B', 2),
        marker('c', 'player', 'C', 3),
        marker('bal', 'ball'),
      ],
      [
        phase('ab', 'A naar B', 800,
          { a: at(2, 2), b: at(6, 2), c: at(4, 6), bal: at(2, 2) },
          [ball('bal', at(6, 2), 'set')],
        ),
        phase('bc', 'B naar C', 800, {}, [ball('bal', at(4, 6), 'set')]),
        phase('ca', 'C naar A', 800, {}, [ball('bal', at(2, 2), 'set')]),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-blokvoetenwerk',
    title: 'Blokvoetenwerk langs het net',
    summary: 'Verplaatsen langs het net en blokken, zonder bal.',
    description:
      'Spelers staan verspreid langs het net. Op teken van de trainer verplaatsen ze zich twee passen ' +
      'zijwaarts en springen ze in blokhouding. Daarna dezelfde oefening met een bal die op de rand van ' +
      'de bovenkant van het net wordt gehouden: handen eroverheen.',
    goals: ['block', 'technique', 'conditioning'],
    level: 1,
    minutes: 10,
    material: ['net'],
    group: group({ min: 2, max: 6, step: 1, maxGroups: 2 }),
    slots: ['warmup', 'core'],
    coachingPoints: [
      'Handen hoog houden tijdens het verplaatsen.',
      'Laatste pas is een sluitpas: recht omhoog, niet driftend.',
      'Duimen omhoog, handen over het net.',
    ],
    variants: [],
    animation: animation(
      [marker('a', 'player', 'B', 1), marker('bal', 'ball')],
      [
        phase('start', 'Blok op 4', 800,
          { a: at(2, 8.3), bal: at(2, 9.4) },
          [],
        ),
        phase('verplaatsen', 'Twee passen naar 3', 900, {}, [move('a', at(4.5, 8.3)), move('bal', at(4.5, 9.4))]),
        phase('sprong', 'Sluitpas en springen', 700, {}, []),
        phase('verder', 'Door naar 2', 900, {}, [move('a', at(7, 8.3)), move('bal', at(7, 9.4))]),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-blok-verdediging',
    title: 'Blok met verdediging erachter',
    summary: 'Twee blokkeren, drie verdedigen; trainer slaat in vanaf een bank.',
    description:
      'Blok op 4 en 3, drie verdedigers erachter in de basisverdediging. De trainer slaat vanaf een ' +
      'verhoging aan de overkant in. Blok sluit, verdediging leest waar het blok níét staat. Elke bal ' +
      'die omhoog komt wordt uitgespeeld tot een aanval.',
    goals: ['block', 'defense', 'tactics'],
    level: 3,
    minutes: 20,
    material: ['bank of kast', 'veel ballen', 'net'],
    group: group({ min: 5, max: 6, step: 1, maxGroups: 1 }),
    slots: ['core'],
    coachingPoints: [
      'Blok bepaalt waar de verdediging staat, niet andersom.',
      'Verdedigers staan stil op het moment van de klap.',
      'Elke omhooggekomen bal uitspelen: anders traint verdedigen alleen het rapen.',
    ],
    variants: [],
    animation: animation(
      [
        marker('b1', 'player', 'B1', 1),
        marker('b2', 'player', 'B2', 2),
        marker('v1', 'player', 'V1', 3),
        marker('v2', 'player', 'V2', 4),
        marker('v3', 'player', 'V3', 5),
        marker('trainer', 'coach', 'T'),
        marker('bal', 'ball'),
      ],
      [
        phase('opstelling', 'Blok op 4 en 3, drie erachter', 1000,
          {
            b1: at(1.8, 8.3), b2: at(4.5, 8.3),
            v1: at(1.5, 5), v2: at(7.5, 5), v3: at(4.5, 1.5),
            trainer: at(7, 11), bal: at(7, 11),
          },
          [],
        ),
        phase('aanval', 'Trainer slaat langs het blok', 900, {},
          [ball('bal', at(7.4, 4.6), 'attack')],
        ),
        phase('verdediging', 'V2 verdedigt naar het midden', 900, {},
          [ball('bal', at(4.5, 6.5), 'pass')],
        ),
      ],
      'full',
    ),
  }),

  builtIn({
    id: 'ingebouwd-verdediging-diepte',
    title: 'Verdedigen in de diepte',
    summary: 'Trainer prikt en slaat afwisselend; verdedigers werken in tweetallen.',
    description:
      'Twee verdedigers in het achterveld. De trainer slaat afwisselend hard in en prikt kort over. ' +
      'Elke bal moet omhoog en naar de middenzone. Series van tien ballen per tweetal, dan wisselen.',
    goals: ['defense', 'conditioning'],
    level: 2,
    minutes: 15,
    material: ['veel ballen'],
    group: group({ min: 2, max: 2, step: 2, maxGroups: 3 }),
    slots: ['core'],
    coachingPoints: [
      'Laag blijven en stilstaan op het moment van de klap.',
      'Korte bal met de handen open naar boven, niet duiken zonder plan.',
      'Praat: wie neemt de bal in het midden?',
    ],
    variants: [],
    animation: animation(
      [
        marker('v1', 'player', 'V1', 1),
        marker('v2', 'player', 'V2', 2),
        marker('trainer', 'coach', 'T'),
        marker('bal', 'ball'),
      ],
      [
        phase('hard', 'Harde bal op V1', 800,
          { v1: at(2.5, 2), v2: at(6.5, 2), trainer: at(4.5, 8.5), bal: at(4.5, 8.5) },
          [ball('bal', at(2.6, 2.4), 'attack')],
        ),
        phase('omhoog', 'Omhoog naar het midden', 800, {}, [ball('bal', at(4.5, 5.5), 'pass')]),
        phase('kort', 'Prik kort achter het blok', 900,
          { bal: at(4.5, 8.5) },
          [ball('bal', at(6.4, 5.5), 'pass'), move('v2', at(6.4, 5))],
        ),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-aanval-vier',
    title: 'Aanvalslijn op 4',
    summary: 'Aanlopen en slaan vanaf positie 4, met en zonder blok.',
    description:
      'Rij aanvallers op 4, spelverdeler op 2/3, ballenkar bij de spelverdeler. Aanlopen, slaan, bal ' +
      'ophalen en achteraan aansluiten. Eerst zonder blok, daarna met één blokkeerder die alleen de ' +
      'lijn dichtzet: de aanvaller moet diagonaal.',
    goals: ['attack', 'technique'],
    level: 2,
    minutes: 20,
    material: ['ballenkar', 'net'],
    group: group({
      min: 4,
      max: 10,
      step: 1,
      maxGroups: 2,
      roles: [{ position: 'setter', count: 1, required: false }],
    }),
    slots: ['core'],
    coachingPoints: [
      'Aanloop begint buiten de zijlijn en gaat naar binnen.',
      'Laatste twee passen zijn de snelste.',
      'Arm gestrekt op het hoogste punt, hand over de bal.',
    ],
    variants: [
      {
        id: 'ingebouwd-aanval-vier-blok',
        title: 'Met blok',
        description: 'Eén blokkeerder zet de lijn dicht; alleen diagonaal telt.',
        group: null,
      },
    ],
    animation: animation(
      [
        marker('sv', 'player', 'SV', 1),
        marker('a1', 'player', 'A', 2),
        marker('rij', 'player', '·', 3),
        marker('bal', 'ball'),
      ],
      [
        phase('setup', 'Set-up naar 4', 900,
          { sv: at(6.8, 8), a1: at(0.5, 5.5), rij: at(0.2, 3.5), bal: at(6.8, 8) },
          [ball('bal', at(1.6, 8.2), 'set'), move('a1', at(1.4, 6.6))],
        ),
        phase('aanloop', 'Aanloop van buiten naar binnen', 700, {},
          [move('a1', at(1.6, 7.8))],
        ),
        phase('aanval', 'Slaan, diagonaal', 900, {},
          [ball('bal', at(7, 13.5), 'attack')],
        ),
        phase('aansluiten', 'Bal halen en aansluiten', 800, {},
          [move('a1', at(0.2, 4.5)), move('rij', at(0.5, 5.5))],
        ),
      ],
      'full',
    ),
  }),

  builtIn({
    id: 'ingebouwd-rotatie-doorlopen',
    title: 'Rotatie doorlopen',
    summary: 'Zonder bal alle zes de rotaties lopen: opstelling bij service en ontvangst.',
    description:
      'Zes spelers in rotatie 1. Op teken schuiven ze door en zetten ze zichzelf neer in de ' +
      'serveopstelling én de ontvangstopstelling van die rotatie. De trainer roept "wij serveren" of ' +
      '"zij serveren". Pas als het staat, de volgende rotatie.',
    goals: ['positioning', 'tactics'],
    level: 2,
    minutes: 15,
    material: ['net'],
    group: group({ min: 6, max: 6, step: 6, maxGroups: 2 }),
    slots: ['core'],
    coachingPoints: [
      'Weet van wie je vóór en achter moet blijven — dat is de hele regel.',
      'Spelverdeler loopt pas uit als de bal geraakt is.',
      'Zeg hardop welke rotatie het is.',
    ],
    variants: [],
    animation: animation(
      [
        marker('z1', 'player', '1', 1),
        marker('z2', 'player', '2', 2),
        marker('z3', 'player', '3', 3),
        marker('z4', 'player', '4', 4),
        marker('z5', 'player', '5', 5),
        marker('z6', 'player', '6', 6),
      ],
      [
        phase('start', 'Basisopstelling', 1200,
          {
            z1: ZONE.one, z2: ZONE.two, z3: ZONE.three,
            z4: ZONE.four, z5: ZONE.five, z6: ZONE.six,
          },
          [],
        ),
        phase('draaien', 'Doordraaien met de klok mee', 1400, {},
          [
            move('z1', ZONE.six), move('z6', ZONE.five), move('z5', ZONE.four),
            move('z4', ZONE.three), move('z3', ZONE.two), move('z2', ZONE.one),
          ],
        ),
      ],
    ),
  }),

  builtIn({
    id: 'ingebouwd-drie-tegen-drie',
    title: 'Drie tegen drie doorschuiven',
    summary: 'Klein veld, drie tegen drie; winnaar blijft staan. Per drietal.',
    description:
      'Op een half veld drie tegen drie, alleen bovenhands of alles mag. Wie het punt wint blijft ' +
      'staan, de verliezers gaan eruit en het wachtende drietal komt erin. Speel tot vijf punten per ' +
      'ronde. Met negen spelers draait dit vanzelf door.',
    goals: ['tactics', 'defense', 'attack'],
    level: 2,
    minutes: 20,
    material: ['net', 'ballen'],
    group: group({ min: 6, max: 12, step: 3, maxGroups: 1 }),
    slots: ['game'],
    coachingPoints: [
      'Drie keer spelen, ook als het sneller kan.',
      'Roep voordat de bal over is wie hem neemt.',
      'Wachtend drietal staat klaar aan de kant, niet op de bank.',
    ],
    variants: [],
    animation: null,
  }),

  builtIn({
    id: 'ingebouwd-vier-tegen-vier',
    title: 'Vier tegen vier met opdracht',
    summary: 'Wedstrijdvorm op klein veld, met één afspraak per ronde.',
    description:
      'Vier tegen vier over de volle breedte. Elke ronde één opdracht: alleen punt na een aanval van ' +
      'de achterlijn, of eerst drie keer spelen, of elke bal moet door de spelverdeler. Rondes van vijf ' +
      'minuten, daarna een nieuwe opdracht.',
    goals: ['tactics', 'attack', 'defense'],
    level: 2,
    minutes: 20,
    material: ['net', 'ballen'],
    group: group({ min: 8, max: 8, step: 8, maxGroups: 2 }),
    slots: ['game'],
    coachingPoints: [
      'De opdracht is de oefening: zonder opdracht is het gewoon spelen.',
      'Elke rally begint met een service, niet met een ingooi.',
    ],
    variants: [],
    animation: null,
  }),

  builtIn({
    id: 'ingebouwd-zes-tegen-zes',
    title: 'Zes tegen zes met wisselende opdracht',
    summary: 'Volledige wedstrijdvorm; de trainer stuurt met opdrachten en de stand.',
    description:
      'Zes tegen zes met alles erop en eraan. De trainer geeft per ronde een opdracht aan één kant: ' +
      'beginnen op 0-4 achterstand, alleen punten na een verdedigde bal, of elke fout in de service ' +
      'kost twee punten. Zo train je hetzelfde als in een wedstrijd, maar dan gericht.',
    goals: ['tactics', 'positioning', 'attack', 'defense'],
    level: 3,
    minutes: 25,
    material: ['net', 'ballen', 'scorebord'],
    group: group({ min: 12, max: 14, step: 1, maxGroups: 1 }),
    slots: ['game'],
    coachingPoints: [
      'Rally afmaken, ook als hij lelijk is.',
      'Na elke rally kort: wat ging er goed, en door.',
      'Wissel de opdracht op tijd; een opdracht die niet meer werkt kost tijd.',
    ],
    variants: [
      {
        id: 'ingebouwd-zes-tegen-zes-wash',
        title: 'Wash-spel',
        description: 'Twee rally’s achter elkaar winnen levert pas een punt op.',
        group: null,
      },
    ],
    animation: animation(
      [
        marker('a1', 'player', '', 1), marker('a2', 'player', '', 2), marker('a3', 'player', '', 3),
        marker('a4', 'player', '', 4), marker('a5', 'player', '', 5), marker('a6', 'player', '', 6),
        marker('b1', 'opponent', ''), marker('b2', 'opponent', ''), marker('b3', 'opponent', ''),
        marker('b4', 'opponent', ''), marker('b5', 'opponent', ''), marker('b6', 'opponent', ''),
        marker('bal', 'ball'),
      ],
      [
        phase('service', 'Service van de overkant', 1100,
          {
            a1: ZONE.one, a2: ZONE.two, a3: ZONE.three, a4: ZONE.four, a5: ZONE.five, a6: ZONE.six,
            b1: at(1.5, 16.5), b2: at(1.5, 10.5), b3: at(4.5, 10), b4: at(7.5, 10.5),
            b5: at(7.5, 16.5), b6: at(4.5, 17), bal: at(4.5, 19.5),
          },
          [ball('bal', at(1.8, 2), 'serve')],
        ),
        phase('pass', 'Pass naar positie 2', 900, {},
          [ball('bal', at(7.5, 7.8), 'pass')],
        ),
        phase('setup', 'Set-up naar 4', 900, {},
          [ball('bal', at(1.6, 8), 'set'), move('a4', at(1.5, 6.8))],
        ),
        phase('aanval', 'Aanval diagonaal', 900, {},
          [move('a4', at(1.6, 7.9)), ball('bal', at(7.4, 14), 'attack')],
        ),
      ],
      'full',
    ),
  }),

  builtIn({
    id: 'ingebouwd-conditie-baan',
    title: 'Baan met sprints en verdedigen',
    summary: 'Vier stations, één minuut per station, in groepjes van twee tot vier.',
    description:
      'Vier stations langs het veld: sprint met richtingsverandering, blokspringen langs het net, ' +
      'verdedigen op ingegooide ballen, en plank. Eén minuut per station, dertig seconden wissel, ' +
      'twee rondes. Per station een groepje.',
    goals: ['conditioning'],
    level: 2,
    minutes: 15,
    material: ['pionnen', 'ballen', 'matje'],
    group: group({ min: 2, max: 4, step: 1, maxGroups: 4 }),
    slots: ['warmup', 'core'],
    coachingPoints: [
      'Techniek blijft staan, ook als het zwaar wordt.',
      'De pauze is onderdeel van de oefening: die duurt echt dertig seconden.',
    ],
    variants: [],
    animation: null,
  }),

  builtIn({
    id: 'ingebouwd-uitlopen',
    title: 'Uitlopen en rekken',
    summary: 'Rustig uitlopen en de afspraken voor de wedstrijd doornemen.',
    description:
      'Twee rondjes rustig uitlopen, daarna staand rekken: kuiten, hamstrings, schouders, onderrug. ' +
      'Ondertussen kort doornemen wat er deze training uitkwam en wat er zaterdag van belang is.',
    goals: ['conditioning'],
    level: 1,
    minutes: 8,
    material: [],
    group: group({ min: 1, max: 20, step: 1, maxGroups: 1 }),
    slots: ['cooldown'],
    coachingPoints: ['Iedereen bij elkaar, ook wie snel klaar is.'],
    variants: [],
    animation: null,
  }),
];

/** De ingebouwde oefening bij een id, als die er is. */
export function builtInById(id: string): Exercise | undefined {
  return BUILT_IN_EXERCISES.find((exercise) => exercise.id === id);
}
