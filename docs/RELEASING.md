# Releasing

1. **Node harness green**: `bash tests/run.sh` (the pure-logic suites plus a
   syntax check of every PJSR file, bundled or not). The Release workflow runs
   the same harness before building and fails the release if it is red — do not
   tag on a red harness.

2. **PixInsight hand gates.** The harness covers the pure-logic layer only. The
   grid, the reprojection, the join and the dialog cannot be exercised headless.
   Run each of these in PixInsight before tagging:
   - `./scripts/stage-dev.sh`, then **Script → Feature Scripts → Add** the
     staged folder (or **Execute Script File…** the staged `MosaicToolbox.js`).
     The version label in the console banner must read a real number, not
     `__BUILD__` — if it reads the placeholder the stamp substitution is broken.
   - **A real multi-filter mosaic.** On a set of plate-solved, linear, gradient-
     corrected tiles across at least two filters, run to completion. Every filter
     must come out on the *same* grid: identical dimensions, and the outputs must
     register onto each other pixel-for-pixel (check with **Blink** or a
     PixelMath difference of two channels' geometry). This is the promise the
     script exists to keep.
   - **The joins are clean.** Inspect each join at the seam: no fine bright or
     dark line (raise **Edge trim** if there is), no wedge of gradient spreading
     from the seam (raise **Smoothness**, or the input was not gradient
     corrected). Read the console report — scale factor, star count and sample
     count per join — and explain anything that fell back to the pixel scale.
   - **A channel with missing tiles.** Run a project where one filter is missing
     a tile the others have. The other channels must split into the fragments
     they do have and join them, and a genuinely stranded fragment must be
     reported by tile number rather than crashing.
   - **Autocrop and auto-stretch.** With **Autocrop** on, the result has no black
     border and the astrometric solution survives the crop. With **Auto-stretch**
     on, every result is visible rather than a black frame, and the pixels are
     unchanged (the mosaics stay linear).
   - **French.** Switch the language to French, confirm the dialog, tooltips and
     console output are translated and that the table and settings survive the
     restart. FITS `HISTORY` stays in English by design.
   - **Clean console.** Read the log end to end and explain every warning.

3. Update `CHANGELOG.md` — move `[Unreleased]` into a `[X.Y.Z]` section dated
   today, and record the validation evidence from step 2. Update the README
   version badge.

4. **Re-read `docs/ARCHITECTURE.md` against the code.** Every constant, default,
   file name and pipeline step named there must match what the code at the tag
   does. It is the contributor's map; a stale map sends the next fix to the wrong
   place.

5. Verify the git author is `caelo-works` (`git config user.name`). Never rely on
   the active `gh` account (it can flip at any time): inject the caelo-works token
   per command instead — `GH_TOKEN="$(gh auth token --user caelo-works)" gh …` for
   `gh`, and for git
   `GH_TOKEN="$(gh auth token --user caelo-works)" git -c credential.https://github.com.helper='!gh auth git-credential' push …`.

6. Commit, push `main` first, then tag and push the tag (so CI on `main` has run
   before the tag exists):
   ```
   git commit -am "vX.Y.Z: <headline>"
   GH_TOKEN="$(gh auth token --user caelo-works)" git -c credential.https://github.com.helper='!gh auth git-credential' push origin main
   git tag -a vX.Y.Z -m "vX.Y.Z — <headline>"
   GH_TOKEN="$(gh auth token --user caelo-works)" git -c credential.https://github.com.helper='!gh auth git-credential' push origin vX.Y.Z
   ```

7. The Release workflow attaches `dist/MosaicToolbox-X.Y.Z.zip` +
   `update-package.json`.

8. **Notify the site agent**: comment on the tracking issue in
   `caelo-works/pixinsight-scripts` with the release URL, the zip **sha1** (from the
   published `update-package.json`, not your local build), and `piVersionRange`.

---

## Versioning

The **tag is the version**. The literal `__BUILD__` lives in the entry's
`#define VERSION` and in `MT_VERSION()` in `MT_Globals.js`; both are stamped by
`scripts/build-update-package.sh` at packaging time and by `scripts/stage-dev.sh`
as `<version>-dev`. There is no version number to keep in step by hand and no way
for the zip name and the dialog to disagree.

What makes a release major: a change to the join arithmetic or the grid
computation that moves the pixels of an assembled mosaic. That output is the
compatibility surface, and it is judged on real frames.

## Who validates what

The node harness covers the filter matching, the statistics, the layout and join
order, the star merge, the autocrop rectangle and the catalogue. It cannot tell
you whether a join is seamless — no harness can, and the thing this script
produces is judged by eye on real narrowband data. The hand gates above are not
optional ceremony: a release that passes CI and has not been looked at on a real
mosaic has not been validated at all.

## Code signing

Off, deliberately. `build-update-package.sh` signs only when `XSSK_PATH` is set,
and the site's ingest **refuses** any zip containing a `.xsgn` while the
CaeloWorks CPD identity is not published: a signature made with a local identity
is rejected on every other machine, which is worse than no signature. Until then
PixInsight shows an "unsigned repository" warning on the shared repository, which
is expected and affects every CaeloWorks script equally.
