# Tchaikovsky: Romeo and Juliet — The Spheres session

[Download the session JSON](../examples/tchaikovsky-spheres.orchmix.json). Put it in the `wav` folder beside the 33 files, then choose **Load stems → Choose folder**. Keep just one `.orchmix.json` in that folder for automatic selection.

The template uses the supplied filenames exactly, including lowercase `coranglais.wav` and `untunedpercussion_1.wav` / `untunedpercussion_2.wav`. Every stem has its own control, an explicit seat row/order and an unchanged reference gain of **0 dB**. It assumes the files come from the same StereoMix set and retain their common starting point.

The initial excerpt is **0–30 seconds**. At 48 kHz, 33 stereo stems require about **363 MiB** of decoded sample memory for 30 seconds, before overhead. Change the start in the loader to choose another passage; longer excerpts remain subject to the app's memory budget.

## What the recording documentation establishes

The [dataset paper, Section II-B, Table I and Figure 2](https://arxiv.org/html/2511.21247v1#S2.SS2), distinguishes recorded lines from seats. Figure 2 depicts six first-violin positions, six second-violin positions, four violas, three cellos and two basses. The prose separately mentions six violinists in its first recording stage; it does not explain how these map to both violin groups or the numbered string recordings. Therefore, the diagram is a layout reference, not a verified roster of distinct people or a per-file headcount.

| Stem filename(s) | Supported interpretation | Player count per file |
| --- | --- | --- |
| `Violin_1_1.wav`, `Violin_1_2.wav` | Two first-violin lines; six section positions in the diagram | Unspecified |
| `Violin_2_1.wav`, `Violin_2_2.wav` | Two second-violin lines; six section positions | Unspecified |
| `Viola_1.wav`, `Viola_2.wav` | Two viola lines; four section positions | Unspecified |
| `Cello_1.wav`, `Cello_2.wav` | Two cello lines; three section positions | Unspecified |
| `Bass.wav` | One double-bass line; two section positions | Two indicated by the diagram |
| `Flute_1.wav`, `Flute_2.wav`, `Piccolo.wav` | Separate wind parts | One part/performer per stem; see shared-seat note below |
| `Oboe_1.wav`, `Oboe_2.wav`, `coranglais.wav` | Separate wind parts | One part/performer per stem; see shared-seat note below |
| `Clarinet_1.wav`, `Clarinet_2.wav`, `Bassoon_1.wav`, `Bassoon_2.wav` | Separate wind parts | One part/performer per stem |
| `Horn_1.wav` through `Horn_4.wav` | Four horn parts | One part/performer per stem |
| `Trumpet_1.wav`, `Trumpet_2.wav` | Two trumpet parts | One part/performer per stem |
| `Trombone_1.wav` through `Trombone_3.wav`, `Tuba.wav` | Separate low-brass parts | One part/performer per stem |
| `Harp.wav` | Harp part | One position |
| `Timpani.wav` | Timpani part | One position; three drums in the score, not three players |
| `untunedpercussion_1.wav`, `untunedpercussion_2.wav` | Two parts: bass drum and cymbals | One position each; the file-to-instrument assignment is unverified |

The paper says piccolo shared a seat with a flute, and English horn with an oboe. That does not establish identical players or simultaneous seating. The two string suffixes identify separately recorded lines; they should not be read as individual players or desks.

## How the JSON represents this

The app's `seat.weight` controls relative polygon width; it is **not a player-count field** and does not alter audio gain. For display only, the two stems of each string group share the diagram's section weight equally:

- Each first- or second-violin stem: `3`.
- Each viola stem: `2`.
- Each cello stem: `1.5`.
- Double-bass stem: `2`.
- Other stems: `1`.

These values are a visual convention, not measured performers per recording. In particular, `1.5` means half the cello section's display allocation. The layout engine also reserves minimum widths and splits crowded rows, so polygon areas are not an exact headcount chart. Full string names say “line 1/2” without claiming a particular divisi allocation.

Musician symbols use a separate `players` field. The template leaves it out for all numbered string lines and the two unidentified untuned-percussion stems; those polygons show an identifying symbol with **?**, not a guessed number of musicians. The bass stem has `players: 2`; individual wind, brass, harp and timpani stems have `players: 1`. All supplied counts use `playersBasis: "estimate"` and appear with **≈**, because the diagram and recorded parts do not establish a unique-player roster. Piccolo shares the flute symbol, and English horn the oboe symbol, without changing their labels.

Harp uses orange and sits on the left of the middle row. Strings are blue, woodwinds green, brass red, and percussion orange. This is a readable teaching arrangement rather than an exact reconstruction of the rectangular studio plan. With 33 stems the current app displays channel numbers on the map; instrument names remain in the matching faders and tooltips.

The source metadata records durations and instrument activity, not players per numbered string stem. Its two generic percussion names are retained until their identities can be established by listening or by the producers. No guessed bass-drum/cymbal assignment is embedded in the JSON.

## Sources

- [The Spheres dataset on Zenodo](https://zenodo.org/records/17347681): StereoMix archive and metadata; performed by the Colibrì Ensemble. The user-supplied WAV names match its 33 Tchaikovsky FLAC stem names after extension conversion.
- [García-Martínez et al., The Spheres Dataset, arXiv:2511.21247v1](https://arxiv.org/html/2511.21247v1): Section II-B, Table I and Figure 2 for recording methods, lines and seating; Section III for the file organization.
- [Official experiment code](https://github.com/repertorium/TheSpheresDataset-Experiments): groups the two untuned percussion files without identifying them separately.
- [Tchaikovsky Research: Romeo and Juliet](https://en.tchaikovsky-research.net/pages/Romeo_and_Juliet#Instrumentation): score instrumentation. It specifies string groups, not their player numbers.

Prepared for Adrián Artacho's Orch Mix on 14 October 2026. The template and these notes contain no audio.
