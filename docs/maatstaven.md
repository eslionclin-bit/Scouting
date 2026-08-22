# Waar de getallen mee vergeleken worden

Een percentage op zichzelf zegt niets. 50% sideout is prima of dramatisch,
afhankelijk van wat jullie normaal doen en van wat er in het spel te halen valt.
Daarom staat elk kerngetal in de app naast twee andere:

| Kolom | Wat het is | Waar het vandaan komt |
|---|---|---|
| Deze wedstrijd / set | Wat er nu gebeurt | Geteld uit de ingevoerde acties |
| Ons gemiddelde | Ons eigen niveau | Geteld uit onze andere wedstrijden |
| Topniveau | Waar het heen kan | Een referentiewaarde uit `src/analysis/benchmarks.ts` |

De eerste twee zijn tellingen. De derde niet, en dat is het belangrijkste wat er
over dit hoofdstuk te zeggen valt.

## De zes kerngetallen

Ze staan in `src/analysis/metrics.ts`, en ze worden overal op dezelfde manier
gerekend — op het dashboard, in het teamdossier en op het coachscherm.

| Getal | Telling |
|---|---|
| Sideout | Rally's gewonnen als de tegenstander serveert |
| Punt op eigen service | Rally's gewonnen als wij serveren |
| Pass positief | Passes die perfect of goed waren |
| Aanval punt | Aanvallen die direct een punt opleveren |
| Aanvalsrendement | (punten − fouten) / aanvallen |
| Servicefouten | Services die de bal weggeven |

## Ons eigen gemiddelde

Dit is de eerlijkste maatstaf die de app heeft, want hij komt uit dezelfde bron
als het getal ernaast: jullie eigen wedstrijden, met dezelfde invoerder en
dezelfde definities.

Hij wordt op twee manieren gebruikt:

1. **Als kolom** naast wat er nu gebeurt. Vanaf 25 rally's of acties in de
   historie; daaronder is het geen niveau maar een momentopname, en dan blijft
   het oordeel leeg.
2. **Als drempel** voor bevindingen die binnen het team gaan over onderlinge
   verschillen. Een rotatie is niet zwak omdat hij onder een vast percentage
   ligt, maar omdat hij twaalf procentpunt onder onze eigen andere rotaties
   ligt. Of 40% sideout slecht is, hangt van de competitie af; dat R4 ver onder
   de andere vijf ligt, is in elke competitie iets om aan te werken.

Voor absolute kwaliteit werkt dat niet: als jullie gemiddeld 20% servicefouten
maken, is 20% niet opeens goed. Daar staan dus vaste grenzen, met de
referentiewaarde ernaast zodat je zelf kunt wegen.

## De referentiewaarden — en wat ze niet zijn

De waarden onder 'Topniveau' zijn **indicatief**: ordegroottes die in de
volleybalanalyse voor internationaal topniveau worden aangehouden. Ze zijn niet
door ons uit een dataset gerekend. Dat staat bij elk getal in de app
(`indicatief`), en de herkomst is uit te klappen door erop te tikken.

Dat label is geen slag om de arm voor de vorm. De hele app is gebouwd op het
principe dat je van elk getal kunt navertellen waar het vandaan komt, en deze
zes getallen zijn de enige die dat niet halen. Zolang dat zo is, horen ze te
worden gelezen als richting, niet als norm.

Ze staan daarom als **data** in `src/analysis/benchmarks.ts`, niet als drempel in
de code: een beter onderbouwd getal is een regel aanpassen.

## Hoe ze harde getallen worden

Door ze te berekenen uit echte wedstrijden. Het veld `basis` in een referentie
kan `berekend` zijn in plaats van `indicatief`, met het aantal wedstrijden erbij
— dan is het pas een maatstaf.

De route daarnaartoe is het inlezen van **DataVolley-bestanden** (`.dvw`), het
formaat waarin op hoger niveau al jaren wordt gescout. Eén bestand is één
wedstrijd, actie voor actie. Wat dat oplevert:

- referentiewaarden die uit tellingen komen in plaats van uit literatuur;
- een toets voor de analyse zelf: dezelfde wedstrijd door onze code en door
  bestaande software gehaald hoort dezelfde cijfers op te leveren;
- een migratiepad voor iedereen die al in DataVolley scout.

Wat het niet oplevert: cijfers uit jullie eigen competitie. Die worden nergens
op actieniveau vastgelegd, door niemand. Het eigen gemiddelde blijft dus de
belangrijkste maatstaf — en die wordt beter met elke wedstrijd die erin gaat.
