import "server-only";

/**
 * Chat Brain at the table (a live night's activity and the one-phone tool) is
 * staff-only until Chat Brain launches. Chat Brain's launch is the moment
 * public boards reach LAUNCH_BOARDS (brainProgress, the bar on /chat-brain);
 * there's no switch. Before then a staff or admin account can open it, so it
 * can be tried on dev (where community test boards count) and in production.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { LAUNCH_BOARDS } from "./rules";
import { brainProgress } from "./store";

/** Public boards have reached the launch goal. */
export async function brainLaunched(): Promise<boolean> {
  const p = await brainProgress().catch(() => null);
  return !!p && p.boards >= LAUNCH_BOARDS;
}

/** Whether this account may run Chat Brain at the table: anyone once Chat Brain launches, staff before. */
export async function brainTableOpenFor(userId: string | null): Promise<boolean> {
  if (await brainLaunched()) return true;
  if (!userId) return false;
  const { data } = await createServiceClient().from("users").select("role").eq("id", userId).maybeSingle();
  return isStaffRole((data as { role: string | null } | null)?.role ?? null);
}
