"use server";

/**
 * Submit beta feedback. The handler:
 *   1. Validates the payload shape (category + message length).
 *   2. Re-checks beta mode so the form can't be submitted when the
 *      surface is supposed to be off.
 *   3. Looks up the authenticated user (if any) for the from-line +
 *      reply-to fallback.
 *   4. Routes the email via `sendCompanionFeedbackEmail`.
 *
 * No DB write — the user opted for email-only persistence.
 */

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { feedbackInbox, isBetaModeOn } from "@/lib/companion/beta";
import {
  COMPANION_FEEDBACK_CATEGORIES,
  sendCompanionFeedbackEmail,
  type CompanionFeedbackCategory,
} from "@/lib/email/companion-feedback";

const MAX_MESSAGE_LENGTH = 2000;
// RFC 5321 allows up to 254 chars; we cap to 254 for safety.
const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubmitCompanionFeedbackInput {
  category: string;
  message: string;
  /** Optional contact email — used by guests who want a reply.
   *  Auth users have an email on file; the client suppresses this
   *  field for them but we still accept it as a override. */
  contactEmail?: string | null;
  /** Path the form was opened from, so triage can see which surface
   *  the tester was on. Sent by the client. */
  path?: string | null;
}

export interface SubmitCompanionFeedbackResult {
  ok: boolean;
  reason?: string;
}

function isCategory(v: string): v is CompanionFeedbackCategory {
  return (COMPANION_FEEDBACK_CATEGORIES as readonly string[]).includes(v);
}

export async function submitCompanionFeedbackAction(
  input: SubmitCompanionFeedbackInput,
): Promise<SubmitCompanionFeedbackResult> {
  if (!isBetaModeOn()) return { ok: false, reason: "beta_off" };

  // ---- payload shape ----
  const category = (input.category ?? "").trim();
  if (!isCategory(category)) return { ok: false, reason: "invalid_category" };

  const message = (input.message ?? "").trim();
  if (message.length === 0) return { ok: false, reason: "empty_message" };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: "message_too_long" };
  }

  const contactEmail = (input.contactEmail ?? "").trim();
  if (contactEmail.length > 0) {
    if (contactEmail.length > MAX_EMAIL_LENGTH) {
      return { ok: false, reason: "email_too_long" };
    }
    if (!EMAIL_REGEX.test(contactEmail)) {
      return { ok: false, reason: "invalid_email" };
    }
  }

  // ---- viewer ----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerKind: "auth" | "guest" = user ? "auth" : "guest";
  const viewerEmail = user?.email ?? null;
  const viewerUserId = user?.id ?? null;
  const viewerDisplayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    null;

  // ---- request context ----
  const h = await headers();
  const userAgent = h.get("user-agent");

  // ---- send ----
  const result = await sendCompanionFeedbackEmail({
    to: feedbackInbox(),
    category,
    message,
    viewerKind,
    viewerEmail,
    viewerUserId,
    viewerDisplayName,
    contactEmail: contactEmail.length > 0 ? contactEmail : null,
    path: input.path?.trim() || null,
    userAgent,
    submittedAt: new Date(),
  });

  if (!result.ok) return { ok: false, reason: result.error };
  return { ok: true };
}
