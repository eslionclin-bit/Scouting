# Invoeren op een tablet

De invoer is het enige onderdeel dat onder tijdsdruk staat. Een dashboard mag
even nadenken; een rally niet. Dit document legt vast hoe de veldinvoer werkt en
waarom hij zo is.

## Waar het vandaan komt

Vergeleken met de bestaande programma's:

| Programma | Manier | Wat we ervan leren |
|---|---|---|
| DataVolley | Toetsenbordcodes (`*06SM#`) | Bloedsnel voor een getrainde scout, onbruikbaar voor een vrijwilliger. Profsoftware optimaliseert snelheid per actie; wij moeten leerbaarheid optimaliseren. |
| VolleyStation, Click&Scout | Tablet, tikken op een veld | Het veld is de juiste kapstok: je ziet wat je invoert. |
| SoloStats Live, iScore | Speler → actie → resultaat, knoppenlijsten | Werkt, maar je vertaalt de hele tijd van wat je ziet naar een naam in een lijst. |
| ovscout2 | Veld mét de rotatie erin | De zes op hun rotatiepositie tonen scheelt de vraag 'wie'. |

Wat de goede gemeen hebben: de zes staan op het veld, de bank staat er visueel
buiten, de resultaatknoppen staan altijd op dezelfde plek (spiergeheugen), undo
zit in een vaste hoek, en de stand is altijd groot in beeld.

## Wat er mis was met onze stapsgewijze invoer

Die stelt elke vraag opnieuw — ook als het antwoord al vastligt. De app weet wie
er in zone 1 staat en dus serveert, en vroeg het toch. Vier tot vijf tikken per
actie, en je keek naar een namenlijst in plaats van naar het veld.

## Hoe de veldinvoer werkt

**Het hele veld staat op het scherm; je tikt waar het gebeurde en hoe het ging.**

- Eén veld, net in het midden. Onze helft toont de zes op hun rotatiepositie met
  rugnummer en naam, libero inbegrepen. Hun helft toont de zes zones, gezien
  vanaf onze kant: hun voorlijn staat tegen het net en hun zone 4 (hun
  linksvoor) staat voor ons rechts.
- **Eén tik op een vak** legt vast wie het was, welke kant en welke zone.
- **De actiesoort wordt voorspeld** en staat groot naast het veld. Je leest wat
  je vastlegt in plaats van het in te vullen; klopt het niet, dan is het één tik.
- **De tweede tik is de kwalificatie**, en daarmee staat de actie erin.

Dus twee tikken per actie. Een rally van vijf acties kost er negen, tegen
ongeveer twintig in de stapsgewijze invoer.

Verder:

- **Bij onze eigen service staat de server al geselecteerd** (die volgt uit de
  opstelling). Een ace is één tik. De plek achter de achterlijn staat op 'midden'
  en is met één tik te veranderen — de strook staat onder ons veld, want daar
  staat de server ook.
- **Tik je de andere ploeg aan dan de app verwachtte, dan schuift het actietype
  mee.** Verwachtte hij onze service en tik jij de tegenstander aan, dan gaat het
  om hun pass. Altijd te corrigeren.
- **Bij een verwachte pass licht op wie er passt** — de sideout-opstelling. De
  zes blijven staan waar ze staan (anders klopt de rotatie niet meer), maar de
  passer-loper die vooraan staat krijgt het label 'passt', want die past in
  vrijwel alle gevallen mee. De spelverdeelster en de diagonaal niet.
- **Bij een blok lichten alleen de drie voorlijnvakken op.** Een blokpunt is een
  punt en hoort aan een naam te hangen; blokken doet de voorlijn.
- **Alles wat optioneel is, wordt ná de tik gevraagd** in één verfijnbalk: tempo
  en blok bij een aanval, de reden bij een fout, welke tegenstander het was.
  De balk verdwijnt vanzelf. Zo blijft de hoofdstroom altijd twee tikken en kost
  detail alleen iets als je er tijd voor hebt.
- De knoppen die je zelden nodig hebt (koppelen, stand, corrigeren, wissel) staan
  achter één knop; de balk had er zeven.

## Wanneer welke invoer

| Situatie | Invoer |
|---|---|
| Tablet (900 px of breder) mét opstelling | Veldinvoer |
| Geen opstelling ingevuld | Stapsgewijs — zonder de zes weet de app niet wie waar staat |
| Telefoon | Stapsgewijs — zes vakken plus knoppen passen niet |

De stapsgewijze invoer blijft dus bestaan, met dezelfde opslag en dezelfde regels
eronder.

## Instellingen (per tablet)

Ze staan op het startscherm onder 'Instellingen' en gelden voor dit apparaat, niet
voor de wedstrijd — een tweede tablet heeft zijn eigen keuzes.

- **Veld rechts, knoppen links** — voor wie de tablet met links bedient.
- **Set-up altijd vragen** — standaard uit. De toets kost ongeveer een derde van
  alle tikken en zegt weinig zolang hij gewoon goed is.
- **Van de tegenstander** — drie standen, standaard 'ook hun pass':
  - *alleen wat op ons afkomt* — hun service en hun aanval;
  - *ook hun pass* — twee tikken per ontvangen rally, en het levert op wie van
    hen slecht past: daar serveer je de volgende keer naartoe;
  - *alles van hen* — ook hun set-up en verdediging.
