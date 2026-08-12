import "server-only";
import { sendTransactionalEmail } from "./mailersend";
import { formatEventTime } from "@/lib/time/format";

/**
 * "Your tournament is coming up" reminder email. The recipient's timezone (when
 * known) renders the start time in their zone; otherwise it falls back to the
 * platform default (Pacific + Eastern), so the time is never ambiguous.
 */
export async function sendTournamentReminderEmail(opts: {
  to: string;
  toName?: string;
  tournamentTitle: string;
  startIso: string;
  tournamentUrl: string;
  viewerTz?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const when = formatEventTime(opts.startIso, opts.viewerTz);
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName,
    subject: `Reminder: ${opts.tournamentTitle} is coming up`,
    text:
      `Heads up${opts.toName ? `, ${opts.toName}` : ""}. Your tournament is almost here.\n\n` +
      `${opts.tournamentTitle}\nStarts: ${when}\n\n` +
      `View the tournament and lobby details:\n${opts.tournamentUrl}\n\n` +
      `See you on the grid!\nGameShuffle`,
  });
}

/** The organizer moved the tournament to a new date/time. */
export async function sendTournamentRescheduledEmail(opts: {
  to: string;
  toName?: string;
  tournamentTitle: string;
  startIso: string;
  tournamentUrl: string;
  viewerTz?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const when = formatEventTime(opts.startIso, opts.viewerTz);
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName,
    subject: `Time changed: ${opts.tournamentTitle}`,
    text:
      `Heads up${opts.toName ? `, ${opts.toName}` : ""}. The organizer moved this tournament to a new time.\n\n` +
      `${opts.tournamentTitle}\nNew start: ${when}\n\n` +
      `Details:\n${opts.tournamentUrl}\n\n` +
      `GameShuffle`,
  });
}

/** The organizer cancelled the tournament. */
export async function sendTournamentCancelledEmail(opts: {
  to: string;
  toName?: string;
  tournamentTitle: string;
  tournamentUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName,
    subject: `Cancelled: ${opts.tournamentTitle}`,
    text:
      `Heads up${opts.toName ? `, ${opts.toName}` : ""}. This tournament has been cancelled by the organizer.\n\n` +
      `${opts.tournamentTitle}\n\n` +
      `${opts.tournamentUrl}\n\n` +
      `Sorry for the change of plans.\nGameShuffle`,
  });
}
