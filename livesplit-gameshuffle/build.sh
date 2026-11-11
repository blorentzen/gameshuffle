#!/usr/bin/env bash
# Builds GameShuffle for LiveSplit and puts what the site serves in place:
#   public/livesplit/Components/LiveSplit.GameShuffle.dll   (LiveSplit's own update check downloads this)
#   public/livesplit/update.xml                             (kept by hand: add an <update> per release, newest first)
#   public/downloads/GameShuffle-for-LiveSplit.zip          (the setup page's Download button)
# Needs the .NET SDK (dotnet on PATH, or ~/.dotnet/dotnet).
#   bash livesplit-gameshuffle/build.sh
set -euo pipefail
cd "$(dirname "$0")"
DOTNET="$(command -v dotnet || echo "$HOME/.dotnet/dotnet")"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

bash fetch-livesplit.sh
"$DOTNET" run --project tests
"$DOTNET" build src -c Release -nologo -v quiet

VERSION="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' src/LiveSplit.GameShuffle.csproj)"
grep -q "version=\"$VERSION\"" ../public/livesplit/update.xml || { echo "Add version $VERSION to public/livesplit/update.xml first" >&2; exit 1; }

mkdir -p ../public/livesplit/Components ../public/downloads
cp src/bin/Release/LiveSplit.GameShuffle.dll ../public/livesplit/Components/
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp src/bin/Release/LiveSplit.GameShuffle.dll "$TMP/"
cp LICENSE "$TMP/LiveSplit.GameShuffle.LICENSE.txt"
rm -f ../public/downloads/GameShuffle-for-LiveSplit.zip
(cd "$TMP" && zip -q -X ../gs.zip LiveSplit.GameShuffle.dll LiveSplit.GameShuffle.LICENSE.txt && mv ../gs.zip "$OLDPWD/../public/downloads/GameShuffle-for-LiveSplit.zip")
echo "GameShuffle for LiveSplit $VERSION: $(wc -c < ../public/downloads/GameShuffle-for-LiveSplit.zip | tr -d ' ') bytes zipped"
