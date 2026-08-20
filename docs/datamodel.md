# Datamodel en offline-opslag

Achtergrond bij de keuzes in `src/domain`, `src/db` en `src/sync`. De projectbrief
is leidend; dit document legt vast *hoe* die eisen in het model landen.

## 1. De keten

```
Team ──┬── Player
       │
Match ──── MatchSet (1-5) ──── Rally ──── Action
```

Een actie staat nooit op zichzelf: hij hangt aan een rally, die aan een set, die
aan een wedstrijd hangt. Elke actie draagt óók `setId` en `matchId`. Dat is
bewuste redundantie: het analysedashboard filtert op set en het opponent-dossier
op wedstrijd, en beide willen dat via één index kunnen doen in plaats van via
drie opzoekingen.

### Velden per entiteit

| Entiteit | Kern | Bijzonderheden |
|---|---|---|
| `Team` | `name`, `isOwnTeam` | Tegenstanders zijn gewone teams; daarop hangt het dossier over meerdere wedstrijden. |
| `Player` | `teamId`, `number`, `name` | Rugnummer uniek binnen een team. |
| `Match` | `date`, `ownTeamId`, `opponentTeamId`, `homeAway`, `status` | Eindstand per set staat op de sets, niet hier — anders twee waarheden. |
| `MatchSet` | `setNumber`, `pointsUs`, `pointsThem`, `startingServe` | Stand wordt herberekend, zie §4. |
| `Rally` | `sequence`, `servingTeam`, `wonBy`, `pointsUsAfter/ThemAfter` | `wonBy: null` betekent: rally loopt nog. |
| `Action` | `sequence`, `team`, `playerId`, `type`, `zoneFrom`, `zoneTo`, `quality` | `playerNumber` staat er los bij: bij de tegenstander ken je vaak wél het nummer en niet de speler, en een export blijft zo leesbaar. |

Elk record draagt daarnaast `rev`, `updatedBy`, `createdAt`, `updatedAt` en
`deletedAt`.

## 2. Protocolregels in code

`src/domain/rules.ts` vertaalt het scoutingprotocol naar controles, in twee
niveaus:

- **error** — schendt het model, wordt niet opgeslagen (vertrekzone ontbreekt bij
  opslag of aanval; ongeldige zone; actie in een al afgeronde rally).
- **warning** — kan kloppen, maar wijkt af (opslag die niet de eerste actie is,
  receptie na een ace, block op de eigen aanval).

De invoerder houdt het laatste woord bij warnings. Blokkeren waar het protocol
geen ruimte laat, waarschuwen waar het dat wel doet.

**Toewijzingsregel.** Een actie hoort bij de speler die de bal als laatste
redelijkerwijs kon beïnvloeden. Na een ace komt er geen aparte receptie: de
perfecte opslag beëindigt de rally, dus een receptie erna wordt geweigerd — met
de uitleg erbij dat de opslag anders 'goed' of 'matig' had moeten zijn.

**Rally-uitslag.** `rallyOutcomeFor()` leidt de uitslag af uit de laatste actie:
`fout` is een punt tegen, `perfect` bij opslag, aanval of block is een punt voor.
Een perfecte receptie of toets levert geen punt op en laat de rally doorlopen.
Bij alles daartussen kiest de invoerder zelf 'punt wij' of 'punt zij'.

## 3. Kwalificatiecriteria als data

`src/domain/protocol.ts` bevat de tabellen uit `scoutingprotocol.docx`: per
actietype, per kwalificatie een objectief criterium plus het voorbeeld uit het
document. Daarmee zijn de tooltips uit schermontwerp A geen losse teksten in een
component maar afgeleiden van één bron.

`PROTOCOL_VERSION` gaat mee in elke export. Het protocol mag volgens het document
niet halverwege een seizoen wijzigen; door de versie mee te exporteren is later
altijd te zien onder welke definities een wedstrijd is ingevoerd.

## 4. Setstand: herberekenen, niet optellen

