/**
 * The homepage's signed-in touches (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/PjULC3d4viTX3Tn4oYmLTe): which plans the visitor
 * has, so the plans band says "Open your hub" / "Manage your events" instead
 * of the pitch, and their next event (a tournament they run or play in, or a
 * game night they host or are going to) at the top of Run the night.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, type SubscriptionTier } from "@/lib/subscription";
import { safeTimeZone, GS_TIME_ZONE } from "@/lib/time/gsClock";
import { isSupporter } from "@/lib/support/store";

export interface NextEvent {
  kind: "tournament" | "game-night";
  title: string;
  href: string;
  /** "Hosting" or "Playing" / "Going". */
  role: string;
  /** When, in the visitor's timezone ("Sat, Oct 18 · 7:00 PM"), or "Happening now". */
  when: string;
}

export interface HomeViewer { userId: string; pro: boolean; circuit: boolean; trialUsed: boolean; supporter: boolean; next: NextEvent | null }

/** Tournaments still running count as now for a few hours after their start. */
const RUNNING_GRACE_MS = 6 * 3_600_000;

type Tour = { id: string; title: string; status: string; date_time: string | null; archived_at: string | null };
type Night = { id: string; title: string; status: string; starts_at: string | null; archived_at: string | null };

export async function homeViewer(): Promise<HomeViewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceClient();
  const { data: row } = await admin.from("users").select("subscription_tier, role, circuit_tier, circuit_status, timezone, has_used_trial").eq("id", user.id).maybeSingle();
  const r = (row ?? {}) as { subscription_tier?: string | null; role?: string | null; circuit_tier?: string | null; circuit_status?: string | null; timezone?: string | null; has_used_trial?: boolean | null };
  const pro = effectiveTier({ tier: (r.subscription_tier as SubscriptionTier | null) ?? "free", role: r.role ?? null, circuitTier: r.circuit_tier ?? null, circuitStatus: r.circuit_status ?? null }) === "pro";
  const circuit = !!r.circuit_tier && ["active", "trialing", "past_due"].includes(r.circuit_status ?? "");
  const [next, supporter] = await Promise.all([
    nextEvent(user.id, safeTimeZone(r.timezone ?? GS_TIME_ZONE)).catch(() => null),
    isSupporter(user.id).catch(() => false),
  ]);
  return { userId: user.id, pro, circuit, trialUsed: !!r.has_used_trial, supporter, next };
}

async function nextEvent(userId: string, tz: string): Promise<NextEvent | null> {
  const admin = createServiceClient();
  const now = Date.now();
  const since = new Date(now - RUNNING_GRACE_MS).toISOString();
  const [organized, joined, hosting, going] = await Promise.all([
    admin.from("tournaments").select("id, title, status, date_time, archived_at").eq("organizer_id", userId).in("status", ["open", "in_progress"]).is("archived_at", null).gte("date_time", since).order("date_time").limit(3),
    admin.from("tournament_participants").select("tournament:tournaments(id, title, status, date_time, archived_at)").eq("user_id", userId).neq("status", "dropped").limit(50),
    admin.from("board_game_nights").select("id, title, status, starts_at, archived_at").eq("host_id", userId).eq("status", "scheduled").is("archived_at", null).gte("starts_at", new Date(now).toISOString()).order("starts_at").limit(3),
    admin.from("board_game_night_rsvps").select("night:board_game_nights(id, title, status, starts_at, archived_at)").eq("user_id", userId).eq("status", "going").limit(50),
  ]);
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const live = (t: Tour | null) => !!t && ["open", "in_progress"].includes(t.status) && !t.archived_at && !!t.date_time && (t.status === "in_progress" || Date.parse(t.date_time) >= now - RUNNING_GRACE_MS);
  const upcoming = (n: Night | null) => !!n && n.status === "scheduled" && !n.archived_at && !!n.starts_at && Date.parse(n.starts_at) >= now;

  const options: { at: number; event: Omit<NextEvent, "when">; running: boolean }[] = [];
  for (const t of (organized.data ?? []) as Tour[]) if (live(t)) options.push({ at: Date.parse(t.date_time!), running: t.status === "in_progress", event: { kind: "tournament", title: t.title, href: `/tournament/${t.id}`, role: "Hosting" } });
  for (const p of (joined.data ?? []) as { tournament: Tour | Tour[] | null }[]) {
    const t = one(p.tournament);
    if (live(t)) options.push({ at: Date.parse(t!.date_time!), running: t!.status === "in_progress", event: { kind: "tournament", title: t!.title, href: `/tournament/${t!.id}`, role: "Playing" } });
  }
  for (const n of (hosting.data ?? []) as Night[]) if (upcoming(n)) options.push({ at: Date.parse(n.starts_at!), running: false, event: { kind: "game-night", title: n.title, href: `/game-nights/${n.id}`, role: "Hosting" } });
  for (const g of (going.data ?? []) as { night: Night | Night[] | null }[]) {
    const n = one(g.night);
    if (upcoming(n)) options.push({ at: Date.parse(n!.starts_at!), running: false, event: { kind: "game-night", title: n!.title, href: `/game-nights/${n!.id}`, role: "Going" } });
  }
  if (!options.length) return null;
  // Something running now comes first, then the soonest.
  options.sort((a, b) => Number(b.running) - Number(a.running) || a.at - b.at);
  const pick = options[0];
  const when = pick.running ? "Happening now" : new Date(pick.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/, (\d)/, " · $1");
  return { ...pick.event, when };
}
