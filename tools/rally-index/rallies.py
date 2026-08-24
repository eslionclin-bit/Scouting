#!/usr/bin/env python3
"""
Rally's uit een wedstrijdopname halen.

Waarom niet op de fluit alleen: in een sporthal spelen meestal meer wedstrijden
tegelijk, en die fluiten ook. Een fluitdetector die niet weet van welk veld het
geluid komt, knipt er dus lukraak rally's bij. Vandaar dat het hier omgekeerd
werkt:

  1. **Beweging is het hoofdsignaal.** Een rally is een aaneengesloten stuk waarin
     er in het veld veel beweegt; tussen de rally's staat iedereen te wachten,
     te wisselen of te drinken. Een camera die stil staat maakt dat verschil
     groot, en beweging van het veld ernaast valt buiten het uitgesneden vlak.
  2. **De fluit is de bevestiging.** Hij scherpt de grens aan — een rally begint
     kort na een fluit — en fluiten van andere velden zijn hoorbaar zachter,
     want ze zijn verder weg. Wat niet samenvalt met een bewegingsgrens telt
     niet mee.

Wat eruit komt is een lijst rally's met begin en eind. Verder niets: geen
speelsters, geen acties. Dat is precies de bedoeling — negentig minuten video
wordt honderdvijftig clips van tien seconden, en de rest doe jij.

Gebruik:

    python3 rallies.py wedstrijd.mp4 --start 30:20 --end 45:00

Nodig: ffmpeg en ffprobe in het pad, en numpy (`pip install numpy`).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, asdict

try:
    import numpy as np
except ImportError:  # pragma: no cover - eerlijke fout in plaats van een stacktrace
    sys.exit("numpy ontbreekt. Installeer het met: pip install numpy")


# --- instellingen die je mag verdraaien als de uitkomst niet klopt -----------

AUDIO_RATE = 8000
"""8 kHz is genoeg: een scheidsrechtersfluit zit rond 2-4 kHz."""

WHISTLE_BAND = (1800.0, 4200.0)
"""Frequentieband van een fluit. Erbuiten zit de zaal: stemmen, ballen, schoenen."""

FRAME_RATE = 4.0
"""Beelden per seconde voor de bewegingsmeting. Meer helpt niet; een rally duurt seconden."""

FRAME_SIZE = (128, 72)
"""Zo klein mag het: we meten hoeveel er verandert, niet wat er gebeurt."""

MIN_RALLY_S = 2.0
"""Korter dan dit is geen rally maar een service-fout of een meetfout."""

MAX_GAP_S = 1.2
"""Twee stukken beweging met minder stilte ertussen horen bij dezelfde rally."""

MAX_RALLY_S = 60.0
"""Langer dan dit is bijna zeker twee rally's aan elkaar geplakt."""


@dataclass
class Rally:
    index: int
    start: float
    end: float
    duration: float
    """Fluit vlak voor het begin gevonden? Dan is de grens hard."""
    whistle_start: float | None
    whistle_end: float | None
    note: str


def seconds(value: str) -> float:
    """'30:20' of '1:30:20' of '1820' naar seconden."""
    parts = value.split(":")
    total = 0.0
    for part in parts:
        total = total * 60 + float(part)
    return total


def probe_duration(path: str) -> float:
    """Duur van het bestand. ffprobe als het er is, anders ffmpeg zelf."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, check=True,
        )
        return float(out.stdout.strip())
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError):
        pass

    # ffmpeg drukt de duur af in zijn eigen melding; niet mooi, wel altijd
    # aanwezig als ffmpeg er is, en dat is de enige echte eis van dit script.
    out = subprocess.run(["ffmpeg", "-i", path], capture_output=True, text=True)
    for line in out.stderr.splitlines():
        if "Duration:" in line:
            stamp = line.split("Duration:")[1].split(",")[0].strip()
            return seconds(stamp)
    sys.exit(f"Kon de duur van {path} niet bepalen. Staat ffmpeg in het pad?")


def read_audio(path: str, start: float, end: float) -> np.ndarray:
    """Mono PCM op AUDIO_RATE, als float in [-1, 1]."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start}", "-to", f"{end}", "-i", path,
           "-vn", "-ac", "1", "-ar", str(AUDIO_RATE), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def read_frames(path: str, start: float, end: float) -> np.ndarray:
    """Grijswaardebeelden op FRAME_RATE, als (n, hoogte, breedte)."""
    width, height = FRAME_SIZE
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start}", "-to", f"{end}", "-i", path,
           "-an", "-vf", f"fps={FRAME_RATE},scale={width}:{height}",
           "-pix_fmt", "gray", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    count = len(raw) // (width * height)
    return np.frombuffer(raw, dtype=np.uint8)[: count * width * height].reshape(
        count, height, width
    ).astype(np.float32)


