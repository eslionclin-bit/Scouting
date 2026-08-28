# Volleybal scouting-app

Offline-first scouting-app voor volleybal: rally's actie-voor-actie invoeren op een
tablet in de sporthal, zonder internet, met synchronisatie zodra er weer een
netwerk is.

Twee kanten van hetzelfde verhaal:

- **Invoeren** — één iemand legt de rally's vast, actie voor actie, in één vraag
  tegelijk.
- **Coachen** — op de bank een scherm dat zegt wát je nu moet doen en zeggen,
  niet een scherm om in te zoeken.

Daaromheen: analysedashboard, opponent-dossier, rotatie- en wisselbeheer, en
live koppelen tussen apparaten. Installeerbaar op een tablet, en volledig
bruikbaar zonder verbinding.

## Aan de slag

```bash
npm install
npm run dev     # ontwikkelserver op http://localhost:5173
                # de trainingsapp staat op http://localhost:5173/training.html
npm run build   # typecheck + productiebuild van beide apps, inclusief service worker
npm run build:demo  # alles in één HTML-bestand, om de app te laten zien
npm test        # 447 tests: domein, opslag, sync, rotatie, analyse, schermen, export,
                # en de trainingsapp: verdeling, bank, reeksen, delen
```

## Wat er nu staat

| Laag | Map | Verantwoordelijk voor |
|---|---|---|
| Domein | `src/domain` | Types, scoutingprotocol, validatieregels, zonelogica, logische klok |
| Opslag | `src/db` | IndexedDB-schema, transacties, repositories per entiteit |
| Sync | `src/sync` | Outbox, samenvoegen (LWW), sync-engine, transport-contract |
| Koppeling | `src/sync/peer` | Live meelezen tussen twee apparaten (WebRTC) |
| Analyse | `src/analysis` | Tellingen per speler, actietype, zone en rotatie |
| Export | `src/export` | JSON (canoniek) en CSV (voor Excel) |
| App | `src/app` | React-schermen, invoerstroom, PWA-registratie |
| Training | `src/training` | De tweede app: oefeningenbank, trainingen, reeksen, delen |

## De schermen

**Startscherm** — wedstrijden openen of een nieuwe beginnen, en per wedstrijd
exporteren naar JSON of CSV. Staat er nog iets in de outbox, dan zie je dat hier.

**Nieuwe wedstrijd** — eigen team met spelers, tegenstander, datum en thuis/uit.
Rugnummers van de tegenstander kun je hier alvast invullen; een naam hoeft niet.
Het eigen team blijft bewaard, dus meestal hoef je alleen nog een tegenstander in
te tikken.

Wie begint met serveren staat hier bewust níét: dat weet je pas na de toss aan
het eind van de warming-up. Die vraag stelt het invoerscherm — en alleen voor
set 1 en de beslissende set, want daartussen wisselen de teams om en om.

Bij een speler kun je een rol kiezen. Dat is optioneel; alleen bij een libero
maakt het verschil, want die serveert niet.

**Rally-invoer op een tablet** — het hele veld staat op het scherm: onze zes op
hun rotatiepositie met rugnummer en naam, hun helft als zes zones, het net
ertussen. Eén tik op een vak legt vast wie het was, welke kant en welke zone;
de tweede tik is de kwalificatie. Twee tikken per actie, en bij onze eigen
service staat de server al klaar — dan is een ace één tik. Een rally van vijf
acties kost negen tikken in plaats van ongeveer twintig.

De actiesoort wordt voorspeld en staat zichtbaar naast het veld: je leest wat je
vastlegt in plaats van het in te vullen. Tik je de andere ploeg aan dan de app
verwachtte, dan schuift het actietype mee. Alles wat optioneel is (tempo, blok,
foutreden, welke tegenstander) wordt ná de tik gevraagd in één verfijnbalk die
vanzelf verdwijnt. Zie [docs/invoeren.md](docs/invoeren.md).

**Instellingen** — per tablet, via het startscherm: veld links of rechts (voor
linkshandigen), set-up altijd vragen of niet, pass van de tegenstander wel of niet
vastleggen, rugnummers van de tegenstander tonen.

**Rally-invoer (stapsgewijs)** — het scherm waar het tijdens de wedstrijd om draait. Eén vraag
tegelijk, in de volgorde waarin je een rally ziet:

1. **Wie speelde de bal?** — kant van het net, dan de speler. Een speler die er
   nog niet in staat, voeg je hier toe zonder de wedstrijd te onderbreken.
