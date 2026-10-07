import "server-only";

/**
 * The paid-plans waitlist for visitors outside the US. Lives in MailerLite
 * (group "Paid Plans Waitlist (International)", built-in Country field) so
 * the list doubles as the demand signal the international and localization
 * plans ask for. Outside production it logs instead of writing, so dev and
 * previews never add test addresses to the real list.
 */

import { isProduction } from "@/lib/env";
import { isMailerLiteConfigured, upsertSubscriber } from "@/lib/marketing/mailerlite";

export const ML_PAID_WAITLIST_GROUP = "200274817777141320";

export async function joinPaidPlansWaitlist(args: { email: string; name?: string | null; country: string | null; product: "pro" | "circuit"; origin: string }): Promise<boolean> {
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (!isProduction && process.env.ALLOW_NONPROD_EMAIL !== "true") {
    console.log(`[paid-waitlist] (non-prod, not sent) ${args.product} ${args.country ?? "??"} via ${args.origin}`);
    return true;
  }
  if (!isMailerLiteConfigured()) return false;
  const res = await upsertSubscriber({
    email,
    name: args.name ?? undefined,
    groups: [ML_PAID_WAITLIST_GROUP],
    fields: { country: args.country ?? undefined, origination: `paid-waitlist:${args.product}:${args.origin}` },
  });
  return res;
}
