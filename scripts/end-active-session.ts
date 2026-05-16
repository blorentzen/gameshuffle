/**
 * One-shot: end the currently-active session (status=active or ending →
 * status=ended). Service-role write. Used while debugging — quickest
 * way to clear the session state so the streamer can reboot.
 *
 * Usage:
 *   npx tsx scripts/end-active-session.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sessions, error: selErr } = await admin
    .from("gs_sessions")
    .select("id, slug, status")
    .in("status", ["active", "ending"]);
  if (selErr) {
    console.error("Select failed:", selErr.message);
    process.exit(1);
  }
  if (!sessions || sessions.length === 0) {
    console.log("No active session to end.");
    return;
  }

  for (const s of sessions) {
    const { error: updateErr } = await admin
      .from("gs_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", s.id);
    if (updateErr) {
      console.error(`  ✗ ${s.slug}: ${updateErr.message}`);
    } else {
      console.log(`  ✓ ${s.slug} (${s.id}): ended`);
    }
  }
})();
