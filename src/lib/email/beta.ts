/**
 * Streamer Beta program transactional emails.
 *
 * Two messages per application:
 *  - Team notification → support@gameshuffle.co (reply-to set to the applicant)
 *  - Auto-confirmation → applicant (reply-to set to support@)
 *
 * Both go through the shared MailerSend client, so they fall back to console
 * logging in dev when MAILERSEND_API_KEY isn't set.
 */

import { sendTransactionalEmail } from "./mailersend";

const SUPPORT_INBOX = "support@gameshuffle.co";
const FROM_NAME = "GameShuffle";

export const BETA_PLATFORM_LABELS: Record<string, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
  other: "Other / multiple",
};

export const BETA_SIZE_LABELS: Record<string, string> = {
  starting: "Just getting started",
  under_100: "Under 100 avg viewers",
  "100_500": "100 to 500 avg viewers",
  "500_2k": "500 to 2,000 avg viewers",
  over_2k: "2,000+ avg viewers",
};

function label(map: Record<string, string>, key: string | null): string {
  if (!key) return "(not provided)";
  return map[key] ?? key;
}

export async function sendBetaTeamNotification({
  name,
  email,
  platform,
  channelUrl,
  communitySize,
  about,
  submittedAt,
  authenticatedUserId,
}: {
  name: string | null;
  email: string;
  platform: string | null;
  channelUrl: string | null;
  communitySize: string | null;
  about: string | null;
  submittedAt: Date;
  authenticatedUserId?: string | null;
}) {
  const text = [
    "A new Streamer Beta application has been received.",
    "",
    `From: ${name?.trim() || "(not provided)"} <${email}>`,
    `Platform: ${label(BETA_PLATFORM_LABELS, platform)}`,
    `Channel: ${channelUrl?.trim() || "(not provided)"}`,
    `Community size: ${label(BETA_SIZE_LABELS, communitySize)}`,
    `Submitted: ${submittedAt.toISOString()}`,
    `Authenticated user: ${authenticatedUserId ?? "(anonymous)"}`,
    "",
    "What they stream / why they're interested:",
    "",
    about?.trim() || "(not provided)",
    "",
    "---",
    "Reply directly to this email to reach the applicant.",
  ].join("\n");

  return sendTransactionalEmail({
    to: SUPPORT_INBOX,
    subject: `[Beta] ${name?.trim() || email} wants in (${label(BETA_PLATFORM_LABELS, platform)})`,
    text,
    fromName: FROM_NAME,
    replyTo: email,
  });
}

export async function sendBetaConfirmation({
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
    "Thanks for your interest in the GameShuffle Streamer Beta. We've received your",
    "application and the team will review it shortly.",
    "",
    "If you're a fit, we'll reach out with your invite and get you set up with Pro",
    "access for the beta. In the meantime, feel free to reply to this email with",
    "anything you'd like us to know about your channel.",
    "",
    "Talk soon,",
    "The GameShuffle team",
    SUPPORT_INBOX,
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Your GameShuffle Streamer Beta application",
    text,
    fromName: FROM_NAME,
    replyTo: SUPPORT_INBOX,
  });
}