De stand van een set wordt bij elke wijziging opnieuw geteld uit de afgeronde
rally's. Optellen zou drift opleveren zodra een rally wordt teruggedraaid, een
uitslag wordt gecorrigeerd of twee apparaten dezelfde set bijwerken. Herberekenen
kost een handvol records per set en levert altijd hetzelfde antwoord.

Om dezelfde reden staat `pointsUsAfter` op de rally: de stand ná die rally is een
momentopname die uit dezelfde telling rolt, niet een tweede boekhouding.

## 5. Opslag

IndexedDB, benaderd via `idb`. Zes stores voor domeinrecords, plus `outbox` en
`meta`.

Indexen zijn gekozen op de vragen die de app straks echt stelt:

- `actions.by_rally_sequence` — de rally-keten bovenin het invoerscherm.
- `actions.by_match_type`, `actions.by_player` — dashboard per speler en per
  actietype.
- `matches.by_opponent` — het opponent-dossier.
- `rallies.by_set_sequence` — verloop van een set.

**Elke schrijfactie is één transactie** waarin het record, de outbox-regel én de
klokstand samen worden weggeschreven (`src/db/mutations.ts`). Er kan dus geen
actie in de database staan die de sync nooit meeneemt, en andersom ook niet.

## 6. Sync

### Identiteit en volgorde

- **UUID's** voor elk record: offline aanmaken zonder centrale nummering.
- **Hybride logische klok** (`src/domain/clock.ts`) voor `rev`: monotoon binnen
  een apparaat, lexicografisch sorteerbaar, met device-id als tiebreak. Een
  tablet die zijn tijd corrigeert of een paar seconden voorloopt, verstoort de
  volgorde niet.

### Samenvoegen

Last-writer-wins op `rev`, per record (`src/sync/merge.ts`). Dat is hier geen
compromis: acties zijn onveranderlijk en undo is een tombstone, dus twee
apparaten die tegelijk invoeren produceren twee losse acties — nooit een half
overschreven actie. Alleen bij bewerkbare records (wedstrijdgegevens, spelers)
kan een echte botsing ontstaan, en daar is 'de laatste wint' de verwachte
uitkomst.

Binnengehaalde wijzigingen gaan **niet** de outbox in; anders zou een wijziging
eeuwig heen en weer blijven kaatsen tussen twee apparaten.

### De engine

`SyncEngine` doet per ronde eerst push, dan pull, en werpt nooit. Bij een
mislukking blijft alles in de outbox staan, verdubbelt de wachttijd tot een
maximum, en gaat de app normaal door. Bij het `online`-event probeert hij meteen
opnieuw.

`matchId`-scope beperkt het verkeer tot de wedstrijd die op beide apparaten open
staat; teams en spelers gaan altijd mee, anders mist het meelees-apparaat namen
en rugnummers.

### Transport

`SyncTransport` is het enige wat een verbinding hoeft te implementeren:

```ts
push({ deviceId, changes }): Promise<{ acceptedRevs }>
pull({ deviceId, cursor, matchId }): Promise<{ changes, cursor, hasMore }>
```

`LoopbackHub` implementeert dat in het geheugen: een append-only log met een
cursor per apparaat. Daarmee draaien de tests het volledige sync-pad zonder
server, en ligt meteen vast wat de relay over het lokale netwerk (v3) moet doen.
Een cloud-transport is dezelfde twee methodes over HTTP.

## 7. Export

- **JSON** is canoniek: codes blijven zoals ze in het model staan (`attack`,
  `poor`), met formaat- en protocolversie erbij.
- **CSV** is voor Excel: Nederlandse koppen en labels, één regel per actie, met
  wedstrijd-, set- en rallycontext in elke regel. De id-kolommen koppelen elke
  regel terug aan de JSON.

Geen van beide is een eigen gesloten formaat — data mag nooit vastzitten in de
app.

## 8. Wat hier bewust nog niet zit

- Service worker en manifest: die horen bij de app-shell, en die komt met de UI.
- Rotatie- en wisselbeheer (v2): `Rally.rotationUs` is er al als aanknopingspunt.
- Berekeningen voor dashboard en opponent-dossier (v2/v4): die lezen straks uit
  `loadMatchBundle()` en de bestaande indexen; het model hoeft er niet voor te
  wijzigen.
