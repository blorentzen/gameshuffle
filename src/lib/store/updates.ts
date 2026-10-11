import "server-only";

/**
 * "Email me when the packs go live": the Coming soon page's signup, a
 * MailerLite group like the Chat Brain and paid-plans lists. Outside
 * production it logs instead of writing, so dev and previews never add test
 * addresses to the real list.
 *
 * ML_SHOP_GROUP is the group id from MailerLite (config, not a secret). Until
 * it's set, production hides the signup and the page just says check back.
 */

import { isProduction } from "@/lib/env";
import { isMailerLiteConfigured, upsertSubscriber } from "@/lib/marketing/mailerlite";

export const ML_SHOP_GROUP: string | null = "200869331232359825"; // "Shop Launch"

export function shopUpdatesConfigured(): boolean {
  if (!isProduction) return true;
  return !!ML_SHOP_GROUP && isMailerLiteConfigured();
}

export async function joinShopUpdates(args: { email: string; name?: string | null; origin: string }): Promise<boolean> {
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (!isProduction && process.env.ALLOW_NONPROD_EMAIL !== "true") {
    console.log(`[shop-updates] (non-prod, not sent) via ${args.origin}`);
    return true;
  }
  if (!ML_SHOP_GROUP || !isMailerLiteConfigured()) return false;
  return upsertSubscriber({
    email,
    name: args.name ?? undefined,
    groups: [ML_SHOP_GROUP],
    fields: { origination: `shop-updates:${args.origin}` },
  });
}
