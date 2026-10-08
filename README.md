# Orch / Mix

A local orchestral balance lab for Adrián Artacho’s instrumentation teaching. Follow each part’s energy in a large orchestra seating map, then adjust its balance with the mixer faders below. Audio is selected from your computer and stays there.

## Start

**Open `index.html` in your desktop browser.** No build, account, npm installation or server is required. On macOS you can also double-click `Start.command`; Windows has `start.bat`.

1. Select **Try the sound demo** to test the controls immediately. This is generated demonstration audio, not a recording of an orchestra.
2. Select **Load stems** to open synchronized audio files or one folder containing a piece’s stems. A single `.orchmix.json` in that folder supplies the instrument labels, seating and reference levels automatically.
3. Choose an excerpt start and length (30 seconds by default), review the instrument names and families, then **Open excerpt**.
4. Press play. Adjust the faders with a drag, mouse wheel or arrow keys. **S** solos a part; **M** mutes it.

Chrome or Edge is the simplest starting point. Current Firefox and Safari support Web Audio; compressed format support varies by browser. PCM WAV is the most predictable input. An optional Python localhost launcher is available if a browser’s local-file policy blocks direct opening:

```sh
python3 scripts/serve.py
```

The server binds only to `127.0.0.1` and serves a fixed list of application assets. The browser still opens audio through its file picker; the server cannot browse or serve your recordings.

## A listening exercise

**Explore** starts with the stems’ existing relative levels. You can listen to the reference, alter the balance, or choose **Set reference** to establish your own interpretation.

**Balance challenge** adds hidden random level offsets. Every fader starts in the centre, so a fader’s position does not reveal its target. Find the reference by ear, then choose **Reveal balance**. The score compares the relative gain differences across active stems, ignoring a shared volume offset; silent excerpt parts are excluded. It is a simple exercise metric, not a validated perceptual assessment. **Show reference solution** restores the target, while **New challenge** scrambles it again.

The family colours are blue for strings, green for woodwinds, red for brass and orange for percussion/harp. Each instrument group has a polygon in the orchestra map and a matching mixer channel below. The polygons brighten from the dark stage background as their audio energy rises; the illumination and small level bars follow the signal after each part’s gain, mute and solo controls. The master control changes overall playback level; it does not change the balance score. Start with the default −12 dB master to leave mixing headroom.

The seating map adapts to the loaded instrumentation. It removes empty rows and splits crowded rows, while the mixer adds one channel per stem. Default seating places strings at the front, woodwinds in the middle, brass behind them and percussion/harp at the rear. A session JSON can override each group’s row, left-to-right order and relative area. See [the session format](docs/SESSION-FORMAT.md) and the [twelve-part Beethoven example](examples/beethoven-layout.json).

The *pp–ff* marks are an intuitive playback scale, not an acoustic simulation of playing dynamics. A recorded forte played quietly retains its forte timbre. A reference balance represents one interpretation, not a uniquely correct orchestration.

## Get recordings

**[The audio source guide](docs/AUDIO-SOURCES.md)** contains original publisher pages, direct downloads, source credits, licence details and local-use qualifications.

- **Operation Beethoven:** twelve real orchestral section tracks, available separately as WAV or MP3. A useful first source under CC BY 4.0.
- **The Spheres:** Mozart’s Symphony No. 40 and Tchaikovsky’s *Romeo and Juliet*. Choose the **StereoMix** archive containing individual stereo stems.
- **SynthSOD / URMP:** further orchestral renderings and smaller recorded ensembles.
- **PHENICX, ECHO and OrchPlay:** interesting additional materials, with their own usage restrictions. Local playback does not grant rights to every teaching, export or recording activity.

An optional downloader saves Beethoven’s twelve tracks to an ignored local folder. It only runs when you explicitly execute it:

```sh
python3 scripts/download_beethoven.py --format wav
```

There is no automatic online audio loading. Downloaded recordings are not part of this repository. No GitHub Pages deployment is configured; the repository can remain private.

## Large recordings

For ordinary **PCM16/24/32 or float32 WAV**, the app reads only the selected excerpt using local file slices, including compatible WAVE extensible headers. It preserves channel layout and amplitude and schedules all parts on the same Web Audio clock. The common excerpt is limited by the shortest selected track. It cannot correct stems that were originally misaligned.

Compressed formats require a full browser decode before cropping. Long files (over 120 seconds), very large files or loads exceeding the conservative **512 MiB** audio budget are rejected with preparation guidance. The browser and temporary decode copies need additional RAM. RF64/BW64 and unsupported codecs should be converted first.

For long FLAC/MP3 originals, use the optional Python helper with **FFmpeg / ffprobe** installed:

```sh
python3 scripts/prepare_audio.py "/path/to/one-piece/StereoMix" \
  --start 90 --duration 30 \
  --output local-audio/my-excerpt --title "My orchestral excerpt"
```

This writes aligned short WAVs and a settings JSON, without normalizing individual stems. Choose the prepared folder to load them together. Python is only a preparation/launch convenience; mixing runs in the browser. See [the local-use guide](docs/LOCAL-USE.md) for full instructions.

## Save a session

**Save session settings** downloads a small `.orchmix.json` containing the piece title, excerpt, instrument labels, local filenames, seating and reference gains. It contains no audio. Save it beside the stems, then choose that folder to reopen the setup. The app automatically opens a folder’s single `.orchmix.json`; if several are present, choose the intended one with **Open session JSON**. You can also open a session JSON and select its matching audio files separately.

Filenames are relative to the session file’s folder, making the setup portable when the folder is moved. [Session format and examples](docs/SESSION-FORMAT.md) explain how to assign each stem to an orchestra area.

Saved sessions preserve the reference setup. They do not save a learner’s transient challenge attempt, mute/solo choices or the generated demo.

## Local by design

- No external scripts, fonts, analytics, cloud storage, uploads or API calls.
- The app’s content security policy blocks network connections; explicit source-guide links open publisher websites separately.
- Audio/video formats, downloaded archives, `local-audio/`, `local-projects/` and exported session files are ignored by Git.
- An optional server serves only named app files, with no directory listing or upload endpoint.
- Keeping recordings outside Git matters even in a private repository. The app does not manage or bypass a provider’s licence or DRM.

## Development

Plain HTML/CSS/JavaScript, with no runtime dependencies:

- `app/app.js`: interface, local file workflow and challenge state.
- `app/audio-engine.js`: synchronized playback, bounded WAV excerpt reader and meters.
- `app/model.js`: instrument inference, session validation and balance scoring.
- `app/layout.js`: adaptive polygon seating geometry.
- `scripts/`: optional Python standard-library utilities; preparation also needs FFmpeg.

Run the focused unit tests with Node.js:

```sh
node --test tests/*.test.cjs
```

Browser smoke tests use Playwright as an optional development dependency; see `tests/browser-smoke.cjs` for invocation. The tests generate their own small audio fixtures; no third-party recordings are committed.

## Credits

Concept and teaching context: **Adrián Artacho**. Audio recordings belong to their respective contributors and licensors; the [source guide](docs/AUDIO-SOURCES.md) lists provenance and required credits. This repository does not include those recordings.

---

## 📝 [ToDo](https://trello.com/c/6JXoSz8Z/99-mitmachstation-bei-open-house-am-1510)
