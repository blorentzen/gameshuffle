/**
 * GET /api/cron/tt-records (monthly, the 2nd at 15:00 UTC: 8am PDT / 7am PST)
 *
 * Compares mkwrs.com's world records with the time trial record floor (src/data/time-trials-records.ts,
 * picks 2026-10-29, 8A). When a record got faster than the floor allows, or a page can't be read,
 * emails support@ and notifies staff. Nothing changes on its own: run
 * `npx tsx scripts/pull-tt-records.ts` and ship the file.
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { MKWRS_PAGES, parseMk8dx, parseMkworld, type ParsedRecord } from "@/lib/timeTrials/recordsParse";
import { recordFor, RECORD_SLACK } from "@/lib/timeTrials/records";
import { TT_RECORDS_CHECKED } from "@/data/time-trials-records";
import { formatTime } from "@/lib/timeTrials/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

async function read(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": "GameShuffle time trials record check (gameshuffle.co)" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  return res?.ok ? res.text() : null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/tt-records] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const [dx, world] = await Promise.all([read(MKWRS_PAGES.mk8dx), read(MKWRS_PAGES.mkworld)]);
  const problems: string[] = [];
  const records: ParsedRecord[] = [];
  if (dx) records.push(...parseMk8dx(dx).records); else problems.push("Couldn't read the Mario Kart 8 Deluxe record page.");
  if (world) records.push(...parseMkworld(world).records); else problems.push("Couldn't read the Mario Kart World record page.");
  if (dx && !records.some((r) => r.game === "mk8dx")) problems.push("The Mario Kart 8 Deluxe page had no records we could read (its layout may have changed).");
  if (world && !records.some((r) => r.game === "mkworld")) problems.push("The Mario Kart World page had no records we could read (its layout may have changed).");

  // A new record beyond the slack would be refused as "faster than the world record".
  const faster = records.filter((r) => {
    const ours = recordFor(r.game, r.trackId, r.cc);
    return ours == null || r.ms < ours;
  });
  const urgent = faster.filter((r) => { const ours = recordFor(r.game, r.trackId, r.cc); return ours == null || r.ms < Math.floor(ours * (1 - RECORD_SLACK)); });
  if (!faster.length && !problems.length) return NextResponse.json({ ok: true, newer: 0 });

  const lines = faster.map((r) => {
    const ours = recordFor(r.game, r.trackId, r.cc);
    return `${r.game === "mk8dx" ? "MK8DX" : "MK World"} ${r.name} ${r.cc}cc: ${formatTime(r.ms)}${ours ? ` (ours ${formatTime(ours)})` : " (not in ours)"}`;
  });
  const summary = [...problems, faster.length ? `${faster.length} records got faster since ${TT_RECORDS_CHECKED}${urgent.length ? `, ${urgent.length} by more than the 1% slack (those runs would be refused)` : ""}:` : "", ...lines].filter(Boolean).join("\n");
  const title = urgent.length || problems.length ? "Time trial records need refreshing" : "Time trial records moved";
  await sendTransactionalEmail({
    to: "support@gameshuffle.co",
    subject: `[Time trials] ${title}`,
    text: `${summary}\n\nRun npx tsx scripts/pull-tt-records.ts and ship src/data/time-trials-records.ts.`,
    fromName: "GameShuffle",
  }).catch((e) => console.error("[cron/tt-records] email failed:", e instanceof Error ? e.message : e));
  if (urgent.length || problems.length) {
    const { data: staff } = await createServiceClient().from("users").select("id").in("role", ["staff", "admin"]);
    await Promise.all(((staff ?? []) as { id: string }[]).map((u) => createNotification({
      userId: u.id, type: "system", title, message: summary.slice(0, 500), link: "/time-trials",
    }).catch(() => undefined)));
  }
  return NextResponse.json({ ok: true, newer: faster.length, urgent: urgent.length, problems });
}
