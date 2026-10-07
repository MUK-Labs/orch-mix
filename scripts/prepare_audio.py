#!/usr/bin/env python3
"""Cut matching local stem excerpts into browser-friendly WAV files; no normalization."""

import argparse
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {".wav", ".wave", ".flac", ".mp3", ".aif", ".aiff", ".m4a", ".ogg", ".opus", ".aac"}
EXCLUDED = re.compile(r"(^|[\s_.-])(mix(?:ture)?|master|reference|tutti|scale[s]?|solo[s]?|clap[s]?|sweep[s]?)([\s_.-]|$)", re.I)
INSTRUMENTS = [
    (r"vl1|violin[_ -]?1|violinen[_ -]?1", "Violins I", "strings"),
    (r"vl2|violin[_ -]?2|violinen[_ -]?2", "Violins II", "strings"),
    (r"vla|viola|violen", "Violas", "strings"),
    (r"vlc|cello|violoncell", "Cellos", "strings"),
    (r"vlo|contrabass|double[_ -]?bass|violone|^bass$", "Basses / violone", "strings"),
    (r"piccolo", "Piccolo", "woodwinds"),
    (r"flute|flöte|(?:^|-)fl$", "Flute", "woodwinds"),
    (r"coranglais|english[_ -]?horn", "Cor anglais", "woodwinds"),
    (r"oboe|(?:^|-)ob$", "Oboes", "woodwinds"),
    (r"clarinet|klarinette|(?:^|-)kl$", "Clarinets", "woodwinds"),
    (r"bassoon|fagott|(?:^|-)fg$", "Bassoons", "woodwinds"),
    (r"trumpet|trompete|(?:^|-)trp$", "Trumpets", "brass"),
    (r"trombone|posaune", "Trombones", "brass"),
    (r"tuba", "Tuba", "brass"),
    (r"horn|hörner|(?:^|-)hrn$", "Horns", "brass"),
    (r"timpani|pauke|(?:^|-)pk$", "Timpani", "percussion"),
    (r"harp|harfe", "Harp", "percussion"),
    (r"percussion|schlagzeug", "Percussion", "percussion"),
]


def identify(stem):
    for pattern, name, family in INSTRUMENTS:
        if re.search(pattern, stem, re.I):
            return name, family
    label = re.sub(r"[\x00-\x1f\x7f]", " ", stem.replace("_", " ")).strip()
    return (label[:100] or "Instrument"), "strings"


def probe(path):
    proc = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
        "stream=channels,duration:format=duration", "-of", "json", str(path)
    ], capture_output=True, text=True, check=True)
    data = json.loads(proc.stdout)
    streams = data.get("streams", [])
    if not streams:
        raise ValueError(f"No audio stream: {path.name}")
    if streams[0].get("channels") not in (1, 2):
        raise ValueError(f"{path.name}: use mono/stereo stems, not a multichannel microphone file")
    raw = streams[0].get("duration", data.get("format", {}).get("duration"))
    try:
        duration = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"Cannot determine duration: {path.name}") from None
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"Invalid duration: {path.name}")
    return duration


def collect_inputs(paths):
    found = []
    for raw in paths:
        path = Path(raw).expanduser().resolve()
        if path.is_dir():
            # Deliberately non-recursive: a dataset root can include other
            # pieces, microphone positions, scales, or our own output folder.
            for child in sorted(path.iterdir()):
                if child.is_file() and child.suffix.lower() in EXTENSIONS:
                    if EXCLUDED.search(child.stem):
                        print(f"Skip likely mix/reference/scale: {child.name}")
                    else:
                        found.append(child.resolve())
        elif path.is_file() and path.suffix.lower() in EXTENSIONS:
            found.append(path)
        else:
            raise ValueError(f"Not an audio file or folder: {raw}")
    return list(dict.fromkeys(found))


