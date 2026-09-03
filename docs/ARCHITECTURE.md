# Architecture

A dialog and an engine around PixInsight's core astrometry and image objects.
The script reprojects every mosaic tile onto one common grid, then joins the
tiles photometrically. There is one entry point and ten modules; everything is a
plain global function or class, wired together by `#include` in dependency
order — there are no ES modules and no `require`.

## Files

| File | What lives there |
|---|---|
| `pjsr/MosaicToolbox.js` | Feature declaration, the `#include` chain, `mtMain()` |
| `pjsr/mosaictoolbox/MT_Lang.js` | The English/French catalogue and `mtT()` / `mtTv()` |
| `pjsr/mosaictoolbox/MT_Globals.js` | Version, the filter table, FITS/identifier/enum/statistics helpers |
| `pjsr/mosaictoolbox/MT_Data.js` | The data model (`MT_Image`, `MosaicToolboxData`) and settings persistence |
| `pjsr/mosaictoolbox/MT_Astrometry.js` | The common grid, reprojection, edge erosion, autocrop, the screen stretch |
| `pjsr/mosaictoolbox/MT_Overlap.js` | Bounding boxes, the overlap mask, join orientation |
| `pjsr/mosaictoolbox/MT_Photometry.js` | Star detection and merging, aperture photometry, the scale fit |
| `pjsr/mosaictoolbox/MT_Gradient.js` | The sample grid, the surface spline, the correction field and its application |
| `pjsr/mosaictoolbox/MT_Join.js` | One complete photometric join, tying the five steps together |
| `pjsr/mosaictoolbox/MT_Engine.js` | Grid → layout → per-channel assembly, autocrop, the report |
| `pjsr/mosaictoolbox/MT_Dialog.js` | The dialog and every control on it |
| `pjsr/assets/MosaicToolbox.svg` | Menu icon, installed to `rsc/icons/script/` |

## What the node harness covers, and what it cannot

PixInsight scripts cannot run headless, so `tests/run.sh` bundles the modules
that load without PixInsight, drives them through a shim (`tests/shim.js`), and
runs the suites in `tests/*.test.js`. It then syntax-checks — with the same
preprocessor strip — the two files it does not bundle: the entry point, and
`MT_Dialog.js`, which is `class … extends Dialog` and evaluates its base class at
load time.

The strip removes PixInsight preprocessor directives (`#include`, `#define`,
`#feature-*`, `#engine`, the `#if` family) and **only** those. `MT_Data.js` and
`MT_Engine.js` use JavaScript private members — `#key()`, `#writeB()`,
`#buildGrid()` — which also begin with `#`; the strip's keyword list exists
precisely so those are never mistaken for a directive and deleted.

What is tested is the pure-logic layer:

| Suite | What it holds still |
|---|---|
| `strings` | The two catalogues carry the same keys, the printf placeholders match in order between languages, and `mtT`/`mtTv` fall back and substitute correctly |
| `i18n` | Every `mtT`/`mtTv` key used in the source (direct, concatenated or in a ternary) exists in the catalogue, and no tooltip is a hard-coded string |
| `filters` | `FILTER` keyword → channel key: exact aliases beat prefixes, longest prefix wins |
| `statistics` | `mtMedian`/`mtMAD`/`mtMean` on partial fills and typed arrays, the 1.4826 MAD scaling |
| `identifiers` | View id sanitisation and uniqueness, enum resolution by name with the first-item fallback, RA/Dec formatting |
| `layout` | Intersection/union of grid rectangles, 1-D clustering, and `mtOrderByConnectivity` — including the stranded and trim-too-tight diagnostics |
| `photometry` | `mtMergeStars` (coincident-pair merging across bucket boundaries) and `mtLinearLimit`'s floor |
| `geometry` | The midtones transfer function, and `mtLargestCoveredRect`'s largest-rectangle-in-a-histogram search for autocrop |
| `data` | `MosaicToolboxData.validate`/`warnings`/`activeChannels` — the business rules the dialog enforces before a run |

What it cannot cover is everything that needs a real image or the GUI: the grid
computation and reprojection (`AstrometricMetadata`, `ImageReprojection`), the
star detector and surface spline, the pixel writes of a join, and the dialog.
Those are the hand gates in [RELEASING.md](RELEASING.md). No harness can tell you
whether a join looks right — a mosaic is judged by eye.

## The pipeline

