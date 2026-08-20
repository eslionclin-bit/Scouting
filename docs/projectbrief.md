# Projectbrief: offline volleybal scouting-app

**Doel:** een app waarmee een coach of assistent tijdens (of na afloop van) een wedstrijd rally's actie-voor-actie kan invoeren — inclusief speler, zone en kwalificatie — volledig offline op een tablet in de sporthal, met automatische synchronisatie zodra er weer verbinding is. De verzamelde data voedt twee dingen: (1) een analysedashboard na de wedstrijd, (2) een opponent-dossier dat groeit naarmate je vaker tegen dezelfde tegenstander speelt.

Dit document is het startpunt voor de bouw in Claude Code. Het bundelt: de datastructuur, het scoutingprotocol (kwalificatiedefinities), de schermontwerpen, en een featurelijst gebaseerd op onderzoek naar bestaande volleybal-scoutingapps.

---

## 1. Kernvereiste: offline-first

Dit is geen "nice to have" maar het uitgangspunt van de architectuur:

- App moet volledig bruikbaar zijn **zonder internetverbinding** — invoer, navigatie, laatste-acties-overzicht, alles lokaal.
- Data wordt lokaal opgeslagen op het apparaat (bijv. IndexedDB in een PWA) en pas gesynchroniseerd zodra er weer wifi/4G is.
- Aanbevolen vorm: **Progressive Web App (PWA)** — installeerbaar als icoon op tablet/telefoon, werkt offline via een service worker, geen appstore-traject nodig.
- Synchronisatie mag nooit blokkeren: als sync mislukt, blijft de app normaal bruikbaar en probeert het later opnieuw.

## 2. Datamodel

Een wedstrijd bestaat uit sets → rally's → acties. Elke actie is de kleinste eenheid en staat nooit op zichzelf: hij hoort bij een rally-keten.

```
Wedstrijd
  - datum, tegenstander, thuis/uit, eindstand per set
  Set (1-5)
    - setstand
    Rally
      - volgnummer, resultaat (punt wij / punt zij)
      Actie (herhaald, in volgorde)
        - team (wij / tegenstander)
        - speler (rugnummer + naam)
        - actietype (opslag, receptie, toets, aanval, block, verdediging)
        - zone_vertrek (1-6, verplicht bij opslag/aanval)
        - zone_landing (1-6, optioneel)
        - kwalificatie (perfect / goed / matig / fout)
        - tijdstempel (optioneel, alleen relevant bij invoer tijdens video-terugkijken)
```

**Toewijzingsregel** (uit het scoutingprotocol): een actie hoort bij de speler die de bal als laatste redelijkerwijs kon beïnvloeden — niet automatisch bij wie de bal raakte. Een onhoudbare opslag wordt een "perfecte opslag" (ace), zonder aparte receptie-actie.

Exportformaat: platte, open structuur (JSON en/of CSV) zodat data nooit vastzit in de app — geen eigen gesloten formaat.

## 3. Scoutingprotocol — kwalificatiecriteria

Vaste regel voor elke kwalificatie: gekoppeld aan een **zichtbaar, telbaar gevolg** voor de rally, niet aan een esthetisch oordeel. Bij twijfel: kies de lagere kwalificatie.

| Kwalificatie | Algemeen principe |
|---|---|
| Perfect | Beste mogelijke gevolg: alle opties open voor de volgende speler, of direct punt |
| Goed | Bruikbaar, aanval/opbouw gaat normaal door, lichte beperking |
| Matig | Volgende speler moet improviseren: minder opties, geforceerde keuze |
| Fout | Rally eindigt direct in nadeel: bal uit, in het net, punt voor tegenstander |

**Per actietype (samenvatting — volledige tabellen met voorbeelden staan in `scoutingprotocol.docx`):**

