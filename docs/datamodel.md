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

## 8. Gelijktijdigheid

IndexedDB-transacties overleven geen `await`, terwijl operaties als 'start een
rally als er nog geen open rally is' of 'geef deze actie het volgende volgnummer'
nu eenmaal eerst lezen en daarna schrijven. Bij snel tikken — of als de UI
tegelijk opnieuw laadt — leverde dat twee openstaande rally's in één set op.

`src/db/mutex.ts` zet zulke operaties achter elkaar. Vergrendeld zijn:
`rallies.start/complete/reopen/remove`, `actions.append/remove/undoLast`,
`sets.start`, `players.create/createMany` en `teams.findOrCreateOpponent`. De
mutex is niet herintreedbaar: een vergrendelde methode roept geen andere
vergrendelde methode aan (`undoLast` zet daarom zelf de tombstone).

## 9. De app-laag

`src/app` is de enige map die React kent. De opslag komt binnen via
`StoreProvider`; elke geslaagde transactie verhoogt een versienummer, waarop
`useQuery` opnieuw draait. Geen polling, en geen handmatig verversen na elke
actie — ook wijzigingen die via sync binnenkomen, komen zo vanzelf op het scherm.

De invoervolgorde van scherm A zit in `src/app/entry/entryReducer.ts`: een pure
reducer, los van React, zodat de kern van de app te testen is zonder een scherm
te renderen.

## 10. Rotatie en wissels (schema v2)

Twee stores erbij: `lineups` (één startopstelling per set) en `substitutions`.
Meer is er niet nodig, en dat is het punt: **alleen de startopstelling en de
wissels worden vastgelegd, elke rotatiestand daarna wordt berekend.** Zou de
stand per rally worden opgeslagen, dan kan die na een undo of een gecorrigeerde
uitslag uit de pas gaan lopen met de rally's zelf.

De regel (in `domain/rotation.ts`): een team draait door zodra het een rally wint
waarin de tegenstander serveerde. `rallies.start()` schrijft de uitkomst mee in
`Rally.rotationUs`, zodat de analyse per rotatie niets hoeft te herleiden.

Wissels zijn vervangingen op de plek waar de gewisselde speler staat, geldig
vanaf de rally waarin ze worden ingevoerd; terugwisselen is gewoon de omgekeerde
vervanging.

Bestaande wedstrijden uit schema v1 blijven werken: die hebben simpelweg geen
opstelling, en de rotatiekolom in het dashboard blijft dan leeg.

## 11. Analyse

`src/analysis` slaat de geneste wedstrijd eerst plat tot één rij per actie, met
set, rally en rotatie erbij (`toActionRows`). Elke berekening werkt daarna op
dezelfde rijen en filteren is een `Array.filter` — dus wat het dashboard toont
bij 'set 2, rotatie 4' komt gegarandeerd uit dezelfde telling als het totaal.

Wat er wordt gerekend, en waarom zo:

- **Puntpercentage** alleen bij opslag, aanval en block. Een perfecte receptie
  levert geen punt op, alleen een goede uitgangspositie; daar staat het
  positieve percentage (perfect + goed).
- **Rendement** is `(perfect − fout) / totaal`, de gebruikelijke maat in
  volleybal, en dus navertelbaar uit de rally's.
- **Sideout per rotatie**: van de rally's waarin de tegenstander serveerde, het
  aandeel dat wij wonnen. Dit is de reden dat rotatie überhaupt wordt
  bijgehouden.

## 12. Kleurgebruik in de cijfers

De vier kwalificatiekleuren uit de projectbrief (groen, lichtgroen, oranje,
rood) zijn nagerekend op onderscheidbaarheid, ook bij kleurenblindheid. De
oorspronkelijke tinten lagen voor deuteranopie vrijwel op elkaar; de gekozen
waarden halen de norm, met het paar lichtgroen/oranje op de ondergrens. Daarom
staat bij elke kwalificatiekleur ook tekst — op de knoppen, in de pilletjes van
de rally-keten, in de legenda en in de tabel. Kleur draagt de betekenis nooit
alleen.

De zone-heatmap gebruikt één tint in vier stappen (donker → licht), met in elk
vak het aantal en het percentage. Wie de stappen niet uit elkaar houdt, leest de
getallen.

## 13. Live meelezen

Twee apparaten, één wedstrijd: de invoerder op de tribune legt vast, de coach op
de bank kijkt mee. De offline-garantie per apparaat blijft daarbij overeind —
meelezen is een extra bovenop de lokale opslag, nooit een voorwaarde ervoor.

