import "server-only";
import { sendTransactionalEmail } from "./mailersend";
import { weekEmail, type WeeklyReport } from "@/lib/lounge/weekly";

/**
 * The Monday lounge report (GS Pro, lounge night picks 2026-10-20): the week's MMR change per
 * lounge game, record, best night, division changes and the rivals met most. The words are
 * built in src/lib/lounge/weekly.ts (`weekEmail`), so the cron's dry run shows the same text.
 */
export async function sendLoungeWeeklyEmail(opts: {
  to: string;
  toName?: string | null;
  report: WeeklyReport;
  baseUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subject, text } = weekEmail(opts.report, { name: opts.toName ?? null, baseUrl: opts.baseUrl });
  return sendTransactionalEmail({ to: opts.to, toName: opts.toName ?? undefined, subject, text });
}
