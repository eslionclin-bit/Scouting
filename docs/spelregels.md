# Spelregels als fundament

Aanleiding: de app volgde de basisregels van volleybal op te veel plekken niet,
waardoor de invoerder werk deed dat de app zelf kan weten — en er dingen mogelijk
waren die in het veld niet kunnen.

Dit document zet de regels op een rij, wat de app ermee doet, en wat er nog open
staat. De regels zelf staan als code in `src/domain/scoring.ts`.

**De wedstrijdvorm van dit team:** er worden **altijd vier sets gespeeld**, ook
bij 3-0 — dus geen best of five. Staat het na vier sets 2-2, dan volgt een
vijfde set tot 15. De sets ervoor gaan tot 25. Alles met twee punten verschil.

## 1. De regels die ertoe doen

### Puntentelling en sets

- Rally-point: elke rally levert een punt op, ongeacht wie serveerde.
- Een set gaat tot **25 punten met minimaal 2 punten verschil**. Bij 24-24 gaat
  het door tot één team twee punten voorsprong heeft (26-24, 27-25, …).
- De **beslissende vijfde set gaat tot 15**, ook met 2 punten verschil.
- Er worden **altijd vier sets gespeeld**; een vijfde alleen bij 2-2. De app mag
  dus niet stoppen bij drie gewonnen sets.

### Wie serveert

- Wint het **serverende** team de rally, dan serveert **dezelfde speler**
  opnieuw. Er wordt niet gedraaid.
- Wint het **ontvangende** team de rally (sideout), dan draait dat team één
  positie **met de klok mee** en serveert de speler die daardoor in zone 1 komt.
- De zes van de opstelling leggen de **rotatievolgorde voor de hele set** vast.
  Een invaller neemt de plek én de rotatiepositie over van wie hij vervangt.

Gevolg: zodra de opstelling en de uitslag van de toss bekend zijn, ligt voor de
hele set vast wie wanneer serveert. Dat hoort de app te weten, niet te vragen.

### Beginservice per set

- Het team dat set 1 níét begon, begint set 2. Daarna om en om.
- Voor de **beslissende set is er een nieuwe toss**.

Gevolg: de app hoeft maar twee keer per wedstrijd te vragen wie begint — voor
set 1 en, als het zover komt, voor set 5.

### Libero

- De libero **serveert niet** en speelt alleen op een achterpositie.
- Een liberowissel is **geen wissel**: hij mag onbeperkt, met de bal uit het
  spel, en telt niet mee voor het wisselquotum.
- Draait de libero richting de voorlijn, dan komt de speler die hij verving weer
  in het veld — en die serveert dus ook.

Gevolg: de app moet weten wie de libero is, anders zet hij die speler op een
serveerbeurt die in het veld niet bestaat.

### Wissels

- **Maximaal zes wissels per set per team** — het aantal dat in deze competitie
  geldt.
- Een basisspeler mag er één keer uit en één keer terug in, en dan alleen op de
  plek van degene die hem verving.
- Er staan altijd zes spelers in het veld; een wissel verandert wie dat zijn,
  niet hoeveel.

### Time-outs

- Twee per set per team.

## 2. Wat de app nu fout doet

| Nu | Waarom dat niet klopt |
|---|---|
| 'Set afronden' is een knop die je bij 1-0 kunt indrukken | Een set eindigt bij 25 met 2 verschil, niet wanneer iemand op een knop drukt |
| Elke set vraagt wie begint met serveren | Alleen set 1 en set 5 zijn een toss; de rest volgt uit de vorige set |
| De app vraagt wie serveert, ook met een opstelling | Met opstelling en rotatie ligt de server vast |
| Geen posities of rollen bij spelers | Zonder libero-rol zet de app die speler op een serveerbeurt die niet bestaat |
| Undo stopt bij de setgrens | Ging de set per ongeluk dicht, dan moet je terug naar het setpoint ervoor |
| Geen einde aan de wedstrijd | Na vier sets (of vijf bij 2-2) is het klaar |
| Na 'speler toevoegen' springt het scherm door | Aan het begin wil je drie rugnummers achter elkaar intikken |

## 3. Wat er nu in zit

Gebouwd:

- **Puntentelling** in `domain/scoring.ts`: 25 punten, beslissende set 15, twee
  punten verschil, vier vaste sets en een vijfde bij 2-2. De regels staan als
  veld op de wedstrijd, dus een andere competitie is een instelling.
- **Set sluiten op de telling**: bij 25 (met verschil) vraagt de app één keer ter
  bevestiging — 'Set 1 klaar? 25-19' — met 'nog niet' als de stand nog gecorrigeerd
  moet worden. De losse knop 'Set afronden' is verdwenen.
- **Beginservice**: alleen set 1 en de beslissende set vragen om de toss; set 2
  t/m 4 leidt de app af uit de vorige set.
- **Undo over de setgrens**: is de set net gesloten, dan zet undo hem weer open
  op het punt ervoor.
- **Wedstrijd klaar**: na de laatste set stopt de invoer en verwijst het scherm
  naar de cijfers.
- **Server staat klaar**: met een opstelling weet de app wie in zone 1 staat.
  Een **libero wordt daarbij overgeslagen** — die serveert niet.