- **Opslag** — perfect = ace; goed = ontvanger kan alle aanvalsopties nog gebruiken; matig = ontvanger kan nog maar 1-2 opties gebruiken; fout = net/uit/overtreding.
- **Receptie/verdediging** — perfect = ideale plek voor spelverdeler; goed = blijft speelbaar voor reguliere aanval; matig = dwingt tot noodoplossing; fout = bal niet bereikt of direct verloren.
- **Toets/opbouw** — perfect = alle afgesproken aanvalsopties uitvoerbaar; goed = kleine aanpassing nodig; matig = noodslag of andere aanvalsrichting; fout = niet meer aan te vallen of overtreding.
- **Aanval** — perfect = direct punt; goed = wel verdedigd maar geen tegenaanval mogelijk; matig = tegenstander zet reguliere tegenaanval op; fout = net/uit/geblokt tot puntverlies.
- **Block** — perfect = direct punt na block; goed = vertraagt bal zodat eigen team kan verdedigen; matig = geen invloed; fout = bal eigen veld in, of overtreding.

Zone-registratie: standaard rotatienummering 1-6. Vertrekzone (waar de speler stond bij afzet) is verplicht bij opslag en aanval; landingszone is optioneel.

## 4. Schermontwerp

Drie hoofdschermen, ontworpen voor bediening met duim/wijsvinger op tablet tijdens live wedstrijd:

**A — Rally-invoer (hoofdscherm tijdens de wedstrijd)**
- Bovenaan: set, stand, wisselknop team "wij" / "tegenstander"
- Rally-keten zichtbaar bovenin: reeks van al ingevoerde acties in deze rally, als pilletjes met pijltjes ertussen (bijv. "#4 opslag → #9 receptie goed → #7 aanval z4→z6")
- Daaronder in volgorde: spelerselectie (grid met rugnummer + naam) → zoneselectie (mini-veld, 6 tikbare vakken) → kwalificatie (4 knoppen, kleurgecodeerd: groen/lichtgroen/oranje/rood)
- Onderaan: rally afronden met "punt wij" / "punt zij", plus **undo** van de laatste actie — expliciet vereist, geen optioneel extra'tje
- Elke kwalificatieknop toont bij lang indrukken (of als tooltip) het bijbehorende criterium uit het protocol, zodat nieuwe invoerders niet hoeven te bladeren

**B — Analysedashboard (na de wedstrijd/set)**
- Samenvattende cijfers per speler en per rotatie (foutpercentage, puntpercentage per actietype)
- Zone-heatmap: van waaruit wordt aangevallen/geserveerd, eigen team én tegenstander apart
- Filter op set, op rotatie, op speler

**C — Opponent-dossier (verzameld over meerdere wedstrijden)**
- Header: naam tegenstander, aantal eerdere wedstrijden, head-to-head record
- Aanvalszone-verdeling in percentages (tikbaar mini-veld met percentage per zone)
- Automatisch gegenereerde lijst "belangrijkste zwaktes" — puur afgeleid uit tellingen, geen giswerk (bijv. "spelverdeler kiest bij druk in 71% voor midden")
- Kort tactisch advies-blok, gegenereerd op basis van de cijfers

*(Visuele mockups van deze drie schermen zijn eerder in dit gesprek gedeeld en kunnen als stijlreferentie dienen.)*

## 5. Featurelijst — gebaseerd op onderzoek naar bestaande apps

Features die coaches aantoonbaar waarderen in vergelijkbare tools (DataVolley, Click & Scout, SoloStats, VBStats, Coachr, Volleyball Lineup Tracker), en die worden meegenomen in dit ontwerp:

| Feature | Waarom | Prioriteit |
|---|---|---|
| Offline-first met achtergrond-sync | Kernvereiste, geen betrouwbare wifi in sporthallen | v1, blocking |
| Klik/tap-interface, geen vrije tekstinvoer | Typen heeft steile leercurve; klikken werkt voor iedere invoerder | v1 |
| Undo per actie én per rally | Fouten bij snelle live-invoer zijn onvermijdelijk; expliciet gewaardeerd door gebruikers | v1, blocking |
| Kwalificatiecriteria zichtbaar in de app (tooltip/uitleg) | Voorkomt inconsistente invoer tussen meerdere invoerders | v1 |
| Rotatie- en wisselbeheer geïntegreerd | Voorkomt twee losse systemen naast elkaar (rotatie op papier + acties in app) | v2 |
| Open exportformaat (JSON/CSV) | Data mag nooit vastzitten in één app | v1 |
| Live meelezen: coach ziet invoer van tribune-invoerder | Coach kan tijdens time-outs direct cijfers zien zonder zelf in te voeren | v3 |
| Volledige multi-device sync (meerdere gelijktijdige invoerders) | Pas relevant zodra met meerdere assistenten tegelijk wordt ingevoerd | v5 |
| Voice/handsfree invoer | Houdt handen vrij tijdens coachen, maar voegt complexiteit toe | later, optioneel |

