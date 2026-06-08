/**
 * Companion beta feedback — transactional email.
 *
 * One outbound email per submission, routed to the configured
 * inbox (`COMPANION_FEEDBACK_EMAIL` or `support@gameshuffle.co`
 * fallback). Reply-to is wired so the recipient can hit Reply and
 * land on the right person:
 *   - Authenticated viewers: their account email
 *   - Guests who left a contact email: that email
 *   - Anonymous guests: omitted; reply just goes back to support
 */

import { sendTransactionalEmail } from "./mailersend";

export const COMPANION_FEEDBACK_CATEGORIES = [
  "bug",
  "idea",
  "confusion",
  "other",
] as const;
export type CompanionFeedbackCategory =
  (typeof COMPANION_FEEDBACK_CATEGORIES)[number];

const CATEGORY_LABELS: Record<CompanionFeedbackCategory, string> = {
  bug: "Bug report",
  idea: "Idea / feature request",
  confusion: "Confusing / unclear",
  other: "Other",
};

interface SendArgs {
  to: string;
  category: CompanionFeedbackCategory;
  message: string;
  viewerKind: "auth" | "guest";
  viewerEmail: string | null;
  viewerUserId: string | null;
  viewerDisplayName: string | null;
  contactEmail: string | null;
  path: string | null;
  userAgent: string | null;
  submittedAt: Date;
}

export function readableCompanionFeedbackCategory(
  category: CompanionFeedbackCategory,
): string {
  return CATEGORY_LABELS[category];
}

/** Pick the most-specific reply-to email available, or null. */
function bestReplyTo(args: Pick<SendArgs, "viewerKind" | "viewerEmail" | "contactEmail">):
  | string
  | null {
  if (args.viewerKind === "auth" && args.viewerEmail) return args.viewerEmail;
  if (args.contactEmail) return args.contactEmail;
  return null;
}

export async function sendCompanionFeedbackEmail(args: SendArgs) {
  const replyTo = bestReplyTo(args);
  const fromLine =
    args.viewerKind === "auth"
      ? `${args.viewerDisplayName?.trim() || "(no display name)"} <${args.viewerEmail ?? "(no email)"}>`
      : args.contactEmail
        ? `Guest <${args.contactEmail}>`
        : "Guest (anonymous)";

  const text = [
    "A new TCG Companion beta feedback submission has been received.",
    "",
    `From: ${fromLine}`,
    `Category: ${readableCompanionFeedbackCategory(args.category)}`,
    `Submitted: ${args.submittedAt.toISOString()}`,
    `Viewer: ${args.viewerKind}`,
    args.viewerUserId ? `User ID: ${args.viewerUserId}` : null,
    args.path ? `Page: ${args.path}` : null,
    args.userAgent ? `User-Agent: ${args.userAgent}` : null,
    "",
    "Message:",
    "",
    args.message,
    "",
    "—",
    replyTo
      ? "Reply directly to this email to respond."
      : "No reply address provided.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return sendTransactionalEmail({
    to: args.to,
    subject: `[Companion beta] ${readableCompanionFeedbackCategory(args.category)} — ${fromLine}`,
    text,
    fromName: "GameShuffle Companion",
    ...(replyTo ? { replyTo } : {}),
  });
}
