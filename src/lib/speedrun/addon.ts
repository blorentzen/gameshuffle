/**
 * GameShuffle for LiveSplit, the desktop add-on (picks 2026-11-10, all as recommended). Source in livesplit-gameshuffle/
 * (MIT); `bash livesplit-gameshuffle/build.sh` builds it into public/: the download below, and the DLL plus update.xml
 * that LiveSplit's own update check reads from /livesplit/. Bump the version in the .csproj and update.xml together.
 */
export const LIVESPLIT_ADDON = {
  version: "1.0",
  size: "21 KB",
  href: "/downloads/GameShuffle-for-LiveSplit.zip",
} as const;