def prepare(args):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("Install FFmpeg (including ffprobe) first: https://ffmpeg.org/download.html")
    if not math.isfinite(args.start) or args.start < 0:
        raise ValueError("--start must be a finite non-negative number of seconds")
    if not math.isfinite(args.duration) or not 1 <= args.duration <= 120:
        raise ValueError("--duration must be between 1 and 120 seconds")
    if not 1 <= args.max_tracks <= 48:
        raise ValueError("--max-tracks must be between 1 and 48")
    if not args.title.strip() or len(args.title.strip()) > 200 or re.search(r"[\x00-\x1f\x7f]", args.title):
        raise ValueError("--title must be nonempty text of at most 200 characters")
    sources = collect_inputs(args.inputs)
    if not sources:
        raise ValueError("No stems found. Choose one piece's stem folder or list the files explicitly.")
    if len(sources) > args.max_tracks:
        raise ValueError(f"Found {len(sources)} tracks (limit {args.max_tracks}); select fewer files or raise --max-tracks")
    out = Path(args.output).expanduser().resolve()
    # Avoid URL/path syntax and control characters in portable session names.
    names = [(re.sub(r"[\\:%\x00-\x1f\x7f]", "_", p.stem).strip(". ")[:180] or "instrument")
             + ".wav" for p in sources]
    if len(set(n.casefold() for n in names)) != len(names):
        raise ValueError("Duplicate output filenames. Select one microphone view and one version per instrument.")
    targets = [out / name for name in names]
    if any(target in sources for target in targets):
        raise ValueError("The output folder must not overwrite a source file; choose another --output")
    manifest_path = out / "session.orchmix.json"
    for target in [*targets, manifest_path]:
        if target.exists() and not args.overwrite:
            raise ValueError(f"Already exists: {target}. Use another folder or --overwrite.")
        if target.is_symlink():
            raise ValueError(f"Refusing a symlink output: {target}")
    durations = [probe(path) for path in sources]
    # Keep the requested common window. Never pad a shorter stem silently.
    available = min(durations) - args.start
    if available + 0.025 < args.duration:
        raise ValueError(f"The shortest track has only {max(0, available):.3f} seconds after --start; choose a shorter excerpt")
    print(f"Preparing {len(sources)} tracks: {args.start:g}–{args.start + args.duration:g} seconds.")
    out.mkdir(parents=True, exist_ok=True)
    tracks = []
    with tempfile.TemporaryDirectory(prefix=".orchmix-prepare-", dir=out) as temp_name:
        temp = Path(temp_name)
        frames = []
        for index, (source, name) in enumerate(zip(sources, names), start=1):
            target = temp / name
            command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
                       "-ss", str(args.start), "-t", str(args.duration), "-map", "0:a:0",
                       "-vn", "-ar", "48000", "-c:a", "pcm_s16le", "-map_metadata", "-1", str(target)]
            subprocess.run(command, check=True, capture_output=True, text=True)
            with wave.open(str(target), "rb") as wav:
                frames.append(wav.getnframes())
            label, family = identify(source.stem)
            tracks.append({"id": f"track-{index}", "name": label, "family": family,
                           "file": name, "referenceDb": 0})
            print(f"  {index:02d}/{len(sources):02d} {name}")
        if not frames or min(frames) <= 0 or max(frames) - min(frames) > 1:
            raise ValueError("Converted stems differ in sample length; select a window fully present in every file")
        manifest = {"version": 1, "title": args.title.strip(),
                    "excerpt": {"start": 0, "duration": min(frames) / 48000}, "tracks": tracks}
        (temp / manifest_path.name).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        # Publish only after every conversion passed. Re-check collisions in
        # case another process created a file while conversion was running.
        for target in [*targets, manifest_path]:
            if target.exists() and not args.overwrite:
                raise ValueError(f"Output appeared during conversion: {target}; nothing replaced")
            if target.is_symlink():
                raise ValueError(f"Output became a symlink: {target}")
        for target in [*targets, manifest_path]:
            (temp / target.name).replace(target)
    print(f"Ready: {out}\nSelect these WAV files in Orch Mix, then load session.orchmix.json.")
    print("Levels were preserved. Check instrument names/families and set your reference balance in the app.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", help="One stem folder (not recursive), or explicit audio files")
    parser.add_argument("--start", type=float, default=0, help="Common source start in seconds (default: 0)")
    parser.add_argument("--duration", type=float, default=30, help="Common excerpt duration, at most 120 seconds (default: 30)")
    parser.add_argument("--output", default=str(ROOT / "local-audio" / "prepared"))
    parser.add_argument("--title", default="Local orchestra excerpt")
    parser.add_argument("--max-tracks", type=int, default=32)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    try:
        prepare(args)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        detail = exc.stderr.strip() if isinstance(exc, subprocess.CalledProcessError) and exc.stderr else str(exc)
        parser.exit(1, f"Cannot prepare audio: {detail}\n")


if __name__ == "__main__":
    main()
