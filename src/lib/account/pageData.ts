import "server-only";

/**
 * What the account section pages need from the server (menus and account picks 2026-11-05): who's signed in, GS Pro
 * (a staff persona preview's plan when previewing), the profile timezone for event times, and whether Payouts and
 * Shop orders show. One read of the users row; the rest only when a page asks.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, hasCapability, isStaffRole, normalizeTier } from "@/lib/subscription";
import { getPlatformFlag } from "@/lib/platform/flags";
import { accountOrders } from "@/lib/store/lookup";
import { previewPro } from "@/lib/preview/server";

export interface AccountPageData {
  userId: string;
  email: string | null;
  role: string | null;
  isPro: boolean;
  /** My Cards is open to this account (free today). */
  canCollect: boolean;
  timeZone: string | null;
}

export async function accountPageData(route: string): Promise<AccountPageData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(route)}`);
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role, circuit_tier, circuit_status, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
    circuitTier: (profile?.circuit_tier as string | null) ?? null,
    circuitStatus: (profile?.circuit_status as string | null) ?? null,
  };
  return {
    userId: user.id,
    email: user.email_confirmed_at ? user.email ?? null : null,
    role: capUser.role,
    isPro: await previewPro(effectiveTier(capUser) === "pro"),
    canCollect: hasCapability(capUser, "companion.collection"),
    timeZone: (profile?.timezone as string | null) ?? null,
  };
}

/** Payouts shows once paid entry is on, or for an organizer who already has a payout account. */
export async function showPayoutsFor(userId: string): Promise<boolean> {
  if (await getPlatformFlag("paid_tickets_enabled")) return true;
  const { count, error } = await createServiceClient().from("gs_connect_accounts").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
  return !error && (count ?? 0) > 0;
}

/** Shop orders: once the shop is open, for staff, and for anyone with an order. */
export async function showShopOrdersFor(d: AccountPageData): Promise<boolean> {
  return (await getPlatformFlag("shop_open", false)) || isStaffRole(d.role)
    || (await accountOrders(d.userId, d.email).catch(() => [])).length > 0;
}
