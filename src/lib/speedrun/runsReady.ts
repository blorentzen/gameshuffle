import "server-only";

/**
 * My runs (speedrun templates picks 2026-11-10, 6A; supabase/speedrun-m2.sql): whether the runs table and the run_key
 * columns exist. Everything speedrun works without them, as it did; once they're there, attempts and bets are kept per
 * run. A yes is kept; a no is asked again after a minute (so running the migration needs no redeploy).
 */

import { createServiceClient } from "@/lib/supabase/admin";

let ok: { yes: boolean; at: number } | null = null;

export async function runsReady(): Promise<boolean> {
  if (ok?.yes) return true;
  if (ok && Date.now() - ok.at < 60_000) return false;
  const { error } = await createServiceClient().from("speedrun_runs").select("id").limit(1);
  if (error && !/speedrun_runs|42P01|PGRST205|schema cache/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) console.warn("[speedrun] runs check:", error.message);
  ok = { yes: !error, at: Date.now() };
  return !error;
}
