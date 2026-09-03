# Changelog

All notable changes to Mosaic Toolbox are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html): the tag is the
version, and a change that moves the pixels of an assembled mosaic is major.

Mosaic Toolbox was written by Nicolas Godingen. From version 2.3.1 onwards it is
maintained and distributed by Caelo Works with the author's agreement. See
`NOTICE.md` for the full attribution.

## [Unreleased]

First Caelo Works distribution of the script. No change to what the script does
to an image: the entry point, the ten `mosaictoolbox/` modules and their
arithmetic are Nicolas Godingen's 2.3.1, carried over unchanged. Everything here
is packaging, testing and repository infrastructure.

### Added

- A branded header matching the other CaeloWorks scripts: the menu icon as an
  emblem, the title, a version and maintainer line, and the language selector on
  one row, with the tagline and the requirement notes below it. Colored resource
  icons on the Check plan, Run and Cancel buttons.
- A Node test harness (`tests/`) that drives the pure-logic layer — filter
  matching, robust statistics, view identifiers, the join layout and order, the
  star merge, the midtones transfer function and the autocrop rectangle, the
  data model's validation, and the English/French catalogue — through a shim of
  the PixInsight globals it touches. 128 assertions across eight suites.
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

[Unreleased]: https://github.com/caelo-works/pix-mosaic-toolbox/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/caelo-works/pix-mosaic-toolbox/releases/tag/v2.3.1
