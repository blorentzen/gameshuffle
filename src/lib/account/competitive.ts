import "server-only";

/**
 * Account ▸ Competitive (menus and account picks 2026-11-05, 4A): what an account has in competitive Mario Kart, for
 * one screen with links to each tool. A staff persona preview with sample data fills the parts the account has
 * nothing in, each marked as a sample (src/lib/preview).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { personaPreview } from "@/lib/preview/server";
import { accessLine, accessOf } from "@/lib/timeTrials/team";

export interface CompetitiveSummary {
  username: string | null;
  lounge: { game: string; name: string; mmr: number | null; division: string | null }[];
  loungeSample: boolean;
  times: number;
  timesSample: boolean;
  mmrCard: { token: string; loungeName: string | null } | null;
  mmrSample: boolean;
  /** Review access on the time trial boards (reviewer, updater for some boards), or null. */
  review: string | null;
}

const SAMPLE_LOUNGE = [{ game: "mk8dx", name: "Sample player", mmr: 8200, division: "Platinum" }];

export async function competitiveSummary(userId: string): Promise<CompetitiveSummary> {
  const db = createServiceClient();
  const [user, lounge, times, card, access, preview] = await Promise.all([
    db.from("users").select("username").eq("id", userId).maybeSingle().then((r) => r.data as { username: string | null } | null),
    db.from("lounge_links").select("game, name, mmr, division").eq("user_id", userId).then((r) => (r.data ?? []) as CompetitiveSummary["lounge"]),
    db.from("tt_times").select("id", { count: "exact", head: true }).eq("player", `u:${userId}`).eq("status", "ok").then((r) => r.count ?? 0),
    db.from("mmr_cards").select("token, lounge_name").eq("user_id", userId).maybeSingle().then((r) => r.data as { token: string; lounge_name: string | null } | null),
    accessOf(userId).catch(() => null),
    personaPreview(),
  ]);
  const sample = !!preview?.sample;
  const review = access && !access.staff && (access.reviewer || access.modes.length > 0) ? accessLine(access) : null;
  return {
    username: user?.username ?? null,
    lounge: lounge.length || !sample ? lounge : SAMPLE_LOUNGE,
    loungeSample: !lounge.length && sample,
    times: times || !sample ? times : 12,
    timesSample: !times && sample,
    mmrCard: card ? { token: card.token, loungeName: card.lounge_name } : sample ? { token: "sample", loungeName: "Sample player" } : null,
    mmrSample: !card && sample,
    review,
  };
}