def motion_energy(frames: np.ndarray, crop: tuple[float, float, float, float]) -> np.ndarray:
    """
    Hoeveel er verandert binnen het uitgesneden vlak, per beeld.

    Het uitsnijden is wat het veld ernaast buiten de deur houdt: die beweging
    valt letterlijk buiten beeld.
    """
    left, top, right, bottom = crop
    n, height, width = frames.shape
    region = frames[
        :,
        int(top * height) : max(int(bottom * height), int(top * height) + 1),
        int(left * width) : max(int(right * width), int(left * width) + 1),
    ]
    diff = np.abs(np.diff(region, axis=0)).mean(axis=(1, 2))
    return np.concatenate([[0.0], diff])


def whistles(audio: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Momenten waarop er gefloten wordt, met hoe hard.

    De hardheid telt: de fluit van het veld waar je voor staat is hoorbaar
    luider dan die van twee velden verderop. Dat is geen perfecte scheiding,
    maar in combinatie met de bewegingsgrens is het genoeg.
    """
    window = 512
    hop = 128
    if len(audio) < window:
        return np.zeros(0), np.zeros(0)

    count = 1 + (len(audio) - window) // hop
    frames = np.lib.stride_tricks.as_strided(
        audio,
        shape=(count, window),
        strides=(audio.strides[0] * hop, audio.strides[0]),
    )
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(window), axis=1))
    freqs = np.fft.rfftfreq(window, 1.0 / AUDIO_RATE)

    band = (freqs >= WHISTLE_BAND[0]) & (freqs <= WHISTLE_BAND[1])
    in_band = spectrum[:, band].sum(axis=1)
    total = spectrum.sum(axis=1) + 1e-9
    # Verhouding én absolute sterkte: een fluit is zowel smalbandig als hard.
    score = (in_band / total) * np.sqrt(in_band)

    times = np.arange(count) * hop / AUDIO_RATE
    threshold = np.percentile(score, 99.0)
    peaks = []
    strengths = []
    last = -10.0
    for i, value in enumerate(score):
        if value < threshold or times[i] - last < 0.4:
            continue
        peaks.append(times[i])
        strengths.append(float(in_band[i]))
        last = times[i]
    return np.array(peaks), np.array(strengths)


def split_point(energy: np.ndarray) -> float:
    """
    De grens tussen 'er wordt gespeeld' en 'er wordt gewacht'.

    Eerst stond hier de mediaan plus wat spreiding. Dat werkt alleen als er meer
    gewacht dan gespeeld wordt, en dat is niet altijd zo — bij lange rally's en
    korte pauzes ligt de mediaan midden in het spel en vindt hij niets meer.

    Nu wordt de drempel gezocht waar de twee groepen het scherpst uiteenvallen
    (de methode van Otsu): verdeel op elke mogelijke waarde, en kies die waarbij
    het verschil tussen de twee groepen het grootst is. Dat vraagt niets over
    hoeveel er van elk is.
    """
    counts, edges = np.histogram(energy, bins=64)
    centers = (edges[:-1] + edges[1:]) / 2.0
    total = counts.sum()
    if total == 0:
        return float(energy.mean())

    weight_low = np.cumsum(counts)
    weight_high = total - weight_low
    sum_low = np.cumsum(counts * centers)
    sum_all = sum_low[-1]

    valid = (weight_low > 0) & (weight_high > 0)
    if not valid.any():
        return float(energy.mean())

    mean_low = np.divide(sum_low, weight_low, out=np.zeros_like(sum_low), where=weight_low > 0)
    mean_high = np.divide(
        sum_all - sum_low, weight_high, out=np.zeros_like(sum_low), where=weight_high > 0
    )
    between = weight_low * weight_high * (mean_low - mean_high) ** 2
    between[~valid] = -1.0
    return float(centers[int(np.argmax(between))])


def segments(energy: np.ndarray, fps: float) -> list[tuple[float, float]]:
    """Aaneengesloten stukken waarin er gespeeld wordt."""
    if len(energy) == 0:
        return []
    threshold = split_point(energy)

    active = energy > threshold
    found: list[tuple[float, float]] = []
    start: int | None = None
    for i, value in enumerate(active):
        if value and start is None:
            start = i
        elif not value and start is not None:
            found.append((start / fps, i / fps))
            start = None
    if start is not None:
        found.append((start / fps, len(active) / fps))

    merged: list[list[float]] = []
    for begin, end in found:
        if merged and begin - merged[-1][1] <= MAX_GAP_S:
            merged[-1][1] = end
        else:
            merged.append([begin, end])
    return [(a, b) for a, b in merged if b - a >= MIN_RALLY_S]


def nearest(times: np.ndarray, target: float, window: float) -> float | None:
    if len(times) == 0:
        return None
    index = int(np.argmin(np.abs(times - target)))
    return float(times[index]) if abs(times[index] - target) <= window else None


def build(path: str, start: float, end: float, crop: tuple[float, float, float, float]) -> list[Rally]:
    print(f"Beeld inlezen ({end - start:.0f} seconden)…", file=sys.stderr)
    frames = read_frames(path, start, end)
    print(f"  {len(frames)} beelden", file=sys.stderr)

    print("Geluid inlezen…", file=sys.stderr)
    audio = read_audio(path, start, end)
    print(f"  {len(audio) / AUDIO_RATE:.0f} seconden", file=sys.stderr)

    energy = motion_energy(frames, crop)
    peaks, strengths = whistles(audio)
    found = len(peaks)
    if found > 4:
        # Twee groepen: dichtbij en veraf. Waar de scheiding ligt hangt af van de
        # zaal en de camera, dus die wordt gezocht in plaats van vastgezet — met
        # dezelfde tweedeling als bij de beweging.
        loudness = np.log1p(strengths)
        keep = loudness > split_point(loudness)
        if keep.sum() >= 2:
            peaks = peaks[keep]
    print(f"  {found} fluitsignalen, {len(peaks)} over na het wegfilteren "
          f"van de verder weg gelegen velden", file=sys.stderr)

    rallies: list[Rally] = []
    for begin, finish in segments(energy, FRAME_RATE):
        before = nearest(peaks, begin, 5.0)
        after = nearest(peaks, finish, 3.0)
        length = finish - begin

        # Elke rally begint na een fluit. Een stuk beweging zonder fluit eromheen
        # is dus iets anders: inspelen tussen de punten, een bal die terugrolt,
        # een wissel. Bij korte stukken is dat het verschil tussen bruikbaar en
        # rommel; bij lange laat de app het staan, want daar is het risico
        # andersom.
        if before is None and after is None and length < 2 * MIN_RALLY_S:
            continue

        note = ""
        if length > MAX_RALLY_S:
            note = "erg lang — waarschijnlijk twee rally's aan elkaar"
        elif before is None and after is None:
            note = "geen fluit in de buurt — mogelijk geen rally"
        rallies.append(
            Rally(
                index=len(rallies) + 1,
                start=round(start + begin, 2),
                end=round(start + finish, 2),
                duration=round(length, 2),
                whistle_start=round(start + before, 2) if before is not None else None,
                whistle_end=round(start + after, 2) if after is not None else None,
                note=note,
            )
        )
    return rallies


def score(found: list[Rally], truth: list[dict]) -> str:
    """
    Hoe goed het ging, tegen een lijst die je zelf hebt bijgehouden.

    Twee getallen, en ze zijn niet even belangrijk. **Gemist** is duur: die rally
    zie je nooit meer terug in de lijst. **Te veel** is goedkoop: je kijkt drie
    seconden en tikt door. Vandaar dat de instellingen liever iets te veel dan
    iets te weinig geven.
    """
    hits = 0
    offsets: list[float] = []
    used: set[int] = set()
    for want in truth:
        best, overlap = None, 0.0
        for i, got in enumerate(found):
            if i in used:
                continue
            common = min(got.end, want["end"]) - max(got.start, want["start"])
            if common > overlap:
                best, overlap = i, common
        if best is not None and overlap > 0:
            hits += 1
            used.add(best)
            offsets.append(abs(found[best].start - want["start"]))

    missed = len(truth) - hits
    extra = len(found) - hits
    lines = [
        "",
        f"Tegen je eigen lijst van {len(truth)} rally's:",
        f"  gevonden      {hits}",
        f"  gemist        {missed}   ({100 * hits / max(len(truth), 1):.0f}% gevonden)",
        f"  te veel       {extra}",
    ]
    if offsets:
        lines.append(f"  begin wijkt   mediaan {np.median(offsets):.1f}s af, "
                     f"slechtste {max(offsets):.1f}s")
    return "\n".join(lines)


def clock(value: float) -> str:
    minutes, secs = divmod(int(value), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Rally's uit een wedstrijdopname halen.")
    parser.add_argument("video")
    parser.add_argument("--start", default="0", help="Vanaf waar, bijv. 30:20. De warming-up sla je hiermee over.")
    parser.add_argument("--end", default=None, help="Tot waar. Leeg is tot het eind.")
    parser.add_argument("--out", default="rallies.json")
    parser.add_argument(
        "--truth",
        default=None,
        help="JSON met een lijst {start, end} in seconden die je zelf hebt bijgehouden, "
             "om te meten hoe goed dit werkt.",
    )
    parser.add_argument(
        "--min-rally",
        type=float,
        default=MIN_RALLY_S,
        help=f"Korter dan dit telt niet als rally (standaard {MIN_RALLY_S}s).",
    )
    parser.add_argument(
        "--crop",
        default="0.1,0.1,0.9,0.95",
        help="Het vlak waarin het veld staat, als links,boven,rechts,onder tussen 0 en 1. "
             "Snijd de velden ernaast eraf.",
    )
    args = parser.parse_args()

    globals()["MIN_RALLY_S"] = args.min_rally

    start = seconds(args.start)
    end = seconds(args.end) if args.end else probe_duration(args.video)
    crop = tuple(float(part) for part in args.crop.split(","))
    if len(crop) != 4:
        sys.exit("--crop wil vier getallen: links,boven,rechts,onder")

    rallies = build(args.video, start, end, crop)  # type: ignore[arg-type]

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(
            {"video": args.video, "start": start, "end": end, "rallies": [asdict(r) for r in rallies]},
            handle,
            indent=2,
            ensure_ascii=False,
        )

    print()
    print(f"{len(rallies)} rally's gevonden tussen {clock(start)} en {clock(end)}")
    print()
    print(f"{'nr':>4}  {'begin':>8}  {'eind':>8}  {'duur':>6}  fluit  opmerking")
    for rally in rallies:
        mark = ("B" if rally.whistle_start else "-") + ("E" if rally.whistle_end else "-")
        print(
            f"{rally.index:>4}  {clock(rally.start):>8}  {clock(rally.end):>8}"
            f"  {rally.duration:>5.1f}s  {mark:^5}  {rally.note}"
        )

    lengths = [r.duration for r in rallies]
    if lengths:
        print()
        print(f"mediaan duur {np.median(lengths):.1f}s · "
              f"kortste {min(lengths):.1f}s · langste {max(lengths):.1f}s")
        flagged = sum(1 for r in rallies if r.note)
        print(f"{flagged} met een opmerking; die zijn het waard om na te kijken.")

    if args.truth:
        with open(args.truth, encoding="utf-8") as handle:
            print(score(rallies, json.load(handle)))
    print()
    print(f"Weggeschreven naar {args.out}")


if __name__ == "__main__":
    main()
