# Local setup and audio preparation

Orch Mix is an offline browser instrument for Adrián Artacho's orchestration teaching. HTML, CSS and JavaScript provide the interface and Web Audio playback. Python is optional; no account, npm installation or public hosting is required.

## Open it

1. Clone or download this repository onto your computer.
2. On macOS, open `Start.command`; on Windows, open `start.bat`. You can always open `index.html` directly in a modern desktop browser. If macOS does not execute the launcher, opening `index.html` needs no command-line setup.
3. Try the built-in synthesized demonstration, or choose your locally downloaded audio files. The demonstration is original synthetic material, not an orchestra recording.
4. Use the setup controls to choose a common excerpt, check each instrument's name and family, and establish the reference balance before starting the listening challenge.

The large orchestra map shows one polygon per instrumental group. Each polygon brightens with that stem’s current energy, using strings blue, woodwinds green, brass red, and percussion/harp orange. The separate mixer below provides one vertical fader per stem. Faders change playback gain. The *pp–ff* scale describes relative playback level: it does not turn a performed fortissimo timbre into a performed pianissimo. The challenge compares a mix against a chosen reference, not a uniquely correct orchestration.

Select files from **one piece, one take, one microphone/mix perspective**. They need the same time origin. The app schedules stems together but cannot repair originally unsynchronized recordings. Do not normalize each file independently; that would discard the relative balance. Source naming can be ambiguous, so check the automatically assigned labels and colours.

## Keep the piece’s setup with its stems

Put one `session.orchmix.json` beside the audio files, then use **Load stems → Choose folder**. The app discovers that settings file and maps each listed filename to its instrument label, family, reference gain and seating. If the selected folder contains several `.orchmix.json` files, select the intended one with **Open session JSON**; the app does not guess. Ordinary `.json` files are not opened automatically.

The map adapts to the instruments present: empty rows disappear, crowded rows split, and the mixer has one channel per loaded stem. Default rows are strings at the front, woodwinds in the middle, brass at the back and percussion/harp at the rear. Optional `seat` settings override the row, order and relative polygon width. See [the session format](SESSION-FORMAT.md) for a small editable example and a complete Beethoven template.

**Save session settings** exports a JSON without audio. Place it alongside the stems to reopen the same setup by choosing the folder again. If the files sit in subfolders, keep those paths relative to the JSON’s containing folder. Choosing a folder grants local access for that selection only; the app does not scan your computer or remember permission after a browser reload.

## Optional local server

If your browser's local-file policy prevents the app from opening, install Python 3 and run:

```sh
python3 scripts/serve.py
```

On Windows, `py scripts/serve.py` is an alternative. The server opens `http://127.0.0.1:8765/` and listens on your own computer only. Use `--no-browser` to suppress automatic opening or `--port 8766` if the port is occupied. Stop it with Ctrl+C.

Only the named application assets, documentation and the example settings template are served. Audio, your local project JSON files, repository metadata and directory listings are not exposed. Choose audio through the browser's file picker even when using this server. There is no upload endpoint.

## Download the Beethoven starter material

The [source catalogue](AUDIO-SOURCES.md) contains direct download links, credits and terms. To download the twelve MP3 stems with Python:

```sh
python3 scripts/download_beethoven.py
```

The files go into `local-audio/beethoven/`. The helper does not run at application startup. Later runs skip only files whose recorded URL, size and local checksum still match; incomplete transfers are never published under the final filename. For a different location use `--output "/path/to/my/audio"`. WAV downloads use `--format wav` and take substantially more space.

## Make long recordings lighter

Browser playback decodes audio into RAM. Compressed file size is not decoded size: 12 stereo stems lasting 30 seconds at 48 kHz require roughly 138 MB for float samples alone; ten minutes would require roughly 2.76 GB, before temporary copies and browser overhead. Short excerpts make loading and repeated listening much easier. A browser may decode a complete input file before extracting an excerpt, so pre-trimming long originals is useful even when the app offers excerpt controls.

The optional preparation helper needs Python 3 and [FFmpeg](https://ffmpeg.org/download.html) including `ffprobe`. No Python packages are required. For the Beethoven downloads:

```sh
python3 scripts/prepare_audio.py local-audio/beethoven \
  --start 0 --duration 30 \
  --output local-audio/beethoven-excerpt \
  --title "Beethoven 4 · introduction"
```

For a downloaded dataset, point to the **innermost folder containing only one excerpt's instrument stems**, or list exact files:

```sh
python3 scripts/prepare_audio.py "/path/to/piece/Violin_1.flac" "/path/to/piece/Flute.flac" \
  --start 60 --duration 30 --output local-audio/my-excerpt
```

The helper:

- Uses the identical source start and duration for every track, preserving relative gain and existing stereo placement. It does not normalize, trim silence independently, or add reverb.
- Writes 48 kHz PCM 16-bit WAV files with equal sample lengths. Source mono/stereo channel counts are preserved; multichannel microphone files are rejected.
- Reads only the specified folder, never its subfolders. Likely mix/reference/scale/solo-test filenames are skipped during folder discovery; list files explicitly to include such names intentionally.
- Defaults to 30 seconds and at most 32 tracks. Durations range from 1 to 120 seconds; a deliberate `--max-tracks 40` permits more tracks, up to 48. Your computer's memory may still require fewer.
- Refuses existing outputs unless `--overwrite` is supplied. All conversions are checked before final files are installed. The source files are not changed.
- Writes `session.orchmix.json` with file names, labels, families and initial 0 dB reference gains. It contains no audio. Unknown instrument names initially use the strings family; review them in setup.

Choose the prepared folder in the app; its single `session.orchmix.json` opens automatically with the WAVs. The JSON's excerpt starts at **0**, because the original start time has already been trimmed. Do not apply the original start offset a second time. Session files refer to local filenames; they are not URLs and cannot retrieve recordings automatically.

## What stays local

The app has no external fonts, analytics, CDN scripts or audio upload service. Local audio is supplied to the browser by your explicit file selection. Exported session settings do not embed recordings; reselect the matching files when reopening a session. Your browser may ask again after a reload.

`local-audio/`, `local-projects/`, exported `*.orchmix.json`, common audio/video formats and downloaded ZIP archives are excluded by `.gitignore`. Keep source licences alongside the downloads. Git ignore rules prevent ordinary accidental staging; they cannot prevent a deliberate force-add. Keeping a repository private does not mean recordings uploaded there remain solely on your computer.

Local playback avoids publishing the recordings through this app. Permissions for the particular recording and activity still come from its licence; see [AUDIO-SOURCES.md](AUDIO-SOURCES.md).
