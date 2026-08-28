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

De bewerker werkt met een vinger, en met één schakelaar die bepaalt wat slepen
betekent:

- **Neerzetten** — je sleept iemand naar de plek waar hij in deze fase begint.
- **Laten bewegen** — je sleept iemand naar waar hij in deze fase heen gaat, en
  de app tekent de lijn. Een bal wordt dan een pass, een speler een looplijn; het
  soort (pass, set-up, aanval, service, lopen) verander je erna in één keuzelijst,
  en de boog gaat mee.

De pijlpunt zelf is ook te pakken en te verschuiven — een pad is niets anders dan
een marker die ergens heen gaat.

Afspelen kan in de bewerker zelf, op hetzelfde veld waar je aan het werk bent:
een animatie die je niet ziet lopen kun je ook niet beoordelen. Tijdens het
afspelen verdwijnt het gereedschap uit beeld, inclusief de pijlpunten, zodat je
naar de oefening kijkt en niet naar de knoppen.

Verder scheelt 'fase kopiëren' het meeste werk bij een oefening die zichzelf
herhaalt: de kopie neemt de bewegingen mee en legt zijn eigen beginposities vast,
zodat hij niet meeschuift met wat ervoor gebeurt. Fases duren seconden, geen
milliseconden.

## Inloggen

Iedere trainer heeft een eigen account met een wachtwoord. Wat dat precies
regelt, en wat niet:

- **Wie de app mag gebruiken.** Is er een deelserver ingesteld, dan komt er
  niets op het scherm voordat er is ingelogd. Is die er niet, dan valt er niets
  te controleren en werkt de app zoals hij zonder server werkt: alles op dit
  apparaat.
- **Wie er accounts aanmaakt.** Alleen de eigenaar; er is geen aanmeldpagina.
  Op de beheerpagina staat voor hem een lijst met alle accounts, met knoppen om
  iemand toe te voegen, een wachtwoord opnieuw te zetten, iemand eigenaar te
  maken en iemand te verwijderen. Een verwijderd account kan meteen niets meer:
  zijn sessies gaan mee de deur uit.
- **Wat er per account gescheiden blijft.** Elk account krijgt op een apparaat
  een eigen database. Logt er een tweede trainer in op dezelfde laptop, dan ziet
  die niets van de eerste. Het eerste account dat op een apparaat inlogt neemt de
  bestaande opslag over — dat is bijna altijd de eigenaar van die telefoon zelf,
  en zo raakt niemand werk kwijt dat er al stond.

### Hoe het beveiligd is

| Wat | Hoe |
|---|---|
| Wachtwoord | PBKDF2-SHA256, 210.000 rondes, eigen zout per gebruiker. Het wachtwoord zelf wordt nooit bewaard. |
| Sessie | 32 willekeurige bytes, 90 dagen geldig, in de database alleen als SHA-256. |
| Raden afremmen | Tien mispogingen op rij zetten het account een kwartier op slot. |
| Onbekend adres | Levert exact dezelfde melding en dezelfde wachttijd op als een fout wachtwoord — anders is de server een manier om te achterhalen wie er trainer is. |
| Wachtwoord wijzigen | Alleen met het oude erbij, en alle andere sessies vervallen. |
| Laatste eigenaar | Kan zichzelf niet verwijderen of degraderen. |

De sessie staat in `localStorage` en gaat als `Authorization`-kop mee, niet als
cookie: de app en de server staan op verschillende adressen, en dan is een kop
eenvoudiger en veiliger dan een cookie die je over domeinen heen moet toestaan.
Een bewaarde sessie is genoeg om de app te openen, ook zonder verbinding — de
controle bij de server gebeurt erna, op de achtergrond. Anders zou de app in een
sporthal zonder bereik om een wachtwoord vragen dat hij daar toch niet kan
controleren.

### De eerste keer

Na het uitrollen staat er nog geen account. Dan, en alleen dan, biedt de app aan
om er één aan te maken; dat account wordt de eigenaar. Doe dat meteen — tot dat
moment kan iedereen die het adres kent het doen. Wie dat gaatje helemaal dicht
wil, zet op de worker een secret `SETUP_TOKEN`; dan moet die code bij dat ene
verzoek meegestuurd worden, en het invulveld daarvoor staat op het scherm.

## Delen: scopes in plaats van accounts

Wie er binnen mag, regelt de inlog. Wat je deelt, regelen de scopes — die twee
staan los van elkaar. Een record gaat naar de scopes die zijn zichtbaarheid
noemt:

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

