import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { PartyCard } from "@/data/party/cards";

/**
 * The live-night extras: the weekly community challenge, points bounties and
 * table-voted awards. Service role only (party tables are closed to browser
 * roles); every read degrades to empty before the migration is applied.
 */

/* ── Weekly challenge ────────────────────────────────────────────────────── */

export interface WeeklyRow { id: string; host_user_id: string; family: string; week_start: string; card_id: string; points: number }

/** Monday of this week (UTC), as YYYY-MM-DD. */
export function weekStart(d: Date = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}

export function weeklyRef(w: WeeklyRow): string {
  return `weekly:${w.host_user_id}:${w.family}:${w.week_start}`;
}

/** Missions that suit a weekly challenge: no {rival}, since not everyone has one at the table. */
function weeklyPool(missions: PartyCard[]): PartyCard[] {
  return missions.filter((c) => c.kind === "mission" && !c.text.includes("{rival}"));
}

/** This week's challenge for a host and deck family, picking one on first use. */
export async function ensureWeekly(hostUserId: string, family: string, missions: PartyCard[]): Promise<WeeklyRow | null> {
  const svc = createServiceClient();
  const week = weekStart();
  const { data, error } = await svc.from("party_weekly").select("*").eq("host_user_id", hostUserId).eq("family", family).eq("week_start", week).maybeSingle();
  if (error) return null;
  if (data) return data as WeeklyRow;
  const pool = weeklyPool(missions);
  if (!pool.length) return null;
  const card = pool[Math.floor(Math.random() * pool.length)];
  const ins = await svc.from("party_weekly").insert({ host_user_id: hostUserId, family, week_start: week, card_id: card.id }).select("*").single();
  if (ins.error) {
    // Someone else picked it a moment ago.
    const { data: again } = await svc.from("party_weekly").select("*").eq("host_user_id", hostUserId).eq("family", family).eq("week_start", week).maybeSingle();
    return (again as WeeklyRow | null) ?? null;
  }
  return ins.data as WeeklyRow;
}

export async function rerollWeekly(w: WeeklyRow, missions: PartyCard[]): Promise<WeeklyRow | null> {
  const pool = weeklyPool(missions).filter((c) => c.id !== w.card_id);
  if (!pool.length) return w;
  const card = pool[Math.floor(Math.random() * pool.length)];
  const { data } = await createServiceClient().from("party_weekly").update({ card_id: card.id }).eq("id", w.id).select("*").single();
  return (data as WeeklyRow | null) ?? w;
}

/** Accounts (by user id) that already finished this week's challenge. */
export async function weeklyDone(w: WeeklyRow, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data } = await createServiceClient().from("party_points").select("user_id").eq("ref", weeklyRef(w)).in("user_id", userIds);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

/* ── Bounties ────────────────────────────────────────────────────────────── */

export interface BountyRow {
  id: string; host_user_id: string; night_id: string | null; text: string; points: number; posted_by_seat: number | null;
  status: "open" | "pending" | "claimed" | "cancelled"; claimed_night: string | null; claimed_seat: number | null; claimed_user: string | null;
  confirmed_by_seat: number | null; expires_at: string | null; created_at: string;
}

/** Bounties a night can see: its own, the host's community bounties still open, and any claimed in this night. */
export async function bountiesForNight(hostUserId: string, nightId: string): Promise<BountyRow[]> {
  const { data, error } = await createServiceClient().from("party_bounties").select("*").eq("host_user_id", hostUserId)
    .or(`night_id.eq.${nightId},and(night_id.is.null,status.in.(open,pending)),claimed_night.eq.${nightId}`)
    .order("created_at").limit(100);
  if (error) return [];
  const now = Date.now();
  return ((data ?? []) as BountyRow[]).filter((b) => b.status !== "cancelled" && !(b.status === "open" && b.expires_at && Date.parse(b.expires_at) < now));
}

/* ── Awards ──────────────────────────────────────────────────────────────── */

export const AWARDS = [
  { id: "comeback", label: "Best comeback" },
  { id: "chaotic", label: "Most chaotic" },
  { id: "sport", label: "Best sport" },
] as const;
export type AwardId = (typeof AWARDS)[number]["id"];
export const AWARD_POINTS = 2;

export interface VoteRow { award: AwardId; voter_seat: number; nominee_seat: number }

export async function votesForNight(nightId: string): Promise<VoteRow[]> {
  const { data, error } = await createServiceClient().from("party_award_votes").select("award, voter_seat, nominee_seat").eq("night_id", nightId);
  return error ? [] : ((data ?? []) as VoteRow[]);
}

/** Winners per award (ties all win). */
export function tallyAwards(votes: VoteRow[]): Record<string, { seats: number[]; votes: number }> {
  const out: Record<string, { seats: number[]; votes: number }> = {};
  for (const a of AWARDS) {
    const counts = new Map<number, number>();
    for (const v of votes.filter((x) => x.award === a.id)) counts.set(v.nominee_seat, (counts.get(v.nominee_seat) ?? 0) + 1);
    const top = Math.max(0, ...counts.values());
    if (top > 0) out[a.id] = { seats: [...counts].filter(([, n]) => n === top).map(([s]) => s), votes: top };
  }
  return out;
}