- **Rollen** bij spelers: spelverdeler, midden, passer-loper, diagonaal, libero.
- **Wisselen** vanuit het invoerscherm, met het aantal wissels van deze set erbij.
  Bij de zevende wissel weigert de app: het quotum is zes per set.
- **Libero in het veld**: per set leg je vast wie de libero is. De app zet hem in
  het veld op de plek van de middenspeler die achterin staat (zone 5 of 6), en
  haalt hem er weer uit zodra diezelfde speler naar zone 1 draait — daar wordt
  geserveerd. Een liberowissel telt niet mee voor het quotum, want het is er geen.
- Alleen tellen wat is afgesloten: een set die na undo weer openstaat, telt niet
  als gewonnen.
- **Per speler doorklikken**: vanuit het wedstrijddashboard en het teamdossier
  open je één speler. Daar staat wat ze doet per actietype, hoe het verloopt over
  het seizoen, en of ze in de laatste wedstrijd onder of boven het eigen niveau
  speelde. Diezelfde vergelijking staat als aanwijzing op het coachscherm, zodat
  je tijdens de wedstrijd weet dát iemand onder haar niveau zit — iets anders dan
  'slecht spelen', en het enige van de twee dat een wissel rechtvaardigt.
  Er wordt pas iets gezegd bij minstens zes acties nu en twintig in de historie.

## 4. Wat er nog moet veranderen

### Datamodel

- `Match` krijgt een puntenregel: sets tot 25 (beslissende set 15), 2 punten
  verschil, 3 gewonnen sets. Als veld, niet als aanname in de code — dan is een
  andere competitie een instelling in plaats van een verbouwing.
- `Player` krijgt een **rol**: spelverdeler, midden, passer-loper, diagonaal,
  libero. De libero-rol is de enige die gedrag verandert (serveert niet).
- `MatchSet` krijgt een afgeleide status 'gewonnen door', en de beginservice van
  set 2 t/m 4 wordt berekend in plaats van gevraagd.
- Wissels krijgen een teller per set, zodat de app kan waarschuwen bij het
  maximum.

### Invoerscherm

- **Setpoint**: bij 24-24 of 24-x meldt de app dat het setpoint is, en bij het
  bereiken van de setwinst vraagt hij één keer ter bevestiging: 'Set klaar?
  25-19.' Ja sluit de set, nee laat je doorgaan (voor als er een punt te veel
  is ingevoerd).
- **'Set afronden' verdwijnt** als losse knop.
- **Undo over de setgrens**: is de set net gesloten, dan zet undo hem weer open
  op het setpoint.
- **Wisselen in twee tikken** vanuit het invoerscherm: speler eruit, speler erin.
  De app houdt bij hoeveel wissels er nog over zijn.
- **De server hoeft niet gekozen te worden** zolang de opstelling bekend is; bij
  een liberopositie kiest de app de speler die de libero verving.
- **Speler toevoegen** blijft in de lijst staan in plaats van door te springen.

### Wat er dan overblijft om te vragen

Per wedstrijd: de opstelling van set 1 en de toss. Per set daarna: alleen de
opstelling. In de beslissende set opnieuw de toss. Verder rekent de app.

## 5. Voorstel: invoeren op het veld

Dit is de vraag 'kan het intuïtiever' uit een eerder gesprek, nu concreet.

Het scherm toont het **veld met de zes posities**, gevuld met de rugnummers uit
de opstelling en de huidige rotatie. Dat is meteen ook de zoneselectie: waar je
tikt, is waar de speler staat.

Invoeren wordt dan:

1. **Tik op de speler in het veld** — dat is 'wie' én 'waar' in één handeling.
2. **Kies de actie** (zes knoppen onder het veld).
3. **Kies de kwalificatie** (vier knoppen).

Voor een service scheelt dat nog meer: de server staat al vast, dus die licht
op en je tikt alleen nog de kwalificatie. Een ace is dan één tik in plaats van
vijf.

Wat dit oplost:
- De stap 'wie' verdwijnt bijna altijd, want het veld toont wie waar staat.
- De zone is geen aparte vraag meer.
- Je ziet tijdens het invoeren de opstelling, dus een wissel of een fout in de
  rotatie valt meteen op.

Wat het kost:
- Het werkt alleen goed als de opstelling is ingevuld. Zonder opstelling moet de
  huidige stapsgewijze invoer blijven bestaan als terugval.
- Op een telefoon is een veld met twaalf vakken klein. Voorstel: veld op tablet,
  stappen op telefoon — of het veld boven en de knoppen eronder, wat op een
  telefoon in de lengte nog past.
- De tegenstander heeft meestal geen opstelling. Voor hun kant blijft het een
  veld met zes zones zonder namen, wat voor de analyse (aanvalszones) precies
  genoeg is.

## 6. Wat nog openstaat

- **Wisselregel 'één keer uit, één keer terug'**: het aantal wissels wordt
  bewaakt (zes per set), maar dat een basisspeler alleen terug mag op de plek van
  degene die haar verving nog niet. In de praktijk zou de app daarvoor moeten
  weigeren wat een scheidsrechter ook weigert; dat is pas nuttig als het echt
  voorkomt.
- **Time-outs**: worden niet geteld.
- **Invoeren op het veld** (hoofdstuk 5): besproken, bewust uitgesteld tot de
  regels staan.
