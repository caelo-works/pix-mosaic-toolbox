# Changelog

All notable changes to Mosaic Toolbox are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html): the tag is the
version, and a change that moves the pixels of an assembled mosaic is major.

Mosaic Toolbox was written by Nicolas Godingen. From version 2.3.1 onwards it is
maintained and distributed by Caelo Works with the author's agreement. See
`NOTICE.md` for the full attribution.

## [Unreleased]

### Documentation

- The README says that the automatic grid rotation is the first opened tile's,
  so the same tiles opened in another order give a slightly different grid,
  and how to reproduce a mosaic exactly.

### Fixed

- **Autocrop kept no astrometric solution.** On PixInsight 1.9.4 and 1.9.5 the
  Crop process deletes the solution of the image it crops, and the script did
  not rebuild it, so every mosaic cropped by **Autocrop** came out without one.
  On the fallback path (pixel copy, used when the Crop process cannot be driven)
  the solution was kept but not moved, so it was off by the crop offset. The
  crop's solution is now rebuilt from the common grid, shifted by the crop
  origin; on PixInsight 1.9.6 and later, where Crop transforms the solution
  itself, Crop's is kept and checked against the grid's (a warning above
  0.1 px). The console reports which, for every mosaic. **Mosaics autocropped
  with an earlier version have no astrometric solution (or a shifted one):
  re-solve them, or assemble them again with this version.** Autocrop is off by
  default; uncropped mosaics were not affected.

- `sign-package.sh` kept no leading or trailing space of the key password
  (`read` without `IFS=`). It now also builds and checks the signed zip and
  its sidecar in its work directory, and replaces the originals only once
  `check-package.sh --signed` and `verify-signature.sh` both pass: a failed
  run leaves the unsigned package as it was.
- `check-package.sh` no longer pipes into `grep -q`: under `pipefail`, the
  writer could die of SIGPIPE after an early match and turn a pass into a
  failure at random. Listings are captured first.

## [2.4.3] - 2026-10-31

Signed with the CaeloWorks identity of the Certified PixInsight Developer
program, as the PixInsight Development Team asked under rule 5.1 of the CPD
Program Rules. **No pixel moves**: nothing in `pjsr/` is touched, so an
assembled mosaic is identical to 2.4.2's.

**Validation.** Node harness green (148 assertions), shellcheck clean. The
unsigned 2.4.3 zip is byte-identical to what the 2.4.2 build scripts produce
from the same sources (`check-package.sh` PASS, reproducible).
`check-package.sh --signed` rejects a missing signature, a second `.xsgn` and a
signature claiming another developer. The signed package is checked with
unsigned scripts disallowed once it has been signed.

### Added

- `MosaicToolbox.xsgn`, the code signature of the entry script. It covers every
  file the entry script includes from `mosaictoolbox/`, so those files carry
  none of their own; PixInsight's documentation advises against signing them,
  and refuses to. The platform includes (`StarDetector.jsh`, `astrometry/…`) are
  PixInsight's own signed code and are not part of ours. The script now runs
  with *Allow execution of unsigned scripts* turned off.
- `scripts/sign-package.sh`: signs a built zip in place, re-zips it the way the
  build does, writes the new sha1 into `update-package.json`, and checks the
  result. `scripts/verify-signature.sh` asks PixInsight whether a package's
  signature is valid, on the files as the zip carries them, and needs no key.
  `scripts/pi-run.sh` drives a headless PixInsight, including a Windows one
  from WSL.

### Changed

- A tag now opens a **draft** release. It is published only once the package is
  signed, which CI cannot do, having neither PixInsight nor the keys.
- `build-update-package.sh` no longer has a signing branch (it had never been
  used): the signature is made on the zip, after the version stamp. Its zip
  writer moved to `scripts/repro-zip.py`, shared with `sign-package.sh` so the
  signed zip is laid out like the unsigned one.