2. **Wat deed hij?** — service, pass, set-up, aanval, blok of verdediging. De
   verwachte volgende actie is gemarkeerd, maar nooit voorgeselecteerd.
3. **Waar stond hij?** — mini-veld met zes vakken. Bij een service drie plekken
   achter de achterlijn, want daar sta je bij een service. Verplicht bij service
   en aanval, overslaan mag bij de rest.
4. **Hoe pakte het uit?** — vier kleurgecodeerde knoppen; lang indrukken toont
   het criterium uit het protocol met een voorbeeld.

Twee dingen die de app zelf weet, scheelt dat invoerwerk: bij een eigen service
staat de speler uit zone 1 al klaar (met een opstelling weet de app precies wie,
anders blijft dezelfde speler serveren zolang wij aan service blijven), en de
speler die net de bal raakte is niet te kiezen voor de volgende actie — twee
keer achter elkaar mag nu eenmaal niet, behalve na een blok.

Bovenin staat steeds wat er al gekozen is; elk stukje is aan te tikken om terug
te gaan. Onderaan 'punt wij' / 'punt zij', undo actie en undo rally.

De set eindigt op de telling, niet op een knop: bij 25 punten met twee verschil
(15 in de beslissende set) vraagt de app één keer ter bevestiging. Klopt de stand
niet, dan kies je 'nog niet' en corrigeer je eerst. Ging een set per ongeluk
dicht, dan zet undo hem weer open op het punt ervoor.

Er worden altijd vier sets gespeeld — ook bij 3-0 — en een vijfde bij 2-2. Zie
[`docs/spelregels.md`](docs/spelregels.md) voor de regels die de app kent.

Raakt de invoerder een rally kwijt, dan tel je het punt bij via **'Stand'**: het
telt mee voor de stand én de rotatie, maar staat in de data als 'niet ingevoerd'
— zonder te doen alsof er acties bekend zijn.

De termen op de knoppen komen uit de zaal, niet uit het protocoldocument: dat
schrijft 'opslag', 'receptie' en 'toets', maar niemand zegt dat langs de lijn.
De codes in de data blijven ongewijzigd, dus eerder ingevoerde wedstrijden
kloppen nog.

Twee dingen nemen werk uit handen tijdens live invoer: na een opslag zet de app
de receptie van de tegenpartij klaar (en zo verder door de keten), en een actie
die de rally volgens het protocol beëindigt — een fout, een ace, een kill —
rondt de rally meteen af en zet de opslag van de winnaar klaar.

Undo werkt over de rallygrens heen: is de nieuwe rally nog leeg, dan wordt de
vorige rally heropend en dáár de laatste actie teruggedraaid.

**Tempo en blok bij een aanval** — na de zone volgt bij een aanval één extra
vraag: welk tempo (hoog, snel, achter, overig) en hoeveel blok stond
ertegenover (geen, 1, 2, 3). Twee tikken, allebei over te slaan — een invoerder
die achterloopt op het spel is erger dan een aanval zonder tempo. Alleen bij de
aanval, want dat is de actie waar het antwoord het meest verklaart: tegen één
blokkeerder hoort een aanval veel beter te scoren dan tegen drie, en zonder dat
gegeven is een laag aanvalsrendement niet te duiden. Het staat ook in de
CSV-export, en is achteraf te corrigeren.

**Waardoor ging die bal verloren?** — na een fout verschijnt onder de keten een
rijtje redenen: bij een service 'in het net / uit / anders', bij een aanval ook
'geblokt', bij een pass 'onhoudbaar / technische fout'. De vraag komt pas nádat
de fout is opgeslagen, dus het invoeren wacht er nooit op — de rally loopt door
en de balk verdwijnt vanzelf. Twaalf servicefouten is een telling; negen daarvan
in het net is een trainingsopdracht.

**Corrigeren** — undo werkt zolang je de fout meteen ziet. Ontdek je pas drie
rally's later dat die pass matig was in plaats van goed, dan staat onder
'Corrigeren' de laatste twintig acties van de set, met de rally erbij; per actie
zijn de kwalificatie en de speler aan te passen of is hij te verwijderen. De
stand wordt daarbij bewust niet meeverschoven: verandert een correctie de uitslag
van een rally, dan zegt het scherm dat en corrigeer je de stand zelf via 'Stand'.

