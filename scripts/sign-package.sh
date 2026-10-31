#!/usr/bin/env bash
#
# sign-package.sh <zip>
#
# Signs a package built by build-update-package.sh with the CaeloWorks identity
# of the Certified PixInsight Developer program (CPD Program Rules, rule 5.1),
# in place: the zip gains <NAME>.xsgn and is re-zipped reproducibly, and the
# update-package.json next to it gets the new sha1. Then it checks the result
# with check-package.sh --signed and verify-signature.sh.
#
#   XSSK_PATH=/path/to/caeloworks.xssk scripts/sign-package.sh dist/MosaicToolbox-X.Y.Z.zip
#
# The key password is read from stdin: prompted on a terminal, one line when
# piped. It is passed only through the environment of the PixInsight process that
# signs, and never written anywhere.
#
# What gets signed, and why only that:
#   Only the entry script, into <NAME>.xsgn. Its signature covers every file it
#   #includes, recursively - CodeSigning.html, section 6, and measured on
#   PixInsight 1.9.5: one line of code added to an included file turns the entry
#   signature invalid. Signing the mosaictoolbox/ files too is useless (their signatures are
#   never verified) and the core refuses it anyway, since they carry no
#   #feature-id. A comment added to any file does NOT invalidate the signature:
#   the signed code is canonicalized, so a tamper test has to change code.
#
#   The platform includes (<pjsr/StarDetector.jsh>, <pjsr/astrometry/...>) are
#   not part of the signed code: CodeSigning section 6 treats include/pjsr as
#   secure code, verified against its own PixInsight signatures instead.
#
#   Entitlements: the signature declares none (generateScriptSignatureFile gets
#   [], and the .xsgn carries no <Entitlements> element). verify-signature.sh
#   still prints com.pixinsight.security.pjsr.*,com.pixinsight.security.pcl.*:
#   those belong to the CaeloWorks identity, from its entry in PixInsight's
#   etc/security/certified-developers.xcdev - the standard set nearly every
#   certified developer has. Nothing in the script needs more.
#
#   The file signed is the one in the zip, after the version stamp: the stamp
#   changes code, so a signature made on pjsr/ in the repository would not hold.
#
# A signed zip is not reproducible: the signature carries a timestamp, so each
# signing gives a new sha1. The sidecar is what carries the right one.
#
set -euo pipefail

ZIP="${1:?usage: sign-package.sh <zip>}"
[ -f "$ZIP" ] || { echo "error: no such file: $ZIP" >&2; exit 1; }
ZIP="$( cd "$( dirname "$ZIP" )" && pwd )/$( basename "$ZIP" )"
SIDECAR="$( dirname "$ZIP" )/update-package.json"
[ -f "$SIDECAR" ] || { echo "error: no update-package.json next to $ZIP" >&2; exit 1; }
: "${XSSK_PATH:?set XSSK_PATH to the CaeloWorks signing keys (.xssk)}"
[ -f "$XSSK_PATH" ] || { echo "error: XSSK_PATH not found: $XSSK_PATH" >&2; exit 1; }

NAME="MosaicToolbox"
DEVELOPER="CaeloWorks"
VENDOR="src/scripts/CaeloWorks/$NAME"
REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

# shellcheck source=scripts/pi-run.sh
. "$REPO/scripts/pi-run.sh"
pi_setup
WORK="$( pi_tmpdir )"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/pkg"
( cd "$WORK/pkg" && unzip -q "$ZIP" )
[ -f "$WORK/pkg/$VENDOR/$NAME.js" ] || { echo "error: no $VENDOR/$NAME.js in $ZIP" >&2; exit 1; }
# Re-signing replaces, never stacks: start from no signature at all.
find "$WORK/pkg" -name '*.xsgn' -delete

# The files to sign, relative to the package directory, ';'-separated. The runner
# takes a list so that a second entry point, if one is ever added, is one word.
SIGN_LIST="$NAME.js"

if [ -t 0 ]; then
  printf 'PixInsight signing-key password for %s (not stored): ' "$DEVELOPER" >&2
fi
# IFS= : without it, read trims leading and trailing spaces from the password.
IFS= read -r -s __PW || true
[ -t 0 ] && echo >&2
[ -n "$__PW" ] || { echo "error: no password given" >&2; exit 1; }

