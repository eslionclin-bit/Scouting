# Rally's uit een opname halen

Negentig minuten video wordt hiermee een lijst van ongeveer honderdvijftig
rally's met begin- en eindtijd. Verder niets — geen speelsters, geen acties. Dat
is genoeg om het invoeren niet meer live te hoeven doen: je springt van rally
naar rally en voert in op je eigen tempo.

## Waarom beweging en niet de fluit

In een sporthal spelen meestal meer wedstrijden tegelijk, en die fluiten ook.
Een fluitdetector weet niet van welk veld het geluid komt en knipt er dus rally's
bij die niet bestaan.

Daarom werkt dit andersom:

1. **Beweging is het hoofdsignaal.** Een rally is een aaneengesloten stuk waarin
   er in het veld veel beweegt; ertussen staat iedereen te wachten. Met `--crop`
   snijd je de velden ernaast letterlijk uit beeld, en dan bestaan ze niet meer.
2. **De fluit is alleen bevestiging.** Hij scherpt de grens aan en markeert wat
   zeker een rally is. Fluiten van andere velden zijn zachter; die worden
   weggefilterd. Raakt de app er te veel kwijt, dan is dat niet erg — zie de
   meting hieronder.

De grens tussen 'er wordt gespeeld' en 'er wordt gewacht' wordt per opname
gezocht (de methode van Otsu) in plaats van vastgezet. Dat scheelde alles: met
een vaste drempel vond hij bij lange rally's en korte pauzes helemaal niets meer.

## Gebruik

Nodig: `ffmpeg` in het pad en `numpy`.

```
pip install numpy
python3 rallies.py wedstrijd.mp4 --start 30:20 --crop 0.1,0.1,0.9,0.95
```

- `--start` slaat de warming-up over.
- `--end` om eerst een stukje te proberen, bijvoorbeeld `--end 45:00`.
- `--crop links,boven,rechts,onder` als deel van het beeld, tussen 0 en 1. Dit is
  de knop die ertoe doet: zorg dat alleen jullie veld erin valt.
- `--min-rally` als hij korte dingen meepakt die geen rally zijn.
- `--truth lijst.json` om te meten hoe goed het ging, tegen een lijst
  `[{"start": 1820.0, "end": 1828.5}, …]` die je zelf hebt bijgehouden.

Eruit komt `rallies.json` plus een leesbaar overzicht op het scherm.

## Wat het doet op nagemaakte opnamen

Twee testopnamen, allebei met een tweede veld dat constant beweegt én meefluit:

| | rally's | gevonden | te veel | begin wijkt af |
|---|---|---|---|---|
| lange rally's, korte pauzes | 10 | 10 (100%) | 3 | mediaan 0,0s · slechtste 1,8s |
| normale verhouding | 12 | 12 (100%) | 0 | mediaan 0,0s · slechtste 1,2s |

In de tweede test bleven er van de 25 gedetecteerde fluitsignalen maar 9 over na
het filteren, en tóch werden alle rally's gevonden. Dat is het bewijs van het
uitgangspunt: het werkt ook als het geluid grotendeels onbruikbaar is.

Dit zijn nagemaakte opnamen. Ze bewijzen dat de methode deugt, niet hoe goed hij
het doet op echte beelden. Daar is een echte wedstrijd voor nodig.

## Waar het scheef kan gaan

- **Camera die beweegt.** Dan beweegt alles altijd. Zet hem op een statief.
- **Publiek in beeld.** Snijd het eruit met `--crop`.
- **Time-outs en wissels.** Daar loopt iedereen, dus daar kan een rally worden
  gezien die er niet is. Kost drie seconden om weg te tikken.
- **Twee rally's aan elkaar** bij een korte pauze. Die krijgen een opmerking mee.

Gemist is duur, te veel is goedkoop: een gemiste rally zie je nooit meer terug in
de lijst, een overtollige tik je weg. De instellingen staan daarom aan de ruime
kant.
