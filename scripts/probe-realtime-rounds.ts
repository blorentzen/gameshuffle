/**
 * Standalone realtime probe — subscribes to the `session_picks_bans_rounds`
 * channel as the anon role for a specific session_id and prints every
 * event it receives. Run alongside the Hub's "Open round" / "Close round"
 * actions to see whether realtime is actually delivering events.
 *
 * Diagnostic flow:
 *   1. Find the current active session_id (script does this).
 *   2. Subscribe to the rounds channel.
 *   3. You manually open a round in the Hub.
 *   4. We expect to see "INSERT" event here within 1-2s.
 *
 * If we see the event → realtime is healthy; bug is in the React layer.
 * If we don't see the event → realtime is broken at Supabase level
 *   (publication, RLS, or replica identity).
 *
 * Usage:
 *   npx tsx scripts/probe-realtime-rounds.ts
 *
 * Stop with Ctrl-C.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRole) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
  }

  // Find the currently-active session.
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessions } = await admin
    .from("gs_sessions")
    .select("id, slug, status, owner_user_id, name")
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false });
  if (!sessions || sessions.length === 0) {
    console.error("No active session. Go live in the Hub first.");
    process.exit(1);
  }
  console.log(`Found ${sessions.length} active session(s):`);
  for (const s of sessions) {
    console.log(`  - ${s.slug} (${s.id}) status=${s.status}`);
  }
  const session = sessions[0];
  console.log(`\nSubscribing as anon to rounds for: ${session.slug} (${session.id})\n`);

  // Subscribe as anon — same role the /live page uses.
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sanity check: can anon SELECT from the rounds table for this session?
  const { data: existingRounds, error: selErr } = await supabase
    .from("session_picks_bans_rounds")
    .select("id, status, game_slug, opened_at")
    .eq("session_id", session.id);
  if (selErr) {
    console.error(`  anon SELECT failed: ${selErr.message}`);
  } else {
    console.log(
      `  anon SELECT returned ${existingRounds?.length ?? 0} round(s)` +
        (existingRounds && existingRounds.length > 0
          ? `: ${JSON.stringify(existingRounds)}`
          : ""),
    );
  }
  console.log("");

  const channel = supabase.channel(`probe-rounds-${session.id}`).on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "session_picks_bans_rounds",
      filter: `session_id=eq.${session.id}`,
    },
    (payload) => {
      const ts = new Date().toISOString();
      console.log(
        `[${ts}] event=${payload.eventType} new=${JSON.stringify(
          payload.new,
        )} old=${JSON.stringify(payload.old)}`,
      );
    },
  );

  channel.subscribe((status, err) => {
    console.log(`[channel status] ${status}${err ? ` err=${err.message}` : ""}`);
  });

  console.log(
    "Waiting for events. Now open a round in the Hub. Press Ctrl-C to exit.\n",
  );

  // Keep the script alive.
  await new Promise<void>(() => {});
})();
