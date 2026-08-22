# Scoutbestanden inlezen (.dvw)

Waarom dit er is: de referentiekolom in de cijfertabellen was een ordegrootte
uit de literatuur. Met ingelezen wedstrijden wordt het een telling, met het
aantal wedstrijden erbij. En het levert nog iets op wat niemand anders
controleert: onze eigen rekenwerk komt langs een bestand dat ook door andere
software gelezen wordt.

## Het formaat, kort

Een `.dvw` is platte tekst in secties, met puntkomma's als scheidingsteken:

| Sectie | Wat erin staat |
|---|---|
| `[3MATCH]` | datum, seizoen, competitie |
| `[3TEAMS]` | twee regels: thuisploeg en bezoekers |
| `[3PLAYERS-H]` / `[3PLAYERS-V]` | rugnummers, namen, rol |
| `[3SET]` | de eindstand per set — onze belangrijkste controle |
| `[3SCOUT]` | de wedstrijd zelf, één regel per balcontact |

Een scoutregel ziet er zo uit:

```
*06SM#~~~18C;p;;;;;;14.31.13;1;3;3;;;;6;15;4;12;10;9;11;15;10;13;3;16;
```

- `*` thuisploeg (`a` = bezoekers), `06` rugnummer;
- `S` vaardigheid (Serve), `M` type, `#` waardering (ace);
- daarna combinatiecode, startzone `1`, eindzone `8`, subzone `C`;
- in de kolommen erna: tijd, **setnummer**, de positie van beide spelverdelers,
  en wie er op dat moment in het veld staat.

Verder komen voor: `*p01:00` (punt, met de stand), `**1set` (einde set), `*z3`
(spelverdeler draait door), `*c02` (wissel), `*T` (time-out) en `*$$&H#` (een
punt zonder toegewezen actie).

De betekenis van de codes is afgeleid uit de broncode van het R-pakket
[`datavolley`](https://github.com/openvolley/datavolley) (MIT).

## De vertaling naar onze begrippen

Dit is de plek waar het mis kan gaan, dus hij staat expliciet in
`src/import/dvw/interpret.ts`.

**Vaardigheden** vallen één op één samen, op één na: `F` (vrije bal) wordt bij
ons verdediging, want dat is wat het in het spel doet.

**Waarderingen** niet. DataVolley kent er zes per vaardigheid, wij vier:

| | perfect | goed | matig | fout |
|---|---|---|---|---|
| Service | `#` ace | `/` `+` | `!` `-` | `=` |
| Pass | `#` | `+` | `!` `-` `/` | `=` |
| Aanval | `#` | `+` | `!` `-` | `/` geblokt, `=` |
| Blok | `#` | `+` | `!` `-` | `/` `=` |
| Verdediging | `#` | `+` | `!` `-` `/` | `=` |
| Set-up | `#` | `+` | `!` `-` `/` | `=` |

De gevolgen daarvan hoor je te kennen voordat je de cijfers gebruikt:

- **Sideout en punt op eigen service zijn hard te vergelijken.** Die volgen uit
  de uitslag van een rally, en die betekent overal hetzelfde.
- **De vier actiecijfers zijn een richting.** 'Pass positief' bij ons is niet
  precies 'pass positief' in een DataVolley-bestand, omdat de grens tussen goed
  en matig ergens anders ligt. Dat staat ook in de app bij het cijfer.

**Tempo en blok**: het aanvalstempo komt uit de typecode (`H` hoog; `Q`, `M`,
`F`, `N`, `T`, `U` snel; `O` overig) en wordt 'achter' zodra de aanval vanaf een
achterzone komt. Onze vier soorten gaan over tempo, niet over plaats — een
gestrekte bal naar de antenne is net zo goed 'snel' als een korte bal in het
midden. Het aantal blokkeerders komt uit de code voor het aantal spelers; een
'blok met een gat' (code 4) telt als dubbel blok, want er staan twee mensen.

Niet elk bestand vult beide in: in de Bundesliga-wedstrijd staat geen enkel
blokaantal en ontbreekt de startzone bij aanvallen, waardoor daar geen
achterbalaanvallen te herkennen zijn. Dat is 'onbekend', geen nul — de app telt
het apart.

**Foutreden**: de 'special code' van DataVolley — één letter die zegt waardoor
de bal verloren ging — wordt per vaardigheid vertaald naar onze zes redenen
(uit, in het net, geblokt, technische fout, onhoudbaar, anders). Een geblokte
aanval komt gratis: die staat al in de waardering (`/`). Ook hier vult niet elke
scout het in: in twee van onze vier testbestanden staat geen enkele reden.

**Zones**: DataVolley verdeelt het veld in negen zones. De drie diepe zones
vallen bij ons samen met de achterzone erboven (7→5, 8→6, 9→1).

**Rotatie**: DataVolley noteert de positie van de spelverdeler (1-6). Die nemen
we over als rotatiestand van een ingelezen wedstrijd. Dat is een andere
nummering dan bij onze eigen wedstrijden (waar rotatie 1 de startopstelling is),
dus rotatiecijfers zijn niet tussen eigen en ingelezen wedstrijden te
vergelijken. Voor de kerngetallen maakt het niets uit.

## Controles

- **Setstanden.** Wat wij uit de rally's optellen wordt vergeleken met de
  eindstanden die het bestand zelf in `[3SET]` noteert. Wijken die af, dan lezen
  we het bestand verkeerd. Alle vier de testbestanden komen exact uit.
- **Scoutdiepte.** Acties gedeeld door rally's. Onder de vier is een bestand
  alleen op hoofdlijnen gescout; zo'n wedstrijd telt dan wel mee voor sideout en
  punt op eigen service (die volgen uit de uitslag) maar niet voor de
  actiecijfers, want die zouden over een selectie gaan.
- **Overgeslagen codes** worden geteld en gemeld, niet stilzwijgend weggegooid.

## Wat er met een ingelezen wedstrijd gebeurt

Hij komt in dezelfde opslag als de eigen wedstrijden, met `reference: true`. Dat
betekent:

- hij staat **niet** in de eigen wedstrijdlijst en telt **niet** mee in ons eigen
  gemiddelde — anders zou de Bundesliga onze seizoenscijfers optillen;
- de ploegen eruit staan niet tussen onze tegenstanders;
- hij telt mee voor de referentiekolom, met **beide ploegen**. Wie alleen naar de
  thuisploeg kijkt, meet of die won — niet wat het niveau is.

Een referentiewaarde blijft indicatief zolang er minder dan honderd waarnemingen
achter zitten. Pas daarboven staat er `berekend` bij, met het aantal wedstrijden
en de competities.

## Waar bestanden vandaan komen

Er is geen openbare database met scoutbestanden. Wat er publiek is, staat bij het
[openvolley-project](https://github.com/openvolley/ovdata) — een handvol echte
wedstrijden, waarvan er vier in `fixtures/dvw/` staan (zie `HERKOMST.md`).
Verder komen ze van clubs die zelf met DataVolley of VolleyStation scouten.
