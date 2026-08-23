/**
 * Wat de app zelf al weet en dus niet hoeft te vragen.
 *
 * De kwalificatieschaal loopt in dit protocol altijd vanuit het eigen team (zie
 * `protocol.ts`): bij een service betekent 'goed' dat de tegenstander eronder
 * lijdt. Dat oordeel gáát dus al over hun pass. Er daarna nog eens apart om hun
 * pass vragen is dezelfde bal twee keer kwalificeren — en het is precies wat er
 * eerder ook bij hun verdediging na onze aanval gebeurde.
 *
 * Dus leidt de app hem af. Waar de bal heenging staat al vast (de doelzone van
 * onze service), wie daar stond volgt uit hun rotatie, en hoe de pass uitpakte
 * is het spiegelbeeld van onze servicekwalificatie. Nul extra tikken, en de
 * tabel 'wie er slecht past' vult zich alsnog.
 *
 * Een afgeleide actie draagt `derived: true`. Dat is geen detail: wie een
 * cijfer voor zich krijgt hoort te kunnen zien of iemand het heeft gezien of
 * dat de app het heeft uitgerekend.
 */

import type { Action, Quality, Zone } from './types';

/**
 * Hun pass, gespiegeld uit onze servicekwalificatie.
 *
 * - `perfect` staat er niet bij: dat is een ace, de rally is voorbij en het
 *   protocol registreert er geen pass bij.
 * - `error` evenmin: een servicefout betekent dat er niets te passen viel.
 * - `good` (zij komen onder druk) wordt bij hen `poor`: de bal bleef in het
 *   spel maar er kon weinig mee.
 * - `poor` (geen druk) wordt bij hen `good`. Bewust niet `perfect`: dat de
 *   service niets deed, betekent nog niet dat hun pass op de centimeter was, en
 *   dat kunnen we van deze kant ook niet zien.
 */
const MIRRORED: Partial<Record<Quality, Quality>> = {
  good: 'poor',
  poor: 'good',
};

export interface DerivedReception {
  team: 'them';
  type: 'reception';
  quality: Quality;
  playerId: string | null;
  playerNumber: number | null;
  zoneFrom: Zone;
  zoneTo: null;
  derived: true;
}

export interface ReceiverAt {
  playerId: string | null;
  playerNumber: number | null;
}

/**
 * De pass van de tegenstander die volgt uit onze service.
 *
 * Levert `null` op zodra er iets ontbreekt of niets te passen viel; de app
 * verzint dan niets en vraagt ook niets — er is gewoon geen pass.
 */
export function receptionFromServe(
  serve: Pick<Action, 'team' | 'type' | 'quality' | 'zoneTo'>,
  receiver: ReceiverAt = { playerId: null, playerNumber: null },
): DerivedReception | null {
  if (serve.team !== 'us' || serve.type !== 'serve') return null;
  if (serve.zoneTo === null) return null;
  const quality = MIRRORED[serve.quality];
  if (!quality) return null;
  return {
    team: 'them',
    type: 'reception',
    quality,
    playerId: receiver.playerId,
    playerNumber: receiver.playerNumber,
    zoneFrom: serve.zoneTo,
    zoneTo: null,
    derived: true,
  };
}
