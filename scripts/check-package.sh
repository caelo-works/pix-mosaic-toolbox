#!/usr/bin/env bash
#
# check-package.sh [--signed] <zip>
#
#   --signed   the package is a release: it must carry the CaeloWorks code
#              signature. Without it the package is checked as a development
#              build (CI has neither PixInsight nor the keys, so cannot sign).
#
# Verifies a built package against the contract the CaeloWorks update site
# enforces on ingest (scripts/build-update-repo.sh in caelo-works/pixinsight-scripts),
# plus the things only this repo can know. Catching a violation here costs a red
# CI run; catching it there costs a published release that has to be pulled.
#
set -euo pipefail

SIGNED=0
if [ "${1:-}" = "--signed" ]; then SIGNED=1; shift; fi
ZIP="${1:?usage: check-package.sh [--signed] <zip>}"
NAME="MosaicToolbox"
LIBDIR="mosaictoolbox"
VENDOR="src/scripts/CaeloWorks/$NAME"

fail=0
note() { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

tree="$( unzip -Z1 "$ZIP" )"
# Never pipe into grep -q here: grep exits at its first match, the writer can
# then die of SIGPIPE, and under pipefail a match reads as a failure. Capture
# first, then grep a here-string.
has() { grep -qx -- "$1" <<< "$tree"; }

echo "Package contract: $(basename "$ZIP")"

# The site refuses a package whose tree does not extract relative to the
# PixInsight install directory.
if grep -q '^src/' <<< "$tree"; then
   note "extracts relative to the PixInsight install directory"
else
   bad "no src/... tree: the site's ingest would reject this"
fi

# Code signature (CPD Program Rules, rule 5.1). Exactly one, for the entry
# script: its signature covers every file the entry #includes from
# mosaictoolbox/, and a signature on any other file is never verified -
# PixInsight's documentation calls that misleading. The platform includes
# (<pjsr/...>) are not part of the signed code: the core verifies their own
# signatures. Validity can only be checked by PixInsight itself
# (verify-signature.sh); this checks the shape and the identity claimed.
sigs="$( grep -i '\.xsgn$' <<< "$tree" || true )"
if [ -z "$sigs" ]; then
   if [ "$SIGNED" -eq 1 ]; then
      bad "no code signature: a release must ship $VENDOR/$NAME.xsgn"
   else
      note "unsigned: a development build, not a release"
   fi
elif [ "$SIGNED" -eq 0 ]; then
   bad "a development build must carry no signature, found:"
   printf '%s\n' "$sigs" | sed 's/^/          /'
elif [ "$sigs" != "$VENDOR/$NAME.xsgn" ]; then
   bad "the only signature must be $VENDOR/$NAME.xsgn, found:"
   printf '%s\n' "$sigs" | sed 's/^/          /'
elif ! grep -q "<Signature [^>]*scriptId=\"$NAME\"[^>]*developerId=\"CaeloWorks\"" \
       <<< "$( unzip -p "$ZIP" "$VENDOR/$NAME.xsgn" )"; then
   bad "$NAME.xsgn is not a CaeloWorks signature of script $NAME"
else
   note "signed by CaeloWorks ($NAME.xsgn)"
fi

# Everything the script needs at runtime: the entry point and every module.
if has "$VENDOR/$NAME.js"; then note "entry script is in place"; else bad "no $VENDOR/$NAME.js"; fi
for lib in $( cd "$( dirname "$0" )/.." && ls "pjsr/$LIBDIR" ); do
   if has "$VENDOR/$LIBDIR/$lib"; then note "$LIBDIR/$lib is packaged"; else bad "$LIBDIR/$lib is missing from the package"; fi
done

# The menu icon, installed where #feature-icon looks for it.
if has "rsc/icons/script/$NAME/$NAME.svg"; then
   note "menu icon is installed under rsc/icons/script/"
else
   bad "no menu icon at rsc/icons/script/$NAME/$NAME.svg"
fi

# The licence and the attribution notice. NOTICE.md is not optional: the
# upstream PCL 2.0 work the astrometry code derives from requires its notice and
# acknowledgment to travel with every copy, and for most users the zip is the
# only thing they ever see.
if has "$VENDOR/LICENSE";   then note "LICENSE ships with the script";   else bad "LICENSE is missing";   fi
if has "$VENDOR/NOTICE.md"; then note "NOTICE.md ships with the script"; else bad "NOTICE.md is missing"; fi

# The version stamp has to have been substituted in every .js, or the dialog
# shows the literal placeholder and no user can report which build they are on.
sources="$( unzip -p "$ZIP" "$VENDOR/$NAME.js" "$VENDOR/$LIBDIR/"'*' 2>/dev/null || true )"
if [ -z "$sources" ]; then
   bad "could not read the packaged sources to check the version stamp"
elif grep -q '__BUILD__' <<< "$sources"; then
   bad "the __BUILD__ placeholder was not stamped in every source file"
else
   note "the version stamp was substituted"
fi

# Nothing from the development tree belongs in a user's PixInsight install. A
# whitelist rather than a blacklist: the package unpacks over someone's
# PixInsight directory, so the question is not "is this file unwanted" but
# "is this file one of the two places we are allowed to write".
stray="$( printf '%s\n' "$tree" \
          | grep -v '/$' \
          | grep -vE "^(${VENDOR}|rsc/icons/script/${NAME})/" || true )"
if [ -n "$stray" ]; then
   bad "the package writes outside its two allowed directories:"
   printf '%s\n' "$stray" | sed 's/^/          /'
else
   note "every file lands under $VENDOR/ or rsc/icons/script/$NAME/"
fi

echo
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAILED"
exit "$fail"
