/**
 * Server-side tournament management gate. Resolves an authed user's role
 * (owner | editor | null) against a tournament, consulting the co-organizer
 * roster and the operational role (staff/admin manage as owner). Used by the
 * tournament API routes so co-organizers can act alongside the owner while
 * owner-only powers (delete, cancel, roster) stay locked down.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrganizerRole, type OrganizerRole } from "@/lib/tournaments/access";

export async function getTournamentRole(
  admin: SupabaseClient,
  tournamentId: string,
  userId: string,
): Promise<OrganizerRole> {
  const { data: t } = await admin
    .from("tournaments")
    .select("organizer_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return null;
  const organizerId = (t as { organizer_id: string }).organizer_id;
  if (organizerId === userId) return "owner";

  const [{ data: me }, { data: co }] = await Promise.all([
    admin.from("users").select("role").eq("id", userId).maybeSingle(),
    admin.from("tournament_organizers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", userId).maybeSingle(),
  ]);
  return resolveOrganizerRole({
    userId,
    organizerId,
    coOrganizerIds: co ? [userId] : [],
    role: (me as { role: string | null } | null)?.role ?? null,
  });
}
