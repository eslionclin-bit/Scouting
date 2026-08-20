/**
 * Serialiseert schrijfoperaties die eerst lezen en daarna schrijven.
 *
 * IndexedDB-transacties kunnen niet over een `await` heen blijven bestaan, dus
 * operaties als 'start een rally als er nog geen open rally is' of 'geef deze
 * actie het volgende volgnummer' zijn niet vanzelf veilig. Bij snel tikken —
 * of als de UI tegelijk opnieuw laadt — leverde dat twee open rally's op.
 * Deze mutex zet zulke operaties achter elkaar.
 *
 * Niet herintreedbaar: een vergrendelde methode mag geen andere vergrendelde
 * methode aanroepen.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    // De keten mag niet breken op een mislukte operatie: de volgende in de rij
    // moet gewoon aan de beurt komen.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
