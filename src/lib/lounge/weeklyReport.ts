import "server-only";

/**
 * The Monday lounge report, server side (GS Pro, lounge night picks 2026-10-20). Every Monday at
 * 9am Pacific (/api/cron/lounge-weekly), each confirmed lounge player (lounge_links) whose
 * account has GS Pro and hasn't turned the report off (mmr_cards.weekly_report) gets an in-app
 * notification and an email about last week: per game, the MMR change, record, best night,
 * division changes and the rivals met most (from the copied tables, lounge_rivals_between).
 * A week with no events sends nothing. One report per account per week: the row in
 * lounge_weekly_reports is claimed before anything is sent, so a retried run never sends twice.
 * If MKCentral doesn't answer, that account is left for the next run instead of being claimed.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { createNotification } from "@/lib/social/notifications";
import { sendLoungeWeeklyEmail } from "@/lib/email/lounge";
import { getBaseUrl } from "@/lib/env";
import { GS_TIME_ZONE, gsAddDays, gsWeekStart, zonedInstant } from "@/lib/time/gsClock";
import { LoungeUnavailable, divisionSteps, loungePlayer } from "@/lib/mmr/mkcentral";
import { MMR_GAMES, type MmrGame } from "@/lib/mmr/rules";
import { weeklyReportOn } from "@/lib/mmr/store";
import { linksFor } from "./store";
import { loungePagePath } from "./lines";
import { weekEmail, weekNotice, weekSummary, type WeekGame, type WeekRival, type WeeklyReport } from "./weekly";

/** The Monday that starts last week: the week a Monday morning report covers. */
export const lastWeekOf = (now: number = Date.now()) => gsAddDays(gsWeekStart(now), -7);

/** The week as instants, by lounge nights: Monday 6am to the next Monday 6am, Pacific. */
export function weekWindow(weekOf: string): { from: string; to: string } {
  return {
    from: zonedInstant(weekOf, 6, 0, GS_TIME_ZONE).toISOString(),
    to: zonedInstant(gsAddDays(weekOf, 7), 6, 0, GS_TIME_ZONE).toISOString(),
  };
}

/** The opponents met most that week (none until the copied tables and lounge-night-m1 are there). */
async function rivalsBetween(game: MmrGame, playerId: number, weekOf: string): Promise<WeekRival[]> {
  const { from, to } = weekWindow(weekOf);
  const { data, error } = await createServiceClient().rpc("lounge_rivals_between", { p_game: game, p_player: playerId, p_from: from, p_to: to, p_limit: 3 });
  if (error) return [];
  return ((data ?? []) as { name: string | null; events: number; ahead: number; behind: number }[])
    .map((r) => ({ name: r.name ?? "A player", events: Number(r.events), ahead: Number(r.ahead), behind: Number(r.behind) }));
}

/** One account's report for a week: null when they played no events, "unavailable" when MKCentral didn't answer. */
export async function buildWeeklyReport(userId: string, weekOf: string): Promise<WeeklyReport | null | "unavailable"> {
  const games: WeekGame[] = [];
  for (const link of await linksFor(userId)) {
    let player;
    try {
      player = await loungePlayer({ id: link.playerId }, link.game);
    } catch (e) {
      if (!(e instanceof LoungeUnavailable)) console.error("[lounge-weekly] read:", e);
      return "unavailable";
    }
    if (!player) continue;
    const steps = await divisionSteps(link.game);
    const s = weekSummary(player.changes, steps, weekOf);
    if (!s) continue;
    games.push({
      ...s, game: link.game, label: MMR_GAMES[link.game].short, name: player.name,
      page: loungePagePath(player.name, link.game), rivals: await rivalsBetween(link.game, link.playerId, weekOf),
    });
  }
  if (!games.length) return null;
  games.sort((a, b) => b.events - a.events);
  return { weekOf, games };
}

export interface WeeklyPreview {
  userId: string;
  username: string | null;
  notice: { title: string; message: string };
  email: { subject: string; text: string };
  report: WeeklyReport;
}

