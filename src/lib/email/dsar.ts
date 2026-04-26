/**
 * DSAR (Data Subject Access Request) transactional emails.
 *
 * Per gs-dsar-spec.md §6. Three templates:
 *  - Verification email — public form requester clicks link to confirm
 *  - Admin notification — landed in privacy@gameshuffle.co inbox
 *  - Requester confirmation — sent post-verify or on authenticated submission
 *
 * Sender: GameShuffle privacy team. Reply-to: privacy@gameshuffle.co so
 * any thread reply lands in the team inbox even when the from address is
 * the no-reply alias.
 */

import { sendTransactionalEmail } from "./mailersend";

const PRIVACY_INBOX = "privacy@gameshuffle.co";
const FROM_NAME = "GameShuffle Privacy";

export const DSAR_REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Access — get a copy of my data",
  correction: "Correction — fix incorrect information",
  deletion: "Deletion — delete my account and data",
  portability: "Portability — get my data in a portable format",
  opt_out_marketing: "Opt out of marketing emails",
  opt_out_sale: "Opt out of data sale or sharing",
  other: "Other",
};

function readableType(type: string): string {
  return DSAR_REQUEST_TYPE_LABELS[type] ?? type;
}

export async function sendDSARVerificationEmail({
  to,
  name,
  verificationUrl,
  requestType,
}: {
  to: string;
  name?: string | null;
  verificationUrl: string;
  requestType: string;
}) {
  const greetingName = name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    "",
    "We received your privacy request for GameShuffle. To confirm this request",
    "is from you, please click the link below within 7 days:",
    "",
    verificationUrl,
    "",
    `Request type: ${readableType(requestType)}`,
    "",
    "If you didn't make this request, you can safely ignore this email — no",
    "action will be taken without your confirmation.",
    "",
    "Once you verify, we'll respond within 30 days.",
    "",
    "— The GameShuffle privacy team",
    PRIVACY_INBOX,
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Verify your GameShuffle privacy request",
    text,
    fromName: FROM_NAME,
    replyTo: PRIVACY_INBOX,
  });
}

export async function sendDSARAdminNotification({
  requestId,
  requesterEmail,
  requesterName,
  requestType,
  description,
  verifiedBy,
  verifiedAt,
  responseDueAt,
  hasAccountMatch,
}: {
  requestId: string;
  requesterEmail: string;
  requesterName: string | null;
  requestType: string;
  description: string | null;
  verifiedBy: string;
  verifiedAt: Date;
  responseDueAt: Date;
  hasAccountMatch: boolean;
}) {
  const text = [
    "A privacy request has been verified and is awaiting your response.",
    "",
    `Request ID: ${requestId}`,
    `Requester: ${requesterName?.trim() || "(not provided)"}`,
    `Email: ${requesterEmail}`,
    `Account match: ${hasAccountMatch ? "Yes" : "No"}`,
    `Type: ${readableType(requestType)}`,
    `Description: ${description?.trim() || "(not provided)"}`,
    `Verified by: ${verifiedBy}`,
    `Verified at: ${verifiedAt.toISOString()}`,
    `Response due by: ${responseDueAt.toISOString()}`,
    "",
    "To process this request, query the dsar_requests table directly.",
  ].join("\n");

  return sendTransactionalEmail({
    to: PRIVACY_INBOX,
    subject: `New DSAR — ${readableType(requestType)} from ${requesterEmail}`,
    text,
    fromName: FROM_NAME,
    replyTo: requesterEmail,
  });
}

export async function sendDSARRequesterConfirmation({
  to,
  name,
  requestType,
  submittedAt,
  responseDueAt,
}: {
  to: string;
  name?: string | null;
  requestType: string;
  submittedAt: Date;
  responseDueAt: Date;
}) {
  const greetingName = name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    "",
    "We've received and confirmed your privacy request. Here's what to expect:",
    "",
    `Request type: ${readableType(requestType)}`,
    `Submitted: ${submittedAt.toDateString()}`,
    `Response by: ${responseDueAt.toDateString()}`,
    "",
    "We'll review your request and respond within 30 days as required by",
    "applicable law. If we need additional information to process your",
    "request, we'll reach out via this email address.",
    "",
    "If you have questions in the meantime, reply to this email.",
    "",
    "— The GameShuffle privacy team",
    PRIVACY_INBOX,
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: "Your GameShuffle privacy request has been received",
    text,
    fromName: FROM_NAME,
    replyTo: PRIVACY_INBOX,
  });
}
