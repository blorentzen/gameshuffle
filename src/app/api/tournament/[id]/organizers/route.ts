/**
 * GET    /api/tournament/[id]/organizers  → the host and co-organizers (public)
 * POST   /api/tournament/[id]/organizers  → add one by GS username (owner only)
 * DELETE /api/tournament/[id]/organizers?userId=... → remove one (owner only)
 *
 * Co-organizers (GS Circuit team access) share edit rights on the tournament.
 * The roster is owner-managed; RLS lets a co-organizer edit but not touch the
 * roster (see supabase/tournament-coorganizers-m1.sql). All writes go through
 * the service client after an explicit owner check.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { tournamentHasFeature } from "@/lib/tournaments/circuit-resolve";

export const runtime = "nodejs";

type OrganizerRow = { user_id: string; added_at: string };
type UserRow = { id: string; display_name: string | null; username: string | null; avatar_url: string | null; is_public: boolean | null };

/** A private profile's handle stays out, so the page names them without linking to a /u page that won't load. */
const publicHandle = (u: { username: string | null; is_public: boolean | null } | undefined) => (u?.is_public ? u.username : null);

const HOST_COLS = "id, display_name, username, is_public, profile_accent, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar";

/**
 * Whoever runs the tournament, read with the service client: someone hosting a
 * public event is named on it even when their profile is private (the users
 * table only lets others read public rows, so a browser read came back empty
 * and the page said "by the organizer").
 */
async function loadHost(id: string) {
  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("organizer_id").eq("id", id).maybeSingle();
  const organizerId = (t as { organizer_id: string | null } | null)?.organizer_id;
  if (!organizerId) return null;
  const { data: u } = await admin.from("users").select(HOST_COLS).eq("id", organizerId).maybeSingle();
  if (!u) return null;
  const { is_public, ...rest } = u as unknown as { username: string | null; is_public: boolean | null } & Record<string, unknown>;
  return { ...rest, username: is_public ? rest.username : null };
}

async function loadRoster(id: string) {
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
  const byId = new Map((users ?? []).map((u) => [(u as UserRow).id, u as UserRow]));
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

/** Owner = the creator or staff/admin. Only owners manage the roster. */
async function requireOwner(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("organizer_id").eq("id", id).maybeSingle();
  if (!t) return { ok: false as const, status: 404 };
  if ((t as { organizer_id: string }).organizer_id === user.id) return { ok: true as const, user, admin };
  const { data: me } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (me as { role: string | null } | null)?.role;
  if (role === "staff" || role === "admin") return { ok: true as const, user, admin };
  return { ok: false as const, status: 403 };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [host, organizers] = await Promise.all([loadHost(id), loadRoster(id)]);
  return NextResponse.json({ host, organizers });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireOwner(id);
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Enter a GameShuffle username." }, { status: 400 });

  const { admin, user } = gate;
  const { data: target } = await admin
    .from("users")
    .select("id, display_name, username, avatar_url")
    .eq("username", username)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: `No GameShuffle account @${username}.` }, { status: 404 });
  const targetUser = target as UserRow;

  const { data: t } = await admin.from("tournaments").select("organizer_id, game_slug, created_at").eq("id", id).maybeSingle();
  const tour = t as { organizer_id: string; game_slug: string | null; created_at: string | null } | null;
  if (tour?.organizer_id === targetUser.id) {
    return NextResponse.json({ error: "That account already owns this tournament." }, { status: 400 });
  }
  // Co-organizers are a paid Circuit feature (allowed free while billing is off).
  if (tour && !(await tournamentHasFeature(admin, { id, organizer_id: tour.organizer_id, game_slug: tour.game_slug, created_at: tour.created_at }, "co_organizers"))) {
    return NextResponse.json({ error: "Co-organizers are a GameShuffle Circuit feature. Upgrade to add a team." }, { status: 402 });
  }

  const { error } = await admin
    .from("tournament_organizers")
    .upsert({ tournament_id: id, user_id: targetUser.id, added_by: user.id }, { onConflict: "tournament_id,user_id" });
  if (error) return NextResponse.json({ error: "Could not add co-organizer." }, { status: 500 });

  return NextResponse.json({ organizers: await loadRoster(id) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireOwner(id);
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  await gate.admin.from("tournament_organizers").delete().eq("tournament_id", id).eq("user_id", userId);
  return NextResponse.json({ organizers: await loadRoster(id) });
}
