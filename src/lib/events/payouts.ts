import "server-only";

import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { deliver } from "./notify";

/**
 * Payout notifications for organizers.
 *
 * Money leaving Stripe for an organizer's bank never touches GameShuffle, so a
 * Connect webhook is the only way we find out it happened — or didn't. A failed
 * payout is the one that matters: Stripe keeps the money and retries nothing
 * until the organizer fixes their bank details.
 */
export async function notifyPayout(stripeAccountId: string, payout: Stripe.Payout, failed: boolean): Promise<void> {
  const svc = createServiceClient();
  const { data: account } = await svc.from("gs_connect_accounts").select("user_id").eq("stripe_account_id", stripeAccountId).maybeSingle();
  const userId = account?.user_id as string | undefined;
  if (!userId) return;

  const { data: user } = await svc.from("users").select("display_name, username").eq("id", userId).maybeSingle();
  const amount = `$${(payout.amount / 100).toFixed(2)}`;
  const name = (user?.display_name as string | null) || (user?.username as string | null) || null;

  await deliver(
    { userId, displayName: name, email: null },
    {
      inApp: failed
        ? {
            type: "payout_failed",
            title: `Payout of ${amount} failed`,
            message: payout.failure_message ?? "Stripe couldn't send it to your bank. Check your payout details.",
            link: "/account/stuff?tab=payouts",
          }
        : {
            type: "payout_paid",
            title: `${amount} is on its way to your bank`,
            message: payout.arrival_date ? `Expected ${new Date(payout.arrival_date * 1000).toLocaleDateString()}.` : null,
            link: "/account/stuff?tab=payouts",
          },
    },
  );
}
