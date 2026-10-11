/**
 * Who runs a tournament: the host and the co-organizers, read with the
 * service client. Someone hosting a public event is named on it even when
 * their profile is private (the users table only lets others read public
 * rows); a private profile's handle stays out so the page doesn't link to a
 * /u page that won't load. Used by the organizers API and the tournament
 * page's server render.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

type OrganizerRow = { user_id: string; added_at: string };
type OrganizerUserRow = { id: string; display_name: string | null; username: string | null; avatar_url: string | null; is_public: boolean | null };

/** A private profile's handle stays out, so the page names them without linking to a /u page that won't load. */
const publicHandle = (u: { username: string | null; is_public: boolean | null } | undefined) => (u?.is_public ? u.username : null);

const HOST_COLS = "id, display_name, username, is_public, profile_accent, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar";

/**
 * Whoever runs the tournament, read with the service client: someone hosting a
 * public event is named on it even when their profile is private (the users
 * table only lets others read public rows, so a browser read came back empty
 * and the page said "by the organizer").
 */
export async function loadTournamentHost(id: string) {
  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("organizer_id").eq("id", id).maybeSingle();
  const organizerId = (t as { organizer_id: string | null } | null)?.organizer_id;
  if (!organizerId) return null;
  const { data: u } = await admin.from("users").select(HOST_COLS).eq("id", organizerId).maybeSingle();
  if (!u) return null;
  const { is_public, ...rest } = u as unknown as { username: string | null; is_public: boolean | null } & Record<string, unknown>;
  return { ...rest, username: is_public ? rest.username : null };
}

export async function loadTournamentRoster(id: string) {
  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("tournament_organizers")
    .select("user_id, added_at")
    .eq("tournament_id", id)
    .order("added_at");
  const ids = (rows ?? []).map((r) => (r as OrganizerRow).user_id);
  if (ids.length === 0) return [];
  const { data: users } = await admin
    .from("users")
    .select("id, display_name, username, avatar_url, is_public")
    .in("id", ids);
  const byId = new Map((users ?? []).map((u) => [(u as OrganizerUserRow).id, u as OrganizerUserRow]));
  return (rows ?? []).map((r) => {
    const u = byId.get((r as OrganizerRow).user_id);
    return {
      userId: (r as OrganizerRow).user_id,
      displayName: u?.display_name ?? "Member",
      username: publicHandle(u) ?? null,
      avatarUrl: u?.avatar_url ?? null,
      addedAt: (r as OrganizerRow).added_at,
    };
  });
}

/** Who runs a championship series: named either way, a handle only for a public profile, plus their timezone. */
export async function loadChampionshipOwner(id: string): Promise<{ displayName: string; username: string | null; timeZone: string | null } | null> {
  const admin = createServiceClient();
  const { data: c } = await admin.from("championships").select("owner_id").eq("id", id).maybeSingle();
  const ownerId = (c as { owner_id: string | null } | null)?.owner_id;
  if (!ownerId) return null;
  const { data: u } = await admin.from("users").select("display_name, username, is_public, timezone").eq("id", ownerId).maybeSingle();
  const row = u as { display_name: string | null; username: string | null; is_public: boolean | null; timezone: string | null } | null;
  if (!row) return null;
  return { displayName: row.display_name || row.username || "", username: row.is_public ? row.username : null, timeZone: row.timezone };
}
