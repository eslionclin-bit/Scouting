# De trainingsapp

Naast de scouting-app staat in deze repo een tweede app: **trainingen maken**.
Hij draait op `/training.html`, heeft zijn eigen database en zijn eigen server,
en deelt met de scouting-app alleen de bouwstenen — ids, de logische klok, de
build en de tests.

Waarom in dezelfde repo: het zijn twee kanten van hetzelfde seizoen, gemaakt
voor dezelfde persoon, en ze delen genoeg gereedschap dat twee losse projecten
alleen maar dubbel onderhoud zouden opleveren. Waarom niet één app: wie een
training voorbereidt is niet bezig met wedstrijdinvoer, en omgekeerd. Twee
ingangen, twee iconen op het beginscherm, geen gedeelde toestand.

## Waar de app om draait

Een oefening is niet 'voor zes spelers'. Hij werkt vanaf vier tot en met tien,
in stappen van één — of, bij een oefening in drietallen, alleen met drie, zes of
negen. Dat staat in het model:

```ts
interface GroupSpec {
  min: number;        // kleinste werkbare groep
  max: number;        // grootste werkbare groep
  step: number;       // 3 = alleen drietallen, 1 = elk aantal
  maxGroups: number;  // hoe vaak dit naast elkaar kan (ruimte in de zaal)
  roles: RoleRequirement[]; // bv. één spelverdeler per groep
}
```

Met het aantal aanwezigen erbij rekent `src/training/domain/grouping.ts` uit
hoeveel groepen er draaien, hoe groot ze zijn, wie er begint en wie er wachten.
De keuzeregel, in deze volgorde:

1. zoveel mogelijk mensen tegelijk aan het werk;
2. daarna liever meer kleine groepen dan één grote — meer balcontacten per speler;
3. daarna zo gelijk mogelijke groepen.

Vraagt een oefening om posities, dan worden die eerst rondgedeeld: bij twee
groepen die elk een spelverdeler nodig hebben, komen de twee spelverdelers niet
samen in dezelfde groep. Ontbreken ze, dan zegt de app dat — hij lost het niet
stilletjes op.

Blijven er mensen over, dan maakt de app een wisselschema: elke beurt schuift de
lijst op met het aantal spelende plekken, zodat na een paar beurten iedereen
even vaak aan de beurt is geweest. Op het trainingsblad staat om de hoeveel
minuten er gewisseld wordt.

## Het datamodel

```
Team ─┬─ Speler (naam, rugnummer, posities, in/uit de selectie)
      │
Oefening (doelen, niveau, duur, materiaal, GroupSpec, coachpunten,
          varianten, animatie, zichtbaarheid)
      │
Training ── Blok ──> verwijst naar een oefening
      │       (warming-up / kern / wedstrijdvorm / afsluiting, minuten, notitie)
      └── aanwezigheid: wie er zijn en wie zich hebben afgemeld
      │
Reeks ── trainingen over een periode, met accenten per periode
Groep ── trainers die oefeningen, trainingen en reeksen delen
```

Elk record draagt sync-metadata (`rev`, `updatedAt`, `deletedAt`) van de hybride
logische klok uit `src/domain/clock.ts`, precies zoals de scouting-app.
Verwijderen is een tombstone.

## Animaties

Een animatie is een rij fases. Elke fase zegt waar de poppetjes en de bal staan
als de fase begint, en welke verplaatsingen erin gebeuren. Wat een fase niet
noemt, blijft staan waar het stond — bij zes fases hoef je dus niet zes keer
alles in te tikken.

De tijd zit in het model en niet in CSS. Daardoor gebruikt alles hetzelfde
rekenwerk: afspelen op het scherm, stap voor stap doorklikken tijdens het
uitleggen, en de rij stilstaande plaatjes op het trainingsblad en op papier.

Coördinaten zijn meters: x van 0 tot 9 (breedte), y van 0 tot 18 (lengte), net
op y = 9. Buiten het veld mag — de serviceplek ligt op y = −1,5.

De bewerker werkt met een vinger: poppetje neerzetten, verslepen, fase erbij.
Ook de pijlpunten zijn te pakken, want een pad is niets anders dan een marker
die ergens heen gaat.

## Delen: scopes in plaats van accounts

Er zijn geen accounts, net als bij de sync van de scouting-app. In plaats
daarvan gaat een record naar de scopes die zijn zichtbaarheid noemt:

| Zichtbaarheid | Waar het heen gaat |
|---|---|
| **Privé** | nergens heen — het apparaat verlaat het nooit |
| **Groep** | de scope van elke genoemde groep (een gedeelde code) |
| **Openbaar** | één vaste, openbare bak |

Een groepscode is twintig tekens die de app zelf maakt, uit een alfabet zonder
`i`, `l`, `o`, `0` en `1` — te dicteren over de telefoon. De server bewaart de
code niet: hij rekent er een SHA-256 over en gebruikt die als kolom. Wie de code
heeft hoort erbij; er valt niets aan te maken en niets te beheren, en een
gestolen database levert geen toegang op.

Teams en spelers hebben geen zichtbaarheid en worden dus nooit verstuurd. De
server weigert ze bovendien zelf, zodat een fout in de app geen namenlijst kan
lekken.

**Openbaar is openbaar.** Iedereen met het adres van dezelfde deelserver kan
openbare oefeningen lezen én er zelf in schrijven. Dat is de prijs van 'geen
accounts', en de app zegt dat ook op het deelscherm.

Ingebouwde bankoefeningen staan in de code, niet in de database. Ze zijn er dus
meteen bij een lege installatie en gaan nooit de deur uit. Wil je er iets aan
veranderen, dan maakt de app een kopie met jouw naam erop.

## De server

`server/training/worker.js` is een Cloudflare Worker met twee eindpunten,
`POST /share/push` en `POST /share/pull`, en één tabel. De outbox, het opnieuw
proberen en het samenvoegen op revisie zitten in de app en horen daar te
blijven: die moet ook werken als er geen server te bereiken is.

Uitrollen gaat via de workflow `.github/workflows/sync-server.yml`, die naast de
sync-server van de scouting-app ook deze deelserver meeneemt zodra het secret
`CLOUDFLARE_TRAINING_D1_ID` bestaat. Het adres van de worker vul je in de app in
op de beheerpagina; zonder adres blijft alles op het apparaat en werkt de rest
gewoon.

## Wat waar staat

| Map | Verantwoordelijk voor |
|---|---|
| `src/training/domain` | Types, groepsverdeling, filters, trainingsplan, reeksen, animatiemodel |
| `src/training/db` | IndexedDB-schema, collecties, outbox, profiel en instellingen |
| `src/training/sync` | Scopes, deel-engine, transport (server of in het geheugen) |
| `src/training/bank` | De ingebouwde oefeningen, en kopiëren naar je eigen bank |
| `src/training/app` | Schermen, veld- en animatiecomponenten, stijl |
| `server/training` | De deelserver |

## Wat er nog niet is

- **Alleen tekstuele evaluatie per training.** Wat een oefening opleverde wordt
  nergens geteld; koppeling met de scoutingdata (traint deze ploeg wel waar ze
  punten op verliest?) zou kunnen, maar is bewust nog niet gemaakt.
- **Geen ledenbeheer in een groep.** Wie de code heeft, hoort erbij. Iemand
  eruit zetten betekent een nieuwe code maken en die opnieuw doorgeven.
- **Geen conflictafhandeling met de hand.** Twee trainers die dezelfde gedeelde
  training tegelijk aanpassen: de laatste schrijver wint, zoals overal in deze
  repo.