```
  all tiles, all filters
        │  MT_Engine.run()
        ▼
  ① one common grid            MT_Astrometry: MT_MosaicGrid
     (finest resolution, first tile's rotation, centre optimised over the union)
        ▼
  ② per channel: reproject every tile onto that grid   MT_Astrometry: mtReproject
        ▼
  ③ erode N px from every tile outline                 MT_Astrometry: mtTrimEdges
        ▼
  ④ join tiles into strips, then strips into the mosaic
     layout  MT_Engine: mtComputeLayout / mtOrderByConnectivity
     join    MT_Join: mtJoinTiles
        ▼
  ⑤ rename, tag FILTER, re-solve
        ▼
  ⑥ optional: one crop rectangle for all channels      MT_Astrometry: mtLargestCoveredRect
        ▼
  ⑦ optional: screen auto-stretch each result          MT_Astrometry: mtAutoStretch
```

**The grid is computed from every filter at once.** `MT_MosaicGrid` takes the
union of all participating tiles before any channel is processed, so every
channel is written onto the *same* canvas — identical coordinates, field of view
and pixel dimensions across L, R, G, B, S, H, O and any custom channel. Running
the stock MosaicByCoordinates once per filter cannot guarantee that, because each
run only sees its own tiles.

### The photometric join (`MT_Join.mtJoinTiles`)

Each join runs on two images already co-registered on the common grid:

1. **Overlap** (`MT_Overlap`). Bounding box of each tile's non-zero pixels, then
   a per-pixel mask of where both hold data, and the join orientation.
2. **Stars** (`MT_Photometry`). `StarDetector` on the shared region of both
   images; the two lists are merged (`mtMergeStars`) so a star faint in one is
   not lost.
3. **Scale** (`MT_Photometry`). Aperture photometry of every star in both images
   at an identical aperture and position, fitted robustly through the origin with
   3σ rejection (`mtScaleFromStars`). Too few stars falls back to a sigma-clipped
   pixel regression (`mtScaleFromPixels`), and says so.
4. **Gradient** (`MT_Gradient`). Star-free sample squares over the shared region
   give the residual, a smoothed `SurfaceSpline` is fitted to it, then refitted
   once with 3σ outliers against the first fit removed.
5. **Apply** (`MT_Gradient`). The correction is evaluated on a 16-pixel lattice
   and bilinearly interpolated; beyond the overlap it is held at the edge value
   and faded to a single constant offset over the taper distance.

## Language

`MT_Lang.js` holds one catalogue, keyed by the English string itself for short
controls (so a missing entry shows in English rather than as a placeholder) and
by a short symbolic key for the long tooltips and messages, which carry both
`en` and `fr`. `mtT(key)` returns the active language's text, falling back to
English and then to the key. `mtTv(key, values)` then substitutes `%NAME%`
placeholders — in function form, so a user-typed value containing `$&` is
inserted literally rather than re-expanded.

Every format string keeps its `%s`/`%d` placeholders in the same order in both
languages, so `format()` can be applied to whichever `mtT` returns.
`tests/strings.test.js` holds that invariant still. FITS `HISTORY` records and
console output are deliberately not translated: they are what a user pastes into
a forum post.

## Two things that govern changes

**The common grid is the whole point.** Every output is written onto one grid so
the channels can be combined with no further registration. Autocrop computes one
rectangle from *all* the finished channels together and applies it to every one
of them; cropping each channel to its own data would undo the single guarantee
the grid exists to provide.

**Zero means "no data".** Throughout the pipeline a zero pixel is absent
coverage, not black sky. A corrected pixel that would fall to or below zero is
clipped to a tiny positive value so it stays part of the mosaic's coverage, and
the console reports how many.

## Versioning at load time

The version literal lives in two places — the entry's `#define VERSION` (read by
the core projection dialog's captions) and `MT_VERSION()` in `MT_Globals.js`
(shown in the dialog and console). Both hold the token `__BUILD__`, stamped by
`scripts/build-update-package.sh` at packaging time and by `scripts/stage-dev.sh`
for hand testing. The tag is the version; there is no number to keep in step by
hand. `#engine v8` sets the JavaScript engine, and
`CoreApplication.ensureMinimumVersion(1,9,4)` sets the PixInsight floor at 1.9.4.

## Known deviations from the CaeloWorks house standard

- **CC BY-NC 4.0, not GPL-3.0.** The NonCommercial condition is the author's
  choice, applied across the scripts he maintains with Caelo Works. The one
  third-party component — the astrometry, derived from MosaicByCoordinates under
  the PixInsight Class Library License 2.0 — is permissive, so unlike the sibling
  scripts nothing upstream forces the licence. GPL-3.0 would in fact be
  unavailable regardless: the PCL 2.0's advertising and no-machine-learning
  clauses are additional restrictions the GPL forbids. See `LICENSE` and
  `NOTICE.md`.
