/**
 * Community visibility flag. The community platform (feed / discovery / game
 * nights) is still in development, so it's hidden from regular users.
 *
 * - `NEXT_PUBLIC_COMMUNITY_ENABLED === "true"` → live for everyone.
 * - Otherwise → visible only to staff/admin, so the team can keep iterating in
 *   prod without exposing it. Flip the env var to launch.
 *
 * Client-safe (the const is inlined at build; `isStaffRole` is a pure helper),
 * so the navbar can import it too.
 */

import { isStaffRole } from "@/lib/subscription";

export const COMMUNITY_PUBLICLY_ENABLED =
  process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === "true";

/** Whether a viewer (by role) may see the community surfaces. */
export function canSeeCommunity(role: string | null | undefined): boolean {
  return COMMUNITY_PUBLICLY_ENABLED || isStaffRole(role);
}
