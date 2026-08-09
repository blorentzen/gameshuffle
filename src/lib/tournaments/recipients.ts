import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A participant we can reach: in-app (userId) and/or email (account or guest),
 *  plus their timezone so times render in their zone. */
export interface TournamentRecipient {
  participantId: string;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  timezone: string | null;
}

/**
 * Everyone signed up for a tournament, with their contact + timezone resolved:
 * account participants carry email (from `user_directory`) + timezone (from
 * `users`); guest participants carry email (from `tournament_guest_claims`).
 * Used to fan out reminders and schedule-change notices. Requires a service
 * client (reads across users / the auth-joined directory).
 */
export async function getTournamentRecipients(
  admin: SupabaseClient,
  tournamentId: string,
  statuses: string[] = ["registered", "confirmed", "checked_in"],
): Promise<TournamentRecipient[]> {
  const { data: parts } = await admin
    .from("tournament_participants")
    .select("id, user_id, display_name, status")
    .eq("tournament_id", tournamentId)
    .in("status", statuses);
  const participants = parts ?? [];

  const userIds = [...new Set(participants.filter((p) => p.user_id).map((p) => p.user_id as string))];
  const emailById = new Map<string, string>();
  const tzById = new Map<string, string | null>();
  if (userIds.length) {
    const [{ data: dir }, { data: us }] = await Promise.all([
      admin.from("user_directory").select("id, email").in("id", userIds),
      admin.from("users").select("id, timezone").in("id", userIds),
    ]);
    for (const r of dir ?? []) if (r.email) emailById.set(r.id, r.email as string);
    for (const r of us ?? []) tzById.set(r.id, (r.timezone as string | null) ?? null);
  }

  const guestPartIds = participants.filter((p) => !p.user_id).map((p) => p.id);
  const guestEmailByPart = new Map<string, string>();
  if (guestPartIds.length) {
    const { data: claims } = await admin
      .from("tournament_guest_claims")
      .select("participant_id, email")
      .in("participant_id", guestPartIds);
    for (const c of claims ?? []) if (c.email) guestEmailByPart.set(c.participant_id, c.email as string);
  }

  return participants.map((p) => ({
    participantId: p.id,
    userId: p.user_id ?? null,
    displayName: p.display_name ?? null,
    email: p.user_id ? emailById.get(p.user_id) ?? null : guestEmailByPart.get(p.id) ?? null,
    timezone: p.user_id ? tzById.get(p.user_id) ?? null : null,
  }));
}
