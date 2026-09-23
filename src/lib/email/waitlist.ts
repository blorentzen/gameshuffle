import "server-only";
import { sendTransactionalEmail } from "./mailersend";
import { formatEventTime } from "@/lib/time/format";

/**
 * "A spot opened up." The most time-sensitive message the events system sends:
 * a seat came free and this person got it, so they need to know now rather than
 * whenever they next open the site.
 */
export async function sendWaitlistPromotedEmail(opts: {
  to: string;
  toName?: string | null;
  eventTitle: string;
  startIso: string | null;
  place?: string | null;
  eventUrl: string;
  needsOrganizerConfirmation: boolean;
  viewerTz?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const when = opts.startIso ? formatEventTime(opts.startIso, opts.viewerTz) : "Time to be announced";
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName ?? undefined,
    subject: `You're off the waitlist for ${opts.eventTitle}`,
    text:
      `Good news${opts.toName ? `, ${opts.toName}` : ""}. A spot opened up and it's yours.\n\n` +
      `${opts.eventTitle}\nWhen: ${when}\n${opts.place ? `Where: ${opts.place}\n` : ""}\n` +
      (opts.needsOrganizerConfirmation
        ? "You've been moved off the waitlist. The organizer will confirm your place shortly.\n\n"
        : "You're in. Nothing else to do.\n\n") +
      `Details:\n${opts.eventUrl}\n\nSee you there!\nGameShuffle`,
  });
}
