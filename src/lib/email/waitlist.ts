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

/**
 * "A spot opened, it's yours if you want it." An offer with a deadline, or in
 * the last stretch before the start, a standby call: first to claim gets it.
 */
export async function sendWaitlistOfferEmail(opts: {
  to: string;
  toName?: string | null;
  eventTitle: string;
  startIso: string | null;
  claimUrl: string;
  /** null = standby (first to claim gets it). */
  expiresIso: string | null;
  paid: boolean;
  viewerTz?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const when = opts.startIso ? formatEventTime(opts.startIso, opts.viewerTz) : "Time to be announced";
  const deadline = opts.expiresIso ? formatEventTime(opts.expiresIso, opts.viewerTz) : null;
  const lead = deadline
    ? `A spot opened up and it's yours if you want it. Claim it by ${deadline} or it goes to the next person in line.`
    : "A spot just opened up. The event starts soon, so it goes to the first person on the waitlist to claim it.";
  const pay = opts.paid ? " Claiming it takes you to checkout, with the ticket held for you." : "";
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName ?? undefined,
    subject: deadline ? `A spot opened for ${opts.eventTitle}` : `Open spot for ${opts.eventTitle}: first to claim`,
    text:
      `Hi${opts.toName ? ` ${opts.toName}` : ""},\n\n${lead}${pay}\n\n` +
      `${opts.eventTitle}\nWhen: ${when}\n\nClaim your spot:\n${opts.claimUrl}\n\n` +
      "Can't make it? Pass from the same page and it goes to the next person.\n\nGameShuffle",
  });
}
