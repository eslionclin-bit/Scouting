# Herkomst van deze scoutbestanden

Vier echte wedstrijden in DataVolley-formaat, gebruikt om de importfunctie te
testen. Ze komen uit het [openvolley](https://github.com/openvolley)-project en
staan onder de MIT-licentie.

| Bestand | Wedstrijd | Competitie |
|---|---|---|
| `stuttgart-schwerin-2018.dvw` | Allianz MTV Stuttgart – SSC Palmberg Schwerin | 1. Bundesliga Frauen, play-offs 2018 |
| `katowice-bedzin-2019.dvw` | GKS Katowice – MKS Będzin | PlusLiga 2018/2019 |
| `hartberg-graz-2020.dvw` | Hartberg – UVC Graz | Austrian Volley Cup Women 2020/21 |
| `braslovce-branik-2015.dvw` | Braslovče – Nova KBM Branik | Sloveense jeugdfinale 2015 |

Bron: <https://github.com/openvolley/ovdata> (`inst/extdata/scout/`). De namen
zijn hier leesbaarder gemaakt; de inhoud is onveranderd.

Waarom ze in de repository staan en niet worden opgehaald: een parser voor dit
formaat is niets waard zonder echte bestanden. Elk scoutprogramma schrijft net
iets anders — een ander tekstformaat, een andere diepte van scouten, accenten in
namen — en juist dat moeten de tests tegenkomen.

## Licentie

```
The MIT License (MIT)

Copyright (c) 2020 Ben Raymond, Adrien Ickowicz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Ook de kennis van het bestandsformaat komt uit dat project: de betekenis van de
vaardigheids- en waarderingscodes is afgeleid uit de broncode van het R-pakket
[`datavolley`](https://github.com/openvolley/datavolley) (MIT, Ben Raymond e.a.).
Zie `docs/import-datavolley.md`.
