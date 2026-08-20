# Volleybal scouting-app

Offline-first scouting-app voor volleybal: rally's actie-voor-actie invoeren op een
tablet in de sporthal, zonder internet, met synchronisatie zodra er weer een
netwerk is.

Wat er nu draait: **v1 en v2** — het rally-invoerscherm en het analysedashboard,
inclusief rotatie- en wisselbeheer, bovenop een datamodel, lokale opslag en
sync-laag. Installeerbaar op een tablet, en volledig bruikbaar zonder verbinding.

## Aan de slag

```bash
npm install
npm run dev     # ontwikkelserver
npm run build   # typecheck + productiebuild inclusief service worker
npm test        # 74 tests: domein, opslag, sync, rotatie, analyse, schermen, export
```

## Wat er nu staat

| Laag | Map | Verantwoordelijk voor |
|---|---|---|
| Domein | `src/domain` | Types, scoutingprotocol, validatieregels, zonelogica, logische klok |
| Opslag | `src/db` | IndexedDB-schema, transacties, repositories per entiteit |
| Sync | `src/sync` | Outbox, samenvoegen (LWW), sync-engine, transport-contract |
| Analyse | `src/analysis` | Tellingen per speler, actietype, zone en rotatie |
| Export | `src/export` | JSON (canoniek) en CSV (voor Excel) |
| App | `src/app` | React-schermen, invoerstroom, PWA-registratie |

## De schermen

**Startscherm** — wedstrijden openen of een nieuwe beginnen, en per wedstrijd
exporteren naar JSON of CSV. Staat er nog iets in de outbox, dan zie je dat hier.

**Nieuwe wedstrijd** — eigen team met spelers, tegenstander, datum, thuis/uit en
wie begint met serveren. Een bestaand eigen team wordt voorgevuld, zodat er
meestal alleen nog een tegenstander hoeft te worden ingetikt.

**Rally-invoer (scherm A)** — het scherm waar het tijdens de wedstrijd om draait:

- bovenin set, stand en de rally-keten als pilletjes met pijltjes ertussen;
- daaronder de vaste volgorde actie → speler → zone → kwalificatie, waarbij de
  actieve stap oplicht;
- de vier kwalificatieknoppen zijn kleurgecodeerd en tonen het criterium uit het
  protocol; lang indrukken opent de volledige uitleg met voorbeeld;
- onderaan 'punt wij' / 'punt zij', stap terug, undo actie en undo rally.

Twee dingen nemen werk uit handen tijdens live invoer: na een opslag zet de app
de receptie van de tegenpartij klaar (en zo verder door de keten), en een actie
die de rally volgens het protocol beëindigt — een fout, een ace, een kill —
rondt de rally meteen af en zet de opslag van de winnaar klaar.

Undo werkt over de rallygrens heen: is de nieuwe rally nog leeg, dan wordt de
vorige rally heropend en dáár de laatste actie teruggedraaid.

**Opstelling en wissels** — via de knop 'Opstelling' in het invoerscherm. Je zet
alleen de zes van het begin van de set neer; welke speler tijdens rally 34 in
zone 3 staat, rekent de app zelf uit. De rotatiestand staat in de kop van het
scherm en wordt bij elke rally meegeschreven, zodat er geen rotatielijst op
papier naast hoeft te bestaan. Een wissel geldt vanaf de rally waarin hij wordt
ingevoerd.

**Analysedashboard (scherm B)** — bereikbaar vanaf het startscherm en vanuit de
invoer ('Cijfers'):

- filters voor set, rotatie en speler in één rij, geldig voor het hele scherm;
- kerncijfers: punten, aanvalsrendement en sideout-percentage;
- een tabel per speler en per actietype, met de verdeling over de vier
  kwalificaties ernaast;
- zone-heatmaps voor aanval en opslag, eigen team en tegenstander apart;
- een rotatietabel met sideout per rotatie — de plek waar een patroon als
  'in R4 komen we er niet uit' zichtbaar wordt.

Elk getal is een telling uit de ingevoerde acties, geen schatting.

### Dezelfde stappen in code

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

### Offline en installeerbaar

De service worker (via `vite-plugin-pwa`) cachet de app-shell, dus de app start
ook op zonder enige verbinding; de wedstrijddata staat toch al in IndexedDB. Op
een tablet is de app te installeren als icoon op het startscherm, zonder
appstore-traject. Een wedstrijd die openstond, wordt bij het opnieuw openen
hervat.

## Volgende stap

Fase v3 uit de projectbrief: live meelezen tussen invoerder en coach over het
lokale netwerk. Het transport-contract en de sync-engine liggen er al; wat nog
ontbreekt is een relay over het lokale netwerk en het meelees-scherm met de
rolkeuze.
