#!/usr/bin/env bash
# Downloads LiveSplit's release and keeps the two DLLs the add-on compiles against (lib/ is gitignored).
#   bash livesplit-gameshuffle/fetch-livesplit.sh [version]
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${1:-1.8.37}"
mkdir -p lib
if [ -f "lib/LiveSplit.Core.dll" ] && [ -f "lib/VERSION" ] && [ "$(cat lib/VERSION)" = "$VERSION" ]; then
  echo "LiveSplit $VERSION already in lib/"
  exit 0
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -sfL -o "$TMP/ls.zip" "https://github.com/LiveSplit/LiveSplit/releases/download/$VERSION/LiveSplit_$VERSION.zip"
unzip -q -o "$TMP/ls.zip" -d "$TMP/ls"
for dll in LiveSplit.Core.dll UpdateManager.dll; do
  found="$(find "$TMP/ls" -name "$dll" | head -1)"
  [ -n "$found" ] || { echo "$dll isn't in LiveSplit $VERSION" >&2; exit 1; }
  cp "$found" lib/
done
echo "$VERSION" > lib/VERSION
echo "LiveSplit $VERSION: $(ls lib)"
