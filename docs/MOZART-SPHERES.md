# Mozart: Symphony No. 40 — The Spheres session

[Download mozart-spheres.orchmix.json](../examples/mozart-spheres.orchmix.json). Put it beside the 14 converted WAV stems, then choose **Load stems → Choose folder**. Keep only the intended `.orchmix.json` in that folder for automatic loading.

The session is for **Symphony No. 40 in G minor, K. 550, revised version with clarinets**. It preserves the source balance with every reference gain at **0 dB**. Its initial excerpt is **0–30 seconds**; adjust the start and length in the loader to explore another passage. At 48 kHz, fourteen stereo stems require approximately **154 MiB** of decoded sample memory for 30 seconds, before overhead.

## Instrumentation and seating

The [dataset paper, Section II-A and Table I](https://arxiv.org/html/2511.21247v1#S2), confirms fourteen separately recorded Mozart lines: five string sections, flute, two oboes, two clarinets, two bassoons and two horns. Each Mozart string section has one stem. `Violin_1.wav` and `Violin_2.wav` therefore mean first and second violins, not two individual violinists.

| WAV stem | Instrument group | Layout row | Display weight |
| --- | --- | --- | ---: |
| `Violin_1.wav` | Violins I | Front | 3 |
| `Violin_2.wav` | Violins II | Front | 3 |
| `Viola.wav` | Violas | Front | 2 |
| `Cello.wav` | Cellos | Front | 1.5 |
| `Bass.wav` | Double basses | Front | 1 |
| `Flute.wav` | Flute | Middle | 1 |
| `Oboe_1.wav`, `Oboe_2.wav` | Oboes 1 and 2 | Middle | 1 each |
| `Clarinet_1.wav`, `Clarinet_2.wav` | Clarinets 1 and 2 | Middle | 1 each |
| `Bassoon_1.wav`, `Bassoon_2.wav` | Bassoons 1 and 2 | Middle | 1 each |
| `Horn_1.wav`, `Horn_2.wav` | Horns 1 and 2 | Back | 1 each |

Strings are blue, woodwinds green and horns red. This instrumentation has no percussion or harp, so the layout has no rear percussion row. All fourteen regions retain their instrument labels.

## What can be said about player numbers

The paper's general recording diagram (Figure 2) shows **6–6–4–3–2** string positions. It does not publish a separate Mozart roster, and its prose mentions six violinists without resolving their assignment between the two violin groups. Those positions are used here as a **display reference**, not a verified Mozart headcount per file. Each wind/horn file represents one instrumental part.

The five string weights preserve the diagram's 6:6:4:3:2 proportions, scaled by one half to fit the app's maximum weight of 4. `seat.weight` affects polygon width within a row; it is not a count of people and never changes audio gain. The layout reserves a minimum width for each region, so displayed areas are not exact seat-count ratios.

The separate `players` fields use **6, 6, 4, 3 and 2** for the string groups and **1** for each wind or horn part, all with `playersBasis: "estimate"`. The stage marks these counts with **≈**. These symbols are a useful visualization of the diagram and instrumental parts, not a confirmed Mozart performer roster. The instrument symbols and counts are preserved when you export the session.

## Source files

The [official StereoMix archive](https://zenodo.org/records/17347681) has a single `Mozart/StereoMix/` folder with these fourteen FLAC basenames. Use the WAV conversions from that one folder, retaining their common time origin. The recording contains all four movements; use the excerpt start control to reach later passages. Avoid mixing stems from different microphone folders or separately trimmed exports.

Sources: [The Spheres dataset](https://zenodo.org/records/17347681); [García-Martínez et al., arXiv:2511.21247v1, Sections II–III, Table I and Figure 2](https://arxiv.org/html/2511.21247v1).

Prepared for Adrián Artacho's Orch Mix on 14 October 2026. No recordings are included.
