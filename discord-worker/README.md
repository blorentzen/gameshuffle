# GameShuffle Discord gateway worker

An always-on service that holds the Discord Gateway WebSocket for the features
the Vercel app can't receive (it's HTTP-interactions only):

- **Emoji reaction roles** — react to a message → get the mapped role (`discord_reaction_roles`)
- **Auto-assign on join** — new members get configured roles (`discord_autoroles`)

It runs as the same bot (`DISCORD_BOT_TOKEN`) and reads config from Supabase with
the service-role key. The Next app writes the config.

## Run locally

```bash
cd discord-worker
cp .env.example .env   # fill in the three values
npm install
npm start              # logs: "[worker] ready as <bot>#0000 — watching N guild(s)"
```

## Deploy on Railway

1. **Push the repo to GitHub** (Railway deploys from GitHub).
2. Railway → **New Project → Deploy from GitHub repo** → pick the gameshuffle repo.
3. In the service **Settings**:
   - **Root Directory** = `discord-worker`
   - **Start Command** = `npm start` (Build = `npm install`, auto-detected)
4. **Variables** tab — add:
   - `DISCORD_BOT_TOKEN` (same as the app)
   - `SUPABASE_URL` (= the app's `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`
5. **Discord dev portal → Bot → Privileged Gateway Intents**: enable
   **Server Members Intent** (needed for join autorole). Reaction roles don't
   need a privileged intent.
6. Deploy → check the **Deploy Logs** for `[worker] ready as …`.

The worker is stateless and safe to restart. Config changes in the app take
effect immediately (it queries Supabase per event).
