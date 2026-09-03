# Contributing

## Before anything else

Input tiles must be **linear**, **plate solved** and **already corrected for
gradients** (DBE, ABE, GraXpert, or NormalizeScaleGradient during
preprocessing). The join measures the brightness *difference* between two tiles
across their overlap and cancels it; it cannot remove a gradient the tiles
share, and a strong uncorrected gradient in one tile is carried across the whole
mosaic rather than fixed by it. A gradient across the finished mosaic is almost
always uncorrected input, not a bug in the join.

## Getting set up

```sh
./scripts/stage-dev.sh              # stage the tree where PixInsight can load it
bash tests/run.sh                   # the pure-logic suites + syntax check of every PJSR file
bash scripts/build-update-package.sh 0.0.0-dev   # build the distributable zip into dist/
```

`stage-dev.sh` copies `pjsr/` intact to a folder PixInsight can open — on WSL it
finds your Windows `LocalAppData` on its own — and stamps the version. Point
**Script → Feature Scripts → Add** at that folder, or run it straight from
**Script → Execute Script File…**. Re-run the script after each edit.

`tests/run.sh` bundles the modules that load without PixInsight, drives them
through a shim, and runs the suites, then syntax-checks the files it does not
bundle (the entry point and the dialog). It catches logic regressions and
contract drift in the pure layer — filter matching, statistics, the join layout
and order, the star merge, the autocrop rectangle, the data model's validation
and the catalogue — **not** PJSR API misuse. There is no substitute for running
the thing in PixInsight; see `docs/RELEASING.md` for the hand gates.

Add a suite by dropping `tests/<name>.test.js` next to the others; the runner
picks up anything matching `*.test.js` and totals each suite's assertion count.

## Layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the file-by-file map and the
two invariants that govern changes.

A new file in `pjsr/mosaictoolbox/` must be reachable by `#include` from the
entry point — an orphan packages fine and then is not there at runtime, which CI
checks. If it loads under the shim, add it to `LIBS` in `tests/run.sh`; if it
builds PixInsight controls at load time (like the dialog), add it to `UNBUNDLED`.

The strip in `tests/run.sh` removes PixInsight preprocessor directives and only
those. JavaScript private members (`#key()`, `#buildGrid()`) begin with `#` too;
they are safe because the strip matches a fixed list of directive keywords, not
every line that starts with `#`. Do not loosen it.

## House rules

- **The common grid is the guarantee.** Every channel is written onto one grid,
  and autocrop applies one rectangle to all of them. Any change that lets a
  channel land on its own grid or crop to its own data breaks the single thing
  the script exists to provide.
- **Validate, do not throw at the user.** Duplicate tile numbers, unsolved
  images, empty channels, stranded fragments — all are reported through
  `validate()`, `warnings()` or a clear message, not a raw exception. Keep it
  that way, and keep the message strings in the catalogue.
- **Zero means "no data".** A zero pixel is absent coverage, not black sky. A
  correction that would drive a pixel to zero clips to a tiny positive value so
  the pixel stays part of the coverage. Do not reintroduce a hard zero.
- **The console report is the reproduction record.** The plan, the layout, and
  the per-join scale, star count and sample count are what a user pastes into a
  bug report. A new parameter that changes the output belongs in that report.
- **Placeholders are pinned.** `tests/strings.test.js` holds the two catalogues
  to the same keys and the same `%s`/`%d` order. A translation that moves a
  placeholder is a bug the test will catch; fix the string, not the test.
- **Settings persist.** People keep process settings. A renamed or re-meaning'd
  stored key needs a migration path; settings are written on every close, not
  only on Run.
- **No name in the interface.** The credit lives in the file header, `NOTICE.md`
  and the README — where the licences that require it are satisfied — and nowhere
  on screen. This is the author's own wish.

## Credit and licence

New work here is contributed under CC BY-NC 4.0 (see `LICENSE`). The astrometric
grid derives from MosaicByCoordinates under the PixInsight Class Library License
2.0, whose notice and acknowledgment are recorded in `NOTICE.md` and must stay
there. If you port a method from published work — a paper, another script, a
documented process — say so in the pull request and add it to `NOTICE.md`.
