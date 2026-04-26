/**
 * Policy update email blast.
 *
 * Sent at the start of the 30-day notice window when ToS, Privacy Policy,
 * or Cookie Policy changes materially. Per the policy commitments in each
 * doc:
 *
 *   "We will notify users of material changes by email at least 30 days
 *   before the changes take effect."
 *
 * Recipients = every confirmed account email (auth.users.email_confirmed_at
 * is non-null). Marketing opt-in does NOT gate this — it's a contractual
 * notice, not marketing.
 *
 * Companion piece to <PolicyUpdateBanner> which handles the in-product
 * surface during the same window.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "./mailersend";

const FROM_NAME = "GameShuffle";
const SUPPORT_INBOX = "support@gameshuffle.co";
const PRIVACY_INBOX = "privacy@gameshuffle.co";

export type PolicyDocSlug = "privacy" | "terms" | "cookie-policy";

const DOC_LABELS: Record<PolicyDocSlug, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  "cookie-policy": "Cookie Policy",
};

const DOC_URLS: Record<PolicyDocSlug, string> = {
  privacy: "https://gameshuffle.co/privacy",
  terms: "https://gameshuffle.co/terms",
  "cookie-policy": "https://gameshuffle.co/cookie-policy",
};

interface BlastResult {
  totalRecipients: number;
  sent: number;
  failed: number;
  failedEmails: string[];
}

/**
 * Send the policy-update notice to one recipient. Reusable by the API
 * route + the CLI script.
 */
export async function sendPolicyUpdateNoticeTo({
  to,
  name,
  doc,
  effectiveDate,
  summary,
}: {
  to: string;
  name?: string | null;
  doc: PolicyDocSlug;
  /** When the change takes effect — must be at least 30 days out. */
  effectiveDate: Date;
  /** 1–3 sentence plain-language summary of what's changing. */
  summary: string;
}) {
  const greetingName = name?.trim() || "there";
  const docLabel = DOC_LABELS[doc];
  const docUrl = DOC_URLS[doc];
  const formatted = effectiveDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const text = [
    `Hi ${greetingName},`,
    "",
    `We're updating our ${docLabel}. The new version takes effect on`,
    `${formatted}.`,
    "",
    "What's changing:",
    summary,
    "",
    `Read the full update: ${docUrl}`,
    "",
    "If you don't agree with the new terms, you can delete your account",
    "from your account settings before the effective date and your data",
    "will be removed.",
    "",
    "Continued use of GameShuffle after the effective date constitutes",
    "your acceptance of the updated terms.",
    "",
    "Questions? Reply to this email or write to",
    PRIVACY_INBOX + ".",
    "",
    "— The GameShuffle team",
  ].join("\n");

  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: `We're updating our ${docLabel} — takes effect ${formatted}`,
    text,
    fromName: FROM_NAME,
    replyTo: PRIVACY_INBOX,
  });
}

/**
 * Send the notice to every confirmed-account email. Designed to be called
 * once per policy update at the start of the 30-day window.
 *
 * Sends serially with a small delay so MailerSend's per-second rate limit
 * doesn't trip on a thousand-recipient blast.
 */
export async function sendPolicyUpdateBlast({
  doc,
  effectiveDate,
  summary,
  delayMs = 60,
  dryRun = false,
}: {
  doc: PolicyDocSlug;
  effectiveDate: Date;
  summary: string;
  delayMs?: number;
  dryRun?: boolean;
}): Promise<BlastResult> {
  // Sanity-check the 30-day notice commitment up front. Anyone calling
  // this with < 30 days notice is doing something wrong.
  const daysOut = Math.floor((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysOut < 30) {
    throw new Error(
      `Policy-update blast requires at least 30 days notice (got ${daysOut} days). ` +
        "If this is a security update, bug fix, or court-ordered change, send manually instead — those are exempt per the policy."
    );
  }

  const admin = createServiceClient();

  // Pull every confirmed account. Page through Supabase's auth.admin.listUsers
  // 1000 at a time (Supabase caps perPage at 1000).
  const recipients: Array<{ email: string; userId: string; name: string | null }> = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if (!u.email || !u.email_confirmed_at) continue;
      recipients.push({ email: u.email, userId: u.id, name: null });
    }
    if (users.length < 1000) break;
    page++;
  }

  // Backfill display names from public.users
  if (recipients.length > 0) {
    const { data: profileRows } = await admin
      .from("users")
      .select("id, display_name")
      .in("id", recipients.map((r) => r.userId));
    const nameById = new Map<string, string>();
    for (const row of profileRows ?? []) {
      if (row.display_name) nameById.set(row.id as string, row.display_name as string);
    }
    for (const r of recipients) {
      r.name = nameById.get(r.userId) ?? null;
    }
  }

  const result: BlastResult = {
    totalRecipients: recipients.length,
    sent: 0,
    failed: 0,
    failedEmails: [],
  };

  if (dryRun) {
    console.log(`[policy-update] DRY RUN — would send to ${recipients.length} recipients`);
    return result;
  }

  for (const r of recipients) {
    const send = await sendPolicyUpdateNoticeTo({
      to: r.email,
      name: r.name,
      doc,
      effectiveDate,
      summary,
    });
    if (send.ok) {
      result.sent++;
    } else {
      result.failed++;
      result.failedEmails.push(r.email);
    }
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}
