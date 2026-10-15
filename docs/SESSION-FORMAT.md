# A piece folder and its orchestra layout

Each session maps local sound files to named instrumental groups. One track becomes one polygon in the orchestra map and one fader in the mixer below. The polygons brighten with the current audio energy; their geometry is generated from the instrumentation rather than stored as screen coordinates.

Keep one `session.orchmix.json` in the same folder as the stems, then choose that folder with **Load stems → Choose folder**. The app automatically reads a single `.orchmix.json` anywhere inside the selected folder and resolves audio paths relative to that JSON’s containing folder. If several session files are present, use **Open session JSON** to select one explicitly. Other `.json` files are ignored during automatic discovery.

You can begin without a JSON: choose stems, review the inferred names and families, then use **Save session settings**. Put the downloaded settings file beside the stems. The file contains no audio, and moving the whole folder preserves its relative paths. Reopen it with a local file/folder selection or an authorized saved library folder; no filenames are used to fetch recordings from the internet. Saved folder handles and MIDI mappings belong to the browser and are not included in the session file.

## Minimal example

Save this as `session.orchmix.json` beside `violins.wav`, `flute.wav` and `horns.wav`:

```json
{
  "version": 1,
  "title": "My orchestration excerpt",
  "excerpt": { "start": 0, "duration": 30 },
  "tracks": [
    {
      "id": "vln1",
      "name": "Violins I",
      "family": "strings",
      "file": "violins.wav",
      "referenceDb": 0,
      "instrument": "violin",
      "players": 6,
      "playersBasis": "estimate",
      "seat": { "row": "front", "order": 1, "weight": 2 }
    },
    {
      "id": "fl",
      "name": "Flute",
      "family": "woodwinds",
      "file": "flute.wav",
      "referenceDb": 0,
      "instrument": "flute",
      "players": 1,
      "playersBasis": "estimate"
    },
    {
      "id": "hn",
      "name": "Horns",
      "family": "brass",
      "file": "horns.wav",
      "referenceDb": -2,
      "instrument": "horn",
      "players": 2,
      "playersBasis": "estimate",
      "seat": { "row": "back", "order": 1, "weight": 1 }
    }
  ]
}
```

The flute uses automatic seating because it has no `seat` field. The violins request more width than a default group. The illustrative player counts are explicitly estimates. These settings only affect the display; a wider polygon or more symbols does not make a stem louder.

## Fields

| Field | Meaning |
| --- | --- |
| `version` | Must be `1`. Existing version 1 sessions without seating settings still work. |
| `title` | Piece or excerpt title, up to 200 characters. |
| `excerpt.start` | Common start in seconds, at least `0`. |
| `excerpt.duration` | Requested length, from `1` to `120` seconds. The shortest track may shorten the common excerpt. |
| `tracks` | Between 1 and 48 local audio tracks. Memory limits still apply. |
| `id` | Unique stable identifier: a letter followed by letters, numbers, `_` or `-`, up to 80 characters. |
| `name` | Visible instrumental group label, up to 100 characters. |
| `family` | `strings`, `woodwinds`, `brass` or `percussion`. Harp uses `percussion` for the orange colour. |
| `file` | Audio filename or subfolder path relative to the JSON’s folder, for example `stems/violins.wav`. Use forward slashes. Absolute paths, URLs and `..` traversal are rejected. |
| `referenceDb` | Reference playback gain from −48 to +12 dB; defaults to `0`. It does not normalize or alter the source recording. |
| `seat` | Optional display settings described below. |
| `instrument` | Optional instrument symbol identifier; see the musician-symbol rules below. |
| `players` | Optional integer from `1` to `80`: musicians represented by this stem. Omit when unknown. |
| `playersBasis` | `confirmed` or `estimate`. A supplied count defaults to `estimate`; use `confirmed` only when the recording documentation supports it. |

Keep one microphone perspective and one synchronized take per piece. Do not add the complete tutti recording as an extra stem. If a section spans several tracks, each listed track gets its own area and fader; the JSON does not combine files.

## Seating rules

Without a `seat` override, family determines the row:

