/**
 * Add BREADTH to the seeded game nights and tournaments.
 *
 * `seed-dev.ts` already produces volume (40 tournaments, 28 nights in dev), but
 * the spread is lopsided in exactly the dimensions the browse and organization
 * surfaces filter on:
 *
 *   nights       25 board / 1 video / 1 tcg / 1 mixed   → the kind filter is untestable
 *   tournaments  31 ffa_points / 1 double_elim          → format filter likewise
 *   championships 1
 *
 * So this seeder is not "more rows". Every row is placed deliberately across
 * kind, level, genre, metro, date window, capacity pressure, price and format,
 * so that every filter in EventsBrowser has something on BOTH sides and the
 * lists are long enough to show how they hold up.
 *
 * Deterministic ids (`sid()` over a stable key), upserted, so re-running is a
 * no-op rather than a duplicate, and --clean removes exactly what it added.
 *
 * Usage:
 *   npx tsx scripts/seed-events-volume.ts --dry
 *   npx tsx scripts/seed-events-volume.ts
 *   npx tsx scripts/seed-events-volume.ts --clean
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const clean = args.includes("--clean");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");
const db = createClient(url, key);

/** Stable uuid from a key, so every run addresses the same rows. */
const sid = (k: string): string => {
  const h = createHash("sha256").update(`gs-volume:${k}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const token = (k: string) => createHash("sha256").update(`tok:${k}`).digest("hex").slice(0, 10);

/** Deterministic PRNG so two runs produce identical data. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rnd = prng(20260923);
const r = (n: number) => Math.floor(rnd() * n);
const some = <T,>(arr: T[], k: number): T[] => {
  const c = [...arr], out: T[] = [];
  while (out.length < k && c.length) out.push(c.splice(r(c.length), 1)[0]);
  return out;
};
/** ISO timestamp `days` from now, at `hour` local-ish. */
const at = (days: number, hour = 19): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** For `created_at` / `joined_at`: a record cannot have been created after now,
 *  and a future value shows up as growth that has not happened on the admin
 *  charts, which read these columns directly. */
const created = (days: number, hour = 12): string =>
  new Date(Math.min(Date.parse(at(days, hour)), Date.now())).toISOString();

// --- catalogs ---------------------------------------------------------------

const METROS = [
  { name: "Austin", state: "TX", lat: 30.2672, lng: -97.7431, tz: "America/Chicago" },
  { name: "Denver", state: "CO", lat: 39.7392, lng: -104.9903, tz: "America/Denver" },
  { name: "Chicago", state: "IL", lat: 41.8781, lng: -87.6298, tz: "America/Chicago" },
  { name: "Seattle", state: "WA", lat: 47.6062, lng: -122.3321, tz: "America/Los_Angeles" },
  { name: "Atlanta", state: "GA", lat: 33.749, lng: -84.388, tz: "America/New_York" },
  { name: "Phoenix", state: "AZ", lat: 33.4484, lng: -112.074, tz: "America/Phoenix" },
  { name: "Brooklyn", state: "NY", lat: 40.6782, lng: -73.9442, tz: "America/New_York" },
  { name: "Portland", state: "OR", lat: 45.5152, lng: -122.6784, tz: "America/Los_Angeles" },
  { name: "Nashville", state: "TN", lat: 36.1627, lng: -86.7816, tz: "America/Chicago" },
  { name: "San Diego", state: "CA", lat: 32.7157, lng: -117.1611, tz: "America/Los_Angeles" },
];
const GENRES = ["Strategy", "Party", "Cooperative", "Family", "Card & deckbuilding",
  "Social deduction", "Trivia", "Word", "Dexterity", "Abstract"];
const LEVELS = ["casual", "intermediate", "advanced"] as const;

/** Per-kind titles, venues and game lists, so a night reads like its category. */
const KINDS = {
  board: {
    titles: ["Heavy Euro Night", "Meeple Monday", "Worker Placement Wednesday", "Tabletop Social",
      "Legacy Campaign Night", "Dice & Drafts", "Sunday Strategy Session"],
    venues: ["Board & Brew", "The Dice Tower Cafe", "Rook & Pawn", "Meeple Mountain", "Guildhall Games"],
    games: [
      { name: "Wingspan", length: "moderate" }, { name: "Brass: Birmingham", length: "long" },
      { name: "Azul", length: "quick" }, { name: "Terraforming Mars", length: "long" },
      { name: "Cascadia", length: "moderate" }, { name: "Ark Nova", length: "long" },
      { name: "Splendor", length: "quick" }, { name: "Everdell", length: "moderate" },
    ],
  },
  video: {
    titles: ["Mario Kart Meetup", "Smash Night", "Couch Co-op Evening", "Retro Arcade Night",
      "Fighting Game Friday", "Party Game Pile-On"],
    venues: ["The Cartridge Club", "Pixel Pub", "Level Up Lounge", "Continue? Arcade"],
    games: [
      { name: "Mario Kart World", length: "moderate" }, { name: "Mario Kart 8 Deluxe", length: "moderate" },
      { name: "Super Smash Bros. Ultimate", length: "quick" }, { name: "Overcooked 2", length: "moderate" },
      { name: "Street Fighter 6", length: "quick" }, { name: "Jackbox Party Pack", length: "quick" },
    ],
  },
  tcg: {
    titles: ["Pokémon TCG League", "Draft Night", "Commander Chaos", "Prerelease Party",
      "Standard Showdown", "Cube Draft Evening"],
    venues: ["Top Deck Games", "The Card Vault", "Mana Leak Cafe", "Binder & Barrel"],
    games: [
      { name: "Pokémon TCG", length: "moderate" }, { name: "Magic: The Gathering", length: "long" },
      { name: "Lorcana", length: "moderate" }, { name: "One Piece TCG", length: "moderate" },
    ],
  },
  mixed: {
    titles: ["Anything Goes Night", "Games & Grazing", "Open Table Social", "Bring What You Like",
      "Grab Bag Game Night"],
    venues: ["The Common Room", "Third Place Collective", "Neighborhood Hall", "The Long Table"],
    games: [
      { name: "Wingspan", length: "moderate" }, { name: "Mario Kart 8 Deluxe", length: "moderate" },
      { name: "Pokémon TCG", length: "moderate" }, { name: "Codenames", length: "quick" },
      { name: "Jackbox Party Pack", length: "quick" },
    ],
  },
} as const;
type Kind = keyof typeof KINDS;

const TOURNEY = {
  ffa_points: { titles: ["Points Night", "Weekly FFA", "Sunday Scramble", "Ladder Night"], races: 12 },
  round_robin: { titles: ["Round Robin Rumble", "Everyone Plays Everyone", "RR Showcase"], races: 8 },
  single_elim: { titles: ["Bracket Night", "Single Elim Showdown", "Knockout Cup"], races: 3 },
  double_elim: { titles: ["Double Trouble", "Two Lives Invitational", "Lower Bracket Legends"], races: 3 },
  heat_mains: { titles: ["Heat Night", "Consi Ladder Classic", "Sprint Car Special"], races: 1 },
} as const;
type Format = keyof typeof TOURNEY;

// --- upsert helpers ---------------------------------------------------------

let wrote = 0;
async function up(table: string, rows: Record<string, unknown>[], onConflict = "id") {
  if (!rows.length) return;
  if (dry) { wrote += rows.length; return; }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 200), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  wrote += rows.length;
}

// --- main -------------------------------------------------------------------

(async () => {
  console.log(`project ${url.slice(8, 14)}…  ${dry ? "(DRY RUN)" : clean ? "(CLEAN)" : ""}`);

  const nightIds = Array.from({ length: 40 }, (_, i) => sid(`night:${i}`));
  const tourneyIds = Array.from({ length: 34 }, (_, i) => sid(`tourney:${i}`));

  if (clean) {
    for (const [t, col, ids] of [
      ["board_game_night_rsvps", "night_id", nightIds],
      ["gs_ticket_tiers", "event_id", [...nightIds, ...tourneyIds]],
      ["tournament_participants", "tournament_id", tourneyIds],
      ["board_game_nights", "id", nightIds],
      ["tournaments", "id", tourneyIds],
    ] as const) {
      const { error } = await db.from(t).delete().in(col, ids as string[]);
      console.log(`  - ${t}${error ? ` (${error.message})` : ""}`);
    }
    console.log("\ncleaned");
    return;
  }

  // Hosts / organizers / attendees come from whoever the main seeder made.
  const { data: pool } = await db.from("users")
    .select("id, username, display_name").not("username", "is", null).limit(80);
  if (!pool?.length) throw new Error("No users — run scripts/seed-dev.ts first");
  const hosts = pool.slice(0, 24);
  console.log(`${pool.length} users available as hosts/attendees\n`);

  // --- game nights ----------------------------------------------------------
  // Even across kind; level, genre, metro, window and price all varied so each
  // filter has both sides. A handful are deliberately full or cancelled.
  const kinds: Kind[] = ["board", "video", "tcg", "mixed"];
  const nights: Record<string, unknown>[] = [];
  const rsvps: Record<string, unknown>[] = [];
  const tiers: Record<string, unknown>[] = [];

  nightIds.forEach((id, i) => {
    const kind = kinds[i % 4];                       // even split, not 25/1/1/1
    const k = KINDS[kind];
    const metro = METROS[i % METROS.length];         // every metro represented
    const level = LEVELS[i % 3];
    const host = hosts[i % hosts.length];
    // Spread across past / soon / far so the `when` filter has range.
    const day = i < 8 ? -(4 + i * 3) : i < 14 ? (i - 7) * 0.4 : (i - 12) * 2.5;
    const capacity = [6, 8, 10, 12, 16, 24][i % 6];
    const full = i % 7 === 3;                        // some at capacity
    const cancelled = i % 13 === 5;
    const unlisted = i % 11 === 4;
    const ticketed = i % 5 === 2;                    // ~20% ticketed

    nights.push({
      id, host_id: host.id,
      title: `${k.titles[i % k.titles.length]} — ${metro.name}`,
      description: `A ${level} ${kind === "board" ? "board game" : kind === "tcg" ? "TCG" : kind === "video" ? "video game" : "mixed"} night in ${metro.name}. Newcomers welcome, teaching games available.`,
      place: `${k.venues[i % k.venues.length]}, ${metro.name}, ${metro.state}`,
      lat: metro.lat + (rnd() - 0.5) * 0.12,
      lng: metro.lng + (rnd() - 0.5) * 0.12,
      starts_at: at(day, [17, 18, 19, 20][i % 4]),
      timezone: metro.tz,
      capacity,
      visibility: unlisted ? "unlisted" : "public",
      genres: some(GENRES, 2 + (i % 3)),
      level,
      kind,
      games: some([...k.games], 2 + (i % 3)).map((g) => ({ name: g.name, length: g.length })),
      status: cancelled ? "cancelled" : day < 0 ? "ended" : "scheduled",
      created_at: created(day - 14),
      updated_at: created(day - 1),
    });

    const goingCount = full ? capacity : 1 + r(Math.max(1, capacity - 2));
    some(pool, Math.min(goingCount, pool.length)).forEach((u, j) => {
      rsvps.push({
        night_id: id, user_id: u.id,
        status: j < goingCount ? "going" : "maybe",
        created_at: created(day - 5 + j * 0.05),
      });
    });

    if (ticketed) {
      tiers.push({
        id: sid(`tier:night:${i}`), event_type: "game-night", event_id: id,
        name: i % 2 ? "Table seat" : "Entry", amount_cents: [500, 800, 1200, 1500][i % 4],
        quantity: capacity, per_order_max: 2, sort: 0, active: true,
      });
    }
  });

  // --- tournaments ----------------------------------------------------------
  // Even across the five formats, both games, every status.
  const formats: Format[] = ["ffa_points", "round_robin", "single_elim", "double_elim", "heat_mains"];
  const statuses = ["open", "open", "in_progress", "complete", "complete", "cancelled", "draft"];
  const tourneys: Record<string, unknown>[] = [];
  const participants: Record<string, unknown>[] = [];

  tourneyIds.forEach((id, i) => {
    const format = formats[i % 5];                   // even, not 31/5/3/1
    const f = TOURNEY[format];
    const status = statuses[i % statuses.length];
    const mkw = i % 3 === 1;
    const org = hosts[(i + 5) % hosts.length];
    const day = status === "complete" ? -(2 + i * 1.5) : status === "in_progress" ? -0.1 : (i % 12) + 0.5;
    const cap = [8, 12, 16, 24, 32, 64][i % 6];
    const ticketed = i % 6 === 4;

    tourneys.push({
      id, organizer_id: org.id,
      title: `${f.titles[i % f.titles.length]} #${i + 1}`,
      game_slug: mkw ? "mario-kart-world" : "mario-kart-8-deluxe",
      mode: "ffa", format,
      acceptance_mode: i % 4 === 0 ? "auto" : "manual",
      status,
      date_time: at(day, [18, 19, 20, 21][i % 4]),
      max_participants: cap,
      share_token: token(`t:${i}`),
      description: `${format.replace("_", " ")} on ${mkw ? "Mario Kart World" : "Mario Kart 8 Deluxe"}. ${f.races} race${f.races > 1 ? "s" : ""} per round.`,
      settings: {
        raceCount: f.races, cc: ["150cc", "200cc"][i % 2], items: "normal", cpu: "none",
        game_label: mkw ? "Mario Kart World" : "Mario Kart 8 Deluxe",
        locationType: i % 5 === 3 ? "in_person" : "online",
        trackMode: ["randomized", "guided", "ffa"][i % 3],
        requireVerified: i % 8 === 0,
      },
      created_at: created(day - 10),
    });

    // A believable fill level: some nearly empty, some full.
    const fill = i % 9 === 2 ? cap : Math.max(2, Math.floor(cap * (0.25 + rnd() * 0.6)));
    some(pool, Math.min(fill, pool.length)).forEach((u, j) => {
      participants.push({
        id: sid(`tp:${i}:${j}`), tournament_id: id, user_id: u.id,
        display_name: u.display_name ?? u.username,
        friend_code: `SW-${2000 + j}-${3000 + i}-4000`,
        status: status === "complete" ? "confirmed" : status === "in_progress" ? "checked_in" : "registered",
        joined_at: created(day - 6 + j * 0.05),
      });
    });

    if (ticketed) {
      tiers.push({
        id: sid(`tier:t:${i}`), event_type: "tournament", event_id: id,
        name: "Entry", amount_cents: [500, 1000, 2000][i % 3],
        quantity: cap, per_order_max: 1, sort: 0, active: true,
      });
    }
  });

  // --- write ----------------------------------------------------------------
  await up("board_game_nights", nights);
  await up("board_game_night_rsvps", rsvps, "night_id,user_id");
  await up("tournaments", tourneys);
  await up("tournament_participants", participants);
  await up("gs_ticket_tiers", tiers);

  const tally = (rows: Record<string, unknown>[], k: string) => {
    const m: Record<string, number> = {};
    for (const row of rows) m[String(row[k])] = (m[String(row[k])] ?? 0) + 1;
    return JSON.stringify(m);
  };

  console.log(`game nights  ${nights.length}`);
  console.log(`   kind    ${tally(nights, "kind")}`);
  console.log(`   level   ${tally(nights, "level")}`);
  console.log(`   status  ${tally(nights, "status")}`);
  console.log(`   rsvps   ${rsvps.length}`);
  console.log(`tournaments  ${tourneys.length}`);
  console.log(`   format  ${tally(tourneys, "format")}`);
  console.log(`   status  ${tally(tourneys, "status")}`);
  console.log(`   game    ${tally(tourneys, "game_slug")}`);
  console.log(`   entries ${participants.length}`);
  console.log(`ticket tiers ${tiers.length}`);
  console.log(`\n${dry ? "would write" : "wrote"} ${wrote} rows`);
})();
