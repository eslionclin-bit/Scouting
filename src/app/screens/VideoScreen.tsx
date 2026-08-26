/**
 * Een opname in rally's knippen.
 *
 * Het scherm waar het live invoeren mee ophoudt. Je kiest de opname van deze
 * wedstrijd, de app zoekt zelf waar de rally's zitten, en daarna spring je van
 * rally naar rally in plaats van de wedstrijd bij te moeten benen.
 *
 * Drie dingen die hier bewust zo zijn:
 *
 *  - **De video blijft op je apparaat.** Er wordt niets verstuurd en niets
 *    opgeslagen; de app krijgt alleen een verwijzing naar het bestand zolang dit
 *    scherm openstaat. Er staan minderjarigen op zulke beelden, en dan is 'we
 *    uploaden het even naar een server' geen optie die je terloops neemt.
 *  - **Beweging én de fluit.** Beweging vertelt waar er gespeeld wordt — en is
 *    te plaatsen, want met het kader snijd je het veld ernaast weg. De fluit
 *    vertelt of het een rally wás: elke rally zit tussen een fluit die de
 *    service vrijgeeft en een die de bal dood verklaart. Bewegen tussen de
 *    rally's door heeft dat niet. Dat er meer wedstrijden tegelijk spelen blijft
 *    waar; daarom telt de fluit nooit een rally weg, hij bevestigt er een.
 *  - **Het kijken gaat versneld.** De app speelt de opname op zestien keer de
 *    snelheid af zonder beeld te tonen, en meet per beeldje hoeveel er
 *    veranderde. Een wedstrijd van anderhalf uur is daarmee in ongeveer zes
 *    minuten bekeken.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { matchStatus, rulesOf, setOutcome } from '../../domain/scoring';
import type { TeamSide } from '../../domain/types';
import { useQuery, useStore } from '../StoreProvider';
import {
  CORNER_KEYS,
  DEFAULT_CORNERS,
  maskFor,
  noteFor,
  ralliesFrom,
  featuresFor,
  judge,
  looksLikeRally,
  whistlesFrom,
  type CornerKey,
  type Corners,
  type JudgedSpan,
  type MotionSample,
  type RallyFeatures,
} from '../../domain/rallyIndex';
import {
  ARM_GRID,
  armWindow,
  readArm,
  restingFrame,
  tallyOf,
  winnerFor,
  type ArmFrame,
  type ArmReading,
  type Box,
  type Side,
  type Team,
} from '../../domain/referee';
import {
  agreementOf,
  rowFor,
  summarise,
  type Answer,
  type LearnRow,
  type RallyObservation,
} from '../../domain/learning';

/**
 * Wat er van dit scherm bewaard blijft bij de wedstrijd.
 *
 * De opname zelf niet — die blijft op je apparaat en de app krijgt hem alleen
 * te leen zolang dit scherm openstaat. Maar het werk eromheen wél: het kader om
 * het veld, het kader om de scheidsrechter, de begintijd, en de hele lijst
 * rally's met wat je er al mee gedaan hebt. Dat is een half uur werk dat niet
 * verloren hoort te gaan omdat je even iets anders wilde bekijken.
 */
interface SavedSetup {
  fileName: string | null;
  startMinutes: string;
  startSeconds: string;
  corners: Corners;
  refBox: Box | null;
  ourSide: Side;
  rallies: JudgedSpan[] | null;
  removed: number[];
  done: number[];
  /**
   * Per rally: welke kant van het beeld de arm op ging.
   *
   * Bewust de richting en niet de uitslag. Welke ploeg links staat is iets wat
   * je later kunt omzetten — en dan hoort de hele lijst mee om te klappen
   * zonder dat er opnieuw een half uur video doorheen moet.
   */
  directions: (Side | null)[];
  /** Wat de app per rally van de beweging en de arm zag. */
  features?: RallyFeatures[];
  arms?: { left: number; right: number }[];
  savedAt: string;
}

export interface VideoScreenProps {
  /**
   * De wedstrijd waar dit beeld bij hoort.
   *
   * Zonder wedstrijd is dit scherm een kijkdoos: je vindt de rally's wel, maar
   * je kunt er niets mee vastleggen. Mét wedstrijd wordt het een werklijst —
   * rally speelt, stopt, jij tikt wie hem won, de volgende speelt vanzelf.
   */
  matchId?: string | null;
  onExit: () => void;
}

/** Zo vaak wordt er gemeten, in seconden opnametijd. */
const SAMPLE_EVERY = 0.25;

/** Waar de metingen op gedaan worden. Klein mag: we tellen verandering, we kijken niet. */
const GRID = { width: 128, height: 72 };

const SPEEDS = [16, 8, 4] as const;

/**
 * Niet elke browser kent deze; wie hem heeft geeft per getoond beeld een seintje
 * en dat is precies wat we willen. De rest krijgt een gewone tijdklok.
 */
type FrameCallbacks = { requestVideoFrameCallback?: (callback: () => void) => number };

const CORNER_LABELS: Record<CornerKey, string> = {
  topLeft: 'linksboven',
  topRight: 'rechtsboven',
  bottomRight: 'rechtsonder',
  bottomLeft: 'linksonder',
};

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * Alleen cijfers, en niet hoger dan wat er in dit vakje thuishoort.
 *
 * Boven de 59 zijn seconden gewoon minuten, en die horen in het vakje ernaast.
 */
function onlyNumber(value: string, max: number): string {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return '';
  return String(Math.min(max, Number.parseInt(digits, 10)));
}

/**
 * Minuten en seconden naar seconden.
 *
 * Twee losse velden en geen '30:20' in één vak. Op een telefoon geeft een
 * getallenveld een cijfertoetsenbord zonder dubbele punt, en dan typt iemand
 * '5.20' — wat de app als vijf seconden las en de hele wedstrijd verkeerd
 * begon. Twee vakjes kunnen dat niet fout doen.
 */
function toSeconds(minutes: string, seconds: string): number {
  const m = Number.parseInt(minutes, 10);
  const s = Number.parseInt(seconds, 10);
  return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
}

