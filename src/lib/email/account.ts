/**
 * Account lifecycle transactional emails.
 *
 * Sent from the deletion / signup / password change flows to confirm
 * destructive or sensitive actions back to the user. All go through the
 * shared MailerSend client, with the dev-mode console fallback when
 * MAILERSEND_API_KEY isn't set.
 */

import { sendTransactionalEmail } from "./mailersend";

const FROM_NAME = "GameShuffle";
const SUPPORT_INBOX = "support@gameshuffle.co";

export async function sendAccountDeletedEmail({
  to,
  name,
}: {
  to: string;
  name?: string | null;
}) {
  const greetingName = name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    "",
    "Your GameShuffle account has been deleted as you requested. Here's what",
    "happened:",
    "",
    "• Your account, profile, and saved configurations were removed",
    "• Any active GameShuffle Pro subscription was cancelled (no further charges)",
    "• Your connected Twitch streamer integration was disconnected and tokens revoked",
    "• Linked sign-in providers (Discord, Twitch) were unlinked",
    "",
    "Note: tournaments you organized remain visible to participants who",
    "registered for them — your organizer reference is now blank, but their",
    "registrations are preserved.",
    "",
    "If this wasn't you, reply to this email immediately and we'll help.",
    "",
    "Thanks for trying GameShuffle.",
    "",
    "— The GameShuffle team",
    SUPPORT_INBOX,
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Your GameShuffle account has been deleted",
    text,
    fromName: FROM_NAME,
    replyTo: SUPPORT_INBOX,
  });
}
