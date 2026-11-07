/**
 * Six test persona accounts on dev, one per persona, each with real activity (menus and account picks 2026-11-05,
 * pick 6A). Staff sign in as one from the View as control (src/lib/preview/devAccounts.ts lists them).
 *
 *   npx tsx scripts/seed-preview-personas.ts          # create or refresh
 *   npx tsx scripts/seed-preview-personas.ts --plan   # say what it would do, no writes
 *
 * Refuses to run unless `.env.local` points at the DEV Supabase project (URL and service key both checked), like
 * scripts/seed-dev.ts. Accounts share `DEV_SEED_PASSWORD` (run seed-dev once first). Rows use stable ids, so a re-run
 * updates in place; dates are relative to the run. `seed-dev.ts --reset` deletes every @seed.gameshuffle.dev
 * account, these included: run this again after it.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { DEV_PERSONA_ACCOUNTS, DEV_PROJECT_REF, personaEmail, type DevPersonaAccount } from "../src/lib/preview/devAccounts";
import { ttTracks } from "../src/lib/timeTrials/tracks";
import { DEX_PUZZLE_ID, puzzleFor } from "../src/lib/originals/daily";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const refFromUrl = URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const refFromJwt = (() => { try { return JSON.parse(Buffer.from(KEY.split(".")[1], "base64url").toString()).ref as string; } catch { return undefined; } })();
if (refFromUrl !== DEV_PROJECT_REF || refFromJwt !== DEV_PROJECT_REF) {
  console.error(`Refusing: this only runs against the dev database (${DEV_PROJECT_REF}).`);
  process.exit(1);
}
const PASSWORD = process.env.DEV_SEED_PASSWORD;
if (!PASSWORD) { console.error("DEV_SEED_PASSWORD is missing from .env.local: run scripts/seed-dev.ts once first."); process.exit(1); }

const PLAN = process.argv.includes("--plan");
const db: SupabaseClient = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const NS = "5eed0000-9a3e-4d7a-8f11-0a1b2c3d4e60";
function sid(key: string): string {
  const h = createHash("sha1").update(Buffer.from(NS.replace(/-/g, ""), "hex")).update(key).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const token = (key: string, n = 24) => createHash("sha256").update(`pv:${key}`).digest("base64url").slice(0, n);
const code = (key: string) => createHash("sha256").update(`pv:${key}`).digest("hex").slice(0, 6).toUpperCase();
const D = 86_400_000;
const at = (days: number, hour?: number) => { const d = new Date(Date.now() + days * D); if (hour !== undefined) d.setHours(hour, 0, 0, 0); return d.toISOString(); };
/** A Pacific calendar day `days` from today, as YYYY-MM-DD. */
const pacificDay = (days: number) => new Date(Date.now() + days * D).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const monthStart = () => `${pacificDay(0).slice(0, 7)}-01`;

const log = (s: string) => console.log(s);
let problems = 0;

async function up(table: string, rows: Record<string, unknown>[], onConflict = "id") {
  if (!rows.length) return;
  if (PLAN) { log(`  plan ${table}: ${rows.length}`); return; }
  const { error } = await db.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

/** One persona's piece; a failure is reported and the rest carries on. */
async function part(name: string, fn: () => Promise<void>) {
  try { await fn(); log(`  ✓ ${name}`); } catch (err) { problems++; log(`  ✗ ${name}: ${(err as Error).message}`); }
}

async function listUsers(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) out.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  return out;
}

