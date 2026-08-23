# Online koppeling

Standaard staat alles op het apparaat waar het is ingevoerd. Dat is geen
beperking maar een keuze: in een zaal zonder bereik moet de invoer gewoon
doorgaan. De online koppeling verandert daar niets aan — hij zorgt er alleen
voor dat wat er lokaal staat vanzelf bij de andere apparaten van de ploeg komt
zodra er internet is.

## Hoe het in elkaar zit

De app had dit al bijna helemaal. Elke wijziging gaat door een outbox, krijgt
een revisie uit een logische klok, en samenvoegen is 'hoogste revisie wint'.
Wat erbij kwam is één transport dat over HTTP praat, en een server die niet meer
doet dan onthouden.

```
invoeren → lokale opslag → outbox → transport → server (Cloudflare)
                                        ↑                  ↓
                              ander apparaat ←────── ophalen
```

De server bewaart **één rij per record**, niet één per wijziging: elke wijziging
bevat het volledige record, dus de vorige versie heeft geen waarde meer.
Daardoor is opnieuw versturen ongevaarlijk en blijft de tabel klein. Een
gewijzigd record wordt verwijderd en opnieuw ingevoegd, zodat het een nieuw,
hoger volgnummer krijgt en andere apparaten het ophalen.

Alles staat in twee bestanden: `server/cloud/worker.js` (twee eindpunten) en
`server/cloud/schema.sql` (één tabel).

### De tabel

Vier kolommen verdienen uitleg, want ze dragen de hele opzet:

- **`seq`** is het volgnummer waarop 'geef me alles ná dit punt' werkt. De
  logische klok van de app loopt per apparaat op, maar niet tussen apparaten
  onderling; daar is één teller voor nodig, en dat is precies wat een oplopende
  rowid is. Dáárom wordt een gewijzigd record verwijderd en opnieuw ingevoegd in
  plaats van bijgewerkt: zo krijgt het een nieuw, hoger volgnummer en halen
  andere apparaten het op.
- **`team`** is de hash van de ploegcode, niet de code zelf. Zie hieronder.
- **`rev`** is de revisie uit de hybride klok van de app en bepaalt wie wint bij
  gelijktijdig wijzigen. De server vergelijkt hem als tekst, precies zoals de
  app doet.
- **`match_id`** staat er zodat meelezen met één wedstrijd niet de hele
  geschiedenis hoeft op te halen. Leeg bij ploegen en spelers: die horen overal
  bij en gaan altijd mee.

Het bestand zelf bevat geen commentaar, en dat is met opzet: de SQL-console van
Cloudflare splitst een geplakt bestand op puntkomma's en struikelt over wat er
daarna nog staat. Zo is het overal te plakken.

## Waarom Cloudflare en niet Supabase

Supabase was de eerste keus en is het niet geworden, om twee redenen die pas bij
het opzetten bleken:

- De gratis laag laat **twee projecten** toe. Wie er al twee heeft, betaalt.
- Belangrijker: een gratis project **pauzeert na zeven dagen zonder
  activiteit**. Een club ligt in de zomer stil en heeft wel eens twee weken geen
  wedstrijd. Dan werkt de koppeling niet meer tot iemand het in een dashboard
  weer aanzet — precies de verrassing die je op een zaterdagochtend niet wilt.

Cloudflare Workers slapen niet, kennen geen projectlimiet, en de database mag
met één vlag in West-Europa staan.

## Er zijn geen accounts

De ploeg wordt bepaald door een gedeelde code, en de server bewaart die code
niet: hij rekent er een hash over en gebruikt die als kolom. Dat heeft drie
gevolgen, en ze zijn alle drie de moeite van het weten waard.

**Er valt niets te beheren.** De eerste keer dat een apparaat een code gebruikt,
ontstaat de ploeg vanzelf. Geen registratie, geen wachtwoord-vergeten.

**Wie de code heeft, ziet de wedstrijden van de ploeg.** Deel hem binnen het team
en niet daarbuiten. Wie de database zou inzien, kan er niets mee — de code staat
er niet in.

**Een typefout levert geen foutmelding op**, maar een andere, lege ploeg. Dat is
het enige geval dat de server niet kan zien, dus telt hij erbij hoeveel er onder
die code staat. Staat dat op nul terwijl je wedstrijden verwacht, dan zegt het
instellingenscherm dat.