### Waarom een koppelcode

Een browser kan geen server draaien, dus twee tablets kunnen elkaar niet zomaar
vinden op een netwerk. Wat wél kan is een rechtstreekse WebRTC-verbinding. Die
heeft eenmalig een uitwisseling nodig van verbindingsgegevens, en juist daarvoor
is normaal een server nodig. Die stap doen hier de mensen zelf: de invoerder
toont een code, de meelezer plakt hem en geeft een antwoordcode terug.

Er wordt bewust géén STUN-server geconfigureerd. Die zou internet vereisen en
voegt op een lokaal netwerk niets toe: de kandidaten die overblijven zijn de
adressen binnen het eigen netwerk, precies wat een sporthal-wifi of een hotspot
oplevert.

Alle ICE-kandidaten gaan in één code ('vanilla ICE') in plaats van los nagestuurd
te worden — er is immers nog geen kanaal om ze over na te sturen.

### Wie doet wat

- **`PeerHost`** (invoerder) luistert op de store: elke geslaagde transactie gaat
  meteen naar de gekoppelde apparaten. Op een `pull` antwoordt hij met alles van
  deze wedstrijd dat nieuwer is dan de cursor van de vrager.
- **`PeerClient`** (meelezer) is gewoon een `SyncTransport`, dus de bestaande
  engine doet het werk: opnieuw proberen, afbouwen, nooit blokkeren. Daarbovenop
  verwerkt hij ongevraagd binnenkomende wijzigingen — dat is wat meelezen live
  maakt.

Er is geen apart wijzigingslogboek nodig: revisies zijn sorteerbaar, dus 'alles
nieuwer dan deze cursor' is een filter over de records van de wedstrijd. Een
meelezer die tussendoor de verbinding kwijtraakt, haalt bij het opnieuw koppelen
alleen op wat hij miste.

De laag eronder — het `PeerChannel`-contract — weet niets van WebRTC. In tests
draait dezelfde logica over twee functies in het geheugen, en het echte pad is
nagelopen met twee losse browsercontexten die over een datakanaal koppelden.

### Rolkeuze

De rol staat per wedstrijd in `meta` (`device.role.<matchId>`), niet per
apparaat: dezelfde tablet kan de ene wedstrijd invoeren en de volgende meelezen.
Het meeleesscherm schrijft niets aan de wedstrijddata — geen openstaande rally,
geen acties — en dat is als test vastgelegd.

## 14. Opponent-dossier

Het dossier telt op over alle wedstrijden tegen dezelfde tegenstander
(`matches.by_opponent`) en gebruikt verder dezelfde analysefuncties als het
dashboard. Het datamodel hoefde er niet voor te wijzigen: een tegenstander was al
een gewoon team met een eigen id, en daar hangen de wedstrijden aan.

De projectbrief vraagt om bevindingen die "puur afgeleid zijn uit tellingen, geen
giswerk". Dat is hier op drie manieren afgedwongen:

1. **Een ondergrens.** Onder de twaalf waarnemingen wordt een patroon niet
   genoemd, hoe sterk het er ook uitziet. Vier aanvallen uit zone 4 zijn geen
   voorkeur, en het scherm zegt dat ook met zoveel woorden.
2. **Het aantal staat erbij.** Elke bevinding draagt zijn eigen `sample`, en het
   scherm toont die naast de tekst. Zo kan een coach zelf wegen hoe hard iets is.
3. **Advies is een vertaling, geen toevoeging.** Elk advies verwijst naar precies
   één bevinding en wordt alleen gegenereerd als die bevinding er is. Er kan dus
   geen advies op het scherm staan zonder telling eronder — een test bewaakt dat.

De drempels zelf (40% voor een zoneconcentratie, 20% voor aanvalsfouten, en zo
verder) staan bij elkaar bovenin `analysis/opponent.ts`, zodat ze te verstellen
zijn zonder de rest aan te raken.

## 15. Wat hier bewust nog niet zit

- Meerdere gelijktijdige invoerders (v5): `PeerHost` verwerkt al een binnenkomende
  `push`, dus een tweede invoerder is vooral een kwestie van UI en van afspreken
  wie wat invoert.
- Video-invoer: `Action.videoTimestampMs` ligt klaar in het model, maar er is nog
  geen scherm dat een video naast de invoer zet.
