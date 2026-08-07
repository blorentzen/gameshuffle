import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email/mailersend";

/**
 * Invite to a championship (accounts-only roster). Owner-guarded.
 *   { type: "user", userId }  → add an existing GS account to the roster (joined).
 *   { type: "email", email }  → create a pending invite + email a join link so the
 *                               recipient creates a free account and joins.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: championshipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Only the owner can invite.
  const { data: champ } = await supabase
    .from("championships")
    .select("id, name, owner_id")
    .eq("id", championshipId)
    .single();
  if (!champ || champ.owner_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const admin = createServiceClient();

  if (body.type === "user" && body.userId) {
    const { error } = await admin
      .from("championship_members")
      .upsert(
        { championship_id: championshipId, user_id: body.userId, status: "joined", joined_at: new Date().toISOString() },
        { onConflict: "championship_id,user_id" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "email" && typeof body.email === "string" && body.email.includes("@")) {
    const email = body.email.trim().toLowerCase();
    const { data: inv, error } = await admin
      .from("championship_invitations")
      .upsert(
        { championship_id: championshipId, email, invited_by: user.id, status: "pending" },
        { onConflict: "championship_id,email" },
      )
      .select("token")
      .single();
    if (error || !inv) return NextResponse.json({ error: error?.message || "Failed" }, { status: 400 });

    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://gameshuffle.co";
    const joinUrl = `${base}/championship/join/${inv.token}`;
    await sendTransactionalEmail({
      to: email,
      subject: `You're invited to ${champ.name} on GameShuffle`,
      text: `You've been invited to join the "${champ.name}" championship series on GameShuffle.\n\nCreate a free account (or sign in) and you'll join the league automatically:\n${joinUrl}\n\nSee you on the grid!`,
    });
    return NextResponse.json({ ok: true, joinUrl });
  }

  return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
}
