#!/usr/bin/env bash
#
# build-update-package.sh <version> [releaseDate YYYYMMDD]
#
# Produces the standardized DISTRIBUTION ARTIFACT that the CaeloWorks showcase site
# (caelo-works/pixinsight-scripts, served at https://pixinsight-scripts.caelo.works/update/)
# ingests to build the shared, signed updates.xri. This repo does NOT generate or host the
# final updates.xri — it only emits, per release, two files under dist/:
#
#   dist/<NAME>-<version>.zip     the package, tree RELATIVE TO PixInsight's install dir
#   dist/update-package.json      metadata the site needs to emit the <package> element
#
# The zip is REPRODUCIBLE (sorted entries, fixed mtimes/permissions) so identical content
# always yields the same SHA-1 — the site authenticates the package by that SHA-1.
#
set -euo pipefail

# ----- script identity -------------------------------------------------------
NAME="MosaicToolbox"                         # class-case: entry file, package dir, icon
SLUG="pix-mosaic-toolbox"                    # kebab-case: site slug (matches the repo)
TITLE="Mosaic Toolbox"                       # human name
LIBDIR="mosaictoolbox"                       # the module folder the entry #includes
DESCRIPTION_HTML="<p>One-step multi-filter mosaic assembly for PixInsight. Reprojects every plate-solved tile onto one common astrometric grid, erodes the soft reprojection edges, and joins the tiles photometrically: star flux ratios set the brightness scale and a smoothed surface spline models the residual gradient. Every filter is written onto the same grid, so the L, R, G, B, S, H and O outputs share identical coordinates, field of view and pixel dimensions, and combine with no further registration. Autocrop, a screen auto-stretch and a full per-join history are included. Interface in English and French.</p><p>Inputs must be linear, plate solved and already corrected for gradients. Self-contained: no other mosaic script is required.</p>"
# The script calls CoreApplication.ensureMinimumVersion(1,9,4) and needs the 1.9.4
# astrometry API, so 1.9.4 is the real floor — higher than the sibling scripts.
PI_VERSION_RANGE="1.9.4:1.9.99"
# -----------------------------------------------------------------------------

VERSION="${1:?usage: build-update-package.sh <version> [releaseDate YYYYMMDD]}"
RELEASE_DATE="${2:-$(date +%Y%m%d)}"

REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
VENDORDIR="CaeloWorks/$NAME"
ZIPNAME="$NAME-${VERSION}.zip"
OUT="$REPO/dist"
STAGE="$( mktemp -d )"
trap 'rm -rf "$STAGE"' EXIT

DST="$STAGE/src/scripts/$VENDORDIR"
mkdir -p "$DST/$LIBDIR" "$STAGE/rsc/icons/script/$NAME"
rm -rf "$OUT"; mkdir -p "$OUT"

# 1) entry script + modules. The version literal lives in two places — the entry's
#    #define VERSION and MT_VERSION() in the module layer — so every .js is stamped.
cp "$REPO/pjsr/$NAME.js" "$DST/$NAME.js"
cp -R "$REPO/pjsr/$LIBDIR/." "$DST/$LIBDIR/"
find "$DST" -name '*.js' -print0 | xargs -0 sed -i "s/__BUILD__/${VERSION}/g"

# 1b) licence text ships next to the entry script. NOTICE.md ships with it and is not
#     optional: the upstream PixInsight Class Library License 2.0 that the astrometry code
#     is used under requires its notice and acknowledgment to travel with every copy, and
#     the zip is the only thing most users ever see.
cp "$REPO/LICENSE"   "$DST/LICENSE"
cp "$REPO/NOTICE.md" "$DST/NOTICE.md"

# 2) menu icon (#feature-icon @script_icons_dir/<NAME>.svg)
cp "$REPO/pjsr/assets/$NAME.svg" "$STAGE/rsc/icons/script/$NAME/$NAME.svg"

# 3) No code signature here. A release is signed afterwards, on the zip this
#    script emits, by scripts/sign-package.sh: the version stamp above changes
#    code, so the signature can only be made on the stamped files.

# 4) reproducible zip: sorted entries, fixed mtime (1980-01-01), fixed perms
#    (0755 for bin/, 0644 otherwise). No OS/timestamp entropy -> stable SHA-1.
python3 "$REPO/scripts/repro-zip.py" "$STAGE" "$OUT/$ZIPNAME"

SHA1=$( sha1sum "$OUT/$ZIPNAME" | cut -d' ' -f1 )

# 5) metadata sidecar — exactly the contract the site ingests
cat > "$OUT/update-package.json" <<JSON
{
  "name": "${TITLE}",
  "slug": "${SLUG}",
  "version": "${VERSION}",
  "fileName": "${ZIPNAME}",
  "sha1": "${SHA1}",
  "type": "script",
  "releaseDate": "${RELEASE_DATE}",
  "piVersionRange": "${PI_VERSION_RANGE}",
  "title": "${TITLE} v${VERSION}",
  "descriptionHtml": "${DESCRIPTION_HTML}"
}
JSON

echo "dist/$ZIPNAME  ($(du -h "$OUT/$ZIPNAME" | cut -f1), sha1 $SHA1)"
echo "dist/update-package.json"
echo "  code signature: none yet - a release is signed with scripts/sign-package.sh"
