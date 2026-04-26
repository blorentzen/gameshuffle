/**
 * Contact form transactional emails.
 *
 * Two messages per submission:
 *  - Team notification → support@gameshuffle.co (reply-to set to requester)
 *  - Auto-confirmation → requester (reply-to set to support@)
 *
 * Both go through the shared MailerSend client, so they fall back to console
 * logging in dev when MAILERSEND_API_KEY isn't set.
 */

import { sendTransactionalEmail } from "./mailersend";

const SUPPORT_INBOX = "support@gameshuffle.co";
const FROM_NAME = "GameShuffle";

export const CONTACT_TOPIC_LABELS: Record<string, string> = {
  general: "General question",
  bug: "Bug report",
  feature: "Feature request",
  account: "Account help",
  billing: "Billing or subscription",
  partnership: "Partnership or press",
  other: "Other",
};

function readableTopic(topic: string): string {
  return CONTACT_TOPIC_LABELS[topic] ?? topic;
}

export async function sendContactTeamNotification({
  name,
  email,
  topic,
  message,
  submittedAt,
  authenticatedUserId,
}: {
  name: string | null;
  email: string;
  topic: string;
  message: string;
  submittedAt: Date;
  authenticatedUserId?: string | null;
}) {
  const text = [
    "A new contact form submission has been received.",
    "",
    `From: ${name?.trim() || "(not provided)"} <${email}>`,
    `Topic: ${readableTopic(topic)}`,
    `Submitted: ${submittedAt.toISOString()}`,
    `Authenticated user: ${authenticatedUserId ?? "(anonymous)"}`,
    "",
    "Message:",
    "",
    message,
    "",
    "—",
    "Reply directly to this email to respond to the requester.",
  ].join("\n");

  return sendTransactionalEmail({
    to: SUPPORT_INBOX,
    subject: `[Contact] ${readableTopic(topic)} from ${name?.trim() || email}`,
    text,
    fromName: FROM_NAME,
    replyTo: email,
  });
}

export async function sendContactConfirmation({
  to,
  name,
  topic,
}: {
  to: string;
  name?: string | null;
  topic: string;
}) {
  const greetingName = name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    "",
    "Thanks for reaching out to GameShuffle. We've received your message and",
    `flagged it as: ${readableTopic(topic)}.`,
    "",
    "We typically respond within 1–2 business days. If you have anything to add",
    "in the meantime, just reply to this email.",
    "",
    "— The GameShuffle team",
    SUPPORT_INBOX,
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "We got your message — thanks for contacting GameShuffle",
    text,
    fromName: FROM_NAME,
    replyTo: SUPPORT_INBOX,
  });
}