**Meekijken op de opstelling** — is de opstelling ingevuld, dan waarschuwt de app
tijdens het invoeren bij een speler die volgens de opstelling niet in het veld
staat, bij een libero die serveert of aanvalt, en bij een blok door een
achterspeler. Alles als waarschuwing, nooit als blokkade: de app weet het niet
beter dan de invoerder, hij kijkt alleen mee.

**Opstelling, libero en wissels** — via de knop 'Opstelling' in het invoerscherm.
Je zet alleen de zes van het begin van de set neer; welke speler tijdens rally 34 in
zone 3 staat, rekent de app zelf uit. De rotatiestand staat in de kop van het
scherm en wordt bij elke rally meegeschreven, zodat er geen rotatielijst op
papier naast hoeft te bestaan. Een wissel geldt vanaf de rally waarin hij wordt
ingevoerd; er zijn er zes per set toegestaan, de zevende weigert de app.

De **libero** leg je per set apart vast: hij hoort niet in de zes. De app zet hem
in het veld op de plek van de middenspeler die achterin staat (zone 5 of 6) en
haalt hem eruit zodra diezelfde speler naar zone 1 draait — een libero serveert
niet. Een liberowissel telt daarom ook niet mee voor het wisselquotum.

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

**Rolkeuze** — bij het openen van een wedstrijd kiest een apparaat wat het doet.
Die keuze wordt per wedstrijd onthouden, dus na een herstart belandt de coach
niet opeens in het invoerscherm.

| Rol | Wat het apparaat doet |
|---|---|
| Ik voer in | Hoofdinvoerder: legt rally's vast en bepaalt wanneer een rally of set klaar is. |
| Ik vul aan | Tweede invoerder: vult acties aan in de rally die openstaat. |
| Ik lees mee | Ziet live wat er wordt ingevoerd, plus de cijfers. Voert zelf niets in. |

**Coachscherm** — voor op de bank, en bewust iets anders dan het dashboard.
Daar zoek je iets op; hier word je iets verteld:

