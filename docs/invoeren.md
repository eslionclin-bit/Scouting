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
  rugnummer en naam, libero inbegrepen. Hun helft toont de zes zones.
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
- **Pass van de tegenstander vastleggen** — standaard aan. Kost twee tikken per
  ontvangen rally en levert op wie van hen slecht passt: daar serveer je de
  volgende keer naartoe.
- **Rugnummers van de tegenstander tonen** — standaard aan.

## Wat 'set-up overslaan' precies betekent

Alleen dat de app hem niet vóórstelt. Drie gevallen waarin je hem toch krijgt:

1. **De set-up gaat fout.** Een fout beëindigt de rally, dus die wordt hoe dan
   ook ingevoerd — hij kan niet verdwijnen.
2. **De set wordt overgenomen** door iemand anders dan de spelverdeler. Dat is
   precies het geval dat de moeite waard is: tik 'Set-up' en de speler, en het
   staat erin.
3. **De set was slecht.** Zelfde: één tik op 'Set-up', dan de kwalificatie.

Wie alles wil vastleggen, zet de instelling aan.
