import "server-only";

/**
 * Levels from players (supabase/levels-m1.sql): whether the tables exist. Until they do, the queue stays quiet in
 * chat, the dashboard says it isn't ready, the overlay piece and the board's tab stay out. A yes is kept; a no is
 * asked again after a minute (so running the migration needs no redeploy).
 */

import { createServiceClient } from "@/lib/supabase/admin";

let ok: { yes: boolean; at: number } | null = null;

export async function levelsReady(): Promise<boolean> {
  if (ok?.yes) return true;
  if (ok && Date.now() - ok.at < 60_000) return false;
  const { error } = await createServiceClient().from("level_queues").select("owner_user_id").limit(1);
  if (error && !/level_queues|42P01|PGRST205|schema cache/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) console.warn("[levels] ready check:", error.message);
  ok = { yes: !error, at: Date.now() };
  return !error;
}

let cur: { yes: boolean; at: number } | null = null;

/**
 * Curating player levels (supabase/levels-m2.sql): marks and likes, the new sorts, GameShuffle picks, the level of the
 * week, lists, reports, maker IDs, Geometry Dash and Minecraft seeds. Until the tables exist, the boards work as they
 * did and none of it shows. Same caching as `levelsReady`.
 */
export async function curationReady(): Promise<boolean> {
  if (cur?.yes) return true;
  if (cur && Date.now() - cur.at < 60_000) return false;
  if (!(await levelsReady())) return false;
  const { error } = await createServiceClient().from("level_marks").select("level_id").limit(1);
  if (error && !/level_marks|42P01|PGRST205|schema cache/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) console.warn("[levels] curation check:", error.message);
  cur = { yes: !error, at: Date.now() };
  return !error;
}
