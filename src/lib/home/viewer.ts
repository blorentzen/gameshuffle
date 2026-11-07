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
import { getGameName } from "@/data/game-registry";

export interface NextEvent {
  kind: "tournament" | "game-night";
  title: string;
  href: string;
  /** "Hosting" or "Playing" / "Going". */
  role: string;
  /** When, in the visitor's timezone ("Sat, Oct 18 · 7:00 PM"), or "Happening now". */
  when: string;
  /** Start time (ms) and whether it's on now, for the home's ticket and "starts in 3 hours". */
  at: number | null;
  running: boolean;
  /** "12 of 16 signed up · Mario Kart 8 Deluxe" (tournaments), "8 going" (game nights). */
  line: string | null;
  /** Its own cover picture, else the game's box art draws the ticket. */
  cover: string | null;
  gameSlug: string | null;
  gameName: string | null;
}

export interface HomeViewer { userId: string; pro: boolean; circuit: boolean; trialUsed: boolean; supporter: boolean; next: NextEvent | null; role: string | null }

/** Tournaments still running count as now for a few hours after their start. */
const RUNNING_GRACE_MS = 6 * 3_600_000;

type Tour = { id: string; title: string; status: string; date_time: string | null; archived_at: string | null; game_slug?: string | null; header_image_url?: string | null; max_participants?: number | null };
type Night = { id: string; title: string; status: string; starts_at: string | null; archived_at: string | null; cover_image_url?: string | null; games?: unknown };
const TOUR_COLS = "id, title, status, date_time, archived_at, game_slug, header_image_url, max_participants";
const NIGHT_COLS = "id, title, status, starts_at, archived_at, cover_image_url, games";

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
  return { userId: user.id, pro, circuit, trialUsed: !!r.has_used_trial, supporter, next, role: r.role ?? null };
}

async function nextEvent(userId: string, tz: string): Promise<NextEvent | null> {
  const admin = createServiceClient();
  const now = Date.now();
  const since = new Date(now - RUNNING_GRACE_MS).toISOString();
  const [organized, joined, hosting, going] = await Promise.all([
    admin.from("tournaments").select(TOUR_COLS).eq("organizer_id", userId).in("status", ["open", "in_progress"]).is("archived_at", null).gte("date_time", since).order("date_time").limit(3),
    admin.from("tournament_participants").select(`tournament:tournaments(${TOUR_COLS})`).eq("user_id", userId).neq("status", "dropped").limit(50),
    admin.from("board_game_nights").select(NIGHT_COLS).eq("host_id", userId).eq("status", "scheduled").is("archived_at", null).gte("starts_at", new Date(now).toISOString()).order("starts_at").limit(3),
    admin.from("board_game_night_rsvps").select(`night:board_game_nights(${NIGHT_COLS})`).eq("user_id", userId).eq("status", "going").limit(50),
  ]);
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const live = (t: Tour | null) => !!t && ["open", "in_progress"].includes(t.status) && !t.archived_at && !!t.date_time && (t.status === "in_progress" || Date.parse(t.date_time) >= now - RUNNING_GRACE_MS);
  const upcoming = (n: Night | null) => !!n && n.status === "scheduled" && !n.archived_at && !!n.starts_at && Date.parse(n.starts_at) >= now;

  type Art = Pick<NextEvent, "cover" | "gameSlug" | "gameName">;
  const tourArt = (t: Tour): Art => ({ cover: t.header_image_url ?? null, gameSlug: t.game_slug ?? null, gameName: t.game_slug ? getGameName(t.game_slug) : null });
  // A game night's games are names (or { name } objects); the first one draws the ticket.
  const nightArt = (n: Night): Art => {
    const g = Array.isArray(n.games) ? n.games[0] : null;
    const name = typeof g === "string" ? g : g && typeof g === "object" && typeof (g as { name?: unknown }).name === "string" ? (g as { name: string }).name : null;
    return { cover: n.cover_image_url ?? null, gameSlug: null, gameName: name };
  };
  const options: { at: number; event: Omit<NextEvent, "when" | "at" | "running" | "line">; running: boolean; id: string; max: number | null }[] = [];
  for (const t of (organized.data ?? []) as Tour[]) if (live(t)) options.push({ id: t.id, max: t.max_participants ?? null, at: Date.parse(t.date_time!), running: t.status === "in_progress", event: { kind: "tournament", title: t.title, href: `/tournament/${t.id}`, role: "Hosting", ...tourArt(t) } });
  for (const p of (joined.data ?? []) as { tournament: Tour | Tour[] | null }[]) {
    const t = one(p.tournament);
    if (live(t)) options.push({ id: t!.id, max: t!.max_participants ?? null, at: Date.parse(t!.date_time!), running: t!.status === "in_progress", event: { kind: "tournament", title: t!.title, href: `/tournament/${t!.id}`, role: "Playing", ...tourArt(t!) } });
  }
  for (const n of (hosting.data ?? []) as Night[]) if (upcoming(n)) options.push({ id: n.id, max: null, at: Date.parse(n.starts_at!), running: false, event: { kind: "game-night", title: n.title, href: `/game-nights/${n.id}`, role: "Hosting", ...nightArt(n) } });
  for (const g of (going.data ?? []) as { night: Night | Night[] | null }[]) {
    const n = one(g.night);
    if (upcoming(n)) options.push({ id: n!.id, max: null, at: Date.parse(n!.starts_at!), running: false, event: { kind: "game-night", title: n!.title, href: `/game-nights/${n!.id}`, role: "Going", ...nightArt(n!) } });
  }
  if (!options.length) return null;
  // Something running now comes first, then the soonest.
  options.sort((a, b) => Number(b.running) - Number(a.running) || a.at - b.at);
  const pick = options[0];
  const when = pick.running ? "Happening now" : new Date(pick.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/, (\d)/, " · $1");
  // How many are in: signed up for a tournament, going to a game night.
  const count = pick.event.kind === "tournament"
    ? await admin.from("tournament_participants").select("id", { count: "exact", head: true }).eq("tournament_id", pick.id).neq("status", "dropped").then((r) => r.count ?? 0, () => null)
    : await admin.from("board_game_night_rsvps").select("night_id", { count: "exact", head: true }).eq("night_id", pick.id).eq("status", "going").then((r) => r.count ?? 0, () => null);
  const countLine = count == null ? null : pick.event.kind === "tournament" ? (pick.max ? `${count} of ${pick.max} signed up` : `${count} signed up`) : `${count} going`;
  const line = [countLine, pick.event.gameName].filter(Boolean).join(" · ") || null;
  return { ...pick.event, when, at: pick.at, running: pick.running, line };
}