- **Rugnummers van de tegenstander tonen** — standaard aan.

## Waarom hun verdediging niet apart wordt gevraagd

Omdat het twee keer dezelfde vraag is. Zeg je van onze aanval dat hij geen punt
was maar de tegenstander wel in de problemen bracht, dan *is* dat het oordeel
over hun verdediging. Nog een keer op hun helft tikken om hetzelfde te zeggen
kost twee tikken en levert niets op wat er niet al stond.

Wat er van hen overblijft is wat op ons afkomt — hun service en hun aanval — en,
als je het wilt weten, hun receptie. Alleen dat wordt vóórgesteld; de rest is
altijd nog met één tik te kiezen.

Hetzelfde geldt voor hun blok. Wie van hen blokte doet er voor ons niet toe; hoe
vaak wij tegen één, twee of drie blokkeerders aanliepen wél, en dat staat al bij
onze eigen aanval.

## De tegenstander: hun opstelling en waar je naartoe serveert

Onder 'Hun opstelling' (achter de ⋯) vul je hun zes rugnummers in, zoals ze er
op dat moment staan. De app rekent zelf terug naar het begin van de set en telt
hun rotatie daarna net zo door als die van ons: zij draaien zodra zij een rally
winnen waarin wij serveerden. Voer je dus een servicefout in, dan staat er
meteen bij wie er bij hen aan de opslag komt.

Het is optioneel — zonder werkt alles gewoon — maar het levert twee dingen op:

- **Wie van hen serveert**, boven in de balk.
- **Op wie je serveert.** Tijdens onze eigen service ligt hun helft leeg; een tik
  daar betekent dan 'daar ging hij naartoe' en niet 'zij deden iets'. Wie daar
  stond leidt de app af uit hun opstelling plus de rotatie van die rally. Vul je
  hun zes pas later in, dan krijgen de al ingevoerde services die naam alsnog.

Dat is wat 'serveer op positie 5, zeker als #38 daar staat' mogelijk maakt: het
staat op het dashboard onder 'Waar we naartoe serveren' en komt als aanwijzing
terug op het coachscherm.

## Posities en de libero

Een speelster krijgt één positie waar ze normaal staat, en daarnaast desgewenst
alles wat ze verder kan. Dat beperkt niets — je kunt elke actie aan elke
speelster hangen — maar het maakt twee dingen mogelijk: zien wie er inzetbaar is
als er iemand uitvalt, en begrijpen waarom iemands cijfers per positie
verschillen.

Voor de libero rekent de app zelf uit voor wie ze erin komt: de enige
middenspeelster achterin, in zone 5 of 6 en nooit in zone 1 — daar wordt
geserveerd. Staan er twee middens achterin, of speelt iemand naast midden ook
iets anders, dan is dat raden. Dan kies je het zelf onder 'Opstelling → komt in
voor', en die keuze wint.

Formeel mag de libero voor elke achterspeelster invallen; de standaard is de
middenspeelster, na afloop van haar serviceserie. Beide gevallen kunnen dus.

## Punt zonder actie

De stand volgt normaal uit de actie zelf: een kill is een punt, een fout is een
punt tegen, en de rally sluit vanzelf. De twee knoppen onderin zijn voor de rally
die eindigt zonder dat er iets is ingevoerd — de tegenstander slaat uit terwijl
je hun aanval niet vastlegt, een netfout, een fluitsignaal, een bal die te
rommelig was om te scouten.

## Wat 'set-up overslaan' precies betekent

Alleen dat de app hem niet vóórstelt. Drie gevallen waarin je hem toch krijgt:

1. **De set-up gaat fout.** Een fout beëindigt de rally, dus die wordt hoe dan
   ook ingevoerd — hij kan niet verdwijnen.
2. **De set wordt overgenomen** door iemand anders dan de spelverdeler. Dat is
   precies het geval dat de moeite waard is: tik 'Set-up' en de speler, en het
   staat erin.
3. **De set was slecht.** Zelfde: één tik op 'Set-up', dan de kwalificatie.

Wie alles wil vastleggen, zet de instelling aan.

## Een wedstrijd van een ander apparaat inlezen

Op het startscherm staat **Wedstrijd inlezen**: kies een JSON-bestand dat op een
ander apparaat is geëxporteerd, en de wedstrijd staat erbij.

Twee dingen maken dat veilig, en ze zijn allebei geleend van de netwerkkoppeling:

1. **De id's blijven staan.** Elk record heeft een uuid van het apparaat waar het
   is ingevoerd. Hetzelfde bestand twee keer inlezen levert dus geen tweede
   wedstrijd op.
2. **De hoogste revisie wint.** Een oud bestand kan verse invoer op dit apparaat
   niet overschrijven; een nieuwer bestand vult wel aan.

Wat het niet doet is ploegen samenvoegen. Heeft de tablet een eigen team
aangemaakt en de telefoon ook, dan zijn dat twee ploegen, en dat blijven het er
twee. Samenvoegen op naam is raden, en raden hoort niet thuis in iets dat data
wegschrijft.
