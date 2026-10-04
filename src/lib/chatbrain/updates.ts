import "server-only";

/**
 * "Email me when Chat Brain opens": a MailerLite group, the same pattern as the
 * paid-plans waitlist. Outside production it logs instead of writing, so dev
 * and previews never add test addresses to the real list.
 *
 * ML_CHAT_BRAIN_GROUP is the group id from MailerLite (config, not a secret).
 * Until it's set, production hides the email form and shows only the
 * create-an-account option.
 */

import { isProduction } from "@/lib/env";
import { isMailerLiteConfigured, upsertSubscriber } from "@/lib/marketing/mailerlite";

export const ML_CHAT_BRAIN_GROUP: string | null = null;

export function updatesConfigured(): boolean {
  if (!isProduction) return true;
  return !!ML_CHAT_BRAIN_GROUP && isMailerLiteConfigured();
}

export async function joinChatBrainUpdates(args: { email: string; name?: string | null; origin: string }): Promise<boolean> {
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (!isProduction && process.env.ALLOW_NONPROD_EMAIL !== "true") {
    console.log(`[chat-brain-updates] (non-prod, not sent) via ${args.origin}`);
    return true;
  }
  if (!ML_CHAT_BRAIN_GROUP || !isMailerLiteConfigured()) return false;
  return upsertSubscriber({
    email,
    name: args.name ?? undefined,
    groups: [ML_CHAT_BRAIN_GROUP],
    fields: { origination: `chat-brain-updates:${args.origin}` },
  });
}