async function account(a: DevPersonaAccount, existing: Map<string, string>): Promise<string> {
  const email = personaEmail(a.handle);
  let id = existing.get(email);
  if (!id) {
    if (PLAN) return sid(`user:${a.handle}`);
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: a.name, seeded: true, preview_persona: true } });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    id = data.user.id;
    log(`  + ${email}`);
  }
  // An existing account keeps its password: resetting it would sign out anyone signed in as it.
  const pro = a.plan === "pro";
  await up("users", [{
    id, username: a.handle, display_name: a.name,
    subscription_tier: pro ? "pro" : "free", subscription_status: pro ? "active" : null, subscription_expires_at: pro ? at(30) : null,
    email_verified: true, is_public: true, bio: `${a.line}. A test persona on dev.`,
    favorite_games: a.favoriteGames, avatar_source: "dicebear", avatar_seed: a.handle,
    interests: a.interests, interests_source: "picked", interests_at: at(-3),
    welcomed_at: at(-3), timezone: "America/Los_Angeles", last_seen_at: at(-0.01),
  }]);
  return id;
}

// ─── activity ────────────────────────────────────────────────────────────────

/** Daily results for the last `days` days (not today, so today's game waits). */
async function dailies(id: string, games: ("shuffle" | "dex" | "fire")[], days: number) {
  const rows: Record<string, unknown>[] = [];
  for (let d = 1; d <= days; d++) {
    for (const game of games) {
      const seed = createHash("sha1").update(`${id}:${game}:${d}`).digest()[0];
      if (game === "fire") {
        const score = 600 + (seed % 9) * 120;
        rows.push({ game, day: pacificDay(-d), player: `u:${id}`, user_id: id, points: Math.min(10, Math.floor(score / 200)), guesses: 6 + (seed % 7), solved: true, seconds: 60, score, created_at: at(-d, 19) });
      } else {
        const guesses = 2 + (seed % 4);
        const solved = seed % 9 !== 0;
        rows.push({ game, day: pacificDay(-d), player: `u:${id}`, user_id: id, points: solved ? [10, 8, 6, 4, 2][guesses - 1] ?? 2 : 0, guesses, solved, seconds: 40 + (seed % 120), created_at: at(-d, 12) });
      }
    }
  }
  // Streaks and "played today" come from each account's daily_results; the boards from daily_scores.
  const results = rows.filter((r) => r.game === "shuffle" || r.game === "dex").map((r) => ({
    user_id: id, day: r.day, puzzle: r.game === "dex" ? DEX_PUZZLE_ID : puzzleFor(r.day as string).id,
    guesses: r.guesses, solved: r.solved, created_at: r.created_at,
  }));
  await up("daily_scores", rows, "game,day,player");
  await up("daily_results", results, "user_id,day,puzzle");
}

async function competitive(id: string) {
  await part("lounge names", () => up("lounge_links", [
    { user_id: id, game: "mk8dx", player_id: 84767, name: "Moti26", mmr: 8557, max_mmr: 8710, world_rank: 1240, confirmed_at: at(-10), checked_at: at(-1) },
    { user_id: id, game: "mkworld12p", player_id: 76963, name: "PartyYoshiK", mmr: 8215, max_mmr: 8302, world_rank: 1688, confirmed_at: at(-10), checked_at: at(-1) },
  ], "user_id,game"));
  await part("MMR card", () => up("mmr_cards", [{
    user_id: id, token: token(`mmr:${id}`), lounge_name: "Moti26", lounge_player_id: 84767, active_look: "main", show_on_profile: true,
    looks: [{ id: "main", name: "My card", game: "mk8dx", layout: "deck", surface: "dark", colors: "division", emblem: "crest", fill: "glyphs", number: "roll", font: "gs", brand: "inside", border: "none", foil: false, accent: "cyan", custom: ["#ff2d95", "#00e5ff"], picture: null }],
  }], "user_id"));
  await part("time trials", async () => {
    const tracks = ttTracks("mk8dx").slice(0, 8);
    await up("tt_times", tracks.map((t, i) => ({
      id: sid(`tt:${id}:${t.id}`), player: `u:${id}`, user_id: id, game: "mk8dx", track: t.id, cc: 150,
      time_ms: 95_000 + i * 3_217, items: "shrooms", vehicle: "any", proof_kind: "none", source: "site", status: "ok", created_at: at(-8 + i * 0.5),
    })));
  });
}

