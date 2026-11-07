import "server-only";
import { sendTransactionalEmail } from "./mailersend";

/**
 * A notification by email (Settings ▸ Notifications, the Email column): the same title, line and link as the bell,
 * plus where to change it. Plain text like the reminders; non-production only logs (mailersend.ts).
 */
export async function sendNotificationEmail(opts: {
  to: string;
  toName?: string | null;
  title: string;
  message?: string | null;
  url: string | null;
  /** The row in Settings ("Follows, comments and reactions"). */
  groupLabel: string;
  settingsUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendTransactionalEmail({
    to: opts.to,
    toName: opts.toName ?? undefined,
    subject: opts.title,
    text:
      `${opts.title}\n` +
      (opts.message ? `${opts.message}\n` : "") +
      (opts.url ? `\n${opts.url}\n` : "") +
      `\nYou get this because Email is on for ${opts.groupLabel} in your notification settings. Change it here:\n${opts.settingsUrl}\n\nGameShuffle`,
  });
}
