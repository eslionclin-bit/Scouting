/**
 * Wie er passt — de sideout-opstelling.
 *
 * De rotatie zegt waar iedereen moet stáán; bij de service zegt hij niet wie de
 * bal aanneemt. Die twee lopen uiteen, en op één punt in het bijzonder: de
 * passer-loper die vooraan staat past in vrijwel alle gevallen mee. Een veld
 * dat alleen de rotatiepositie laat zien, laat dus precies de vraag open die de
 * invoerder op dat moment heeft.
 *
 * Wat hier gebeurt is geen tweede opstelling naast de eerste — de zes staan waar
 * ze staan, anders klopt de rotatie niet meer. Het is een markering: van deze
 * zes zijn dít degenen die de bal aannemen.
 *
 * De regels, in de volgorde waarin ze gelden:
 *
 *  1. **De libero past altijd.** Daar staat ze voor in het veld.
 *  2. **De passer-lopers passen**, voor én achter. Dit is het geval waar het om
 *     begon.
 *  3. **De spelverdeelster past niet.** Zij moet naar de bal toe.
 *  4. **Midden en diagonaal passen niet**, tenzij er anders te weinig overblijft.
 *
 * Blijven er na regel 1 tot en met 4 minder dan twee passers over, dan is de
 * afleiding kennelijk niet vertrouwd — bijvoorbeeld omdat niemand een positie
 * heeft ingevuld. Dan vallen we terug op de achterlijn, want dat is waar in elk
 * systeem gepast wordt.
 */

import type { PlayerRole, Zone } from './types';
import { ZONES } from './types';
import { BACK_ZONES } from './zones';

export interface ReceptionOptions {
  /** Welke posities een speelster kan spelen. */
  rolesOf?: (playerId: string) => readonly PlayerRole[];
  /** De libero van deze set, als die er is en in het veld staat. */
  liberoId?: string | null;
  /**
   * De afspraak van deze wedstrijd: wie er passen.
   *
   * Dit gaat vóór alle afleiding hieronder. Die afleiding is een gok, en zonder
   * ingevulde posities valt hij terug op de achterlijn — waardoor de diagonaal
   * als passer in beeld kwam terwijl ze dat niet is. Een afspraak die je één
   * keer maakt, hoort te winnen van een gok.
   */
  receiverIds?: readonly string[] | null;
}

/** Minder dan dit aan passers is geen aannamesysteem maar een gat in de gegevens. */
const MIN_RECEIVERS = 2;

export function receiversFor(
  positions: Record<Zone, string | null>,
  options: ReceptionOptions = {},
): string[] {
  const onCourt = ZONES.map((zone) => positions[zone]).filter(
    (id): id is string => id !== null,
  );

  // Is het afgesproken, dan hoeft er niets afgeleid te worden. De libero telt
  // altijd mee: daar staat ze voor in het veld.
  const agreed = options.receiverIds;
  if (agreed && agreed.length > 0) {
    const picked = onCourt.filter(
      (playerId) => playerId === options.liberoId || agreed.includes(playerId),
    );
    if (picked.length >= MIN_RECEIVERS) return picked;
  }

  const rolesOf = options.rolesOf;

  if (rolesOf) {
    const receivers = onCourt.filter((playerId) => {
      if (playerId === options.liberoId) return true;
      const roles = rolesOf(playerId);
      if (roles.includes('libero')) return true;
      if (roles.includes('outside')) return true;
      return false;
    });
    if (receivers.length >= MIN_RECEIVERS) return receivers;
  }

  return BACK_ZONES.map((zone) => positions[zone]).filter((id): id is string => id !== null);
}

/**
 * Wie een service in deze zone waarschijnlijk aannam — of niemand.
 *
 * Twee dingen heten 'positie' en ze lopen uiteen zodra de bal geraakt is. Bij de
 * service staat iedereen in zijn rotatievak; dat is de regel, en daarom klopt
 * 'we serveren op positie 5, daar staat #38' gewoon. Maar daarna lopen ze naar
 * hun eigen plek — spelverdeler rechts, passer-lopers links, libero linksachter
 * — en dan zegt het rotatievak niets meer over wie de bal aanneemt.
 *
 * Vandaar deze voorwaarde: een naam alleen als degene die daar stond ook echt
 * meepast. Bij een korte service op de voorlijn staat daar vaak de spelverdeler
 * of de diagonaal, en die neemt hem niet aan. Dan blijft het leeg, en dat is
 * eerlijker dan een naam die verzonnen is.
 */
export function receiverForZone(
  positions: Record<Zone, string | null>,
  zone: Zone,
  options: ReceptionOptions = {},
): string | null {
  const occupant = positions[zone];
  if (!occupant) return null;
  return receiversFor(positions, options).includes(occupant) ? occupant : null;
}