Omdat alles aan die code hangt, is de lengte niet vrijblijvend: de server
weigert codes korter dan zestien tekens, en de app maakt er desgevraagd een van
vier woorden plus vier cijfers — `wad-riet-molen-tij-0042`. Dat is niet te raden
en wél door de telefoon te zeggen, anders dan een reeks willekeurige tekens die
op een tablet in een zaal gegarandeerd verkeerd wordt overgenomen.

## Opzetten

Eenmalig, ongeveer een kwartier. Je hebt een gratis Cloudflare-account nodig.

```bash
cd server/cloud
npx wrangler login

# De database. 'weur' is West-Europa: daarmee staan spelersnamen en
# wedstrijdgegevens hier en niet aan de andere kant van de oceaan.
npx wrangler d1 create volley-scouting --location weur
# → dit drukt een database_id af; zet die in wrangler.toml

npx wrangler d1 execute volley-scouting --remote --file schema.sql
npx wrangler deploy
# → dit drukt het adres af, iets als
#   https://volley-scouting-sync.<naam>.workers.dev
```

Dat adres vul je in de app in: **Instellingen → Online koppeling → adres van de
sync-server**. Eén keer, op het eerste apparaat; de rest krijgt het via de
koppellink.

Je kúnt het ook in GitHub zetten als secret `SYNC_URL`, dan staat het al ingevuld
voor wie de app voor het eerst opent. Nodig is dat niet, en het heeft een nadeel:
ingebakken bij het bouwen is het onzichtbaar. Je kunt niet zien of het erin zit,
je moet een bouw afwachten om het te veranderen, en een browser die een oude
kopie vasthoudt geeft je een app zonder adres zonder dat iemand begrijpt waarom.
Dat laatste kostte een avond zoeken.

### Door GitHub laten doen

De prettigste manier, en de enige waarbij je nooit meer code in een dashboard
hoeft te plakken: `.github/workflows/sync-server.yml` rolt de server uit zodra
er iets in `server/cloud/` verandert. Drie secrets instellen, en klaar:

| Secret | Waar je hem vindt |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token. Rechten: **Workers Scripts: Edit** en **D1: Edit** op je account. |
| `CLOUDFLARE_ACCOUNT_ID` | Het lange stuk in het adres van je dashboard, direct na `dash.cloudflare.com/`. |
| `CLOUDFLARE_D1_ID` | Op de pagina van de D1-database, als **Database ID**. |

Daarna: Actions → **Sync-server** → *Run workflow*. Hij zet de tabel klaar (alle
statements zijn `if not exists`, dus dat mag elke keer) en rolt de worker uit.
Het adres staat in de uitvoer van de laatste stap.

Ontbreken de secrets, dan slaat de workflow zichzelf over. Dat is de normale
situatie voor wie de online koppeling niet gebruikt.

### Zonder terminal

Het kan ook helemaal via het dashboard, en dat is handig als je op een tablet
werkt:

1. **Storage & Databases → D1 → Create database**, naam `volley-scouting`,
   locatie **Western Europe (WEUR)**.
2. Open de database, tabblad **Console**, en voer de statements uit
   `schema.sql` uit. Loopt een geplakt blok vast op *'Requests without any query
   are not supported'*, plak ze dan één voor één en laat de puntkomma weg.
3. **Compute → Workers & Pages → Create → Workers**, deploy de voorbeeldcode.
4. Open de worker, tabblad **Bindings → Add binding → D1 database**, variabele
   **`DB`** (exact zo — de code zoekt op die naam), en kies de database.
5. **Edit code**, alles vervangen door `worker.js`, deployen. Het adres staat
   bovenaan.

Open dat adres in een tabblad: je hoort `{"error":"Alleen POST."}` te zien. Dat
is goed nieuws — de worker draait en weigert netjes wat hij niet moet doen.

Daarna, op **één** apparaat: **Instellingen → Online koppeling** → *Code voor mij
maken* → *Koppelen*.

Elk volgend apparaat gaat via een link. Op het gekoppelde apparaat staat
**Koppeling doorsturen**: stuur die link naar jezelf of naar een teamgenoot, tik
hem aan op het andere apparaat, en dat apparaat hoort erbij. Niets over te
tikken.

