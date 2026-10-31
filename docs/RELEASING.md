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
   - **Header link.** Hover the **Caelo Works** link: the tooltip says it opens
     the product page in the browser. Click it: the product page opens in the
     default browser (Windows, macOS, Linux where available), and nothing else is
     launched at any other point of the run.
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

7. The Release workflow opens a **draft** release carrying the unsigned
   `dist/MosaicToolbox-X.Y.Z.zip` + `update-package.json`. A draft is invisible to
   the public and to the update site. It is **never published unsigned**: sign it
   (`scripts/sign-package.sh`, see *Code signing* below), upload the signed zip and
   sidecar over the draft's, and only then publish it. The workflow summary lists
   the commands in that order. Whatever signs the package - that script or a
   signing run covering every CaeloWorks script at once - must meet the same
   contract. Then run the signed hand gate: with **Allow execution of unsigned
   scripts** turned off, the installed script starts.

8. **Notify the site agent**: comment on the tracking issue in
   `caelo-works/pixinsight-scripts` with the release URL, the zip **sha1** (from the
   published, signed `update-package.json`, not another local build: a signed zip
   is not reproducible), and `piVersionRange`.

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

Every release is signed with the CaeloWorks identity of the Certified PixInsight
Developer program, as rule 5.1 of the CPD Program Rules requires. Without it,
users would have to allow the execution of unsigned scripts to run this one.

Signing happens **after** the build, on the zip, never in CI (no PixInsight, no
keys) and never in `build-update-package.sh`. `scripts/sign-package.sh <zip>` does
it (`XSSK_PATH` points to the keys, the password is read from stdin: prompted on
a terminal, one line when piped), but whatever signs the package must meet this
contract, which `check-package.sh --signed` and `verify-signature.sh` check:

- **Sign the entry script as the zip carries it**, not `pjsr/` in the
  repository. The version stamp changes code - in `MosaicToolbox.js` and in
  `mosaictoolbox/MT_Globals.js` - so a signature made before it does not hold.
- **One signature, the entry script's**: `MosaicToolbox.xsgn` next to
  `MosaicToolbox.js`. It covers every file the entry script `#include`s from
  `mosaictoolbox/`, recursively (PixInsight's `CodeSigning` documentation,
  section 6). The `mosaictoolbox/` files are not signed: their signatures would
  never be verified, PixInsight calls that misleading, and it refuses to sign a
  file without a `#feature-id`. A signing run that signs every `.js` it finds
  fails here.
- **Platform includes are not part of the signature.** `<pjsr/StarDetector.jsh>`
  and the `<pjsr/astrometry/…>` files live in PixInsight's own `include/pjsr`
  directory: section 6 of `CodeSigning` excludes them from the signed code and has
  the core verify their own PixInsight signatures instead. A PixInsight update to
  them does not invalidate ours.
- **Re-zip and give `update-package.json` the new sha1.** The site
  authenticates the package by it. `scripts/repro-zip.py` is the layout the
  build uses.
- **No entitlements declared.** The `.xsgn` carries no `<Entitlements>`
  element. The `pjsr.*`/`pcl.*` entitlements `verify-signature.sh` prints are
  the CaeloWorks identity's, from PixInsight's `certified-developers.xcdev`.
- **Comments are not covered.** The signed code is canonicalized, so an edited
  comment leaves the signature valid. Any test that a signature catches
  tampering must change code.
- **A signed zip is not reproducible**: the signature carries a timestamp, so
  every signing gives a new sha1. CI's reproducibility check runs on the
  unsigned build.
- **The keys stay off this repository.** `XSSK_PATH` points to them; the
  password only ever lives in the environment of the PixInsight process that
  signs.
- **The signing machine must allow unsigned scripts.** `sign-package.sh` and
  `verify-signature.sh` drive PixInsight with small PJSR runners that are not
  signed themselves; with *Allow execution of unsigned scripts* off, PixInsight
  refuses them silently and both scripts stop with an error saying so. The
  signed hand gate, which needs the option off, runs separately.
- On WSL, `scripts/pi-run.sh` hands a Windows PixInsight its paths and
  variables (wslpath, WSLENV) and works under the Windows `%TEMP%`.

## CPD Program Rules

Signed code is bound by the
[CPD Program Rules](https://pixinsight.com/security/cpd-rules/). For this script
that means, at every release:

- the README section *Privacy, network and external programs* must still
  describe exactly what the code does (rule 6.1): no network, the single
  external-program launch (the header link), the settings key, no file written;
- the header link stays product identification (rule 6.4): it points to the
  script's own page, never to the catalogue of other products;
- the update package deploys only to the directories of the Update Repository
  Reference (rule 4.2: here `src/scripts/` and `rsc/icons/`).

`tests/cpd.test.js` holds the code side of the first two points.
