import "server-only";

import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "@/lib/supabase/admin";
import { DAILY_SPEND_ALERT_CREDITS } from "./config";

/**
 * Credit-spend audit trail (spec Phase 2). Every outbound Scrydex call
 * increments today's row in `gs_scrydex_usage`. The daily roll-up is the
 * ONLY visibility into a runaway loop — it must be live from the first real
 * API call, which is why the table ships in the Phase 1 migration.
 *
 * Reconcile monthly against `GET /account/v1/usage`.
 */
export async function recordScrydexUsage(
  endpoint: string,
  credits: number,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    // Atomic per-(date,endpoint) increment via the SECURITY DEFINER RPC if
    // present; otherwise fall back to a read-modify-write upsert. The RPC is
    // preferred so concurrent calls don't clobber each other's counts.
    const { error: rpcError } = await supabase.rpc("increment_scrydex_usage", {
      p_endpoint: endpoint,
      p_credits: credits,
    });

    if (rpcError) {
      // Fallback: best-effort upsert (loses precision under high concurrency,
      // but usage is an audit signal, not a billing source of truth).
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from("gs_scrydex_usage")
        .select("credits, call_count")
        .eq("usage_date", today)
        .eq("endpoint", endpoint)
        .maybeSingle();
      await supabase.from("gs_scrydex_usage").upsert(
        {
          usage_date: today,
          endpoint,
          credits: (existing?.credits ?? 0) + credits,
          call_count: (existing?.call_count ?? 0) + 1,
        },
        { onConflict: "usage_date,endpoint" },
      );
    }

    await checkDailyThreshold(supabase);
  } catch (err) {
    // Never let usage logging break the actual request — but do surface it.
    Sentry.captureException(err, { tags: { area: "scrydex_usage" } });
  }
}

let lastAlertedDate: string | null = null;

async function checkDailyThreshold(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("gs_scrydex_usage")
    .select("credits")
    .eq("usage_date", today);
  const total = (data ?? []).reduce((sum, r) => sum + (r.credits ?? 0), 0);
  if (total >= DAILY_SPEND_ALERT_CREDITS && lastAlertedDate !== today) {
    lastAlertedDate = today; // de-dupe within a warm instance
    Sentry.captureMessage(
      `Scrydex daily credit spend ${total} crossed alert threshold ${DAILY_SPEND_ALERT_CREDITS}`,
      "warning",
    );
    console.warn(
      `[scrydex] DAILY CREDIT ALERT: ${total} credits today (threshold ${DAILY_SPEND_ALERT_CREDITS})`,
    );
  }
}