## 6. Live meelezen: invoerder op de tribune, coach op de bank

Naast offline-opslag op één apparaat komt er een tweede vereiste bij: een tweede persoon (bijv. op de tribune, met beter overzicht) voert acties in, en de coach op de bank ziet die acties automatisch verschijnen — zonder dat er per se internet beschikbaar is.

**Kernprincipe:** geen internet betekent niet geen netwerk. Zolang beide apparaten op hetzelfde lokale wifi-netwerk zitten (het eigen netwerk van de sporthal, of een hotspot vanaf één van de telefoons), kunnen ze rechtstreeks met elkaar communiceren zonder externe server.

**Gekozen aanpak — hybride, bovenop de bestaande offline-opslag:**

- Elke actie wordt, zoals al ontworpen, eerst altijd **lokaal opgeslagen** op het apparaat van de invoerder. Dit blijft de basis en verandert niet.
- Zodra er een verbinding is — lokaal netwerk of internet, wat dan ook beschikbaar is — wordt elke nieuwe actie **direct doorgestuurd** naar de andere gekoppelde apparaten in de wedstrijd.
- Valt de verbinding weg, dan gaat invoeren gewoon door; zodra de verbinding terugkomt, worden gemiste acties automatisch ingehaald (dezelfde sync-logica als bij offline → online, nu toegepast tussen apparaten onderling in plaats van tussen apparaat en cloud).
- Praktisch opzetten: één apparaat (bijv. dat van de invoerder op de tribune) zet een lokale hotspot op, of beide verbinden met de wifi van de sporthal. Er is geen internetverbinding naar buiten nodig, alleen een lokaal netwerk tussen de apparaten.

**Wat de coach ziet:**
- Een apart "meelezen"-scherm (variant op scherm A, maar read-only): dezelfde rally-keten, live bijgewerkt zodra de invoerder een actie vastlegt.
- Geen eigen invoer nodig op dit scherm — puur een live-spiegel van wat er wordt ingevoerd, zodat de coach tijdens time-outs direct de laatste cijfers en patronen kan zien zonder zelf iets in te tikken.
- Rolonderscheid moet in de app expliciet zijn: bij het opstarten kiest een apparaat "ik voer in" of "ik lees mee" voor deze wedstrijd.

**Wat dit niet verandert:** de offline-garantie per apparaat blijft overeind. Als beide apparaten toevallig even geen verbinding met elkaar hebben, blijft de invoerder gewoon lokaal doorwerken; het meelezen hapert dan tijdelijk maar er gaat geen data verloren.

## 7. Gefaseerde opbouw (advies voor Claude Code)

1. **v1** — Rally-invoerscherm (A), lokale opslag, undo, protocol-tooltips, offline werkend als PWA
2. **v2** — Analysedashboard (B), rotatie/wissel-tracking, export
3. **v3** — Live meelezen tussen invoerder en coach over lokaal netwerk (rolkeuze invoerder/meelezer, read-only spiegelscherm)
4. **v4** — Opponent-dossier (C), automatische adviesgeneratie op basis van cijfers
5. **v5** — Volledige multi-device sync met meerdere gelijktijdige invoerders (indien nodig)

---

*Aanvullend bestand: `scoutingprotocol.docx` bevat de volledige kwalificatietabellen met voorbeelden per actietype, en kan direct gebruikt worden als brondocument voor de tooltip-teksten in de app.*