| Family | Colour | Default row |
| --- | --- | --- |
| `strings` | Blue | `front` |
| `woodwinds` | Green | `middle` |
| `brass` | Red | `back` |
| `percussion` | Orange | `rear` |

Rows describe distance from the conductor: `front` is closest, `rear` furthest away. The map fills the available stage fan with the rows actually present, giving the front row more area. Empty rows disappear. A row with more than eight instrumental groups splits into balanced additional curved rows to keep the polygons legible. Above 24 parts, the map uses channel numbers to keep crowded rows readable; full instrument names remain in the matching faders and each area’s tooltip. The mixer below continues to provide one channel per track.

When supplying `seat`, set its `row`. You may also set:

- `order`: a number from −1000 to 1000. Smaller numbers sit further left in that row, as viewed on screen. Omitted values use conventional instrument ordering. If specifying an exact arrangement, give every group in that row an explicit order.
- `weight`: a number from `0.25` to `4`, default `1`. Larger weights request wider polygons within the row. A minimum width is reserved for every group, so this is a relative preference rather than a precise area ratio.

Changing `row` does not change family colour. For example, a harp may use `family: "percussion"` and `seat: { "row": "front", "order": 0 }` to appear in orange near the front. Positions are an editable teaching layout, not a claim that every orchestra uses the same seating.

## Musician symbols and counts

Supported `instrument` identifiers are `violin`, `viola`, `cello`, `bass`, `flute`, `oboe`, `clarinet`, `bassoon`, `horn`, `trumpet`, `trombone`, `tuba`, `harp`, `timpani` and `percussion`. A piccolo can use the flute symbol, an English horn the oboe symbol, and a violone the bass symbol; the full instrument label remains unchanged.

If `instrument` is omitted, the app chooses a symbol from the track's identifier, name and family. A known count normally draws one symbol per musician. When a region is too small to fit them all, it shows fewer symbols with the total `×N`; an estimated count is marked `≈N`. An unknown count shows a single identifying symbol with `?`, which does not mean one musician. Hover a section to read the count details.

`players` is separate from `seat.weight`: a fractional display weight is never interpreted as a headcount. Supply the number of people represented in that particular stem, not the number of instruments in a percussion setup or the number of microphones. For a display of actual recorded musicians, omit counts when a section is split across files and its allocation is unknown. If deliberately illustrating a hypothetical ensemble instead, use `playersBasis: "estimate"`, identify it in the session title and document the assumed totals and per-file allocation. The [PHENICX sessions](PHENICX-ANECHOIC.md) use that teaching approach for their strings.

Use `playersBasis: "confirmed"` for a count established by recording credits or equivalent documentation. Use `"estimate"` for a score-based assumption, a general seating diagram or a teaching choice. Omit `playersBasis` when there is no `players` count. Keep the supporting source and any qualifications alongside the session. The Beethoven example has confirmed counts; the Spheres templates distinguish diagram-based estimates from the unknown per-line string counts.

The player metadata changes only the illustration. It does not alter volume, the balance score, the number of audio channels, or the behavior of mute and solo. Exporting session settings preserves it.

## Complete Beethoven template

[beethoven-layout.json](../examples/beethoven-layout.json) names all twelve Operation Beethoven sections and maps them to four rows. Copy it into your local piece folder and rename it to `session.orchmix.json` to enable automatic discovery. The repository template contains no audio and uses the publisher’s WAV filenames; download links and credits are in [AUDIO-SOURCES.md](AUDIO-SOURCES.md).

Download the WAV versions to use the template directly: the app reads only the chosen excerpt from each large WAV. The optional downloader supports `python3 scripts/download_beethoven.py --format wav`.

For long MP3/FLAC originals, first make short WAVs with the [audio preparation helper](LOCAL-USE.md#make-long-recordings-lighter), then add the template’s `seat` settings to the helper’s generated session. You can also use this template with matching prepared WAV filenames. The excerpt start must be `0` for already-trimmed files.

Keep only the intended `.orchmix.json` in the chosen folder if you want automatic opening. The template’s 0 dB reference gains preserve the supplied stem amplitudes; use **Set reference** to establish your own teaching balance, then save the session again.
