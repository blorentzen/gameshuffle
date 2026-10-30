import "server-only";

/**
 * Supporter looks (picks 2026-10-29, https://claude.ai/artifact/TPhBuiHQDNXsSpFV6Qzcjz): who may use
 * the looks GS Pro used to hold alone. GS Pro (and staff and beta) always; a live Supporter, Backer or
 * Champion subscription sold with looks too. The $3 Supporter level sells looks by default (Britton,
 * 2026-10-29: the lowest way in, and the accountant's yes); the switch support_supporter_looks is a way
 * for staff to stop that without a deploy. A subscription bought with looks keeps them even if the switch
 * goes off later.
 *
 * "Looks" are how things look: MMR card looks, profile and community skins, brand themes, custom CSS,
 * dice and coin looks. What things do (streamer and Discord tools, AI, the MMR card's goal, recap and
 * following the Twitch game) stays GS Pro.
 */

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isProUser } from "@/lib/subscription-server";

export const SUPPORTER_LOOKS_FLAG = "support_supporter_looks";
const LIVE = ["trialing", "active", "past_due"];

/** Whether the $3 Supporter level sells looks right now: on unless staff turned the switch off. */
export function supporterLooksOn(): Promise<boolean> {
  return getPlatformFlag(SUPPORTER_LOOKS_FLAG, true);
}

/**
 * A live support subscription sold with looks (any level with GS Pro counts). Before support-m4.sql adds
 * the looks column, it goes by level: Backer and Champion always, Supporter while the switch is on, so a
 * $3 checkout made before the column exists still gets its looks.
 */
export async function supportLooksGrant(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db.from("support_subscriptions").select("stripe_subscription_id")
    .eq("user_id", userId).in("status", LIVE).eq("looks", true).limit(1);
  if (!error) return !!data?.length;
  const { data: rows, error: e2 } = await db.from("support_subscriptions").select("level")
    .eq("user_id", userId).in("status", LIVE).in("level", ["supporter", "backer", "champion"]);
  if (e2 || !rows?.length) return false;
  if (rows.some((r) => r.level === "backer" || r.level === "champion")) return true;
  return supporterLooksOn();
}

/** Whether someone may use (and show) looks: GS Pro, or support sold with looks. */
export async function hasLooks(userId: string): Promise<boolean> {
  if (await isProUser(userId)) return true;
  return supportLooksGrant(userId);
}

/** The same, once per request for a page owner (profiles, communities, overlays). */
export const ownerHasLooks = cache((userId: string): Promise<boolean> => hasLooks(userId));
