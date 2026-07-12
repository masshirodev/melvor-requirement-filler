#!/usr/bin/env bash
#
# Packages the mod into add-shop-items-v<version>.zip for upload to mod.io / the Mod Manager.
#
# The one thing that actually matters here: manifest.json and setup.mjs must sit at the
# ROOT of the archive, not inside a mod/ folder. Melvor installs and enables a wrongly
# nested mod without complaint and then never runs it, so `zip -j` (junk paths) is
# load-bearing, and we verify the layout afterwards rather than trust it.
#
# The zip is committed to the repo, so run this before committing a release.

set -euo pipefail
cd "$(dirname "$0")"

FILES=(mod/manifest.json mod/setup.mjs)

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "missing $f" >&2; exit 1; }
done

# A syntax error here would ship a mod that silently does nothing.
node --check mod/setup.mjs
node -e 'JSON.parse(require("fs").readFileSync("mod/manifest.json"))'

# The version lives in two places. They drift, and then the Mod Manager reports one
# version while the console logs another.
MANIFEST_VERSION=$(node -pe 'require("./mod/manifest.json").version')
SETUP_VERSION=$(sed -n 's/^const VERSION = "\(.*\)";$/\1/p' mod/setup.mjs)

if [[ -z "$SETUP_VERSION" ]]; then
  echo "could not find 'const VERSION = \"...\";' in mod/setup.mjs" >&2
  exit 1
fi
if [[ "$MANIFEST_VERSION" != "$SETUP_VERSION" ]]; then
  echo "version mismatch: manifest.json says $MANIFEST_VERSION, setup.mjs says $SETUP_VERSION" >&2
  exit 1
fi

OUT="add-shop-items-v$MANIFEST_VERSION.zip"

rm -f "$OUT"
zip -j -q "$OUT" "${FILES[@]}"

# Verify the archive really is flat — this is the failure mode worth catching.
contents=$(unzip -Z1 "$OUT" | sort | tr '\n' ' ')
expected="manifest.json setup.mjs "
if [[ "$contents" != "$expected" ]]; then
  echo "unexpected archive layout: $contents" >&2
  echo "expected files at the archive root, got the above" >&2
  exit 1
fi

echo "built $OUT (v$MANIFEST_VERSION)"
unzip -l "$OUT" | sed -n '4,5p'
