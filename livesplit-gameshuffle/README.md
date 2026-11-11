# GameShuffle for LiveSplit

A LiveSplit component that sends your splits to your GameShuffle speedrun overlay
(https://www.gameshuffle.co/speedrun), and connects by itself whenever LiveSplit opens. MIT licensed.

## Install

1. Download `GameShuffle-for-LiveSplit.zip` from your speedrun setup on GameShuffle.
2. Unzip it into LiveSplit's `Components` folder (next to `LiveSplit.exe`) and restart LiveSplit.
3. Right-click LiveSplit, then Edit Layout, `+`, Other, GameShuffle.
4. Copy your address from the setup, then in Layout Settings, on the GameShuffle tab, press Paste.

The address is private (anyone with it can send splits to your overlay), so it's saved in
`%AppData%\GameShuffle\livesplit-address.txt`, never in the layout file. The tab's switches (send game, category and
attempt count; let the phone remote control the timer; show a status line) are saved in the layout.

## How it works

GameShuffle's relay already talks to LiveSplit One's server protocol (livesplit-core
`src/networking/server_protocol.rs`): the relay sends commands (`getSegmentName`, `getComparisonTime`,
`getCurrentState`, `getCurrentTime`, `start`, `split`, ...) and the timer answers each one in order with
`{"success": ...}` or `{"error": {"code": ...}}`, pushing events like `{"event": "Splitted"}` in between. This add-on
answers the same way from LiveSplit's own timer, so the relay doesn't know which timer it's talking to. It adds one
message of its own, `{"gameshuffle": {"v": 1, "addon", "game", "category", "attempts", "runKey", "remote"}}`, sent on
connect, after a start or reset and when the splits change; the relay reads the run again when `runKey` changes.

- `shared/`: the protocol (JSON, time format, commands, the reconnecting WebSocket), with no LiveSplit types.
- `src/`: the LiveSplit component (net481): the timer wrapper, the component, the settings tab, the factory.
- `tests/`: checks for `shared/` that run anywhere with the .NET SDK, plus a live mode against a running relay.

## Build

```bash
bash livesplit-gameshuffle/build.sh   # fetches LiveSplit's DLLs, runs the checks, builds, copies into public/
```

Needs the .NET SDK (8 or later). It writes `public/livesplit/Components/LiveSplit.GameShuffle.dll` (what LiveSplit's
update check downloads), `public/downloads/GameShuffle-for-LiveSplit.zip` (the setup page's download) and checks that
`public/livesplit/update.xml` lists the version. For a new release: bump `<Version>` in `src/LiveSplit.GameShuffle.csproj`,
add an `<update>` to `update.xml` (newest first), update `src/lib/speedrun/addon.ts`, and run the build.

Live check against a local relay (`cd speedrun-relay && npx wrangler dev --env= --port 8787 --var SPEEDRUN_RELAY_SECRET:<secret>`):

```bash
dotnet run --project livesplit-gameshuffle/tests -- live ws://localhost:8787 <timerToken> http://localhost:8787 <relayId> <secret>
```
