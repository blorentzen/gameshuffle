import "server-only";
import { sendTransactionalEmail } from "./mailersend";
import { formatEventTime } from "@/lib/time/format";

/**
 * The confirmation a buyer gets the moment a ticket is paid for. It is the only
 * thing they can find later without hunting for the event again, so it carries
 * the door details, the calendar file and the refund terms they agreed to.
 * Stripe sends the payment receipt separately.
 */
export async function sendTicketConfirmationEmail(opts: {
  to: string;
  toName?: string | null;
  eventTitle: string;
  startIso: string | null;
  quantity: number;
  tierName: string;
  paidCents: number;
  eventUrl: string;
  calendarUrl: string;
  refundTerms: string;
  viewerTz?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const when = opts.startIso ? formatEventTime(opts.startIso, opts.viewerTz) : "Time to be announced";
  const paid = `$${(opts.paidCents / 100).toFixed(2)}`;
  const tickets = `${opts.quantity} x ${opts.tierName}`;
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName ?? undefined,
    subject: `Your ticket for ${opts.eventTitle}`,
    text:
      `You're in${opts.toName ? `, ${opts.toName}` : ""}.\n\n` +
      `${opts.eventTitle}\nWhen: ${when}\n\n` +
      `Tickets: ${tickets}\nPaid: ${paid}\n${opts.refundTerms}\n\n` +
      `Open your ticket (show the QR code at the door):\n${opts.eventUrl}\n\n` +
      `Add it to your calendar:\n${opts.calendarUrl}\n\n` +
      `See you there!\nGameShuffle`,
  });
}
