# Beethoven: Symphony No. 4 — Operation Beethoven session

[Download beethoven-operation.orchmix.json](../examples/beethoven-operation.orchmix.json). Place it beside the twelve `oma-hkm-*.wav` recordings and choose **Load stems → Choose folder**. `download-record.json` can remain there: it is the downloader's record and is not treated as audio or an Orch Mix session.

The files contain the slow introduction and first movement of Beethoven's Symphony No. 4 in B-flat major, Op. 60, performed by the Hofkapelle München. The initial excerpt is **0–30 seconds**; change the start and length in the loader to explore another passage. All reference gains remain **0 dB**.

## Confirmed section sizes

The [official project page, “Die Beteiligten”](https://openmusic.academy/docs/4HAB9wcKyiXNGNsmkEFRXD), names the musicians in each section. Counting those credits gives **25 instrumentalists**, excluding the conductor:

| WAV stem | Instrument group | Players | Stage row |
| --- | --- | ---: | --- |
| `oma-hkm-08-vl1.wav` | Violins I | 4 | Front |
| `oma-hkm-09-vl2.wav` | Violins II | 4 | Front |
| `oma-hkm-10-vla.wav` | Violas | 2 | Front |
| `oma-hkm-11-vlc.wav` | Cellos | 2 | Front |
| `oma-hkm-12-vlo.wav` | Violone | 1 | Front |
| `oma-hkm-01-fl.wav` | Flute | 1 | Middle |
| `oma-hkm-02-ob.wav` | Oboes | 2 | Middle |
| `oma-hkm-03-kl.wav` | Clarinets | 2 | Middle |
| `oma-hkm-04-fg.wav` | Bassoons | 2 | Middle |
| `oma-hkm-05-hrn.wav` | Horns | 2 | Back |
| `oma-hkm-06-trp.wav` | Trumpets | 2 | Back |
| `oma-hkm-07-pk.wav` | Timpani | 1 | Rear |

The bass instrument is credited as **Violone** and described in the downloads as “Bass-Viole”. The session uses that source-specific name rather than the generic double-bass label. Each file represents the named group; a paired wind or brass section remains one mixer channel.

`seat.weight` equals the credited player count in this template. It controls relative polygon width within a row, never audio gain. The layout engine reserves minimum widths and allocates space between rows independently, so the map is not an exact area chart of headcounts. Colour conventions remain blue strings, green woodwinds, red brass and orange timpani.

The existing [beethoven-layout.json](../examples/beethoven-layout.json) template has been updated to the same names and weights. Use only one `.orchmix.json` in your audio folder for automatic selection. Do not add the separately recorded tutti as an extra stem.

For download links and recording credits, see [AUDIO-SOURCES.md](AUDIO-SOURCES.md#start-here-operation-beethoven). The session contains no audio.
