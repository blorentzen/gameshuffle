# Speedrun relay

LiveSplit One connects here over a WebSocket. The relay reads the runner's splits, follows the run as they split,
pushes the run to GameShuffle's OBS overlays and tells the site about attempts. It is a Cloudflare Worker with one
Durable Object per runner, kept in this folder with its own `package.json`, apart from the Next.js app.

The contract with the site is `specs/gs-speedrun/phase1-contract.md`. LiveSplit One's protocol, as checked against
the real app: `specs/research/2026-11-09-livesplit-one-check.md`.

## Files

| File | What |
| --- | --- |
| `src/index.ts` | The Worker: routes, token and secret checks, hands each request to the runner's object |
| `src/relay.ts` | The Durable Object: sockets, following LiveSplit One, storage, broadcast, webhook |
| `src/lso.ts` | LiveSplit One protocol client (ordered replies, events, timeouts, resync) |
| `src/reads.ts` | Reading the run and the timer in batches |
| `src/state.ts` | `RelayState` and the pure rules for each event (golds, PB, attempts, reconnects) |
| `src/tokens.ts` | Token sign/verify, webhook signature, bearer check (same as the site's `tokens.ts`) |
| `src/time.ts` | LiveSplit time strings to ms |
| `test/*.test.ts` | Unit tests (`npm test`), including the contract's shared token vectors |
| `scripts/token.ts` | Prints a timer and overlay token for local testing |

## How it works

- **Routes.** `GET /lso/<timerToken>` and `GET /watch/<overlayToken>` are WebSockets (anything else gets 426).
  `POST /cmd/<relayId>`, `POST /admin/<relayId>` and `GET /state/<relayId>` need `Authorization: Bearer <secret>`.
  `GET /health` answers `ok`. The object for a runner is `RELAY.getByName(relayId)`.
- **Tokens.** Checked in the Worker (HMAC, constant-time compare). The object keeps the lowest token version allowed
  per kind; `/admin` raises it and closes older sockets. A valid token with a higher version raises it too, so an
  old address stops working even if the `/admin` call never arrived.
- **LiveSplit One.** The object is the protocol client. On connect it reads every split name, the Personal Best and
  Best Segments times, the state and the time; after each event it reads the state and time again (plus the split's
  time on a split). Requests are sent in batches, one round trip each. A newer LiveSplit One connection replaces the
  older one (closed with 4000).
- **Replies without ids.** LiveSplit One answers in order, so the queue is the id. A request with no answer in 5s
  fails, but stays in the queue so its late answer is thrown away rather than handed to the next request; the relay
  then reads everything again. If an answer ever has the wrong shape (or a late one never comes), it stops, waits
  for LiveSplit One to go quiet for 2s and reads everything again.
- **Reconnects.** When LiveSplit One connects, the relay compares what it knew with what LiveSplit One shows: the
  same attempt carries on quietly, an attempt that ended while away is closed with a `reset`, one that began while
  away is counted with a `start`.
- **Attempts.** `attempt` = the attempt number already reached (`attemptBase` from `/admin`, 0 by default) plus every
  Started the relay sees. A changed `attemptBase` applies at once when no run is going, else at the next start.
- **Golds.** A split is gold when its segment beats the best segment read at the start of the attempt (after a
  skipped split, the stretch since the last split reached is compared). With no best segment yet it counts as gold,
  as LiveSplit does. `last.pb` on a finish: the final time beats the PB's final split, or there was no PB.
- **State.** Saved in the object's storage on every change, so `/state` and new overlays are right after the object
  sleeps or restarts. Every change goes to all overlays as `{"type":"state","state":…}`.
- **Webhook.** `POST <GS_ORIGIN>/api/speedrun/relay` with `x-relay-signature` (hex HMAC-SHA256 of the raw body), in
  order, after the overlays are told, retried once a second later on a 5xx or a network error.

### Notes for the site and the overlay

- **Close codes** (the reason is shown to the runner by LiveSplit One):
  4000 replaced by a newer LiveSplit One, 4001 this address was replaced (stop reconnecting, the link is old),
  4003 the address isn't valid (stop reconnecting), 4029 too many overlays open for one run.
- **Overlay pings:** send exactly `{"type":"ping"}`; the answer `{"type":"pong"}` comes without waking the object.
  Pinging every 20 to 30s also keeps proxies from dropping an idle socket.
- **First state:** an overlay gets the latest state on connect, `last` included. Play moments only for states that
  arrive after the first one.
- **`/cmd`:** answers 200 with `{ok:true, state}` or `{ok:false, error}`; errors: `busy` (LiveSplit One is on a
  settings screen), `no_run`, `not_connected`, `timeout`, and LiveSplit One's other codes in snake case
  (`already_paused`, `not_paused`, `run_finished`, `cant_undo_first_split`, `cant_skip_last_split`,
  `run_already_in_progress`, `negative_time`). 400 `bad_command`, 401 without the secret. As the contract says,
  `start` sends `start` and `split` sends `split`, so a stale Start can never split a run in progress (it answers `run_already_in_progress`; Split with no run answers `no_run`).
- **Reset after a finish:** the attempt was already closed by `finish`; the following `reset` carries the same
  attempt number. Keep the finished result.
- **`/admin`:** `{timerVersion?, overlayVersion?, attemptBase?, game?, category?}` (`null` clears game or category,
  80 characters at most). Answers `{ok:true, state}`.

## Local development

```bash
cd speedrun-relay
npm install
cp .dev.vars.example .dev.vars   # SPEEDRUN_RELAY_SECRET and GS_ORIGIN (where webhooks go)
npm run dev                      # wrangler dev on http://localhost:8787, no Cloudflare account needed
npm test                         # unit tests
npm run typecheck                # generates worker-configuration.d.ts, then tsc
npx tsx scripts/token.ts AbCdEfGh12345678   # a timer + overlay token for that relayId
```

The site's `.env.local` gets the same `SPEEDRUN_RELAY_SECRET`, `SPEEDRUN_RELAY_URL=http://localhost:8787` and
`NEXT_PUBLIC_SPEEDRUN_RELAY=ws://localhost:8787`.

To connect the real LiveSplit One to a local relay, use a Chrome started with
`--disable-features=LocalNetworkAccessChecks` (Chrome blocks a public site from reaching `ws://localhost`
otherwise), then Settings, Server Connection, Connect, `ws://localhost:8787/lso/<timer token>`. LiveSplit One doesn't
reconnect by itself: press Connect again after the relay restarts.

Local quirk: when the relay closes an idle socket, browsers report the close about 2s later and Node clients up to
30s later (the local runtime keeps the TCP connection open after the closing handshake). Sockets with traffic close
at once.

## Deploy

One-time setup (Britton), with Cloudflare's own GitHub connection (Workers Builds: Cloudflare makes its own deploy
token, so no API token or GitHub secrets):