- `check-package.sh --signed` requires exactly one signature, the entry
  script's, claiming CaeloWorks. Without the flag it checks a development build
  and refuses any signature.
- A release zip is no longer reproducible: the signature carries a timestamp.
  CI still checks reproducibility on the unsigned build.

## [2.4.2] - 2026-10-13

### Changed

- The **Caelo Works** header link follows the interface language: the English
  product page (`/en/scripts/pix-mosaic-toolbox`) in English, the French one
  (`/scripts/pix-mosaic-toolbox`) in French. The address is read at click time,
  so it follows a language switch, and the tooltip shows the one that will open.
  Both are hard-coded https constants; `tests/cpd.test.js` checks each.

## [2.4.1] - 2026-10-13

Compliance with the
[CPD Program Rules v1.0](https://pixinsight.com/security/cpd-rules/) published by
Pleiades Astrophoto. No change to the image processing: an assembled mosaic is
identical to 2.4.0's.

### Changed

- The **Caelo Works** link in the dialog header now opens this script's own page,
  <https://pixinsight-scripts.caelo.works/scripts/pix-mosaic-toolbox>, instead of
  the catalogue home page, so it stays product identification (rule 6.4). The
  address is a hard-coded https constant, and anything but https is refused.
- On Windows the link opens the browser with `explorer.exe` directly instead of
  going through the `cmd` shell. macOS (`open`) and Linux (`xdg-open`) unchanged.
- The link has a tooltip (English and French) saying that it opens the product
  page in the default browser and that it is the only program the script ever
  starts (rule 5.3).

### Documentation

- New README section *Privacy, network and external programs* (rule 6.1): no
  network connection, the single external-program launch and when it happens,
  the `MosaicToolbox/` settings key, no file written to disk, no telemetry.
- The README now states accurately what happens to source windows: their pixels
  are never modified, and a plate solution present only as header keywords is
  rebuilt by PixInsight when you press Run. The previous "never modifies your
  source windows" was too strong.
- The statements that the CaeloWorks repository is unsigned are gone: Caelo Works
  is a Certified PixInsight Developer, and signing is handled by a separate
  process outside this repository (README, `docs/RELEASING.md`,
  `scripts/build-update-package.sh`). `docs/RELEASING.md` gains a CPD Program
  Rules checklist and a hand gate for the header link.
- Verified compatible with **PixInsight 1.9.5** (Lockhart), no code change. 1.9.5
  moves astrometric solutions to the new XISF `AstrometricSolution` format; Mosaic
  Toolbox reads them through the standard `pjsr/astrometry/AstrometricMetadata.js`
  include (`ExtractMetadata`), which reads the new format automatically. Validated
  by hand on tiles resolved under 1.9.5 and on pre-1.9.5 tiles converted on open.

### Tests

- `tests/cpd.test.js` holds the documented external-program surface: one
  `ExternalProcess`, in `mtOpenInBrowser`, no shell interpreter, called only with
  the product URL. 144 assertions across ten suites.

## [2.4.0] - 2026-09-03

First Caelo Works distribution of the script. The image-processing engine — the
common grid, reprojection, overlap, photometry, gradient model, join and
per-channel assembly — is Nicolas Godingen's 2.3.1, carried over unchanged, so
the pixels of an assembled mosaic are identical. The changes here are to the
interface, the string catalogue, packaging, testing and repository
infrastructure. Validated by hand on a real multi-filter mosaic: one common grid
across every filter, with clean joins.

### Added

- A branded header matching the other CaeloWorks scripts: the menu icon as an
  emblem, the title, a version and maintainer line, and the language selector on
  one row, with the tagline and the requirement notes below it. Colored resource
  icons on the Check plan, Run and Cancel buttons.
- A Node test harness (`tests/`) that drives the pure-logic layer — filter
  matching, robust statistics, view identifiers, the join layout and order, the
  star merge, the midtones transfer function and the autocrop rectangle, the
  data model's validation, and the English/French catalogue — through a shim of
  the PixInsight globals it touches. 135 assertions across nine suites.
- Continuous integration (`.github/workflows/ci.yml`): the test harness on two
  Node versions, a reproducible package build checked against the update site's
  ingest contract, and repository hygiene (shellcheck, SPDX headers, module
  reachability, licence consistency, a well-formed menu icon).
- Release automation (`.github/workflows/release.yml`): a semver tag runs the
  whole of CI, then builds and publishes the distribution zip and its
  `update-package.json` sidecar.
- Packaging scripts (`scripts/`): `build-update-package.sh` (reproducible zip +
  sidecar), `check-package.sh` (the ingest contract), `stage-dev.sh` (hand-test
  staging, WSL-aware).
- A menu icon (`pjsr/assets/MosaicToolbox.svg`) and a `#feature-icon` directive,
  so the script carries an icon under **Script → Mosaic** like its siblings.
- Project documentation: `docs/ARCHITECTURE.md`, `docs/RELEASING.md`,
  `CONTRIBUTING.md`, `LICENSE`, `NOTICE.md`, and issue templates.

### Fixed

- The `%TITLE%` and `%VERSION%` placeholders in the dialog header and in the
  "no plate-solved image is open" message showed up literally instead of being
  filled in. The PixInsight preprocessor was substituting its `#define TITLE` /
  `#define VERSION` macros into the object keys `mtTv` reads (`{ TITLE: … }`
  became `{ "Mosaic Toolbox": … }`), so the placeholders never matched. The keys
  are now quoted, and `tests/preprocessor.test.js` guards the whole class of
  macro/identifier collision — which the node harness could not otherwise see,
  since it strips `#define` without applying it. (Pre-existing in 2.3.1.)

### Changed

- The requirement/help text at the top of the dialog moved into a collapsible
  "Help" section that opens collapsed, so it does not take up room on every run.
  The one-line tagline stays under the title.
- Switching the interface language now retranslates the dialog in place, the way
  the sibling CaeloWorks scripts do, instead of closing and reopening the window.
  The image table, settings and the current view are kept untouched. The
  reopen-loop that drove the old behaviour is gone from the entry point.
- The source tree moved under `pjsr/` (entry point plus the `mosaictoolbox/`
  module folder), the layout the packaging and staging scripts expect. The
  `#include` paths are unchanged, so the script still runs from the folder as-is.
- The version literal is now the token `__BUILD__`, in both the entry's
  `#define VERSION` and `MT_VERSION()`, stamped from the git tag at packaging and
  staging time. There is no version number to keep in step by hand.
- Every source file carries an SPDX licence header.

## [2.3.1] - 2026-09-02

Baseline: Nicolas Godingen's Mosaic Toolbox as received, the starting point for
Caelo Works maintenance.

One dialog, one run: several filters of a mosaic assembled onto a single common
astrometric grid. Reprojects every plate-solved tile onto that grid, erodes the
soft reprojection edges, and joins the tiles photometrically — star flux ratios
for the brightness scale, a smoothed surface spline for the residual gradient.
One output window per filter (MosaicL, MosaicR, MosaicG, MosaicB, MosaicS,
MosaicH, MosaicO, plus named custom channels), all sharing identical coordinates,
field of view and pixel dimensions. Optional autocrop and screen auto-stretch.
Interface, tooltips, console output and messages in English and French.
Self-contained: no other mosaic script required. The astrometric grid derives
from MosaicByCoordinates under the PixInsight Class Library License 2.0.

[Unreleased]: https://github.com/caelo-works/pix-mosaic-toolbox/compare/v2.4.2...HEAD
[2.4.2]: https://github.com/caelo-works/pix-mosaic-toolbox/releases/tag/v2.4.2
[2.4.1]: https://github.com/caelo-works/pix-mosaic-toolbox/releases/tag/v2.4.1
[2.4.0]: https://github.com/caelo-works/pix-mosaic-toolbox/releases/tag/v2.4.0
