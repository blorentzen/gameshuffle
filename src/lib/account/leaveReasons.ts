/**
 * Why people leave: one reason list for deleting an account (Settings ▸ Privacy) and for cancelling
 * GS Pro, GS Circuit or monthly support (the "Before you go" window, and the reason Stripe's customer
 * portal asks). Client-safe. The keys are stored (account_deletions.reason,
 * subscription_cancellations.reason), so never rename one; change its label instead.
 */

export const LEAVE_REASONS = [
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_features", label: "Missing something I need" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "found_alternative", label: "Found something else" },
  { value: "just_testing", label: "Just trying it out" },
  { value: "other", label: "Something else" },
] as const;

export type LeaveReason = (typeof LEAVE_REASONS)[number]["value"];

export const LEAVE_REASON_LABELS: Record<LeaveReason, string> = Object.fromEntries(
  LEAVE_REASONS.map((r) => [r.value, r.label]),
) as Record<LeaveReason, string>;

/** CDS Select hides the label of a "" option, so a word stands in for "no reason given". */
export const LEAVE_NONE = "none";

/** The reason Select's options: "Prefer not to say" first, then the list. */
export const LEAVE_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: LEAVE_NONE, label: "Prefer not to say" },
  ...LEAVE_REASONS.map((r) => ({ value: r.value, label: r.label })),
];

/** The longest comment we keep (the delete form's details and the Before you go comment). */
export const LEAVE_COMMENT_MAX = 1000;

export type LeaveProduct = "pro" | "circuit" | "support";
export const LEAVE_PRODUCTS: readonly LeaveProduct[] = ["pro", "circuit", "support"];
export const LEAVE_PRODUCT_LABELS: Record<LeaveProduct, string> = { pro: "GS Pro", circuit: "GS Circuit", support: "Monthly support" };

export function isLeaveReason(value: unknown): value is LeaveReason {
  return typeof value === "string" && value in LEAVE_REASON_LABELS;
}

export function isLeaveProduct(value: unknown): value is LeaveProduct {
  return typeof value === "string" && (LEAVE_PRODUCTS as readonly string[]).includes(value);
}

/** A reason from a form: one of our keys, else null ("Prefer not to say", empty or unknown). */
export function cleanLeaveReason(value: unknown): LeaveReason | null {
  return isLeaveReason(value) ? value : null;
}

/** A comment from a form: trimmed, at most LEAVE_COMMENT_MAX characters, null when empty. */
export function cleanLeaveComment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, LEAVE_COMMENT_MAX).trim();
  return text || null;
}

/**
 * Stripe's cancellation feedback (the customer portal's reason question) as one of our reasons. Stripe's
 * values with no reason of ours (customer_service, low_quality, too_complex) read as "other"; staff still
 * see Stripe's word through stripeFeedbackWords.
 */
export const STRIPE_FEEDBACK_REASON: Record<string, LeaveReason> = {
  too_expensive: "too_expensive",
  switched_service: "found_alternative",
  unused: "not_using",
  missing_features: "missing_features",
  other: "other",
  customer_service: "other",
  low_quality: "other",
  too_complex: "other",
};

/** Stripe's feedback words that fold into "Something else", in plain words for staff. */
const STRIPE_FEEDBACK_WORDS: Record<string, string> = {
  customer_service: "customer service",
  low_quality: "quality",
  too_complex: "too complicated",
};

export function reasonFromStripe(feedback: string | null | undefined): LeaveReason | null {
  return feedback ? STRIPE_FEEDBACK_REASON[feedback] ?? "other" : null;
}

/** The plain word for a Stripe feedback value that folds into "Something else", else null. */
export function stripeFeedbackWord(feedback: string | null | undefined): string | null {
  return feedback ? STRIPE_FEEDBACK_WORDS[feedback] ?? null : null;
}

/** "Too expensive", "Something else (customer service, from Stripe)", "Not specified". */
export function leaveReasonLabel(reason: string | null | undefined, stripeFeedback?: string | null): string {
  if (isLeaveReason(reason)) return LEAVE_REASON_LABELS[reason];
  const fromStripe = reasonFromStripe(stripeFeedback);
  if (fromStripe) {
    const word = stripeFeedbackWord(stripeFeedback);
    return word ? `${LEAVE_REASON_LABELS[fromStripe]} (${word}, from Stripe)` : LEAVE_REASON_LABELS[fromStripe];
  }
  return reason ? reason : "Not specified";
}

/**
 * How a cancellation is counted: our own answer first, then Stripe's mapped onto our list. The key keeps
 * Stripe's word when it folds into "other" so the tally doesn't lose it.
 */
export function cancellationKey(reason: string | null | undefined, stripeFeedback?: string | null): string {
  if (isLeaveReason(reason)) return reason;
  const fromStripe = reasonFromStripe(stripeFeedback);
  if (!fromStripe) return "unspecified";
  return stripeFeedbackWord(stripeFeedback) ? `other:${stripeFeedback}` : fromStripe;
}

export type LeaveFeedbackInput = { product: LeaveProduct; reason: LeaveReason | null; comment: string | null; subscriptionId: string | null };

/**
 * Check a Before you go request body ({ product, reason?, comment?, subscriptionId? }). The reason is one of
 * our keys, "none" or nothing; the comment a string (trimmed and cut to LEAVE_COMMENT_MAX) or nothing.
 */
export function parseLeaveFeedback(body: unknown): { ok: true; value: LeaveFeedbackInput } | { ok: false; error: "bad_product" | "bad_reason" | "bad_comment" | "bad_subscription" } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!isLeaveProduct(b.product)) return { ok: false, error: "bad_product" };
  const reason = b.reason ?? null;
  if (reason !== null && reason !== LEAVE_NONE && !isLeaveReason(reason)) return { ok: false, error: "bad_reason" };
  const comment = b.comment ?? null;
  if (comment !== null && typeof comment !== "string") return { ok: false, error: "bad_comment" };
  const sub = b.subscriptionId ?? null;
  if (sub !== null && (typeof sub !== "string" || !/^sub_[A-Za-z0-9]{6,255}$/.test(sub))) return { ok: false, error: "bad_subscription" };
  return { ok: true, value: { product: b.product, reason: cleanLeaveReason(reason), comment: cleanLeaveComment(comment), subscriptionId: sub } };
}
