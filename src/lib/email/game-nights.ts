import "server-only";
import { sendTransactionalEmail } from "./mailersend";
import { formatEventTime } from "@/lib/time/format";

/**
 * "Your game night is coming up" reminder, sent to everyone who RSVP'd
 * going. The recipient's timezone (when known) renders the start in their zone;
 * otherwise it falls back to the platform default so the time is never ambiguous.
 */
export async function sendNightReminderEmail(opts: {
  to: string;
  toName?: string;
  nightTitle: string;
  startIso: string;
  place?: string | null;
  nightUrl: string;
  viewerTz?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const when = formatEventTime(opts.startIso, opts.viewerTz);
  const wherePlain = opts.place ? `Where: ${opts.place}\n` : "";
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName,
    subject: `Reminder: ${opts.nightTitle} is coming up`,
    text:
      `Heads up${opts.toName ? `, ${opts.toName}` : ""}. Your game night is almost here.\n\n` +
      `${opts.nightTitle}\nWhen: ${when}\n${wherePlain}\n` +
      `Details and who's coming:\n${opts.nightUrl}\n\n` +
      `See you at the table!\nGameShuffle`,
  });
}
