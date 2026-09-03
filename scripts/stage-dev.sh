#!/usr/bin/env bash
#
# stage-dev.sh [dest]
#
# Stage the script tree into a folder for hand-testing in PixInsight WITHOUT a
# release: the #include paths in MosaicToolbox.js are relative, so staging pjsr/
# intact lets you run it straight from Script > Execute Script File.
#
# Dest resolution: explicit argument, else $MT_DEV_DIR, else (on WSL) the
# Windows user's LocalAppData, else ~/MosaicToolbox-dev.
#
#   ./scripts/stage-dev.sh
#   -> then in PixInsight: Script > Execute Script File... ->
#      <dest>/MosaicToolbox.js
#
# To make it appear in the Scripts menu instead: Script > Feature Scripts... ,
# Add the <dest> directory, and it registers under Mosaic > MosaicToolbox.
set -euo pipefail

NAME="MosaicToolbox"
LIBDIR="mosaictoolbox"
REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

default_dest() {
   if [ -n "${MT_DEV_DIR:-}" ]; then
      echo "$MT_DEV_DIR"
      return
   fi
   # On WSL, resolve the Windows user's LocalAppData through cmd.exe.
   if command -v cmd.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
      local lad
      lad="$( cd /mnt/c 2>/dev/null && cmd.exe /c "echo %LOCALAPPDATA%" 2>/dev/null | tr -d '\r' )"
      if [ -n "$lad" ] && [[ "$lad" != *%* ]]; then
         echo "$( wslpath "$lad" )/$NAME-dev"
         return
      fi
   fi
   echo "$HOME/$NAME-dev"
}

DEST="${1:-$(default_dest)}"

rm -rf "$DEST"
mkdir -p "$DEST/$LIBDIR" "$DEST/assets"
cp "$REPO/pjsr/$NAME.js" "$DEST/"
cp -R "$REPO/pjsr/$LIBDIR/." "$DEST/$LIBDIR/"
cp -R "$REPO"/pjsr/assets/. "$DEST/assets/" 2>/dev/null || true

# The build stamp is only substituted at packaging time, so a dev staging has to
# derive one. The tag is the version, so use it when there is one; before the
# first tag, fall back to the newest released heading in the changelog. The
# literal lives in both the entry's #define and MT_VERSION(), so stamp every .js.
stamp="$( git -C "$REPO" describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || true )"
if [ -z "$stamp" ]; then
   stamp="$( grep -m1 -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$REPO/CHANGELOG.md" \
             | tr -d '#[] ' || true )"
fi
[ -n "$stamp" ] || stamp="0.0.0"
find "$DEST" -name '*.js' -print0 | xargs -0 sed -i "s/__BUILD__/${stamp}-dev/g"

# Report the Windows-style path when staged under /mnt/c.
WINPATH="$DEST"
case "$DEST" in
  /mnt/c/*) WINPATH="C:${DEST#/mnt/c}"; WINPATH="${WINPATH//\//\\}" ;;
esac

echo "Staged to: $DEST"
echo
echo "In PixInsight:  Script > Execute Script File...  ->"
echo "    ${WINPATH}\\${NAME}.js"
echo
echo "Or register it in the menu:  Script > Feature Scripts... > Add"
echo "    ${WINPATH}"
