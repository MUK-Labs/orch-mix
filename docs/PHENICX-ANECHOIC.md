# PHENICX-Anechoic sessions

These manifests match Adrián's supplied WAV folder listings exactly. Copy the matching file beside that piece's WAVs, keep its `.orchmix.json` suffix, then choose the folder in Orch Mix. Keep only one session file in each audio folder for automatic loading. A bare `orchmix.json` does not match the app's automatic discovery pattern; `session.orchmix.json` does.

| Folder | Recording | Manifest | Listed stems |
| --- | --- | --- | ---: |
| `beethoven` | Symphony No. 7, movement I | [beethoven-phenicx.orchmix.json](../examples/beethoven-phenicx.orchmix.json) | 20 |
| `bruckner` | Symphony No. 8, movement II | [bruckner-phenicx.orchmix.json](../examples/bruckner-phenicx.orchmix.json) | 34 |
| `mahler` | Symphony No. 1, movement IV | [mahler-phenicx.orchmix.json](../examples/mahler-phenicx.orchmix.json) | 30 |
| `mozart` | *Don Giovanni*: Donna Elvira's aria, instrumental tracks | [mozart-phenicx.orchmix.json](../examples/mozart-phenicx.orchmix.json) | 10 |

The original Aalto documentation identifies these works. This Beethoven recording is the Seventh, distinct from the Operation Beethoven Fourth; this Mozart is an opera aria, distinct from the Spheres Fortieth Symphony. PHENICX is a selected, denoised subset of the Aalto recordings. Only the supplied instrument files are represented; there are no added percussion, trombone, tuba or soprano channels.

## Bruckner: five files absent from the supplied listing

The [Zenodo archive preview](https://zenodo.org/records/840025/preview/PHENICX-Anechoic.zip?include_deleted=0) contains 39 Bruckner WAVs. These five appear there but not in the supplied folder listing:

- `clarinet3.wav`
- `horn6.wav`
- `trumpet3.wav`
- `violin2.wav`
- `violin9.wav`

The supplied session deliberately references only the 34 listed files, so it can open with that folder as it stands. Check the extracted archive if the omissions were accidental. Adding the WAVs alone does not add them to this explicit session: its track list must also be updated. Original numbering is preserved; Horn 7 does not become Horn 6.

## What the player icons mean: estimated orchestral seating

At Adrián's request, the string icons now depict a plausible performing ensemble rather than the individual player recorded in each file. Every string count is marked `playersBasis: "estimate"`; the app displays `≈N` and identifies it as estimated in the tooltip. Session titles also identify the estimated seating. These are teaching assumptions, not verified recording rosters or mandatory forces for the works.

The recording paper states that one musician for each instrument recorded its parts successively, with multiple usable string takes. It also suggests around ten players in each violin section for Mozart and twelve for Beethoven. Those contextual examples support the Mozart and Beethoven violin totals below, but do not establish actual recorded section sizes. The other figures, including both Romantic ensembles, are editorial estimates for this visualization.

| Piece | Violins, both sections combined | Violas | Cellos | Double basses |
| --- | ---: | ---: | ---: | ---: |
| Mozart | 20 | 6 | 4 | 3 |
| Beethoven | 24 | 8 | 8 | 6 |
| Mahler | 32 | 12 | 10 | 8 |
| Bruckner, intended complete set | 32 | 12 | 10 | 8 |
| Bruckner, current supplied files | 27 | 12 | 10 | 8 |

The estimates are allocated across the stems as follows:

| Piece | Violin stems | Viola stems | Cello stems | Double-bass stem |
| --- | --- | --- | --- | --- |
| Mozart | 10 each across 2 files | 6 | 4 | 3 |
| Beethoven | 6 each across 4 files | 4 each across 2 files | 8 | 6 |
| Mahler | 8 each across 4 files | 12 | 10 | 8 |
| Bruckner | Repeat 3, 3, 2 over file numbers 1–12 | 4 each across 3 files | 5 each across 2 files | 8 |

The Bruckner scheme assigns 3 seats to `violin2.wav` and 2 to `violin9.wav`. Because those files are absent, their five seats are not shown or redistributed: the ten available violin stems represent 27 of the modeled 32 seats. Restoring a missing stem would require adding its track with the corresponding estimate.

Labels such as **Violin 1**, **Violin 2** and **Violin 3** retain the PHENICX file numbering. Allocation between these files is approximate; no assignment to violin I/II or particular divisi has been verified. The Bruckner 3/3/2 pattern is a rounding convention, not evidence that those lines used different real section sizes. Wind and brass stems retain one confirmed recorded player per file. Counts apply only to the available parts; they are not a total for the complete score.

Increasing `players` changes the illustration only. It does not synthesize additional performers, add missing musical lines, change the audio gains or make a solo string take sound like a section. To return to the recorded-layer display, set each string track's `players` to `1` and `playersBasis` to `"confirmed"`.

Strings occupy the front, woodwinds the middle and brass the back. Numerical ordering keeps Violin 10 after Violin 9 rather than after Violin 1. The app divides crowded rows automatically. Seating is a display arrangement, not a reconstruction of the original recording room.

## Playback and reference balance

All reference gains are `0` dB, preserving the supplied relative amplitudes without normalizing files. Start at the app's default low master level. The files request the first 30 seconds; adjust the excerpt controls to hear another passage or a longer selection, within the app's limits.

These are already excerpts, not full symphony movements. The PHENICX catalogue gives approximate durations of 3:11 (Beethoven), 1:27 (Bruckner), 2:12 (Mahler) and 3:47 (Mozart); the actual selected WAVs determine the available duration. The balance target starts from the available recorded layers. It is not a reconstruction of a full orchestra's section sizes, and Bruckner currently lacks five released layers. Use **Set reference** if you establish a different teaching balance.

## Sources and credits

Checked 15 October 2026:

- [PHENICX-Anechoic, Zenodo record 840025](https://zenodo.org/records/840025): dataset provenance and filename convention. Denoised recordings and annotations by the Music Technology Group, Universitat Pompeu Fabra; record creators Marius Miron and Juan Jose Bosch.
- [UPF dataset documentation](https://www.upf.edu/web/mtg/phenicx-anechoic): instrument totals, durations and selected instrument types.
- [Aalto recording documentation](https://research.cs.aalto.fi/acoustics/virtual-acoustics/research/acoustic-measurement-and-analysis/85-anechoic-recordings.html): works, original parts and recording method.
- T. Lokki, J. Pätynen and V. Pulkki, [*Recording of anechoic symphony music*](https://users.aalto.fi/~ktlokki/Publs/001538.pdf), Acoustics 08 Paris, sections 2.1, 4.1 and 6.2: contextual Mozart/Beethoven violin section sizes, individual performers, sequential parts and multiple string takes.
- Dataset reference: M. Miron, J. Carabias-Orti, J. J. Bosch, E. Gómez and J. Janer, *Score-informed source separation for multi-channel orchestral recordings* (2016). Original recording reference: J. Pätynen, V. Pulkki and T. Lokki, *Anechoic recording system for symphony orchestra* (2008).

Only the new Orch Mix settings and these notes are committed. Audio and source annotations remain outside the repository; see the [audio source guide](AUDIO-SOURCES.md) for the publisher's recording-rights information.
