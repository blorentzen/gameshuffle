import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/claim  { token }
 * The signed-in user (who just created an account via the soft-signup link)
 * redeems the guest-claim token, linking the guest participant row to their
 * account. Token possession = proof (it was emailed to them). Idempotent.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createServiceClient();
  const { data: claim } = await admin
    .from("tournament_guest_claims")
    .select("id, participant_id, tournament_id, claimed_at")
    .eq("token", token)
    .eq("tournament_id", id)
    .maybeSingle();
  if (!claim) return NextResponse.json({ error: "Invalid claim" }, { status: 404 });
  if (claim.claimed_at) return NextResponse.json({ ok: true, already: true });

  // Link the guest participant to this account (only while it's still a guest).
  await admin
    .from("tournament_participants")
    .update({ user_id: user.id })
    .eq("id", claim.participant_id)
    .is("user_id", null);
  await admin
    .from("tournament_guest_claims")
    .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
    .eq("id", claim.id);

  return NextResponse.json({ ok: true });
}
