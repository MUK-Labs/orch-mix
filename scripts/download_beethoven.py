#!/usr/bin/env python3
"""Explicitly download Operation Beethoven's twelve stems to an ignored local folder."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://soundprojekt.hmtm.de/sound/oma-hkm/"
TRACK_CODES = ("08-vl1", "09-vl2", "10-vla", "11-vlc", "12-vlo", "01-fl",
               "02-ob", "03-kl", "04-fg", "05-hrn", "06-trp", "07-pk")
PROJECT_URL = "https://openmusic.academy/docs/4HAB9wcKyiXNGNsmkEFRXD"
ATTRIBUTION = "Operation Beethoven. Ein Projekt der Open Music Academy in Kooperation mit der Hofkapelle München, 2023."


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def atomic_json(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix=".orchmix-metadata-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def download(url, target, format_name, overwrite=False):
    descriptor, temporary = tempfile.mkstemp(prefix=".orchmix-download-", suffix=".part", dir=target.parent)
    count = 0
    digest = hashlib.sha256()
    try:
        with os.fdopen(descriptor, "wb") as output:
            request = Request(url, headers={"User-Agent": "OrchMix-local-downloader/1", "Accept-Encoding": "identity"})
            with urlopen(request, timeout=45) as response:
                if not response.geturl().startswith(BASE_URL):
                    raise ValueError("Unexpected download redirect; visit the source page to verify its current links")
                expected = response.headers.get("Content-Length")
                expected = int(expected) if expected else None
                first = response.read(1024 * 1024)
                is_wav = len(first) >= 12 and first[:4] in (b"RIFF", b"RF64") and first[8:12] == b"WAVE"
                is_mp3 = first.startswith(b"ID3") or (len(first) >= 2 and first[0] == 255 and first[1] & 0xE0 == 0xE0)
                if not (is_wav if format_name == "wav" else is_mp3):
                    raise ValueError("The download is not the expected audio format (possibly an HTML error page)")
                block = first
                while block:
                    count += len(block)
                    digest.update(block)
                    output.write(block)
                    block = response.read(1024 * 1024)
                if count < 1024 or (expected is not None and count != expected):
                    raise ValueError(f"Incomplete download: got {count} bytes; expected {expected}")
            output.flush()
            os.fsync(output.fileno())
        if target.is_symlink() or (target.exists() and not overwrite):
            raise ValueError(f"Refusing to replace an existing file: {target}")
        os.replace(temporary, target)
        return {"url": url, "bytes": count, "sha256": digest.hexdigest()}
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=("mp3", "wav"), default="mp3", help="MP3 is much smaller; WAV is uncompressed")
    parser.add_argument("--output", default=str(ROOT / "local-audio" / "beethoven"))
    parser.add_argument("--overwrite", action="store_true", help="Replace existing files after a complete verified download")
    args = parser.parse_args()
    folder = Path(args.output).expanduser().resolve()
    try:
        folder.mkdir(parents=True, exist_ok=True)
        metadata_path = folder / "download-record.json"
        if metadata_path.is_symlink():
            raise ValueError("Refusing symlink download metadata")
        record = {"source": PROJECT_URL, "credit": ATTRIBUTION,
                  "license": "https://creativecommons.org/licenses/by/4.0/", "files": {}}
        if metadata_path.exists():
            record = json.loads(metadata_path.read_text(encoding="utf-8"))
            if not isinstance(record, dict) or not isinstance(record.get("files"), dict):
                raise ValueError("Invalid download-record.json; choose a clean output folder")
        # Check every pre-existing file before starting a network transfer.
        jobs = []
        for code in TRACK_CODES:
            name = f"oma-hkm-{code}.{args.format}"
            url = BASE_URL + name
            target = folder / name
            previous = record["files"].get(name, {})
            if target.is_symlink():
                raise ValueError(f"Refusing symlink output: {target}")
            if target.exists() and not args.overwrite:
                if (isinstance(previous, dict) and previous.get("url") == url
                        and previous.get("bytes") == target.stat().st_size
                        and previous.get("sha256") == checksum(target)):
                    print(f"Already verified: {name}")
                    continue
                raise ValueError(f"Existing unverified or changed file: {name}. Choose a fresh folder or use --overwrite.")
            jobs.append((name, url, target))
        print(f"Source: {PROJECT_URL}\nCC BY 4.0 — {ATTRIBUTION}")
        print(f"Downloading {len(jobs)} files to {folder}. This may take several minutes.")
        for index, (name, url, target) in enumerate(jobs, start=1):
            print(f"{index}/{len(jobs)} {name}", flush=True)
            record["files"][name] = download(url, target, args.format, args.overwrite)
            atomic_json(metadata_path, record)
        print("Done. No recordings were uploaded. See docs/LOCAL-USE.md for preparing a short excerpt.")
    except (OSError, ValueError, URLError) as exc:
        parser.exit(1, f"Download stopped: {exc}\nCompleted files remain in the output folder; incomplete temporary files are removed.\n")


if __name__ == "__main__":
    main()
