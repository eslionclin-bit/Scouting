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
  judge,
  looksLikeRally,
  whistlesFrom,
  type CornerKey,
  type Corners,
  type JudgedSpan,
  type MotionSample,
} from '../../domain/rallyIndex';

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

  function choose(picked: File | null): void {
    if (!picked) return;
    if (url) URL.revokeObjectURL(url);
    setFile(picked);
    setUrl(URL.createObjectURL(picked));
    setRallies(null);
    setError(null);
    setProgress(0);
    setRemoved(new Set());
    setDone(new Set());
    setPlaying(null);
    setSetupOpen(true);
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

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const [x, y] = pointFrom(event);
    dragging.current = nearestCorner(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
    setCorners((current) => ({ ...current, [dragging.current!]: [x, y] }));
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    const [x, y] = pointFrom(event);
    setCorners((current) => ({ ...current, [dragging.current!]: [x, y] }));
  }

  function endDrag(): void {
    dragging.current = null;
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
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
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
            <h2>3 · Jullie veld</h2>
            <p className="card__hint">
              Sleep de vier stippen naar de hoeken van jullie veld. Vier punten en geen rechthoek,
              want een camera staat zelden recht voor het veld — schuin erachter is een veld op het
              beeld een scheve vierhoek, en dan valt het veld ernaast er met een rechthoek niet af
              te snijden.
            </p>
            <div
              className="videocrop"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="videocrop__stage" ref={stageRef}>
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
                {CORNER_KEYS.map((key) => (
                  <span
                    key={key}
                    className="videocrop__handle"
                    style={{ left: `${corners[key][0] * 100}%`, top: `${corners[key][1] * 100}%` }}
                    aria-label={`Hoek ${CORNER_LABELS[key]}`}
                  />
                ))}
              </div>
            </div>
            <p className="step__hint">
              Tik en sleep; de dichtstbijzijnde stip volgt je vinger.
            </p>
            <p className="step__hint">
              Valt een hoek van het veld buiten de opname? Sleep die stip dan gewoon <strong>buiten
              de foto</strong>, in de donkere rand eromheen. De lijn loopt dan door zoals het veld
              doorloopt, in plaats van een stuk af te snijden dat er wel bij hoort.
            </p>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setCorners(DEFAULT_CORNERS)}
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
                dan weg met het kruisje. De app zoekt liever iets te ruim, want een gemiste rally
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
                        className="button button--us"
                        disabled={saving}
                        onClick={() => void score(playing, 'us')}
                      >
                        Punt wij
                      </button>
                      <button
                        type="button"
                        className="button button--them"
                        disabled={saving}
                        onClick={() => void score(playing, 'them')}
                      >
                        Punt zij
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
                </div>
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
