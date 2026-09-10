/**
 * Tournament management access — who can edit a tournament, and at what level.
 *
 *   owner  — the creator (tournaments.organizer_id) or a staff/admin. Full
 *            control: settings, branding, delete, AND the co-organizer roster.
 *   editor — a co-organizer (row in tournament_organizers). Can edit the
 *            tournament + participants, but NOT delete it or change the roster.
 *   null   — no management access.
 *
 * Pure + client-safe: callers pass in the already-loaded ids. RLS is the real
 * enforcement (see supabase/tournament-coorganizers-m1.sql); this drives the UI
 * and the API gates.
 */

export type OrganizerRole = "owner" | "editor" | null;

export function resolveOrganizerRole(opts: {
  userId: string | null | undefined;
  organizerId: string | null | undefined;
  coOrganizerIds?: readonly string[] | null;
  /** Operational role — staff/admin manage any tournament as an owner. */
  role?: string | null;
}): OrganizerRole {
  const { userId, organizerId, coOrganizerIds, role } = opts;
  if (!userId) return null;
  if (userId === organizerId) return "owner";
  if (role === "staff" || role === "admin") return "owner";
  if (coOrganizerIds?.includes(userId)) return "editor";
  return null;
}

/** Any management access at all (edit the tournament). */
export function canManageTournament(role: OrganizerRole): boolean {
  return role !== null;
}

/** Owner-only powers: delete, roster management, and (paid) branding. */
export function canAdministerTournament(role: OrganizerRole): boolean {
  return role === "owner";
}