export function VideoScreen({ matchId = null, onExit }: VideoScreenProps): ReactElement {
  const store = useStore();
  const { data: match } = useQuery(
    async (instance) => {
      if (!matchId) return null;
      const record = await instance.matches.require(matchId);
      const opponent = await instance.teams.get(record.opponentTeamId);
      const sets = await instance.sets.listByMatch(matchId);
      const set = sets.filter((item) => item.status === 'live').at(-1) ?? sets.at(-1) ?? null;
      return { match: record, opponent, sets, set };
    },
    [matchId],
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Apart en scherper uitgelezen: een arm is dunner dan een speelster. */
  const armCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * Het meeluisteren, één keer opgezet.
   *
   * Een videobeeld mag maar één keer aan de geluidsketen gehangen worden; een
   * tweede keer is een fout die de rest van het scherm meesleurt. Daarom blijft
   * hij hier staan, ook tussen twee zoekopdrachten door.
   */
  const soundRef = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    gain: GainNode;
    band: [number, number];
  } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startMinutes, setStartMinutes] = useState('');
  const [startSeconds, setStartSeconds] = useState('');
  /** De rally die nu speelt; daarop stopt de video vanzelf. */
  const [playing, setPlaying] = useState<number | null>(null);
  /** Rally's die je hebt weggegooid omdat het er geen was. */
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  /** Rally's die je hebt afgehandeld. */
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [corners, setCorners] = useState<Corners>(DEFAULT_CORNERS);
  const dragging = useRef<CornerKey | null>(null);
  /**
   * Het kadertje om de scheidsrechter. Leeg betekent: niet gebruiken.
   *
   * Alles hieromheen is bij te zetten en niet in te bouwen. Wie geen kadertje
   * sleept, merkt van dit hele onderdeel niets.
   */
  const [refBox, setRefBox] = useState<Box | null>(null);
  /** Wat je nu aan het aanwijzen bent: het veld of de scheidsrechter. */
  const [aiming, setAiming] = useState<'court' | 'referee'>('court');
  const boxStart = useRef<[number, number] | null>(null);
  /**
   * Hoe het eruitzag voordat je begon te slepen.
   *
   * Een knijpbeweging begint met één vinger, en die vinger pakt eerst een stip
   * beet. Pas als de tweede vinger neerkomt weet de app dat je wilde zoomen —
   * en dan hoort die stip terug te gaan waar hij stond.
   */
  const boxBefore = useRef<Box | null>(null);
  const cornersBefore = useRef<Corners | null>(null);
  /**
   * Inzoomen op het beeld.
   *
   * Op een telefoon is een scheidsrechter van vijftig bij tachtig beeldpunten
   * met een vinger niet te omkaderen. Twee vingers knijpen doet wat je van een
   * foto verwacht, en tikken en slepen blijft daarnaast gewoon werken: één
   * vinger verzet een stip, twee vingers verplaatsen het beeld.
   */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ distance: number; zoom: number; pan: [number, number]; mid: [number, number] } | null>(
    null,
  );
  /**
   * Welke helft van het beeld van jullie is.
   *
   * De arm wijst naar de kant die mag serveren; zonder te weten welke kant dat
   * is, is dat een richting en geen uitslag. Na elke set wisselen de teams van
   * speelhelft, dus dit klapt om zodra je een set afrondt.
   */
  const [ourSide, setOurSide] = useState<Side>('left');
  /** Per rally: welke kant van het beeld de scheidsrechter aanwees. */
  const [directions, setDirections] = useState<(Side | null)[]>([]);
  /** En wat er verder van die rally te onthouden viel — de leerstof. */
  const [features, setFeatures] = useState<RallyFeatures[]>([]);
  const [arms, setArms] = useState<{ left: number; right: number }[]>([]);
  /** Wat u bij eerdere rally's antwoordde, en of het voorstel klopte. */
  const [learned, setLearned] = useState<LearnRow[]>([]);
  /** Wat er van de vorige keer klaarstaat, zodra je dezelfde opname weer kiest. */
  const [saved, setSaved] = useState<SavedSetup | null>(null);
  const [restored, setRestored] = useState(false);
  /** Terug terwijl er nog werk staat: eerst vragen. */
  const [confirmExit, setConfirmExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rallies, setRallies] = useState<JudgedSpan[] | null>(null);
  /**
   * Hoeveel fluitsignalen er gehoord zijn.
   *
   * Nul betekent niet 'er is niet gefloten' maar 'we weten het niet' — geen
   * geluidsspoor, een browser die niet meeluistert, een telefoon die de opname
   * zonder geluid maakte. Alleen bij genoeg fluiten mag het oordeel meewegen.
   */
  const [whistleCount, setWhistleCount] = useState(0);
  /** Stukken beweging zonder fluit: standaard uit het zicht, nooit weggegooid. */
  const [showDoubtful, setShowDoubtful] = useState(false);
  /**
   * Het instellen (kader, begintijd, zoeken) open of dicht.
   *
   * Zodra er rally's zijn gaat het dicht. Anders staat er tussen de video en de
   * knoppen 'punt wij / punt zij' drie schermen aan instellingen in, en scrol je
   * na elke rally weer omlaag — honderdvijfenzestig keer.
   */
  const [setupOpen, setSetupOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Los van de zoekfout: een opmerking bij het instellen van de begintijd. */
  const [startNote, setStartNote] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // De verwijzing naar het bestand weer vrijgeven; anders blijft hij hangen
  // zolang het tabblad openstaat.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  /** Waaronder het werk aan deze wedstrijd bewaard staat. */
  const setupKey = `video.setup.${matchId ?? 'los'}`;

  // Eén keer ophalen wat er van de vorige keer staat. Bewust niet via de
  // gewone gegevensvraag: die luistert mee, en dan zou het opslaan hieronder
  // zichzelf steeds opnieuw inlezen.
  useEffect(() => {
    let alive = true;
    void store.getMeta<SavedSetup>(setupKey).then((found) => {
      if (!alive || !found) {
        setRestored(true);
        return;
      }
      setCorners(found.corners ?? DEFAULT_CORNERS);
      setRefBox(found.refBox ?? null);
      setOurSide(found.ourSide ?? 'left');
      setStartMinutes(found.startMinutes ?? '');
      setStartSeconds(found.startSeconds ?? '');
      setSaved(found);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [setupKey, store]);

  // De antwoorden van eerdere keren erbij, zodat de teller doorloopt over
  // sessies heen in plaats van bij elke keer opnieuw op nul te beginnen.
  const learnKey = `video.learn.${matchId ?? 'los'}`;
  useEffect(() => {
    let alive = true;
    void store.getMeta<LearnRow[]>(learnKey).then((found) => {
      if (alive && found) setLearned(found);
    });
    return () => {
      alive = false;
    };
  }, [learnKey, store]);

  /**
   * Wat de app bij deze rally zag, klaar om naast uw antwoord te zetten.
   *
   * Ook als er niets te lezen viel. Juist de rally's waar de app twijfelde zijn
   * later het leerzaamst — die weglaten zou het beeld mooier maken dan het is.
   */
  function observationOf(index: number): RallyObservation | null {
    const span = rallies?.[index];
    if (!span) return null;
    const shape = features[index];
    const arm = arms[index];
    return {
      at: span.start,
      duration: span.end - span.start,
      serveWhistle: span.serveWhistle,
      endWhistle: span.endWhistle,
      peakEnergy: shape?.peakEnergy ?? 0,
      meanEnergy: shape?.meanEnergy ?? 0,
      bursts: shape?.bursts ?? 0,
      armLeft: arm?.left ?? 0,
      armRight: arm?.right ?? 0,
      direction: directions[index] ?? null,
      ourSide,
      suggested: suggestions[index] ?? null,
    };
  }

  /** Uw antwoord bij de getallen zetten en bewaren. */
  async function remember(index: number, answer: Answer): Promise<void> {
    const seen = observationOf(index);
    if (!seen) return;
    const rows = [...learned.filter((row) => row.at !== seen.at), rowFor(seen, answer)];
    setLearned(rows);
    await store.setMeta(learnKey, rows);
  }

  // En bewaren zodra er iets verandert. Niet bij elke muisbeweging: even
  // wachten tot je klaar bent met slepen scheelt honderden schrijfacties.
  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      void store.setMeta(setupKey, {
        fileName: file?.name ?? saved?.fileName ?? null,
        startMinutes,
        startSeconds,
        corners,
        refBox,
        ourSide,
        rallies,
        removed: [...removed],
        done: [...done],
        directions,
        features,
        arms,
        savedAt: new Date().toISOString(),
      } satisfies SavedSetup);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    restored,
    setupKey,
    store,
    file,
    saved,
    startMinutes,
    startSeconds,
    corners,
    refBox,
    ourSide,
    rallies,
    removed,
    done,
    directions,
    features,
    arms,
  ]);

  function choose(picked: File | null): void {
    if (!picked) return;
    if (url) URL.revokeObjectURL(url);
    setFile(picked);
    setUrl(URL.createObjectURL(picked));
    setError(null);
    setProgress(0);
    setPlaying(null);

    // Dezelfde opname als de vorige keer? Dan staat het werk er nog. Zoeken
    // duurt minuten en het antwoord verandert niet; dat hoef je niet opnieuw
    // te doen omdat je tussendoor iets anders bekeken hebt.
    const again = saved && saved.fileName === picked.name && saved.rallies;
    if (again && saved.rallies) {
      setRallies(saved.rallies);
      setRemoved(new Set(saved.removed));
      setDone(new Set(saved.done));
      setDirections(saved.directions ?? []);
      setFeatures(saved.features ?? []);
      setArms(saved.arms ?? []);
      setSetupOpen(false);
      return;
    }
    setRallies(null);
    setRemoved(new Set());
    setDone(new Set());
    setSetupOpen(true);
    setDirections([]);
    setFeatures([]);
    setArms([]);
  }

  /** Welke hoek zit het dichtst bij waar je tikte. */
  function nearestCorner(x: number, y: number): CornerKey {
    let best: CornerKey = CORNER_KEYS[0];
    let closest = Infinity;
    for (const key of CORNER_KEYS) {
      const [cx, cy] = corners[key];
      const distance = (cx - x) ** 2 + (cy - y) ** 2;
      if (distance < closest) {
        closest = distance;
        best = key;
      }
    }
    return best;
  }

  /**
   * Waar op het beeld je tikte, als deel van de breedte en hoogte.
   *
   * Buiten het beeld mag ook, tot een stuk erbuiten. Dat is nodig: staat de
   * camera schuin, dan valt een hoek van het veld gewoon buiten de opname, en
   * dan moet je die hoek toch ergens kunnen aanwijzen. Zet je hem op de rand van
   * de foto, dan snijdt de lijn ernaartoe een stuk veld af dat wél in beeld is.
   */
  function pointFrom(event: ReactPointerEvent<HTMLDivElement>): [number, number] {
    const stage = stageRef.current;
    if (!stage) return [0, 0];
    const box = stage.getBoundingClientRect();
    const clamp = (value: number): number => Math.min(1.5, Math.max(-0.5, value));
    return [
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    ];
  }

  /** Een kader uit twee punten, in de goede volgorde en nooit van niks. */
  function boxOf(a: [number, number], b: [number, number]): Box {
    return {
      left: Math.max(0, Math.min(a[0], b[0])),
      top: Math.max(0, Math.min(a[1], b[1])),
      right: Math.min(1, Math.max(a[0], b[0])),
      bottom: Math.min(1, Math.max(a[1], b[1])),
    };
  }

  /**
   * Zoomen om een punt op het scherm heen.
   *
   * Wat er onder je vingers zit, hoort daar te blijven zitten. Zonder dat
   * schuift het beeld onder je hand vandaan zodra je knijpt, en ben je met twee
   * handelingen bezig in plaats van één.
   */
  function zoomAround(next: number, screenX: number, screenY: number, from?: { zoom: number; pan: [number, number] }): void {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const box = viewport.getBoundingClientRect();
    const base = from ?? { zoom, pan };
    const level = Math.min(8, Math.max(1, next));
    // Waar het aangewezen punt in het onvergrote beeld ligt.
    const ix = (screenX - box.left - base.pan[0]) / base.zoom;
    const iy = (screenY - box.top - base.pan[1]) / base.zoom;
    const px = screenX - box.left - ix * level;
    const py = screenY - box.top - iy * level;
    setZoom(level);
    setPan(level <= 1 ? [0, 0] : [px, py]);
  }

  /** Het midden van wat je nu ziet; waar de knoppen omheen zoomen. */
  function middleOfView(): [number, number] {
    const box = viewportRef.current?.getBoundingClientRect();
    return box ? [box.left + box.width / 2, box.top + box.height / 2] : [0, 0];
  }

  function fitAgain(): void {
    setZoom(1);
    setPan([0, 0]);
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.current.size === 2) {
      // Twee vingers is knijpen, geen slepen. Wat er met de eerste vinger al
      // getekend was, wordt teruggedraaid: dat was het begin van deze beweging.
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a![0] - b![0], a![1] - b![1]) || 1,
        zoom,
        pan,
        mid: [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2],
      };
      if (dragging.current && cornersBefore.current) setCorners(cornersBefore.current);
      dragging.current = null;
      cornersBefore.current = null;
      if (boxStart.current) {
        boxStart.current = null;
        setRefBox(boxBefore.current);
      }
      return;
    }
    const [x, y] = pointFrom(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sommige invoerapparaten laten dat niet toe; slepen werkt dan nog steeds,
      // alleen laat het los zodra je buiten het beeld komt.
    }
    if (aiming === 'referee') {
      // Een kader trek je op, je verschuift geen stippen: het is één keer per
      // opname en 'sleep er een hokje omheen' hoef je niemand uit te leggen.
      boxStart.current = [x, y];
      boxBefore.current = refBox;
      setRefBox(boxOf([x, y], [x, y]));
      return;
    }
    dragging.current = nearestCorner(x, y);
    cornersBefore.current = corners;
    setCorners((current) => ({ ...current, [dragging.current!]: [x, y] }));
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    }
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a![0] - b![0], a![1] - b![1]) || 1;
      const mid: [number, number] = [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2];
      const start = pinch.current;
      // Verschuiven zit erin door om het nieuwe midden te zoomen: leg je twee
      // vingers plat opzij, dan schuift het beeld mee.
      const shift: [number, number] = [
        start.pan[0] + (mid[0] - start.mid[0]),
        start.pan[1] + (mid[1] - start.mid[1]),
      ];
      zoomAround((distance / start.distance) * start.zoom, mid[0], mid[1], {
        zoom: start.zoom,
        pan: shift,
      });
      return;
    }
    const [x, y] = pointFrom(event);
    if (aiming === 'referee') {
      if (boxStart.current) setRefBox(boxOf(boxStart.current, [x, y]));
      return;
    }
    if (!dragging.current) return;
    setCorners((current) => ({ ...current, [dragging.current!]: [x, y] }));
  }

  function endDrag(event?: ReactPointerEvent<HTMLDivElement>): void {
    if (event) pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    dragging.current = null;
    cornersBefore.current = null;
    // Een tik zonder slepen is geen kader maar een vergissing.
    if (boxStart.current) {
      boxStart.current = null;
      setRefBox((current) =>
        current && (current.right - current.left < 0.04 || current.bottom - current.top < 0.04)
          ? null
          : current,
      );
    }
  }

  /** Een stilstaand beeld om het kader op te zetten. */
  function drawPreview(): void {
    const video = videoRef.current;
    const canvas = previewRef.current;
    if (!video || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = 320;
    canvas.height = Math.round((320 * video.videoHeight) / (video.videoWidth || 16 / 9)) || 180;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  /**
   * Meeluisteren naar de fluit tijdens dezelfde snelle scan.
   *
   * Dat het op zestien keer de snelheid werkt is uitgeprobeerd: de browser rekt
   * het geluid op zonder de toonhoogte te veranderen, dus een fluit van drie
   * en een halve kilohertz blijft op drie en een halve kilohertz staan — hij
   * duurt alleen zestien keer zo kort. In de proef kwam hij er telkens ruim
   * boven uit: een piek van 149 tegen een zaalgeluid van 3.
   *
   * Lukt het niet — geen geluidsspoor, een browser die dwarsligt — dan geeft
   * dit niets terug en zoekt de app gewoon op beweging alleen.
   */
  function listen(video: HTMLVideoElement): typeof soundRef.current {
    if (soundRef.current) return soundRef.current;
    type WithLegacy = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WithLegacy).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const context = new Ctor();
      const source = context.createMediaElementSource(video);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      // De regelbare kraan zit ná het meten: zo kan het geluid tijdens het
      // zoeken dicht (zestien keer versneld geluid is niet om aan te horen)
      // terwijl er wel gemeten wordt. Dempen met de video zelf zou ook de
      // meting op nul zetten.
      const gain = context.createGain();
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(context.destination);
      void context.resume();
      const perBin = context.sampleRate / analyser.fftSize;
      // De band waar een scheidsrechtersfluit in zit. Ruim genomen: de ene fluit
      // is de andere niet, en een erbsenfluit klinkt hoger dan een pea-less.
      const band: [number, number] = [
        Math.floor(2600 / perBin),
        Math.min(analyser.frequencyBinCount - 1, Math.ceil(4400 / perBin)),
      ];
      soundRef.current = { context, analyser, gain, band };
      return soundRef.current;
    } catch {
      return null;
    }
  }

  /**
   * Wat de scheidsrechter na elke rally aanwees.
   *
   * De arm komt ná de rally omhoog, in de pauze tot de volgende service. Dus
   * kijkt de app in dat stuk, en het antwoord hoort bij de rally die net
   * afgelopen is: wie mag serveren, heeft die rally gewonnen.
   *
   * Alleen de eerste seconden van de pauze tellen mee. Daarna wisselt er
   * iemand, loopt de scheidsrechter weg of pakt hij zijn kaartjes, en dat is
   * beweging die niets meer betekent.
   */
  function readRefereeBetween(
    spans: readonly JudgedSpan[],
    frames: ArmFrame[],
  ): { left: number; right: number; side: Side | null }[] {
    if (frames.length < 10 || spans.length === 0) {
      return spans.map(() => ({ left: 0, right: 0, side: null }));
    }
    const readings: ArmReading[] = readArm(frames, restingFrame(frames));
    return spans.map((span, index) => {
      const from = (span.endWhistle ?? span.end) + 0.2;
      const next = spans[index + 1];
      const to = Math.min(from + 8, next ? (next.serveWhistle ?? next.start) - 0.2 : from + 8);
      if (to <= from) return { left: 0, right: 0, side: null };
      return armWindow(readings, from, to);
    });
  }

  async function analyse(): Promise<void> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setError('Deze browser kan de beelden niet uitlezen.');
      return;
    }

    canvas.width = GRID.width;
    canvas.height = GRID.height;

    // Meteen aan, vóór het wachten hieronder: anders staat het scherm stil
    // terwijl de app op de metagegevens wacht, en denk je dat je tik niet
    // aankwam.
    setBusy(true);
    setError(null);
    setRallies(null);
    cancelRef.current = false;

    // Niet elke opname vertelt meteen hoe lang hij is — sommige bestanden pas
    // als je ze afspeelt. Zonder die controle zet de app `currentTime` op iets
    // wat geen getal is en klapt het geheel eruit op een melding waar niemand
    // iets aan heeft.
    if (video.readyState < 1) {
      await new Promise<void>((resolve) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        // Niet eeuwig wachten: als de metagegevens niet komen, proberen we het
        // gewoon en laten we de fout hieronder het werk doen.
        window.setTimeout(resolve, 5000);
      });
    }
    const total = Number.isFinite(video.duration) ? video.duration : 0;
    const wanted = toSeconds(startMinutes, startSeconds);
    const from = total > 0 ? Math.min(wanted, Math.max(0, total - 1)) : wanted;

    const samples: MotionSample[] = [];
    let previous: Float32Array | null = null;
    let lastMeasured = -Infinity;

    const sound = listen(video);
    const bins = sound ? new Uint8Array(sound.analyser.frequencyBinCount) : null;
    /**
     * Het hardste fluitgeluid sinds de vorige meting.
     *
     * Er wordt vaker naar het geluid gekeken dan er metingen worden bewaard.
     * Een fluit duurt op zestien keer de snelheid nog geen vijftigste seconde;
     * wie alleen op de meetmomenten luistert, hoort hem net niet.
     */
    let loudest = 0;

    const hear = (): void => {
      if (!sound || !bins) return;
      sound.analyser.getByteFrequencyData(bins);
      const [from, to] = sound.band;
      let total = 0;
      for (let i = from; i <= to; i++) total += bins[i]!;
      loudest = Math.max(loudest, total / (to - from + 1));
    };

    // Eén keer uitrekenen welke vakjes binnen jullie veld vallen; daarna gaat er
    // per beeldje alleen nog een optelling overheen.
    const mask = maskFor(corners, GRID.width, GRID.height);
    const counted = mask.reduce((sum, value) => sum + value, 0);
    if (counted < 20) {
      setBusy(false);
      setError('Het vlak om jullie veld is te klein. Sleep de hoeken verder uit elkaar.');
      return;
    }

    // Het kadertje om de scheidsrechter wordt apart uitgelezen en bewaard. Pas
    // achteraf is te zeggen hoe het er 'normaal' uitziet — dat is de middelste
    // waarde over de hele opname — en zonder dat is een uitstekende arm niet van
    // een scheidsrechter met een donker shirt te onderscheiden.
    const armCanvas = armCanvasRef.current;
    const armContext =
      refBox && armCanvas ? armCanvas.getContext('2d', { willReadFrequently: true }) : null;
    if (armCanvas) {
      armCanvas.width = ARM_GRID.width;
      armCanvas.height = ARM_GRID.height;
    }
    const armFrames: ArmFrame[] = [];

    const measure = (at: number): void => {
      if (at - lastMeasured < SAMPLE_EVERY) return;
      lastMeasured = at;
      context.drawImage(video, 0, 0, GRID.width, GRID.height);
      const pixels = context.getImageData(0, 0, GRID.width, GRID.height).data;
      const grey = new Float32Array(GRID.width * GRID.height);
      for (let i = 0; i < grey.length; i++) {
        // Eén kanaal is genoeg: we tellen verandering, geen kleur.
        grey[i] = pixels[i * 4]!;
      }
      if (previous) {
        let sum = 0;
        for (let i = 0; i < grey.length; i++) {
          if (mask[i]) sum += Math.abs(grey[i]! - previous[i]!);
        }
        samples.push(
          sound ? { at, energy: sum / counted, whistle: loudest } : { at, energy: sum / counted },
        );
        loudest = 0;

        if (armContext && refBox) {
          const sx = refBox.left * video.videoWidth;
          const sy = refBox.top * video.videoHeight;
          const sw = Math.max(1, (refBox.right - refBox.left) * video.videoWidth);
          const sh = Math.max(1, (refBox.bottom - refBox.top) * video.videoHeight);
          armContext.drawImage(video, sx, sy, sw, sh, 0, 0, ARM_GRID.width, ARM_GRID.height);
          const crop = armContext.getImageData(0, 0, ARM_GRID.width, ARM_GRID.height).data;
          const cell = new Uint8Array(ARM_GRID.width * ARM_GRID.height);
          for (let i = 0; i < cell.length; i++) cell[i] = crop[i * 4]!;
          armFrames.push({ at, pixels: cell });
        }
      }
      previous = grey;
      // Zonder bekende lengte kan er geen percentage: dan laat het scherm zien
      // hoe ver hij in de opname is en niet hoeveel er nog komt.
      setProgress(total > 0 ? (at - from) / Math.max(1, total - from) : 0);
    };

    try {
      await new Promise<void>((resolve, reject) => {
        // Wat er tijdens het zoeken loopt en achteraf uit moet.
        const ears: (number | undefined)[] = [];
        const stop = (): void => {
          video.pause();
          for (const ear of ears) if (ear !== undefined) window.clearInterval(ear);
          video.removeEventListener('ended', onEnded);
          resolve();
        };
        const onEnded = (): void => stop();
        video.addEventListener('ended', onEnded);

        // Een paar seconden aanloop. De browser heeft even nodig om op volle
        // snelheid te komen, en in die tijd worden er beeldjes overgeslagen —
        // een rally die daar begint werd daardoor half gemeten en soms
        // helemaal niet gevonden. De aanloop offeren we liever op dan het spel.
        const runUp = Math.max(0, from - 3);
        if (Number.isFinite(runUp) && runUp > 0) video.currentTime = runUp;
        if (sound) {
          sound.gain.gain.value = 0;
          video.muted = false;
        } else {
          video.muted = true;
        }

        // Zo snel als de browser wil. Sommige weigeren boven de vier, dus we
        // proberen van hoog naar laag en nemen wat blijft staan.
        for (const speed of SPEEDS) {
          try {
            video.playbackRate = speed;
            if (video.playbackRate === speed) break;
          } catch {
            /* volgende snelheid proberen */
          }
        }

        const perFrame = (video as HTMLVideoElement & FrameCallbacks)
          .requestVideoFrameCallback?.bind(video);

        const tick = (): void => {
          if (cancelRef.current) return stop();
          measure(video.currentTime);
          perFrame?.(tick);
        };

        // Luisteren gaat op een eigen klokje en niet op de beeldjes. Op zestien
        // keer de snelheid duurt een fluit nog geen twee honderdsten seconde,
        // en beeldjes komen hooguit zestig keer per seconde langs — dan hoor je
        // hem net niet. Dit kijkt vaak genoeg om er niet overheen te stappen.
        const ear = sound ? window.setInterval(hear, 8) : undefined;
        ears.push(ear);

        let timer: number | undefined;
        if (perFrame) {
          perFrame(tick);
        } else {
          // Oudere browsers: gewoon vaak genoeg kijken.
          timer = window.setInterval(() => {
            if (cancelRef.current || video.ended) {
              window.clearInterval(timer);
              return stop();
            }
            measure(video.currentTime);
          }, 50);
        }

        video.play().catch((cause: unknown) => {
          window.clearInterval(timer);
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        });
      });

      const spans = ralliesFrom(samples);
      // Het geluid loopt achter op het beeld: de meter kijkt altijd naar het
      // venster dat net voorbij is, en de geluidskaart doet er ook iets over.
      // In opnametijd is dat zoveel keer meer als de opname sneller liep.
      const lagSeconds = sound
        ? (sound.analyser.fftSize / sound.context.sampleRate / 2 +
            sound.context.baseLatency +
            (sound.context.outputLatency || 0)) *
          video.playbackRate
        : 0;
      const heard = whistlesFrom(samples, { lagSeconds });
      const found = judge(spans, heard);
      setWhistleCount(heard.length);
      // Alleen verbergen als er genoeg gefloten is om iets te betekenen. Anders
      // zou een opname zonder bruikbaar geluid de hele lijst leegvegen.
      setShowDoubtful(heard.length < spans.length);
      setRallies(found);
      setSetupOpen(found.length === 0);
      const gelezen = readRefereeBetween(found, armFrames);
      setDirections(gelezen.map((item) => item.side));
      setArms(gelezen.map(({ left, right }) => ({ left, right })));
      // De beweging per rally samenvatten zolang de metingen er nog zijn. Na dit
      // scherm zijn ze weg, en dan is deze wedstrijd voorgoed geen leerstof meer.
      setFeatures(found.map((span) => featuresFor(samples, span)));
      if (found.length === 0) {
        setError(
          samples.length < 10
            ? 'Er zijn te weinig beelden bekeken. Werkt het afspelen wel in deze browser?'
            : 'Geen rally’s gevonden. Staat het kader goed om jullie veld, en begint de opname ' +
              'op het ingevulde moment al bij het spel?',
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      video.playbackRate = 1;
      if (soundRef.current) soundRef.current.gain.gain.value = 1;
      video.muted = false;
      setBusy(false);
      setProgress(1);
    }
  }

  /**
   * Eén rally afspelen, en aan het eind stoppen.
   *
   * Doorlopen was het probleem: dan kijk je naar de volgende rally terwijl je
   * nog met deze bezig bent, en moet je terugspoelen. Een seconde aanloop zodat
   * je de service ziet aankomen, en een halve seconde na afloop zodat je ziet
   * waar de bal viel.
   */
  function play(index: number): void {
    const video = videoRef.current;
    const span = rallies?.[index];
    if (!video || !span) return;
    video.playbackRate = 1;
    video.muted = false;
    // Is de servicefluit gehoord, dan begint het daar: dat is exact het moment
    // waarop de rally vrijgegeven werd, preciezer dan een seconde gokken.
    video.currentTime = Math.max(0, span.serveWhistle !== null ? span.serveWhistle - 0.5 : span.start - 1);
    setPlaying(index);
    // De lijst staat onder de speler; zonder dit kijk je naar de knoppen terwijl
    // de rally boven je scherm afspeelt.
    video.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    void video.play();
  }

  /**
   * Deze rally vastleggen bij de wedstrijd en doorgaan.
   *
   * Eén rally in beeld wordt één rally in de wedstrijd: aanmaken en meteen
   * afronden. De stand, de rotatie en de sideout per rotatie rekent de app daar
   * zelf uit — dat is precies wat je met één tik per rally al binnenhaalt.
   */
  async function score(index: number, wonBy: TeamSide): Promise<void> {
    if (!match?.set) return;
    setSaving(true);
    try {
      const rally = await store.rallies.start({ setId: match.set.id });
      await store.rallies.complete(rally.id, wonBy);
      await remember(index, wonBy);
      next(index);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Overgespeeld: wel gezien, geen punt.
   *
   * Bij een dubbele fout, of als er een bal van het veld ernaast in rolt, laat
   * de scheidsrechter de rally overspelen. Er valt dan niets te noteren in de
   * stand — en dat is precies waarom deze knop moet bestaan: zonder hem zou je
   * 'punt wij' of 'punt zij' tikken en klopt de stand de hele set niet meer.
   */
  async function replay(index: number): Promise<void> {
    setSaving(true);
    try {
      await remember(index, 'replay');
      next(index);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  /** De set sluiten en zo nodig de volgende beginnen. */
  async function closeSet(): Promise<void> {
    if (!match?.set || !matchId) return;
    setSaving(true);
    try {
      await store.sets.finish(match.set.id);
      const played = match.sets.map((item) =>
        item.id === match.set!.id ? { ...item, status: 'finished' as const } : item,
      );
      if (!matchStatus(played, rulesOf(match.match.rules)).complete) {
        await store.sets.start({ matchId });
      }
      // Na elke set wisselen de teams van speelhelft, dus wat links stond staat
      // nu rechts. Zonder dit leest de app de rest van de wedstrijd omgekeerd.
      setOurSide((side) => (side === 'left' ? 'right' : 'left'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Mag de fluit meepraten over deze opname?
   *
   * Pas als er ongeveer één fluit per gevonden rally gehoord is. Daaronder zegt
   * 'geen fluit bij deze rally' niets over die rally en alles over het geluid.
   */
  const whistlesUsable = rallies !== null && rallies.length > 0 && whistleCount >= rallies.length;

  /** Beweging zonder enige fluit eromheen: waarschijnlijk geen rally. */
  function doubtful(index: number): boolean {
    const span = rallies?.[index];
    return span !== undefined && whistlesUsable && !looksLikeRally(span);
  }

  /** Staat hij nu niet in de lijst — weggegooid of als twijfelgeval verborgen. */
  function outOfSight(index: number): boolean {
    return removed.has(index) || (!showDoubtful && doubtful(index));
  }

  /** Door naar de eerstvolgende die er nog staat, zonder oordeel. */
  function advance(from: number): void {
    if (!rallies) return;
    for (let i = from + 1; i < rallies.length; i++) {
      if (!outOfSight(i)) return play(i);
    }
    videoRef.current?.pause();
    setPlaying(null);
  }

  /** Deze afgehandeld, door naar de eerstvolgende die er nog staat. */
  function next(from: number): void {
    setDone((current) => new Set(current).add(from));
    advance(from);
  }

  function discard(index: number): void {
    setRemoved((current) => new Set(current).add(index));
    if (playing === index) {
      videoRef.current?.pause();
      setPlaying(null);
    }
  }

  /**
   * De richtingen omgezet in voorstellen.
   *
   * Hier en niet bij het zoeken: zo klapt de hele lijst om zodra je zegt dat
   * jullie aan de andere kant staan, zonder de video opnieuw door te lopen.
   */
  const suggestions = directions.map((side) => winnerFor(side, ourSide));

  /** Hoe vaak het voorstel klopte, over alles wat u ooit bij deze wedstrijd antwoordde. */
  const meting = summarise(agreementOf(learned));

  /** De voorstellen bij elkaar, als controle op het lezen. */
  const suggested = {
    gelezen: suggestions.filter((item) => item !== null).length,
    totaal: rallies?.length ?? 0,
    tally: tallyOf(suggestions),
  };

  const doubtfulCount =
    rallies?.reduce(
      (count, _span, index) => count + (doubtful(index) && !removed.has(index) ? 1 : 0),
      0,
    ) ?? 0;

  // De video stopt zelf aan het eind van de rally die je aantikte.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playing === null || !rallies) return;
    const span = rallies[playing];
    if (!span) return;

    // Tot de eindfluit als die er is: dan zie je de bal nog vallen en hoor je
    // hem doodverklaren.
    const until = Math.max(span.end, span.endWhistle ?? span.end) + 0.5;
    const check = (): void => {
      if (video.currentTime >= until) {
        video.pause();
      }
    };
    video.addEventListener('timeupdate', check);
    return () => video.removeEventListener('timeupdate', check);
  }, [playing, rallies]);

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        {confirmExit ? (
          <div className="rallynow">
            <span className="rallynow__label">
              Terug? Je lijst en de kaders blijven bewaard bij deze wedstrijd — alleen de opname
              moet je straks opnieuw kiezen, want die blijft op je apparaat.
            </span>
            <button type="button" className="button button--primary" onClick={onExit}>
              Ja, terug
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setConfirmExit(false)}
            >
              Nee, verder werken
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              // Alleen vragen als er iets te verliezen valt. Bij een leeg
              // scherm is een tussenvraag alleen maar een extra tik.
              if (rallies && rallies.length > done.size + removed.size) setConfirmExit(true);
              else onExit();
            }}
          >
            ← Terug
          </button>
        )}
        <div>
          <h1>Wedstrijd van beeld</h1>
          <p className="dashboard__sub">
            Kies de opname; de app zoekt zelf de rally’s. Er wordt niets verstuurd — het bestand
            blijft op dit apparaat.
          </p>
        </div>
      </header>

      {match?.set && (
        <section className="card">
          <h2>
            Set {match.set.setNumber} · {match.set.pointsUs}–{match.set.pointsThem}
          </h2>
          <p className="card__hint">
            Tegen {match.opponent?.name ?? 'onbekend'}. Elke rally die je hieronder afhandelt telt
            mee voor de stand, de rotatie en de sideout per rotatie — dat rekent de app zelf uit.
          </p>
          {setOutcome(
            match.set.pointsUs,
            match.set.pointsThem,
            match.set.setNumber,
            rulesOf(match.match.rules),
          ).complete && (
            <button
              type="button"
              className="button button--primary"
              disabled={saving}
              onClick={() => void closeSet()}
            >
              Set {match.set.setNumber} afronden
            </button>
          )}
        </section>
      )}

      <section className="card">
        <h2>1 · De opname</h2>
        <p className="card__hint">
          Een bestand van je telefoon, tablet of laptop. Hoe stiller de camera stond, hoe beter dit
          werkt.
        </p>
        <input
          type="file"
          accept="video/*"
          aria-label="Opname kiezen"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
        {!file && saved?.fileName && saved.rallies && saved.rallies.length > 0 && (
          // Wat er van de vorige keer klaarstaat. Zonder deze regel kies je een
          // bestand, ziet de lijst er ineens ingevuld uit en snap je niet
          // waarom — of erger: je kiest een ander bestand en zoekt een half uur
          // opnieuw.
          <p className="card__hint">
            Van de vorige keer staat er een lijst van {saved.rallies.length} rally’s klaar bij{' '}
            <strong>{saved.fileName}</strong>
            {saved.done.length > 0 ? `, waarvan ${saved.done.length} gedaan` : ''}. Kies datzelfde
            bestand en je gaat verder waar je gebleven was; kies een ander en de app zoekt opnieuw.
          </p>
        )}
        {file && (
          <p className="card__hint">
            {file.name} · {(file.size / 1024 / 1024 / 1024).toFixed(2)} GB
            {duration > 0 ? ` · ${clock(duration)} lang` : ''}
          </p>
        )}
      </section>

      {url && (
        <>
          {/*
            De speler staat hier en niet onderaan. Hij hoorde bij het einde van
            het scherm, ver van de knop 'Neem deze plek' — en dan neem je de plek
            van een video die je nooit hebt verschoven, zonder dat iets je dat
            vertelt. Wat je moet verplaatsen hoort naast de knop te staan die het
            overneemt.
          */}
          <video
            ref={videoRef}
            src={url}
            className="videoplayer"
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration);
              event.currentTarget.currentTime = Math.min(
                toSeconds(startMinutes, startSeconds) || 1,
                Math.max(0, event.currentTarget.duration - 1),
              );
            }}
            onSeeked={drawPreview}
          />

          {!setupOpen && (
            // Dicht: alleen een regel om het weer open te doen. De video staat
            // dan direct boven het blokje met 'punt wij / punt zij'.
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setSetupOpen(true)}
            >
              Kader, begintijd of opnieuw zoeken ▾
            </button>
          )}

          {setupOpen && (
            <>
          <section className="card">
            <h2>2 · Waar begint het spel</h2>
            <p className="card__hint">
              Spoel de video hierboven naar de eerste service en tik op ‘Neem deze plek’. Typen mag
              ook, in de twee vakjes.
            </p>
            <div className="startat">
              <label className="field">
                <span>Minuten</span>
                <input
                  value={startMinutes}
                  onChange={(event) => setStartMinutes(onlyNumber(event.target.value, 599))}
                  placeholder="30"
                  inputMode="numeric"
                  aria-label="Beginnen bij minuut"
                />
              </label>
              <label className="field">
                <span>Seconden</span>
                <input
                  value={startSeconds}
                  onChange={(event) => setStartSeconds(onlyNumber(event.target.value, 59))}
                  placeholder="20"
                  inputMode="numeric"
                  aria-label="Beginnen bij seconde"
                />
              </label>
              <button
                type="button"
                className="button"
                onClick={() => {
                  const at = Math.floor(videoRef.current?.currentTime ?? 0);
                  // Staat de video nog waar hij begon, dan is 'deze plek' niet
                  // wat je bedoelde. Dat hoort de app te zeggen in plaats van
                  // stilletjes nul over te nemen.
                  if (at <= 2) {
                    setStartNote(
                      'De video staat nog aan het begin. Spoel hem eerst naar de eerste service.',
                    );
                    return;
                  }
                  setStartNote(null);
                  setStartMinutes(String(Math.floor(at / 60)));
                  setStartSeconds(String(at % 60));
                }}
              >
                Neem deze plek
              </button>
            </div>
            <p className="step__hint">
              Begint nu bij {clock(toSeconds(startMinutes, startSeconds))}.
            </p>
            {startNote && <p className="setup__error">{startNote}</p>}
          </section>

          <section className="card">
            <h2>3 · Jullie veld{refBox ? ' en de scheidsrechter' : ''}</h2>
            <div className="startat">
              <button
                type="button"
                className={aiming === 'court' ? 'button button--primary' : 'button'}
                onClick={() => setAiming('court')}
              >
                Veld aanwijzen
              </button>
              <button
                type="button"
                className={aiming === 'referee' ? 'button button--primary' : 'button'}
                onClick={() => setAiming('referee')}
              >
                Scheidsrechter
              </button>
            </div>
            <p className="card__hint">
              {aiming === 'court'
                ? 'Sleep de vier stippen naar de hoeken van jullie veld. Vier punten en geen rechthoek, want een camera staat zelden recht voor het veld — schuin erachter is een veld op het beeld een scheve vierhoek, en dan valt het veld ernaast er met een rechthoek niet af te snijden.'
                : 'Sleep een kader om de scheidsrechter op zijn stoel — hoofd tot heup, en aan weerskanten ruimte voor een gestrekte arm. De app kijkt dan na elke rally welke kant hij aanwijst, en zet die uitslag vast klaar. Hoeft niet: laat je dit leeg, dan tik je het zelf in zoals eerst.'}
            </p>
            {aiming === 'referee' && (
              <p className="step__hint">
                Staat hij er nog niet op? Aan het begin van een opname zit de scheidsrechter vaak
                nog niet op zijn stoel. Spoel de video eerst naar een moment waarop er gespeeld
                wordt, dan zie je waar hij hoort te staan.
              </p>
            )}
            <div
              className="videocrop"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={(event) => {
                if (!event.ctrlKey && Math.abs(event.deltaY) < 1) return;
                zoomAround(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY);
              }}
            >
              <div className="videocrop__viewport" ref={viewportRef}>
              <div
                className="videocrop__stage"
                ref={stageRef}
                style={{ transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})` }}
              >
                <canvas ref={previewRef} className="videocrop__frame" />
                <svg
                  className="videocrop__shape"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polygon
                    points={CORNER_KEYS.map((key) =>
                      `${corners[key][0] * 100},${corners[key][1] * 100}`,
                    ).join(' ')}
                  />
                </svg>
                {aiming === 'court' &&
                  CORNER_KEYS.map((key) => (
                    <span
                      key={key}
                      className="videocrop__handle"
                      style={{
                        left: `${corners[key][0] * 100}%`,
                        top: `${corners[key][1] * 100}%`,
                        // Tegen het zoomen in, anders wordt een stip zo groot
                        // als een vuist zodra je inzoomt om precies te richten.
                        transform: `scale(${1 / zoom})`,
                      }}
                      aria-label={`Hoek ${CORNER_LABELS[key]}`}
                    />
                  ))}
                {refBox && (
                  <span
                    className="videocrop__box"
                    style={{
                      left: `${refBox.left * 100}%`,
                      top: `${refBox.top * 100}%`,
                      width: `${(refBox.right - refBox.left) * 100}%`,
                      height: `${(refBox.bottom - refBox.top) * 100}%`,
                    }}
                    aria-label="Kader om de scheidsrechter"
                  />
                )}
              </div>
              </div>
            </div>
            <div className="startat startat--three">
              <button type="button" className="button" onClick={() => zoomAround(zoom / 1.6, ...middleOfView())}>
                Uitzoomen −
              </button>
              <button type="button" className="button" onClick={() => zoomAround(zoom * 1.6, ...middleOfView())}>
                Inzoomen +
              </button>
              <button type="button" className="button button--ghost" onClick={fitAgain} disabled={zoom === 1}>
                Passend
              </button>
            </div>
            <p className="step__hint">
              Knijp met twee vingers om in te zoomen; met twee vingers schuif je het beeld ook.
              Eén vinger blijft slepen.
            </p>
            {aiming === 'court' && (
              <>
                <p className="step__hint">
                  Tik en sleep; de dichtstbijzijnde stip volgt je vinger.
                </p>
                <p className="step__hint">
                  Valt een hoek van het veld buiten de opname? Sleep die stip dan gewoon <strong>buiten
                  de foto</strong>, in de donkere rand eromheen. De lijn loopt dan door zoals het veld
                  doorloopt, in plaats van een stuk af te snijden dat er wel bij hoort.
                </p>
              </>
            )}
            {aiming === 'referee' && refBox && (
              <>
                <p className="step__hint">
                  Welke helft van het beeld is van jullie — links of rechts zoals je ernaar kijkt?
                  De arm wijst naar wie mag serveren, en wie mag serveren heeft de vorige rally
                  gewonnen. Staat het straks omgekeerd, dan draai je het bij de rally’s met één tik
                  om; de hele lijst gaat mee.
                </p>
                <div className="startat">
                  <button
                    type="button"
                    className={ourSide === 'left' ? 'button button--us' : 'button'}
                    onClick={() => setOurSide('left')}
                  >
                    Wij spelen links in beeld
                  </button>
                  <button
                    type="button"
                    className={ourSide === 'right' ? 'button button--us' : 'button'}
                    onClick={() => setOurSide('right')}
                  >
                    Wij spelen rechts in beeld
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                if (aiming === 'referee') setRefBox(null);
                else setCorners(DEFAULT_CORNERS);
              }}
            >
              Opnieuw beginnen
            </button>
          </section>

          <section className="card">
            <h2>4 · Zoeken</h2>
            <p className="card__hint">
              De app kijkt de opname versneld door zonder beeld te tonen. Anderhalf uur duurt
              ongeveer zes minuten. Je kunt dit scherm beter niet verlaten zolang hij bezig is.
            </p>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => void analyse()}
            >
              {busy
                ? progress > 0
                  ? `Bezig… ${Math.round(progress * 100)}%`
                  : 'Bezig…'
                : 'Rally’s zoeken'}
            </button>
            {busy && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                Stoppen
              </button>
            )}
            {error && <p className="setup__error">{error}</p>}
            {rallies && rallies.length > 0 && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setSetupOpen(false)}
              >
                Instellingen dichtklappen ▴
              </button>
            )}
          </section>
            </>
          )}

          {!setupOpen && error && <p className="setup__error">{error}</p>}

          <canvas ref={canvasRef} className="visually-hidden" />
          <canvas ref={armCanvasRef} className="visually-hidden" />

          {rallies && rallies.length > 0 && (
            <section className="card">
              {/*
                Het totaal, niet wat er nog staat. Anders telt de kop naar 165
                terwijl het blokje eronder 'rally 32 van 167' zegt, en dan zit je
                te rekenen in plaats van te kijken.
              */}
              <h2>
                {rallies.length} rally’s gevonden
                {removed.size > 0 ? ` · ${removed.size} weggegooid` : ''}
                {done.size > 0 ? ` · ${done.size} gedaan` : ''}
              </h2>
              {whistlesUsable ? (
                <p className="card__hint">
                  {whistleCount} fluitsignalen gehoord.{' '}
                  {doubtfulCount > 0
                    ? showDoubtful
                      ? `${doubtfulCount} stukken beweging hebben er geen — waarschijnlijk geen rally.`
                      : `${doubtfulCount} stukken beweging zonder fluitsignaal staan hieronder niet tussen.`
                    : 'Bij elk stuk beweging hoorde er een — dit lijkt allemaal spel.'}
                </p>
              ) : (
                <p className="card__hint">
                  {whistleCount === 0
                    ? 'Er is geen fluitsignaal gehoord. Staat er geluid op de opname? Zonder geluid zoekt de app alleen op beweging, en dan staat er meer tussen dat geen rally is.'
                    : `Maar ${whistleCount} fluitsignalen gehoord op ${rallies.length} stukken beweging. Te weinig om er rally’s mee te beoordelen — de lijst hieronder gaat dus alleen op beweging.`}
                </p>
              )}
              {whistlesUsable && doubtfulCount > 0 && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setShowDoubtful((open) => !open)}
                >
                  {showDoubtful
                    ? `Twijfelgevallen verbergen (${doubtfulCount})`
                    : `Toon de ${doubtfulCount} zonder fluitsignaal`}
                </button>
              )}
              <p className="card__hint">
                Tik op een rally: de video springt erheen en <strong>stopt vanzelf aan het eind</strong>.
                {match?.set
                  ? ' Tik dan wie hem won — dat legt hem vast en speelt meteen de volgende af.'
                  : ' Daarna brengt ‘Volgende’ je naar de rally erna.'}{' '}
                Is het er geen — een wissel, een time-out, iemand die een bal terugrolt — gooi hem
                dan weg met het kruisje. Werd er overgespeeld, bijvoorbeeld bij een dubbele fout of
                een bal van het veld ernaast, tik dan ‘Overspelen’: dan telt hij wel mee als
                gezien, maar niet in de stand. De app zoekt liever iets te ruim, want een gemiste rally
                krijg je niet terug.
              </p>

              {playing !== null && (
                <div className="rallynow">
                  <span className="rallynow__label">
                    Rally {playing + 1} van {rallies.length}
                  </span>
                  <button type="button" className="button" onClick={() => play(playing)}>
                    Opnieuw
                  </button>
                  {match?.set ? (
                    // Mét wedstrijd is 'wie won' de vraag, en die legt hem meteen
                    // vast; doorgaan zonder vastleggen kan er nog steeds naast.
                    <>
                      <button
                        type="button"
                        className={[
                          'button button--us',
                          suggestions[playing] === 'us' ? 'button--suggested' : '',
                        ].join(' ')}
                        disabled={saving}
                        onClick={() => void score(playing, 'us')}
                      >
                        Punt wij{suggestions[playing] === 'us' ? ' ◄' : ''}
                      </button>
                      <button
                        type="button"
                        className={[
                          'button button--them',
                          suggestions[playing] === 'them' ? 'button--suggested' : '',
                        ].join(' ')}
                        disabled={saving}
                        onClick={() => void score(playing, 'them')}
                      >
                        Punt zij{suggestions[playing] === 'them' ? ' ◄' : ''}
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={saving}
                        onClick={() => void replay(playing)}
                      >
                        Overspelen
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => next(playing)}
                      >
                        Overslaan ›
                      </button>
                      {/*
                        Ook hier, en niet alleen in de lijst eronder. Of iets een
                        rally is zie je terwijl je kijkt, en dan is naar beneden
                        scrollen om het kruisje te zoeken precies één handeling
                        te veel — honderdzestig keer per wedstrijd.
                      */}
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => {
                          discard(playing);
                          advance(playing);
                        }}
                      >
                        Geen rally ×
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => next(playing)}
                      >
                        Volgende ›
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => {
                          discard(playing);
                          advance(playing);
                        }}
                      >
                        Geen rally ×
                      </button>
                    </>
                  )}
                  {refBox && (
                    // In beeldrichting én met een ploegnaam erbij. 'De overkant'
                    // klinkt als een plek in de zaal terwijl het een ploeg
                    // bedoelde, en dan lees je precies het omgekeerde van wat
                    // er staat.
                    <span className="rallynow__hint">
                      {directions[playing] == null
                        ? 'De scheidsrechter was hier niet te lezen — kies zelf.'
                        : `De scheidsrechter wees naar ${
                            directions[playing] === 'left' ? 'links' : 'rechts'
                          } in beeld. Daar ${
                            suggestions[playing] === 'us'
                              ? 'staan jullie'
                              : `staat ${match?.opponent?.name ?? 'de tegenstander'}`
                          }, dus het voorstel is punt ${
                            suggestions[playing] === 'us' ? 'wij' : 'zij'
                          }.`}
                    </span>
                  )}
                </div>
              )}

              {refBox && directions.length > 0 && (
                // Staat de kant verkeerd om, dan staan álle voorstellen
                // verkeerd om. Dat hoort met één tik recht te zetten, hier waar
                // je het merkt, en niet drie schermen terug bij de instellingen.
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setOurSide((side) => (side === 'left' ? 'right' : 'left'))}
                >
                  Jullie spelen {ourSide === 'left' ? 'links' : 'rechts'} in beeld · omdraaien
                </button>
              )}

              {meting && (
                // De teller. Niet om indruk te maken maar om te weten waar we
                // staan: zonder dit cijfer is elke volgende stap gokwerk.
                <p className="card__hint">{meting}</p>
              )}

              {refBox && suggested.gelezen > 0 && (
                // De controle. Niet 'de app zegt 25-19' maar: als je alle
                // voorstellen zou overnemen, komt hier dit uit. Klopt dat niet
                // met wat je weet van de wedstrijd, dan is er iets mis met het
                // lezen — en dan hoor je dat vóór het invoeren te merken.
                <p className="card__hint">
                  De scheidsrechter was bij {suggested.gelezen} van de {suggested.totaal} rally’s te
                  lezen. Alle voorstellen bij elkaar geeft {suggested.tally.us}–
                  {suggested.tally.them}
                  {suggested.tally.decidedAfter !== null
                    ? suggested.tally.extra > 0
                      ? `, en dan staan er nog ${suggested.tally.extra} rally’s achter het setpunt. Ergens klopt er iets niet.`
                      : ' — dat is een set die uitkomt.'
                    : '. Dat is nog geen volle set.'}
                </p>
              )}

              <ul className="rallylist">
                {rallies.map((span, index) => {
                  if (outOfSight(index)) return null;
                  const note = doubtful(index) ? 'geen fluitsignaal gehoord' : noteFor(span);
                  return (
                    <li key={`${span.start}`} className="rallylist__row">
                      <button
                        type="button"
                        className={[
                          'rallylist__item',
                          playing === index ? 'rallylist__item--playing' : '',
                          done.has(index) ? 'rallylist__item--done' : '',
                        ].join(' ')}
                        onClick={() => play(index)}
                      >
                        <span className="rallylist__number">
                          {done.has(index) ? '✓' : index + 1}
                        </span>
                        <span className="rallylist__time">{clock(span.start)}</span>
                        <span className="rallylist__duration">
                          {Math.round(span.end - span.start)}s
                        </span>
                        {note && <span className="rallylist__note">{note}</span>}
                      </button>
                      <button
                        type="button"
                        className="rallylist__discard"
                        aria-label={`Rally ${index + 1} weggooien`}
                        onClick={() => discard(index)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>

              {removed.size > 0 && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setRemoved(new Set())}
                >
                  Weggegooide terugzetten
                </button>
              )}
            </section>
          )}

        </>
      )}
    </div>
  );
}
