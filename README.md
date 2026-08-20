# Volleybal scouting-app

Offline-first scouting-app voor volleybal: rally's actie-voor-actie invoeren op een
tablet in de sporthal, zonder internet, met synchronisatie zodra er weer een
netwerk is.

Deze eerste fase bevat **het datamodel, de lokale opslag en de sync-laag** — nog
geen UI. Dat is bewust: het invoerscherm, het dashboard en het opponent-dossier
leunen alle drie op dezelfde structuur, en die moet eerst kloppen.

## Aan de slag

```bash
npm install
npm test        # 42 tests: domein, opslag, sync tussen twee apparaten, export
npm run typecheck
```

## Wat er nu staat

| Laag | Map | Verantwoordelijk voor |
|---|---|---|
| Domein | `src/domain` | Types, scoutingprotocol, validatieregels, zonelogica, logische klok |
| Opslag | `src/db` | IndexedDB-schema, transacties, repositories per entiteit |
| Sync | `src/sync` | Outbox, samenvoegen (LWW), sync-engine, transport-contract |
| Export | `src/export` | JSON (canoniek) en CSV (voor Excel) |

De UI hoort straks alleen `src/index.ts` te importeren.

### Een wedstrijd invoeren, in code

```ts
import { ScoutingStore } from './src';

const store = await ScoutingStore.open();

const ons = await store.teams.create({ name: 'Onze ploeg', isOwnTeam: true });
const tegen = await store.teams.findOrCreateOpponent('VC Tegenpartij');
const [sanne] = await store.players.createMany([{ teamId: ons.id, number: 4, name: 'Sanne' }]);

const match = await store.matches.create({
  date: '2026-09-12',
  ownTeamId: ons.id,
  opponentTeamId: tegen.id,
  homeAway: 'home',
  status: 'live',
});
const set = await store.sets.start({ matchId: match.id, startingServe: 'us' });

const rally = await store.rallies.start({ setId: set.id });
await store.actions.append({
  rallyId: rally.id,
  team: 'us',
  type: 'serve',
  quality: 'perfect', // ace
  playerId: sanne.id,
  zoneFrom: 1,
});

await store.rallies.complete(rally.id); // uitslag volgt uit de laatste actie
await store.actions.undoLast(rally.id); // undo per actie
await store.rallies.remove(rally.id);   // undo per rally
```

### Tooltips uit het protocol

De kwalificatiecriteria uit `scoutingprotocol.docx` staan als data in
`src/domain/protocol.ts`. De invoer-UI haalt zijn tooltip-teksten daar op, zodat
er één bron is voor wat 'goed' en 'matig' betekenen:

```ts
tooltipFor('attack', 'good');
// { title: 'Aanval — Goed', principle: '...', criterion: '...', example: '...' }
```

### Synchronisatie

`SyncEngine` praat met een `SyncTransport`. Er zit één transport in de repo:
`LoopbackHub`, een hub in het geheugen die de tests draait en de vorm vastlegt
die de latere relay over het lokale netwerk (v3, live meelezen) moet aannemen.

```ts
const engine = new SyncEngine(store, hub.transport(), { matchId: match.id });
engine.start(); // probeert periodiek en meteen bij 'online'
```

Mislukt een ronde, dan blijft alles in de outbox staan, loopt de wachttijd
exponentieel op en gaat invoeren gewoon door.

## Ontwerpkeuzes

Uitgebreid toegelicht in [`docs/datamodel.md`](docs/datamodel.md). Kort:

- **UUID's, geen autonummering** — twee tablets offline mogen nooit botsen.
- **Hybride logische klok** in plaats van `Date.now()` — tablets lopen uiteen.
- **Tombstones, geen echte verwijderingen** — anders komt een undo bij de
  volgende sync gewoon weer terug.
- **Acties zijn onveranderlijk** — corrigeren is undo + opnieuw invoeren. Daarmee
  kunnen twee apparaten niet over dezelfde actie in conflict komen.
- **Setstand wordt herberekend** uit de afgeronde rally's, nooit opgeteld.
- **Volledige records in de outbox**, geen delta's — herverzenden is daardoor
  ongevaarlijk.

## Volgende stap

Fase v1 uit de projectbrief: het rally-invoerscherm als PWA (app-shell,
service worker, manifest) bovenop deze laag.
