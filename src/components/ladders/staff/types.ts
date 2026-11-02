/** What the staff page's API sends (src/app/api/ranked/[id]/staff/route.ts), and its tabs. */

import type { RankedRole } from "@/lib/ladders/access";
import type { DisciplineSettings } from "@/lib/ladders/discipline";
import type { TableReview } from "@/lib/ladders/review";
import type { LadderRequest, LogRow, StaffPlayer } from "@/lib/ladders/staffStore";
import type { SeasonInfo, TableStatus } from "@/lib/ladders/store";
import type { Queue } from "@/lib/ladders/queueStore";
import type { LadderKind, LadderRules, StaffSettings } from "@/lib/ladders/types";

export const STAFF_TABS = ["tables", "players", "penalties", "seasons", "settings", "log"] as const;
export type StaffTab = (typeof STAFF_TABS)[number];

export interface WaitingTable {
  id: string; number: number; format: number; tier: string | null; status: TableStatus; submittedByName: string | null; createdAt: string;
  reasons: string[]; autoAt: string | null; shotUrl: string | null; missed: number;
}

export interface StaffSettingsView { staff: StaffSettings; discipline: DisciplineSettings; rolesOn: boolean }

export interface HubData {
  you: { name: string; role: RankedRole; gsStaff: boolean };
  ladder: { id: string; slug: string; name: string; kind: LadderKind; season: number; rules: LadderRules; settings: StaffSettingsView };
  tables: { waiting: WaitingTable[]; autoToday: number };
  requests: LadderRequest[];
  discipline: { playerId: string; name: string; strikes: number; breakUntil: string | null }[];
  seasons: SeasonInfo[];
  log: LogRow[];
  /** null until ranked-m2.sql has run. */
  queues: (Queue & { range: string; waiting: number })[] | null;
  rooms: { id: string; number: number; status: "voting" | "playing"; format: number | null; players: number; host: string | null; createdAt: string }[];
}

export interface ReviewData {
  table: WaitingTable & { body: string; autoVerified: boolean; verifiedByName: string | null; note: string | null };
  review: TableReview;
  missed: { name: string; races: number }[];
}

export type { StaffPlayer, LadderRequest, LogRow };

/** One staff action; resolves to the API's answer with `ok`. */
export type Act = (body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>;

const num = (n: number) => n.toLocaleString("en-US");
export { num };

/** "just now", "4 minutes ago", "in 6 minutes", then a Pacific date. */
export function relative(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  const mins = Math.round(Math.abs(ms) / 60_000);
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const amount = mins < 1 ? null : mins < 60 ? say(mins, "minute") : mins < 24 * 60 ? say(Math.round(mins / 60), "hour") : null;
  if (amount == null && mins < 1) return ms > 0 ? "in under a minute" : "just now";
  if (amount == null) return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  return ms > 0 ? `in ${amount}` : `${amount} ago`;
}

export const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "");