async function casual(id: string) {
  await part("dailies", () => dailies(id, ["shuffle", "fire"], 12));
}

async function family(id: string) {
  await part("dailies", () => dailies(id, ["shuffle"], 5));
  await part("party nights", () => up("party_nights", [
    { id: sid(`party:${id}:1`), host_user_id: id, game_slug: "super-mario-party-jamboree", config: { plan: [], format: "classic", moments: [] }, visibility: "open", join_code: code(`party:${id}:1`), status: "ended", created_at: at(-9, 19), ended_at: at(-9, 22) },
    { id: sid(`party:${id}:2`), host_user_id: id, game_slug: "mario-kart-8-deluxe", config: { plan: [], format: "classic", moments: [] }, visibility: "open", join_code: code(`party:${id}:2`), status: "ended", created_at: at(-2, 19), ended_at: at(-2, 21) },
  ]));
  await part("trivia night", () => up("trivia_games", [
    { id: sid(`trivia:${id}:1`), host_user_id: id, title: "Family trivia night", template: "party", code: code(`trivia:${id}:1`), rounds: [], settings: { familySafe: true }, status: "done", phase: "done", created_at: at(-6, 18), started_at: at(-6, 19), finished_at: at(-6, 21) },
  ]));
}

async function pokemon(id: string) {
  await part("dailies", () => dailies(id, ["dex", "shuffle"], 9));
  await part("My Cards", async () => {
    const { data } = await db.from("tcg_cards").select("id").like("id", "sv%").limit(14);
    const ids = (data ?? []).map((r) => r.id as string);
    await up("gs_user_cards", ids.map((card_id, i) => ({ id: sid(`card:${id}:${card_id}`), user_id: id, card_id, quantity: 1 + (i % 3), condition: "NM", added_at: at(-20 + i), showcased_at: i < 3 ? at(-2) : null, showcase_rank: i < 3 ? i + 1 : null })));
  });
  await part("deck list", async () => {
    const { data } = await db.from("tcg_decks").select("cards").like("source", "guide:%").limit(1).maybeSingle();
    if (!data?.cards) throw new Error("no guide deck on dev to copy");
    await up("tcg_decks", [{ id: sid(`deck:${id}`), user_id: id, name: "Mika's Delphox", format: "standard", cards: data.cards, source: "paste", created_at: at(-4), updated_at: at(-4) }]);
  });
  await part("Trainer Road", () => up("road_best", [
    { player: `u:${id}`, trainer_id: "brock-firered", month: monthStart(), run_id: sid(`road:${id}:brock`), level: "normal", won: true, score: 930, stars: 3, turns: 5, seconds: 140, updated_at: at(-3) },
    { player: `u:${id}`, trainer_id: "misty-firered", month: monthStart(), run_id: sid(`road:${id}:misty`), level: "normal", won: true, score: 780, stars: 2, turns: 8, seconds: 260, updated_at: at(-2) },
  ], "player,trainer_id,month"));
}

async function streamer(id: string) {
  await part("dailies", () => dailies(id, ["shuffle"], 3));
  const cfg = { game: "mario-kart-world", max_participants: 12, modules: ["picks_bans", "wheel", "polls"], queue: { cap: 12, rotation: "fifo" } };
  await part("streams", () => up("gs_sessions", [
    { id: sid(`session:${id}:next`), owner_user_id: id, name: "Friday Kart Night", slug: "pv-rory-friday-kart-night", status: "scheduled", platforms: {}, config: cfg, configured_games: ["mario-kart-world"], scheduled_at: at(3, 19), open_mode: "announce_only", created_at: at(-1) },
    { id: sid(`session:${id}:draft`), owner_user_id: id, name: "Smash viewer battles", slug: "pv-rory-smash-viewer-battles", status: "draft", platforms: {}, config: { ...cfg, game: "super-smash-bros-ultimate" }, configured_games: ["super-smash-bros-ultimate"], created_at: at(-0.5) },
  ]));
}

