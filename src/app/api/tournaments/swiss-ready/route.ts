/** GET: whether Swiss and tournament deck lists are switched on (supabase/swiss-m1.sql has run), and time trial events (tt-events-m1.sql). */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

let cache: { at: number; ready: boolean; tt: boolean } | null = null;

export async function GET() {
  if (!cache || Date.now() - cache.at > 60_000) {
    const db = createServiceClient();
    const [a, b, c, d] = await Promise.all([
      db.from("tournaments").select("swiss").limit(1),
      db.from("tournament_swiss_reports").select("match_key", { head: true, count: "exact" }).limit(1),
      db.from("tournament_deck_lists").select("id", { head: true, count: "exact" }).limit(1),
      // A plain read: a count-only (HEAD) request doesn't report a missing table.
      db.from("tt_event_times").select("id").limit(1),
    ]);
    cache = { at: Date.now(), ready: !a.error && !b.error && !c.error, tt: !d.error };
  }
  return NextResponse.json({ ready: cache.ready, tt: cache.tt });
}
