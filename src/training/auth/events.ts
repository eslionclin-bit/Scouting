/**
 * De naam van het bericht dat rondgaat als de sessie niet meer geldig is.
 *
 * Staat apart zodat het delen (dat het merkt) en de inlog (die erop reageert)
 * niet naar elkaar hoeven te verwijzen. Twee bestanden die elkaar importeren
 * werkt in TypeScript, maar levert in de browser een lege constante op als de
 * volgorde toevallig verkeerd uitpakt — en dat is dan een fout die alleen in de
 * gebouwde app te zien is.
 */
export const AUTH_EXPIRED_EVENT = 'volley-training:sessie-verlopen';
