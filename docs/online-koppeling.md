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

Dat adres zet je in GitHub onder *Settings → Secrets and variables → Actions* als
`SYNC_URL`. De eerstvolgende deploy neemt het mee.

Daarna, op elk apparaat: **Instellingen → Online koppeling**. Op het eerste
apparaat laat je de app een code maken en schrijf je hem op; op de andere vul je
dezelfde in.

## Wat je ervan merkt

Niets, als het goed is. Onder Instellingen staat wanneer er voor het laatst is
bijgewerkt en hoeveel er nog klaarstaat. Zonder verbinding loopt dat aantal op en
gaat het invoeren gewoon door; zodra er weer bereik is, loopt het leeg.

De koppeling in de zaal (twee apparaten rechtstreeks, zonder internet) blijft
bestaan en blijft sneller: die is voor live meelezen tijdens de wedstrijd. De
online koppeling is voor bijwerken tussen apparaten die niet tegelijk aan staan.

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