async function organizer(id: string) {
  // A free account keeps one active tournament (the database refuses a second), so one open and one finished.
  const base = { organizer_id: id, mode: "ffa", acceptance_mode: "auto", entry_policy: "open", max_participants: 16 };
  // The free-account trigger counts every active tournament before each insert (whatever the new row's status), so
  // the finished one goes in first, and rows already there are left alone.
  await part("tournaments", async () => {
    const rows = [
      { ...base, id: sid(`t:${id}:done`), title: "October Jamboree Bracket", game_slug: "super-mario-party-jamboree", format: "single_elim", status: "complete", date_time: at(-12, 18), share_token: token(`t:${id}:done`, 16), settings: { game_label: "Super Mario Party Jamboree", locationType: "in_person" }, created_at: at(-20) },
      { ...base, id: sid(`t:${id}:open`), title: "Thursday Night Cup", game_slug: "mario-kart-8-deluxe", format: "ffa_points", status: "open", date_time: at(4, 19), share_token: token(`t:${id}:open`, 16), settings: { raceCount: 8, items: "normal", game_label: "Mario Kart 8 Deluxe", locationType: "online", trackMode: "ffa" }, created_at: at(-5) },
    ];
    if (PLAN) { log(`  plan tournaments: ${rows.length}`); return; }
    const { data: have } = await db.from("tournaments").select("id").in("id", rows.map((r) => r.id));
    const there = new Set((have ?? []).map((r) => r.id as string));
    for (const row of rows.filter((r) => !there.has(r.id))) await up("tournaments", [row]);
  });
  await part("trivia league", () => up("trivia_leagues", [
    { id: sid(`league:${id}`), owner_user_id: id, slug: "pv-ana-thursday-trivia", title: "Thursday Trivia at the Corner Cafe", settings: { weeks: 8, bestOf: 6, online: false, scoring: "place", teamSize: 6, template: "bar", description: "Weekly trivia, teams of up to six." }, status: "active", created_at: at(-14) },
  ]));
  await part("game nights", () => up("board_game_nights", [
    { id: sid(`bgn:${id}:next`), host_id: id, title: "Saturday couch night", starts_at: at(2, 18), timezone: "America/Los_Angeles", visibility: "public", status: "scheduled", place: "Tacoma, WA", location_type: "in_person", kind: "video", capacity: 8, level: "casual", genres: ["Party"], games: [{ name: "Mario Kart 8 Deluxe", length: "quick" }, { name: "Super Mario Party Jamboree", length: "moderate" }] },
    { id: sid(`bgn:${id}:past`), host_id: id, title: "Board games and snacks", starts_at: at(-6, 18), timezone: "America/Los_Angeles", visibility: "public", status: "ended", place: "Tacoma, WA", location_type: "in_person", kind: "board", capacity: 8, level: "casual", genres: ["Party", "Family"], games: [{ name: "Codenames", bggId: 178900, length: "quick" }] },
  ]));
}

const ACTIVITY: Record<string, (id: string) => Promise<void>> = {
  pv_kai: competitive, pv_sam: casual, pv_jordan: family, pv_mika: pokemon, pv_rory: streamer, pv_ana: organizer,
};

async function main() {
  log(PLAN ? "Plan only (no writes)" : "Seeding test persona accounts on dev");
  const existing = PLAN ? new Map<string, string>() : await listUsers();
  for (const a of DEV_PERSONA_ACCOUNTS) {
    log(`▸ ${a.name} (${a.handle}): ${a.line}`);
    let id: string;
    try { id = await account(a, existing); } catch (err) { problems++; log(`  ✗ account: ${(err as Error).message}`); continue; }
    await ACTIVITY[a.handle]?.(id);
  }
  log(problems ? `Done with ${problems} problem(s).` : "Done.");
  if (!PLAN) log(`Password: DEV_SEED_PASSWORD from .env.local. Or sign in from the View as control (staff, dev only).`);
  process.exit(problems ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