- bovenaan de stand, van een afstand leesbaar;
- daaronder **wat er nu aan de hand is**: hoogstens een paar aanwijzingen, elk
  met de telling eronder ("Blok naar zone 4 — 9 van 11 aanvallen komen
  daarvandaan", "Sideout hapert in R2 — 1 van 5");
- het **verloop van de set** als een rij blokjes, één per rally: een reeks tegen
  zie je zo, zonder te tellen;
- de vier cijfers die er tijdens een set toe doen, sideout per rotatie, en wat je
  na de volgende sideout te wachten staat;
- onderaan **wat we eerder zagen**: de zwaktes van deze tegenstander uit vorige
  ontmoetingen, en ons eigen hardnekkigste patroon — apart gezet, want wat er nú
  gebeurt gaat voor;
- een **time-out-knop** die in grote letters hooguit drie zinnen toont om te
  zeggen. Geen zoekwerk terwijl de klok loopt — en daarna laat het scherm zien
  wat de time-out heeft opgeleverd ("sinds je time-out 4–2").

Zolang er te weinig gespeeld is, zwijgt het scherm. Sturen op vier ballen is
slechter dan niets zeggen.

**Twee invoerders tegelijk** — de hoofdinvoerder bepaalt het verloop, de
assistent vult aan. Dat onderscheid is er niet voor de vorm: zouden twee
apparaten allebei een rally kunnen afronden, dan ontstaan er twee rally's en twee
standen. De assistent ziet daarom geen 'punt wij', geen 'set afronden' en geen
'undo rally'; wat hij invoert verschijnt binnen een seconde bij de ander. Wie
welke kant van het net invoert, spreek je zelf af — de app bewaakt dat niet.

**Wat een pass oplevert** — op het dashboard en in het teamdossier: per
passkwaliteit het percentage rally's dat we daarna winnen, plus het verschil
tussen een perfecte en een matige pass in punten per honderd ontvangen ballen.
Dat is passkwaliteit uitgedrukt in punten, en daarmee het argument voor een
training. Per ontvangen rally telt de eerste pass; rally's zonder ingevoerde
pass blijven erbuiten.

**Eerste bal of transitie** — een aanval na onze eigen pass is een opgezette
aanval, alles daarna komt uit een verdediging. Alle scoutprogramma's houden die
twee uit elkaar, want een ploeg kan op de eerste bal prima draaien en in
transitie alles weggeven.

**Wie krijgt de bal, per rotatie** — de verdeling van onze aanvallen per rotatie
met het rendement erachter. Eén speler die alles krijgt is prima, zolang het
rendement er is.

**Waar onze fouten heen gaan** — per actietype de verdeling over de redenen, met
erbij van hoeveel fouten de reden bekend is. Overslaan mag, dus dat aantal hoort
erbij: anders leest 'drie in het net' als het hele verhaal terwijl er twintig
fouten waren.

**Aanval per tempo en blok** — welke ballen de punten opleveren, en wat het blok
ertegenover doet, voor beide ploegen naast elkaar. Op de ingelezen PlusLiga-
wedstrijd komt daar het schoolvoorbeeld uit: tegen één blokkeerder +61%
rendement, tegen twee +41%, tegen drie −17%. Aanvallen zonder ingevuld tempo
blijven eruit; hoeveel dat er zijn staat erbij.

**Nu, wij gemiddeld, topniveau** — op het dashboard en in het teamdossier staan
zes kerngetallen (sideout, punt op eigen service, pass positief, aanval punt,
aanvalsrendement, servicefouten) naast twee referentiepunten: ons eigen
gemiddelde over de andere wedstrijden, en waar het op topniveau ligt. 50%
sideout zegt niets; 50% tegenover onze eigen 53% en 64% op topniveau zegt alles.
Op het coachscherm staat het eigen gemiddelde beknopt onder de cijfers die
tijdens een set tellen.

De eerste twee kolommen zijn tellingen. De derde ook, zodra er scoutbestanden
zijn ingelezen (zie hieronder); zolang dat niet zo is, staat er *indicatief* bij
— een ordegrootte uit de volleybalanalyse in plaats van een telling. Dat label
staat bij elk getal, en tikken toont de herkomst. Zie
[docs/maatstaven.md](docs/maatstaven.md).

**Referentiemateriaal inlezen** — via 'Referentie' op het startscherm lees je
DataVolley-bestanden (`.dvw`) in: het formaat waarin op hoger niveau al jaren
gescout wordt. Eén bestand is één wedstrijd, actie voor actie. Daarmee wordt de
referentiekolom een telling ('58% uit 3 ingelezen wedstrijden') in plaats van een
ordegrootte, en wordt onze eigen analyse getoetst: de setstanden die wij uit de
rally's optellen moeten precies gelijk zijn aan wat het bestand zelf noteert.

Ingelezen wedstrijden staan apart van de eigen wedstrijden: ze verschijnen niet
in de wedstrijdlijst en tellen niet mee in ons eigen gemiddelde. Beide ploegen
tellen wel mee voor de referentie. Wat de vertaling van de DataVolley-schaal naar
onze vier kwalificaties wel en niet toelaat, staat in
[docs/import-datavolley.md](docs/import-datavolley.md) — kort: sideout en punt op
eigen service zijn hard te vergelijken, de vier actiecijfers zijn een richting.

Het eigen gemiddelde is ook drempel geworden waar dat eerlijker is: een rotatie
is zwak als hij twaalf procentpunt onder onze eigen andere rotaties ligt, niet
omdat hij onder een vast percentage zakt.

**Eén speler** — vanuit het dashboard of het teamdossier tik je op een naam.
Daar staat wat ze doet per actietype, hoe haar aanval verloopt over het seizoen
(oudste wedstrijd links), en hoe de laatste wedstrijd zich verhoudt tot haar
eigen niveau daarvoor. Dat laatste is de reden dat dit ook tijdens een wedstrijd
nut heeft: 'onder haar niveau' is iets anders dan 'slecht', en alleen het eerste
is een reden om te wisselen. Diezelfde vergelijking komt als aanwijzing terug op
het coachscherm. Er wordt pas iets over vorm gezegd bij minstens zes acties nu en
twintig in de historie — twee gemiste ballen zijn geen vormdip.

**Ons team** — vanaf het startscherm: waar lopen wíj structureel vast, over alle
wedstrijden heen. Sideout per rotatie, opstellingen vergeleken op puntverschil
per set, foutpatronen per speler — en per bevinding een advies waar je op kunt
trainen. Eén slechte set zegt niets; hetzelfde patroon over vijf wedstrijden wel.

**Opponent-dossier** — via de knop 'Dossier' bij een wedstrijd: alles
wat we van deze tegenstander weten, over alle wedstrijden heen. Head-to-head,
aanvals- en opslagzones, en een lijst met de belangrijkste patronen.

Elke bevinding draagt het aantal waarnemingen waarop hij berust, en onder de
twaalf waarnemingen zegt het dossier niets — vier aanvallen uit zone 4 zijn geen
voorkeur. Het tactisch advies is een vertaling van precies één telling naar een
handeling, met die telling eronder. Geen giswerk, zoals de projectbrief vraagt.

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

### Synchronisatie en koppelen

`SyncEngine` praat met een `SyncTransport`. Mislukt een ronde, dan blijft alles
in de outbox staan, loopt de wachttijd exponentieel op en gaat invoeren gewoon
door.

Drie transports zitten in de repo: `LoopbackHub` (in het geheugen, voor tests),
`PeerClient` over een WebRTC-datakanaal — dat is wat live meelezen mogelijk
maakt — en `CloudTransport` voor de online koppeling.

**Koppelen zonder server.** Een browser kan geen server zijn, dus twee tablets
vinden elkaar niet vanzelf. Wat wél kan is een rechtstreekse verbinding waarbij
de apparaten eenmalig een koppelcode uitwisselen: de invoerder maakt een code, de
meelezer plakt hem en geeft een antwoordcode terug. Daarna loopt alles vanzelf.
Er komt geen server aan te pas — ook geen STUN-server, want die zou internet
vereisen en op een lokaal netwerk niets toevoegen.

Wat je nodig hebt: beide apparaten op hetzelfde netwerk (de wifi van de sporthal
of een hotspot vanaf één van de telefoons), en op allebei de app al een keer
geopend zodat hij lokaal staat. Internet is niet nodig.

**Koppelen mét server.** Apparaten die niet tegelijk aan staan, hebben aan het
bovenstaande niets. Daarvoor is de online koppeling: een Cloudflare Worker met
één tabel (`server/cloud/`) die per record de nieuwste versie bewaart en
teruggeeft wat er sinds de vorige keer bij kwam. Er zijn geen accounts — de
ploeg is een gedeelde code, waarvan de server alleen de hash kent en die alleen
op het apparaat staat. Opzetten en de afwegingen staan in
[docs/online-koppeling.md](docs/online-koppeling.md). Ontbreekt het adres van de
server, dan blijft de app puur lokaal — dat is nog steeds de standaard.

## De trainingsapp

In dezelfde repo staat een tweede app: **trainingen maken**, op `/training.html`.
Eigen database, eigen server, eigen iconen; gedeeld zijn alleen de bouwstenen
(ids, logische klok, build, tests).

Waar het om draait: een oefening is niet 'voor zes spelers', maar werkt van vier
tot tien in stappen van één — of, in drietallen, alleen met drie, zes of negen.
Vink je af wie er vanavond zijn, dan rekent elk blok van de training uit hoeveel
groepen er draaien, wie er begint, wie wachten en om de hoeveel minuten er
gewisseld wordt. Past een oefening niet bij de groep, dan staat dat er in gewone
taal bij, met de oefeningen die hetzelfde trainen en wél passen.

Verder: een oefeningenbank met zestien ingebouwde oefeningen (negen met
animatie), animaties die je zelf met een vinger tekent — slepen om iemand neer te
zetten of om hem te laten bewegen, en afspelen terwijl je bezig bent — filters op doel en
aantal deelnemers en op eigen oefeningen tegenover die van anderen, groepen
waarmee je deelt via een gedeelde code, reeksen die een hele periode
klaarzetten, en een trainingsblad dat op de telefoon én op papier te lezen is.

Zie [`docs/trainingsapp.md`](docs/trainingsapp.md).

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

## De app ergens neerzetten

Er zit een GitHub Actions-workflow bij die de app na elke push naar GitHub Pages
zet. Eenmalig aanzetten: **Settings → Pages → Source: GitHub Actions**. Daarna
staat hij op `https://<gebruiker>.github.io/<repo>/` — een echte URL die je op
een tablet kunt openen en via 'Zet op beginscherm' kunt installeren.

De trainingsapp gaat mee in dezelfde build en staat dan op
`https://<gebruiker>.github.io/<repo>/training.html` — ook te installeren op een
beginscherm, met een eigen icoon.

Zelf hosten kan ook: `npm run build` en de map `dist/` op een willekeurige
statische host zetten.

## Volgende stap

Fase v4 uit de projectbrief: het opponent-dossier — aanvalszones, zwaktes en
tactisch advies over meerdere wedstrijden tegen dezelfde tegenstander. De data
ligt er al (`matches.by_opponent` plus de analysefuncties); het is vooral een
kwestie van optellen over wedstrijden heen.