Dat overtikken is er met opzet uit gehaald. Een code met de hand invoeren op een
telefoon gaat mis, en het gaat *stil* mis: het klavier zet er een hoofdletter of
een spatie in, de server hasht de code, en je belandt zonder foutmelding bij een
lege ploeg. De code staat in de link achter een `#`, en alles na een hekje blijft
in de browser — de server die de app uitlevert ziet hem dus nooit. Wie de link
heeft ziet wel de wedstrijden van de ploeg, dus stuur hem niet in een groep waar
de tegenstander in zit. Op het eerste
apparaat laat je de app een code maken en schrijf je hem op; op de andere vul je
dezelfde in.

## Ziet het andere apparaat niet alles?

De app houdt een **wachtrij** bij, geen kopie: zodra een wijziging is
aangekomen, gaat de regel eruit. Dat is precies goed voor de normale gang van
zaken, maar het betekent dat wat er al eens verstuurd is, niet vanzelf nog een
keer meegaat — bijvoorbeeld naar een ploeg waaraan je later pas koppelde.

Onder Instellingen staat daarom **Alles opnieuw versturen**. Dubbel kan het niet
worden: elke wijziging draagt haar eigen revisie, en wat er al staat blijft zoals
het is.

## Hoe lang het duurt

Een ronde stuurt alles wat klaarstaat, in batches van honderd achter elkaar, en
haalt daarna op wat er ligt. Een apparaat dat net gekoppeld is heeft zijn hele
geschiedenis klaarstaan — een paar honderd wijzigingen is normaal — en die zijn
in een paar seconden weg.

Daarna loopt er elke halve minuut een ronde, en die is leeg zolang je niets
invoert. Tijdens een wedstrijd betekent dat: wat je invoert staat binnen een
halve minuut op het andere apparaat.

## Wat je ervan merkt

Niets, als het goed is. Onder Instellingen staat wanneer er voor het laatst is
bijgewerkt en hoeveel er nog klaarstaat. Zonder verbinding loopt dat aantal op en
gaat het invoeren gewoon door; zodra er weer bereik is, loopt het leeg.

## Twee soorten koppelen, twee soorten codes

Dit is het onderdeel waar de meeste verwarring zit, dus het staat er los bij:

| | Waarvoor | Waar | Hoe de code eruitziet |
|---|---|---|---|
| **Zaalcode** | Twee apparaten naast elkaar; de meelezer ziet elke bal meteen. Geen internet nodig. | Startscherm → *Meelezen in de zaal* | Begint met `VS1`, en is lang |
| **Ploegcode** | Wedstrijden laten meelopen tussen apparaten die niet tegelijk aan staan. | Instellingen → *Online koppeling* | Vier woorden en vier cijfers |

Ze zijn niet uitwisselbaar. Plak je een ploegcode in het zaalvenster, dan zegt
het scherm waar hij wél hoort — dat gebeurde, en 'ongeldig' was daar geen
bruikbaar antwoord op.

## Van code wisselen

Verander je de ploegcode, dan zet het apparaat alles wat het lokaal heeft
opnieuw in de wachtrij. Dat moet, want de outbox is een wachtrij en geen kopie:
zodra een wijziging is aangekomen gaat de regel eruit. Zonder dat opnieuw
klaarzetten zou een telefoon die per ongeluk aan een verkeerde code hing zijn
wedstrijden nooit meer op de goede plek krijgen — ze staan dan bij een ploeg die
niemand kent, en niets zou ze alsnog opsturen.

## Wat het kost

Niets, bij deze aantallen — en niet nét niets, maar met een factor duizend
marge. De gratis laag geeft 100.000 aanroepen per dag; een wedstrijd kost er een
paar honderd. De database mag 5 GB zijn; een volledig gescoute wedstrijd is
ongeveer twaalfhonderd acties van een paar honderd bytes, dus een halve megabyte.
Daar passen een paar duizend wedstrijden in.

## Als je het niet wilt

Laat het secret weg. Dan is de app precies wat hij hiervoor was: alles lokaal, en
koppelen kan alleen met een apparaat in dezelfde zaal. Het instellingenscherm
zegt dat dan ook, in plaats van een veld te tonen waar niets mee gebeurt.
