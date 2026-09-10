import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";

/**
 * Typeahead search over the GameShuffle userbase for players to invite to a
 * tournament. Organizer-guarded (owner or co-organizer). Matches username or
 * display_name, excludes players already entered + the organizer themselves.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createServiceClient();
  const role = await getTournamentRole(admin, id, user.id);
  if (!role) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: entered } = await admin
    .from("tournament_participants")
    .select("user_id")
    .eq("tournament_id", id)
    .not("user_id", "is", null);
  const excluded = new Set<string>([user.id, ...((entered ?? []).map((p) => p.user_id as string))]);

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { data: users } = await admin
    .from("users")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .not("username", "is", null)
    .limit(10);

  const results = (users ?? [])
    .filter((u) => !excluded.has(u.id as string))
    .slice(0, 6)
    .map((u) => ({
      id: u.id as string,
      username: (u.username as string | null) ?? null,
      display_name: (u.display_name as string | null) || "Player",
      avatar_url: (u.avatar_url as string | null) ?? null,
    }));
  return NextResponse.json({ results });
}
