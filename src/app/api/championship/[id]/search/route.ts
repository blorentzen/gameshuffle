import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Typeahead search for existing GameShuffle players to invite to a championship.
 * Owner-guarded. Matches username or display_name, excludes current members.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: championshipId } = await params;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: champ } = await supabase.from("championships").select("owner_id").eq("id", championshipId).single();
  if (!champ || champ.owner_id !== user.id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createServiceClient();
  const { data: members } = await admin.from("championship_members").select("user_id").eq("championship_id", championshipId);
  const excluded = new Set((members ?? []).map((m) => m.user_id as string));

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { data: users } = await admin
    .from("users")
    .select("id, username, display_name")
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .not("username", "is", null)
    .limit(8);

  const results = (users ?? [])
    .filter((u) => !excluded.has(u.id as string))
    .slice(0, 6)
    .map((u) => ({ id: u.id as string, username: (u.username as string | null) ?? null, display_name: (u.display_name as string | null) || "Player" }));
  return NextResponse.json({ results });
}