# The runner signs, then checks each signature back through the core rather than
# trusting that a .xsgn appeared: a wrong password or a foreign key must fail here.
cat > "$WORK/sign.js" <<'PJSR'
var dir    = getEnvironmentVariable( "MTSIGN_DIR" ).replace( /\\/g, "/" );
var files  = getEnvironmentVariable( "MTSIGN_FILES" ).split( ";" );
var xssk   = getEnvironmentVariable( "MTSIGN_XSSK" ).replace( /\\/g, "/" );
var pw     = getEnvironmentVariable( "MTSIGN_PW" );
var report = getEnvironmentVariable( "MTSIGN_REPORT" ).replace( /\\/g, "/" );
var lines  = [];
for ( var i = 0; i < files.length; ++i )
{
   var js = dir + "/" + files[i];
   var xsgn = js.replace( /\.js$/, ".xsgn" );
   try
   {
      Security.generateScriptSignatureFile( xsgn, js, [], xssk, pw );
      var sig = Security.getScriptSignature( js );
      lines.push( ( sig.valid ? "valid " : "invalid " ) + sig.developerId + " " + files[i] );
   }
   catch ( e )
   {
      lines.push( "error - " + files[i] + " : " + e );
   }
}
lines.push( "done" );
File.writeTextFile( report, lines.join( "\n" ) + "\n" );
PJSR

REPORT="$WORK/report.txt"
MTSIGN_DIR="$( pi_native "$WORK/pkg/$VENDOR" )" MTSIGN_FILES="$SIGN_LIST" \
MTSIGN_XSSK="$( pi_native "$XSSK_PATH" )" MTSIGN_PW="$__PW" \
MTSIGN_REPORT="$( pi_native "$REPORT" )" \
  pi_run "$WORK/sign.js" MTSIGN_DIR MTSIGN_FILES MTSIGN_XSSK MTSIGN_PW MTSIGN_REPORT
unset __PW

[ -f "$REPORT" ] || {
  echo "error: PixInsight did not run the signing script" >&2
  echo "       (the runner is an unsigned script: is Preferences > Security >" >&2
  echo "       Allow execution of unsigned scripts turned on for this PixInsight?)" >&2
  exit 1
}
tr -d '\r' < "$REPORT" | sed 's/^/  sign: /' >&2
fail=0
IFS=';' read -r -a sign_files <<< "$SIGN_LIST"
for f in "${sign_files[@]}"; do
  grep -qxF "valid $DEVELOPER $f" <( tr -d '\r' < "$REPORT" ) \
    || { echo "error: $f is not validly signed by $DEVELOPER" >&2; fail=1; }
  [ -f "$WORK/pkg/$VENDOR/${f%.js}.xsgn" ] || { echo "error: no ${f%.js}.xsgn produced" >&2; fail=1; }
done
[ "$fail" = 0 ] || exit 1
rm -f "$WORK/sign.js" "$REPORT"

# Re-zip exactly as the build does and write the sidecar with the new sha1, both
# in the work directory. The originals are replaced only once the signed pair has
# passed check-package.sh --signed and verify-signature.sh: a failed run leaves
# the unsigned zip and its sidecar exactly as they were.
OUTDIR="$WORK/out"
mkdir -p "$OUTDIR"
NEW_ZIP="$OUTDIR/$( basename "$ZIP" )"
NEW_SIDECAR="$OUTDIR/update-package.json"
python3 "$REPO/scripts/repro-zip.py" "$WORK/pkg" "$NEW_ZIP"
SHA1="$( sha1sum "$NEW_ZIP" | cut -d' ' -f1 )"
python3 - "$SIDECAR" "$NEW_SIDECAR" "$SHA1" <<'PY'
import json, sys
src, dst, sha1 = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src) as f:
    meta = json.load(f)
meta["sha1"] = sha1
with open(dst, "w") as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

bash "$REPO/scripts/check-package.sh" --signed "$NEW_ZIP" \
  || { echo "error: the signed package breaks the contract; nothing replaced" >&2; exit 1; }
bash "$REPO/scripts/verify-signature.sh" "$NEW_ZIP" \
  || { echo "error: PixInsight does not accept the signature; nothing replaced" >&2; exit 1; }

# Swap in. The work directory may sit on another filesystem (the Windows %TEMP%),
# so copy next to each target first, then rename: each file changes in one step.
cp "$NEW_ZIP" "$ZIP.signing"
cp "$NEW_SIDECAR" "$SIDECAR.signing"
mv "$ZIP.signing" "$ZIP"
mv "$SIDECAR.signing" "$SIDECAR"
echo "$( basename "$ZIP" ) signed by $DEVELOPER - sha1 $SHA1 (update-package.json updated)"
