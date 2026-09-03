#!/usr/bin/env bash
#
# check-package.sh <zip>
#
# Verifies a built package against the contract the CaeloWorks update site
# enforces on ingest (scripts/build-update-repo.sh in caelo-works/pixinsight-scripts),
# plus the things only this repo can know. Catching a violation here costs a red
# CI run; catching it there costs a published release that has to be pulled.
#
set -euo pipefail

ZIP="${1:?usage: check-package.sh <zip>}"
NAME="MosaicToolbox"
LIBDIR="mosaictoolbox"
VENDOR="src/scripts/CaeloWorks/$NAME"

fail=0
note() { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

tree="$( unzip -Z1 "$ZIP" )"
has() { printf '%s\n' "$tree" | grep -qx "$1"; }

echo "Package contract: $(basename "$ZIP")"

# The site refuses a package whose tree does not extract relative to the
# PixInsight install directory.
if printf '%s\n' "$tree" | grep -q '^src/'; then
   note "extracts relative to the PixInsight install directory"
else
   bad "no src/... tree: the site's ingest would reject this"
fi

# The site refuses any signed artifact while the CaeloWorks CPD identity is not
# published, because a locally signed binary is rejected on every other machine.
if printf '%s\n' "$tree" | grep -qi '\.xsgn$'; then
   bad "contains a code signature: the site's ingest would reject this"
else
   note "carries no code signature"
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
if unzip -p "$ZIP" "$VENDOR/$NAME.js" "$VENDOR/$LIBDIR/"'*' 2>/dev/null | grep -q '__BUILD__'; then
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