1. **After this folder is on `main`**, in Cloudflare: Workers & Pages, Create, **Connect GitHub**, pick
   `blorentzen/gameshuffle`, branch `main`. Worker name **`gameshuffle-speedrun-relay`** (it must match `name` in
   `wrangler.jsonc` or the build fails), root directory **`speedrun-relay`**, build command `npm ci && npm test`,
   deploy command `npx wrangler deploy`, builds for other branches off. The free plan is enough (SQLite Durable
   Objects are included); the first deploy sets up a `workers.dev` subdomain if there isn't one.
2. **Shared secret:** `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Add it to the
   Worker as a secret named `SPEEDRUN_RELAY_SECRET` (Worker, Settings, Variables and Secrets; it stays across
   deploys) and to Vercel (Production) under the same name. Never commit it.
3. **Site env (Vercel, Production):** `SPEEDRUN_RELAY_URL=https://gameshuffle-speedrun-relay.<subdomain>.workers.dev`
   and `NEXT_PUBLIC_SPEEDRUN_RELAY=wss://gameshuffle-speedrun-relay.<subdomain>.workers.dev`, then redeploy the site.
4. Check: `curl https://gameshuffle-speedrun-relay.<subdomain>.workers.dev/health` answers `ok`.

After that, every push to `main` that changes this folder deploys it (Cloudflare shows the build on the Worker's
Deployments tab and as a GitHub check). Until the secret is set, every route but `/health` answers 503.

Webhooks go to `GS_ORIGIN` from `wrangler.jsonc`: `https://www.gameshuffle.co` (the bare domain redirects, and
webhooks don't follow redirects).

**Dev relay** for dev.gameshuffle.co: `npx wrangler deploy --env dev` makes `gameshuffle-speedrun-relay-dev`
(webhooks to `https://dev.gameshuffle.co`), with its own objects; give it its own secret with
`npx wrangler secret put SPEEDRUN_RELAY_SECRET --env dev`, the same value as the dev site's env. The dev site has to
let `POST /api/speedrun/relay` through any deployment protection.

Good to know:

- **Rotating the secret** invalidates every timer address and overlay link (they are signed with it). Runners would
  have to copy new ones. Change it only if it leaked, in Vercel and GitHub together, then redeploy.
- **A deploy can drop connected LiveSplit One sessions**, and LiveSplit One doesn't reconnect by itself. Avoid
  deploying during someone's run.
- The class migration (`v1`, `new_sqlite_classes`) runs on the first deploy. Renaming or removing the `Relay` class
  later needs a new migration entry.
