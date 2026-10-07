# Recordings for Orch Mix

Source notes checked 7 October 2026. Download from the rights holder or dataset publisher and keep the accompanying credits and licence. No third-party recordings are included in this repository. Orch Mix is a project by Adrián Artacho; recording credits remain with their respective creators.

## Start here: Operation Beethoven

[Official project and download page](https://openmusic.academy/docs/4HAB9wcKyiXNGNsmkEFRXD) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Beethoven's Fourth Symphony: the slow introduction and first movement, recorded by the Hofkapelle München as twelve synchronized parts. A practical first set for the mixer. These are section recordings, not twelve microphones of a simultaneous tutti. Select all twelve files from the same format; do not add the separate tutti recording as a thirteenth stem.

| Section | MP3 (smaller) | WAV (uncompressed) |
| --- | --- | --- |
| Violins I | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-08-vl1.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-08-vl1.wav) |
| Violins II | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-09-vl2.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-09-vl2.wav) |
| Violas | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-10-vla.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-10-vla.wav) |
| Cellos | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-11-vlc.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-11-vlc.wav) |
| Bass viol / violone | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-12-vlo.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-12-vlo.wav) |
| Flute | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-01-fl.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-01-fl.wav) |
| Oboes | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-02-ob.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-02-ob.wav) |
| Clarinets | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-03-kl.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-03-kl.wav) |
| Bassoons | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-04-fg.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-04-fg.wav) |
| Horns | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-05-hrn.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-05-hrn.wav) |
| Trumpets | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-06-trp.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-06-trp.wav) |
| Timpani | [MP3](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-07-pk.mp3) | [WAV](https://soundprojekt.hmtm.de/sound/oma-hkm/oma-hkm-07-pk.wav) |

Optional download helper, explicitly run from the repository folder:

```sh
python3 scripts/download_beethoven.py
```

This downloads the MP3s to `local-audio/beethoven/`. Add `--format wav` for WAV files. Nothing is downloaded by opening the app. The helper checks audio signatures and transfer sizes and records a local SHA-256 checksum for safe subsequent runs; it does not claim publisher-signed authentication. Existing changed or unverified files require a new folder or `--overwrite`.

Required source credit:

> CC BY 4.0 – Operation Beethoven. Ein Projekt der Open Music Academy in Kooperation mit der Hofkapelle München, 2023.

Link the licence and identify modifications, such as trimming an excerpt or changing levels. No endorsement is implied. The separately performed tutti is a musical comparison, not an exact waveform reconstruction of the isolated takes.

## Larger real-orchestra set: The Spheres

[Dataset and downloads](https://zenodo.org/records/17347681) · [StereoMix ZIP, about 2.8 GB](https://zenodo.org/records/17347681/files/TheSpheresDataset-StereoMix.zip?download=1) · [Publisher's institutional licence record](https://investigacion.ujaen.es/documentos/69287b76c7686d7eca210ca5?lang=fr) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

Colibrì Ensemble recordings of Mozart's Symphony No. 40 and Tchaikovsky's *Romeo and Juliet*, with up to 33 lines in 18 instrument categories. The **StereoMix** archive contains the individual instruments' contributions to the stereo mix; its name does not mean it contains only a finished mix. The full multichannel archive is about 25.3 GB and is unnecessary for this app.

Unzip locally, choose **one work or movement and its stereo-mix stem folder**, and select the individual FLAC stems. Exclude completed mixes, microphone alternatives, chromatic scales and solo test excerpts. Prepare a short WAV excerpt first if browser decoding is slow. Keep the source-relative gains. Credit the dataset authors and performers using its metadata; distributed adaptations require the applicable ShareAlike terms.

## Further material

| Source and official download entry | Material | Licence / practical point |
| --- | --- | --- |
| [SynthSOD](https://zenodo.org/records/13759492) | Over 47 hours of rendered orchestral/ensemble stems, synthesized with BBC Symphony Orchestra Professional; sample archive available | [CC BY-SA 4.0](https://investigacion.ujaen.es/documentos/67321d1aaea56d4af04840e5?lang=de). Pick one work and either its `Tree` or `Close Mic` folder, not both. Dynamics/articulations include generated variations; establish your own reference balance. Check the chosen composition's rights for any sharing. |
| [URMP on Dryad](https://datadryad.org/dataset/doi:10.5061/dryad.ng3r749) | 44 coordinated chamber performances; useful for a few-track introductory exercise | Dryad deposit under CC0. Select the individual tracks for one piece, not the assembled mix or video. |
| [PHENICX-Anechoic](https://zenodo.org/records/840025) | Denoised synchronized instrumental excerpts based on Aalto's anechoic recordings | Its page explicitly directs questions about recording rights and distribution to Aalto / Jukka Pätynen / Tapio Lokki. Do not treat the annotations' licence as audio permission. |
| [ECHO official database](https://apl-hud.com/echo-database/) / [Zenodo downloads](https://doi.org/10.5281/zenodo.15268471) | Orchestral multitracks, microphone arrays, spot microphones and immersive mixes | CC BY-NC-ND 4.0. The project explicitly welcomes noncommercial educational use and mixing practice. Microphone bleed makes these less suitable for isolating a single instrumental family. Keep private exercises separate from publishing mixes; consult the source for any additional use. |
| [OrchPlay](https://www.orchplaymusic.com/en/) / [official terms](https://orchplaymusic.com/fr/terms) | Proprietary multichannel repertoire with its own player | The terms distinguish restricted OPL library files from audio generated using the player's mixing functions for personal, research, lecture-demonstration or pedagogical use. Use only audio exports that the official software and your licence permit. Orch Mix does not read OPL containers or bypass copy protection. |

Keeping audio on your computer avoids distributing it through GitHub. It does **not** itself grant access, conversion, classroom playback or public-performance rights. Apply the source's terms to the intended activity; the local architecture does not make a blanket educational exemption. For the first classroom session, Operation Beethoven provides the clearest permissions and simplest track layout.
