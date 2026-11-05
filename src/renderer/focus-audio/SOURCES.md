# Bundled focus ambience

The renderer imports only the generated files under `focus-audio/loops/` and the
three 35-second BigSoundBank beds. The unnormalised stems stay in
`assets/focus-sound-stems/` and are not part of the renderer bundle; regenerate
the loops with:

```bash
node scripts/normalize-soundscapes.mjs
```

Each loop is 12–24 s and has its seam crossfaded against itself, so the
soundscape engine can loop the whole buffer without a click. `layers.ts` carries
the per-file static trim; `SOURCES.md` is the licence record.

## Verified CC0 sources

| Bundled file | Source |
| --- | --- |
| `forest.ogg` | “Forest”, sound #0100, Joseph Sardin / LaSonotheque — https://bigsoundbank.com/forest-s0100.html |
| `rain.ogg` | “Summer Rain on Terrace”, sound #1019, Joseph Sardin / LaSonotheque — https://bigsoundbank.com/summer-rain-on-terrace-s1019.html |
| `waves.ogg` | “Sea Waves with Tern Calls”, sound #0267, Joseph Sardin / LaSonotheque — https://bigsoundbank.com/sea-waves-and-seagulls-s0267.html |

These three are 35-second Ogg Vorbis conversions at 44.1 kHz stereo. The source
recordings are released under CC0 1.0 / public-domain-equivalent terms; licence
details are at https://bigsoundbank.com/licenses.html. CC0 does not require
attribution, but it is included here as a courtesy.

## Additional stems — provenance NOT verified

These ten files came from the project's `assets/focus-sound-stems/` folder with
no accompanying source URL, author or licence. They are present in local/dev
builds only and **must not be shipped publicly until provenance is recorded
here**. If a licence cannot be established, replace the stem with a CC0
recording and re-run the normaliser.

| Source stem | Loop output | Duration (loop) | Status |
| --- | --- | --- | --- |
| `distant_thunder.ogg` | `loops/distant_thunder.ogg` | 20.5 s | provenance unrecorded |
| `drizzle.ogg` | `loops/drizzle.ogg` | 22.5 s | provenance unrecorded |
| `forest_after_rain.ogg` | `loops/forest_after_rain.ogg` | 22.5 s | provenance unrecorded |
| `heavy_rain.ogg` | `loops/heavy_rain.ogg` | 22.5 s | provenance unrecorded |
| `roof_rain.ogg` | `loops/roof_rain.ogg` | 22.5 s | provenance unrecorded |
| `small_stream.ogg` | `loops/small_stream.ogg` | 22.5 s | provenance unrecorded |
| `stream.ogg` | `loops/stream.ogg` | 18.5 s | provenance unrecorded |
| `terrace_downpour.ogg` | `loops/terrace_downpour.ogg` | 22.5 s | provenance unrecorded |
| `thunder.ogg` | `loops/thunder.ogg` | 18.5 s | provenance unrecorded |
| `wind.ogg` | `loops/wind.ogg` | 10.5 s | provenance unrecorded |

Durations are the loop lengths produced by the script; its output is one seam
(1.5 s, or target/6 for short loops) shorter than the requested window.
