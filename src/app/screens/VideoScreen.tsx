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
 *  - **Beweging, geen geluid.** In een sporthal spelen meer wedstrijden tegelijk
 *    en die fluiten ook. Wat er buiten jullie veld gebeurt hoort niet mee te
 *    tellen, en het enige wat je daar écht buiten kunt houden is beeld: met het
 *    kader hieronder snijd je de rest weg.
 *  - **Het kijken gaat versneld.** De app speelt de opname op zestien keer de
 *    snelheid af zonder beeld te tonen, en meet per beeldje hoeveel er
 *    veranderde. Een wedstrijd van anderhalf uur is daarmee in ongeveer zes
 *    minuten bekeken.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { noteFor, ralliesFrom, type MotionSample, type RallySpan } from '../../domain/rallyIndex';

export interface VideoScreenProps {
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

interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const FULL: Crop = { left: 0.05, top: 0.05, right: 0.95, bottom: 0.95 };

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** '30:20' of '1:30:20' naar seconden; leeg is vanaf het begin. */
function parseClock(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  return trimmed
    .split(':')
    .reduce((total, part) => total * 60 + (Number.parseFloat(part) || 0), 0);
}

export function VideoScreen({ onExit }: VideoScreenProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startAt, setStartAt] = useState('');
  const [crop, setCrop] = useState<Crop>(FULL);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rallies, setRallies] = useState<RallySpan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    const wanted = parseClock(startAt);
    const from = total > 0 ? Math.min(wanted, Math.max(0, total - 1)) : wanted;

    const samples: MotionSample[] = [];
    let previous: Float32Array | null = null;
    let lastMeasured = -Infinity;

    const box = {
      x: Math.round(crop.left * GRID.width),
      y: Math.round(crop.top * GRID.height),
      w: Math.max(1, Math.round((crop.right - crop.left) * GRID.width)),
      h: Math.max(1, Math.round((crop.bottom - crop.top) * GRID.height)),
    };

    const measure = (at: number): void => {
      if (at - lastMeasured < SAMPLE_EVERY) return;
      lastMeasured = at;
      context.drawImage(video, 0, 0, GRID.width, GRID.height);
      const pixels = context.getImageData(box.x, box.y, box.w, box.h).data;
      const grey = new Float32Array(box.w * box.h);
      for (let i = 0; i < grey.length; i++) {
        // Eén kanaal is genoeg: we tellen verandering, geen kleur.
        grey[i] = pixels[i * 4]!;
      }
      if (previous && previous.length === grey.length) {
        let sum = 0;
        for (let i = 0; i < grey.length; i++) sum += Math.abs(grey[i]! - previous[i]!);
        samples.push({ at, energy: sum / grey.length });
      }
      previous = grey;
      // Zonder bekende lengte kan er geen percentage: dan laat het scherm zien
      // hoe ver hij in de opname is en niet hoeveel er nog komt.
      setProgress(total > 0 ? (at - from) / Math.max(1, total - from) : 0);
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const stop = (): void => {
          video.pause();
          video.removeEventListener('ended', onEnded);
          resolve();
        };
        const onEnded = (): void => stop();
        video.addEventListener('ended', onEnded);

        if (Number.isFinite(from) && from > 0) video.currentTime = from;
        video.muted = true;

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

      const found = ralliesFrom(samples);
      setRallies(found);
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
      setBusy(false);
      setProgress(1);
    }
  }

  function jumpTo(span: RallySpan): void {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 1;
    video.muted = false;
    video.currentTime = Math.max(0, span.start - 1);
    void video.play();
  }

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
          <section className="card">
            <h2>2 · Waar begint het spel</h2>
            <p className="card__hint">
              Staat de warming-up op de opname, vul dan in vanaf wanneer er gespeeld wordt. Als
              minuten:seconden, bijvoorbeeld <strong>30:20</strong>. Leeg laten mag ook.
            </p>
            <label className="field">
              <span>Begin bij</span>
              <input
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                placeholder="30:20"
                inputMode="numeric"
              />
            </label>
          </section>

          <section className="card">
            <h2>3 · Jullie veld</h2>
            <p className="card__hint">
              Sleep de randen zo dat alleen jullie veld erin valt. Speelt er een wedstrijd naast
              jullie, dan is dit wat die buiten de deur houdt — anders telt hun beweging mee en
              vindt de app rally’s die er niet zijn.
            </p>
            <div className="videocrop">
              <canvas ref={previewRef} className="videocrop__frame" />
              <div
                className="videocrop__box"
                style={{
                  left: `${crop.left * 100}%`,
                  top: `${crop.top * 100}%`,
                  width: `${(crop.right - crop.left) * 100}%`,
                  height: `${(crop.bottom - crop.top) * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="videocrop__sliders">
              {(
                [
                  ['left', 'Links'],
                  ['right', 'Rechts'],
                  ['top', 'Boven'],
                  ['bottom', 'Onder'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(crop[key] * 100)}
                    onChange={(event) =>
                      setCrop((current) => ({ ...current, [key]: Number(event.target.value) / 100 }))
                    }
                  />
                </label>
              ))}
            </div>
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
          </section>

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
                parseClock(startAt) || 1,
                Math.max(0, event.currentTarget.duration - 1),
              );
            }}
            onSeeked={drawPreview}
          />
          <canvas ref={canvasRef} className="visually-hidden" />

          {rallies && rallies.length > 0 && (
            <section className="card">
              <h2>{rallies.length} rally’s gevonden</h2>
              <p className="card__hint">
                Tik er een aan om hem te bekijken. Mediaan {clock(
                  rallies.map((span) => span.end - span.start).sort((a, b) => a - b)[
                    Math.floor(rallies.length / 2)
                  ] ?? 0,
                )}{' '}
                per rally. Zitten er dingen tussen die geen rally zijn, dan kost dat een tik; een
                gemiste rally zou erger zijn, dus de app zoekt liever iets te ruim.
              </p>
              <ul className="rallylist">
                {rallies.map((span, index) => {
                  const note = noteFor(span);
                  return (
                    <li key={`${span.start}`}>
                      <button
                        type="button"
                        className="rallylist__item"
                        onClick={() => jumpTo(span)}
                      >
                        <span className="rallylist__number">{index + 1}</span>
                        <span className="rallylist__time">{clock(span.start)}</span>
                        <span className="rallylist__duration">
                          {Math.round(span.end - span.start)}s
                        </span>
                        {note && <span className="rallylist__note">{note}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
