/**
 * Fill in the live end-to-end: a session with a rolled race and item set, a
 * lobby that has actually shuffled, a race history, and a Twitch connection so
 * the player embeds.
 *
 * The active session existed but had none of the state the page renders from,
 * so /live showed its shell: "Not yet rolled" twice, an empty video area, and
 * a leaderboard with nothing in it. You cannot evaluate a screen in that state.
 *
 * Everything is written as session_events in the shapes the page derives from
 * (race_randomized carries both the track AND the item preset), rather than as
 * invented columns — so what renders is what a real roll would produce.
 *
 *   npx tsx scripts/seed-live-experience.ts           # report only
 *   npx tsx scripts/seed-live-experience.ts --write
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import mkworld from "../src/data/mkworld-data.json";

const WRITE = process.argv.includes("--write");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Real MKWorld tracks, addressed the way the rest of the app addresses them. */
type Course = { name: string; icon?: string };
type Cup = { name: string; courses: Course[] };
const TRACKS = (mkworld.cups as Cup[]).flatMap((cup, ci) =>
  cup.courses.map((t, ti) => ({ id: `c${ci}-t${ti}`, name: t.name })),
);

/** Item presets that exist in MKWORLD_ITEM_MODES. */
const PRESETS = [
  { id: "rise-of-the-koopa", name: "Rise of the Koopa" },
  { id: "mushroom-madness", name: "Mushroom Madness" },
  { id: "classic", name: "Classic" },
];

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

async function main() {
  const { data: sessions, error: se } = await db
    .from("gs_sessions")
    .select("id, name, owner_user_id, active_game, status")
    .in("status", ["active", "ending"]);
  if (se) throw new Error(`sessions: ${se.message}`);
  if (!sessions?.length) {
    console.log("No active session to fill. Activate one first.");
    return;
  }

  const plan: string[] = [];
  const events: Record<string, unknown>[] = [];
  const connections: Record<string, unknown>[] = [];

  for (const s of sessions) {
    const { data: existing, error: ee } = await db
      .from("session_events").select("event_type").eq("session_id", s.id);
    if (ee) throw new Error(`events: ${ee.message}`);
    const kinds = new Set((existing ?? []).map((e) => e.event_type));

    if (!kinds.has("race_randomized")) {
      // A short history, oldest first, so "current" is the last one rolled and
      // Race History has something above it.
      for (let i = 0; i < 4; i++) {
        const track = pick(TRACKS, s.id.charCodeAt(0) + i * 7);
        const preset = pick(PRESETS, s.id.charCodeAt(1) + i);
        events.push({
          session_id: s.id,
          event_type: "race_randomized",
          payload: {
            game: "mkworld",
            track_id: track.id,
            track_name: track.name,
            kind: "race",
            series_index: i + 1,
            series_total: 4,
            preset_id: preset.id,
            preset_name: preset.name,
          },
          created_at: new Date(Date.now() - (4 - i) * 11 * 60_000).toISOString(),
        });
      }
      plan.push(`${s.name}: 4 rolled races (current = the last)`);
    }

    // The embed needs a twitch_login. Tokens stay null — nothing here calls
    // Helix, and a fake token that LOOKED real would be worse than none.
    const { data: conn } = await db
      .from("twitch_connections").select("id").eq("user_id", s.owner_user_id).maybeSingle();
    if (!conn) {
      const { data: u } = await db
        .from("users").select("username, display_name").eq("id", s.owner_user_id).maybeSingle();
      const login = (u?.username as string | null) ?? "gameshuffle";
      connections.push({
        user_id: s.owner_user_id,
        twitch_user_id: String(100000 + (s.owner_user_id.charCodeAt(0) * 977) % 800000),
        twitch_login: login,
        twitch_display_name: (u?.display_name as string | null) ?? login,
        is_live: true,
        scopes: [],
      });
      plan.push(`${s.name}: twitch connection for ${login} (is_live, no tokens)`);
    }
  }

  console.log(plan.length ? "\n" + plan.join("\n") : "\nNothing to add — the live surfaces already have state.");
  console.log(`\n${events.length} events, ${connections.length} connections`);

  if (!WRITE) {
    console.log("\nDry run. Re-run with --write to apply.\n");
    return;
  }
  if (events.length) {
    const { error } = await db.from("session_events").insert(events);
    if (error) throw new Error(`insert events: ${error.message}`);
  }
  if (connections.length) {
    const { error } = await db.from("twitch_connections").insert(connections);
    if (error) throw new Error(`insert connections: ${error.message}`);
  }
  console.log("\nApplied.\n");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
