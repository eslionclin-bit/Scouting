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
invoeren → lokale opslag → outbox → transport → Supabase
                                        ↑            ↓
                              ander apparaat ← ophalen
```

De server bewaart **één rij per record**, niet één per wijziging: elke
wijziging bevat het volledige record, dus de vorige versie heeft geen waarde
meer. Daardoor is opnieuw versturen ongevaarlijk en blijft de tabel klein.

Twee dingen doet de server zelf:

1. **Een volgnummer per wijziging.** De logische klok van de app loopt per
   apparaat op, maar niet tussen apparaten onderling. Om 'geef me alles ná dit
   punt' te kunnen zeggen, is één teller nodig die de server bijhoudt.
2. **De ploegcode controleren.**

## Waarom de anon-sleutel in de app mag staan

Supabase heeft een publieke sleutel die in elke webapp terechtkomt. Hier mag die
sleutel niets: de tabellen staan dicht (row level security, en de rechten zijn
ingetrokken). Er zijn precies twee functies die van buiten aan te roepen zijn,
`sync_push` en `sync_pull`, en die vragen allebei om de ploegcode. Die code
staat alleen op het apparaat zelf, nooit in de code en nooit in deze repository,
en op de server staat hij gehasht — net als een wachtwoord.

Wie de code heeft, ziet de wedstrijden van de ploeg. Deel hem dus binnen het
team en niet daarbuiten.

## Opzetten

Eenmalig, ongeveer een kwartier.

1. Maak een gratis project aan op supabase.com. **Kies bij de regio Frankfurt of
   Amsterdam** — dan blijven spelersnamen en wedstrijdgegevens binnen de EU.
2. Open in het project de SQL-editor, plak `server/supabase/schema.sql` erin en
   voer het uit.
3. Maak de ploeg aan, in diezelfde editor:

   ```sql
   select add_team('VCH DS 1', 'kies-hier-een-code');
   ```

   Bedenk zelf een code. Iets van drie woorden achter elkaar is prima en beter te
   onthouden dan iets korts met tekens erin.
4. Zoek in het project onder *Settings → API* twee waarden op: de **Project URL**
   en de **anon public** sleutel.
5. Zet ze in GitHub onder *Settings → Secrets and variables → Actions* als
   `SUPABASE_URL` en `SUPABASE_ANON_KEY`. De eerstvolgende deploy neemt ze mee.
6. Op elk apparaat: **Instellingen → Online koppeling**, ploegcode invullen,
   koppelen. Eén keer per apparaat.

## Wat je ervan merkt

Niets, als het goed is. Onder Instellingen staat wanneer er voor het laatst is
bijgewerkt en hoeveel er nog klaarstaat. Zonder verbinding loopt dat aantal op
en gaat het invoeren gewoon door; zodra er weer bereik is, loopt het leeg.

De koppeling in de zaal (twee apparaten rechtstreeks, zonder internet) blijft
bestaan en blijft sneller: die is voor live meelezen tijdens de wedstrijd. De
online koppeling is voor bijwerken tussen apparaten die niet tegelijk aan staan.

## Wat het kost

Niets, bij deze aantallen. Een volledig gescoute wedstrijd is ongeveer twaalfhonderd
acties van een paar honderd bytes — een halve megabyte. De gratis laag van
Supabase geeft 500 MB, en die staat pas na een paar honderd seizoenen vol.

## Als je het niet wilt

Laat de twee secrets weg. Dan is de app precies wat hij hiervoor was: alles
lokaal, en koppelen kan alleen met een apparaat in dezelfde zaal. Het scherm
zegt dat dan ook, in plaats van een veld te tonen waar niets mee gebeurt.