**Openbaar is openbaar.** Iedere ingelogde gebruiker van dezelfde deelserver kan
openbare oefeningen lezen én er zelf in schrijven. Met de inlog erbij is dat niet
langer 'de hele wereld', maar wel iedereen die op jouw server een account heeft —
en dat bepaal jij.

Delen zit achter dezelfde inlog: zonder geldige sessie neemt de server niets aan
en geeft hij niets terug. Merkt de app tijdens het delen dat de sessie niet meer
geldt, dan komt het inlogscherm terug.

Ingebouwde bankoefeningen staan in de code, niet in de database. Ze zijn er dus
meteen bij een lege installatie en gaan nooit de deur uit. Wil je er iets aan
veranderen, dan maakt de app een kopie met jouw naam erop.

## De server

`server/training/worker.js` is een Cloudflare Worker met drie soorten
eindpunten en drie tabellen:

| Pad | Waarvoor |
|---|---|
| `GET /auth/status` | Is er al een account? Het enige dat zonder inlog te vragen valt. |
| `POST /auth/setup` `/login` `/logout` `/me` `/password` | Inloggen en je eigen wachtwoord. |
| `POST /admin/users` `…/add` `…/remove` `…/password` `…/role` | Alleen voor de eigenaar. |
| `POST /share/push` `/share/pull` | Delen, achter dezelfde inlog. |

`server/training/auth.js` staat er los naast: dat is het rekenwerk aan
wachtwoorden en tokens, zonder database eromheen, en het is apart zodat het te
testen valt. De outbox, het opnieuw proberen en het samenvoegen op revisie zitten
in de app en horen daar te blijven: die moet ook werken als er geen server te
bereiken is.

### Uitrollen, in vijf stappen

1. Maak een D1-database aan: `npx wrangler d1 create volley-training --location weur`.
   Het commando drukt een `database_id` af.
2. Zet in GitHub bij **Settings → Secrets and variables → Actions** de secrets
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` en `CLOUDFLARE_TRAINING_D1_ID`
   (die laatste is de id uit stap 1). De workflow `sync-server.yml` rolt de
   worker dan uit; ontbreekt de id, dan slaat hij die stap over.
3. De uitrol drukt het adres van de worker af, bijvoorbeeld
   `https://volley-training-share.<jouw-account>.workers.dev`.
4. Zet dat adres als secret `TRAINING_SHARE_URL`. De volgende bouw bakt het in de
   app, en vanaf dan vraagt de app om inloggen.
5. Open de app en maak je eigenaarsaccount aan. Doe dit meteen.

Het adres kan ook met de hand op de beheerpagina worden ingevuld; dat is handig
om te proberen. Zonder adres blijft alles op het apparaat en werkt de rest van de
app gewoon door.

## Wat waar staat

| Map | Verantwoordelijk voor |
|---|---|
| `src/training/domain` | Types, groepsverdeling, filters, trainingsplan, reeksen, animatiemodel |
| `src/training/db` | IndexedDB-schema, collecties, outbox, profiel en instellingen |
| `src/training/auth` | Inloggen: cliënt, sessie, de deur voor het scherm |
| `src/training/sync` | Scopes, deel-engine, transport (server of in het geheugen) |
| `src/training/bank` | De ingebouwde oefeningen, en kopiëren naar je eigen bank |
| `src/training/app` | Schermen, veld- en animatiecomponenten, stijl |
| `server/training` | De deelserver |

## Wat er nog niet is

- **Alleen tekstuele evaluatie per training.** Wat een oefening opleverde wordt
  nergens geteld; koppeling met de scoutingdata (traint deze ploeg wel waar ze
  punten op verliest?) zou kunnen, maar is bewust nog niet gemaakt.
- **Geen ledenbeheer in een groep.** Wie de code heeft, hoort erbij. Iemand
  eruit zetten betekent een nieuwe code maken en die opnieuw doorgeven. De
  accounts op de server staan daar los van: die bepalen wie de app mag
  gebruiken, niet wie wat ziet.
- **Geen 'wachtwoord vergeten' per e-mail.** De server verstuurt geen post. Een
  vergeten wachtwoord zet de eigenaar opnieuw, op de gebruikerspagina.
- **Geen conflictafhandeling met de hand.** Twee trainers die dezelfde gedeelde
  training tegelijk aanpassen: de laatste schrijver wint, zoals overal in deze
  repo.
