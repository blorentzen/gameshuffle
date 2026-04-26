/**
 * Email subscription categories — client-safe constants.
 *
 * Split from `subscriptions.ts` so client components (the unsubscribe page,
 * future account preferences UI, signup form) can pull labels/types
 * without dragging in the server-only `node:crypto` and Supabase service
 * role helpers that live in the full module.
 */

export type EmailCategory = "product_updates" | "tips_and_guides" | "partner_offers";

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  product_updates: "Product updates",
  tips_and_guides: "Tips & guides",
  partner_offers: "Partner offers",
};

export const EMAIL_CATEGORY_DESCRIPTIONS: Record<EmailCategory, string> = {
  product_updates: "Launch announcements, new features, and changelog highlights.",
  tips_and_guides: "Best practices, tutorials, and stream-coordination tips.",
  partner_offers: "Occasional offers from partners. Off by default.",
};

/** Categories that signup defaults ON (only product_updates — explicit opt-in). */
export const SIGNUP_DEFAULT_CATEGORIES: EmailCategory[] = ["product_updates"];

/** Full ordered list — used by validators on the API side. */
export const ALL_EMAIL_CATEGORIES: EmailCategory[] = [
  "product_updates",
  "tips_and_guides",
  "partner_offers",
];