export interface WeeklyRunResult {
  weekOf: string;
  accounts: number;
  sent: number;
  emails: number;
  already: number;
  notPro: number;
  off: number;
  quiet: number;
  unavailable: number;
  skipped: string | null;
  previews?: WeeklyPreview[];
}

/** Runs `fn` over `items` a few at a time (MKCentral reads, kept polite). */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Sends last week's report (or `weekOf`'s) to everyone it's for. `dry` builds the reports and
 * returns them (notification, email and data) without claiming or sending anything; `onlyUser`
 * limits the run to one account (a dry run for a test account).
 */
export async function sendWeeklyReports(opts: { weekOf?: string; dry?: boolean; onlyUser?: string | null } = {}): Promise<WeeklyRunResult> {
  const weekOf = opts.weekOf ?? lastWeekOf();
  const db = createServiceClient();
  const out: WeeklyRunResult = { weekOf, accounts: 0, sent: 0, emails: 0, already: 0, notPro: 0, off: 0, quiet: 0, unavailable: 0, skipped: null };
  if (opts.dry) out.previews = [];

  // The claim table guards against double sends: without it (migration pending) nothing goes out.
  const probe = await db.from("lounge_weekly_reports").select("user_id", { head: true, count: "exact" }).limit(1);
  if (probe.error && !opts.dry) return { ...out, skipped: "lounge_weekly_reports missing" };

  let q = db.from("lounge_links").select("user_id");
  if (opts.onlyUser) q = q.eq("user_id", opts.onlyUser);
  const { data: linkRows, error } = await q;
  if (error) return { ...out, skipped: `lounge_links: ${error.message}` };
  const users = [...new Set(((linkRows ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  out.accounts = users.length;
  if (!users.length) return out;

  const done = new Set<string>();
  if (!probe.error) {
    for (let i = 0; i < users.length; i += 200) {
      const { data } = await db.from("lounge_weekly_reports").select("user_id").eq("week_of", weekOf).in("user_id", users.slice(i, i + 200));
      for (const r of (data ?? []) as { user_id: string }[]) done.add(r.user_id);
    }
  }
  const base = getBaseUrl();

  await pool(users, 4, async (userId) => {
    if (done.has(userId) && !opts.dry) { out.already++; return; }
    if (!(await isProUser(userId, db))) { out.notPro++; return; }
    if (!(await weeklyReportOn(userId))) { out.off++; return; }
    const report = await buildWeeklyReport(userId, weekOf);
    if (report === "unavailable") { out.unavailable++; return; }
    if (!report) { out.quiet++; return; }

    const [{ data: u }, { data: dir }] = await Promise.all([
      db.from("users").select("display_name, username").eq("id", userId).maybeSingle(),
      db.from("user_directory").select("email").eq("id", userId).maybeSingle(),
    ]);
    const user = u as { display_name: string | null; username: string | null } | null;
    const name = user?.display_name || user?.username || null;
    const notice = weekNotice(report);

    if (opts.dry) {
      out.previews!.push({ userId, username: user?.username ?? null, notice, email: weekEmail(report, { name, baseUrl: base }), report });
      return;
    }

    const claim = await db.from("lounge_weekly_reports").insert({ user_id: userId, week_of: weekOf, report });
    if (claim.error) {
      if (claim.error.code === "23505") out.already++;
      else console.error("[lounge-weekly] claim:", claim.error.message);
      return;
    }
    await createNotification({
      userId, type: "lounge_weekly", title: notice.title, message: notice.message,
      link: report.games[0].page, data: { weekOf, games: report.games.map((g) => g.game) },
    }).catch((e) => console.error("[lounge-weekly] notify:", e));
    out.sent++;
    const email = (dir as { email: string | null } | null)?.email ?? null;
    if (email) {
      const res = await sendLoungeWeeklyEmail({ to: email, toName: name, report, baseUrl: base }).catch(() => ({ ok: false as const, error: "threw" }));
      if (res.ok) out.emails++;
      else console.error("[lounge-weekly] email:", res.error);
    }
  });
  return out;
}
