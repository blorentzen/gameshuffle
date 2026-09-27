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

/** The check-in window just opened (organizer toolkit C). */
export async function sendCheckInOpenEmail(opts: {
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
    subject: `Check-in is open: ${opts.tournamentTitle}`,
    text:
      `Check-in is open${opts.toName ? `, ${opts.toName}` : ""}.\n\n` +
      `${opts.tournamentTitle}\nStarts: ${when}\n\n` +
      `Check in before it starts so the organizer knows you're here:\n${opts.tournamentUrl}\n\n` +
      `GameShuffle`,
  });
}

/**
 * The organizer's next match or heat includes this entrant. Email is the slow
 * channel for this, so it only goes to guests, who have no in-app alerts; the
 * fast path is SMS once Twilio is live.
 */
export async function sendYoureUpEmail(opts: {
  to: string;
  toName?: string;
  tournamentTitle: string;
  raceLabel: string;
  tournamentUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName,
    subject: `You're up: ${opts.raceLabel}`,
    text:
      `You're up${opts.toName ? `, ${opts.toName}` : ""}.\n\n` +
      `${opts.tournamentTitle}\nNow racing: ${opts.raceLabel}\n\n` +
      `${opts.tournamentUrl}\n\n` +
      `GameShuffle`,
  });
}

/** One-time code proving control of the address a guest entry was saved under. */
export async function sendClaimCodeEmail(opts: {
  to: string;
  code: string;
  tournamentTitle: string;
  displayName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendTransactionalEmail({
    to: opts.to,
    subject: `Your code: ${opts.code}`,
    text:
      `Someone signed in to GameShuffle wants to link "${opts.displayName}" from ${opts.tournamentTitle} to their account.\n\n` +
      `If that's you, enter this code. It works for 10 minutes:\n\n    ${opts.code}\n\n` +
      `If it isn't you, ignore this email. Nothing is linked without the code.\n\n` +
      `GameShuffle`,
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
