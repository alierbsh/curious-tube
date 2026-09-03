#!/usr/bin/env bash
# Package the extension for the Chrome Web Store.
#
# Ships only the files the extension loads at runtime: everything the manifest
# references, and nothing else. The README, the icon generator, the store
# listing material and the Upscayl leftovers stay out of the zip.
#
# Usage: ./build.sh   ->   ../dist/<Name>-<version>.zip

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DIST_DIR="../dist"

read -r NAME VERSION < <(
  python3 -c '
import json
m = json.load(open("manifest.json"))
print(m["name"].replace(" ", ""), m["version"])
'
)

ZIP_PATH="$DIST_DIR/$NAME-$VERSION.zip"

# The runtime payload. Wallpapers are listed by glob so the .temp-* leftovers
# and .DS_Store never slip in.
FILES=(
  manifest.json
  content.js
  content.css
  settings-ui.js
  logo.png
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
)
shopt -s nullglob
FILES+=(wallpapers/wallpaper-*.png wallpapers/wallpaper-*.jpg)
shopt -u nullglob

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "build.sh: missing $f" >&2; exit 1; }
done

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"
zip -q -r -X "$ZIP_PATH" "${FILES[@]}"

echo "$ZIP_PATH"
echo "  $(unzip -l "$ZIP_PATH" | tail -1 | awk '{print $2}') files, $(du -h "$ZIP_PATH" | cut -f1)"
