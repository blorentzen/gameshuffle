import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Accept a championship email invite. The signed-in user (who just created an
 * account or logged in) redeems the token → becomes a joined league member.
 * Uses the service client so the join isn't blocked by owner-only RLS.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const admin = createServiceClient();
  const { data: inv } = await admin
    .from("championship_invitations")
    .select("id, championship_id, status")
    .eq("token", token)
    .single();
  if (!inv) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  await admin.from("championship_members").upsert(
    { championship_id: inv.championship_id, user_id: user.id, status: "joined", joined_at: new Date().toISOString() },
    { onConflict: "championship_id,user_id" },
  );
  if (inv.status !== "accepted") {
    await admin.from("championship_invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", inv.id);
  }
  return NextResponse.json({ ok: true, championshipId: inv.championship_id });
}
