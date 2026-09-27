import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Guest entry claiming (spec F, phase 0 hotfix, 2026-09-26).
 *
 * The old model was "token possession = proof": any signed-in account that
 * opened the link got the entry, silently, and the page redeemed it on load.
 * Forwarded emails, pasted links and screenshots of the address bar were all
 * enough to take someone's spot, paid tickets included. Now:
 *
 *   GET  ?token=   Peek. Says whose entry this is (masked) and whether the
 *                  signed-in account may claim it. Changes nothing.
 *   POST {token}   Claim. Refused unless the account's VERIFIED email matches
 *                  the email the entry was saved under. The page only calls
 *                  this after an explicit confirm.
 *
 * Phase 1 adds hashed, expiring tokens and a code-to-email path for people who
 * signed up with a different address. Until then a mismatch is refused, and
 * the message says which address to sign in with.
 */

type Claim = { id: string; participant_id: string; tournament_id: string; email: string; claimed_at: string | null; claimed_by: string | null };

/** "k***@gmail.com". Enough to recognise your own address, not to learn one. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

async function loadClaim(id: string, token: string): Promise<Claim | null> {
  const { data } = await createServiceClient()
    .from("tournament_guest_claims")
    .select("id, participant_id, tournament_id, email, claimed_at, claimed_by")
    .eq("token", token)
    .eq("tournament_id", id)
    .maybeSingle();
  return (data as Claim | null) ?? null;
}

/** Whether this user may claim: signed in, email verified, and the same address. */
function eligibility(claim: Claim, user: { email?: string | null; email_confirmed_at?: string | null } | null) {
  if (!user) return { canClaim: false, reason: "signed_out" as const };
  if (!user.email_confirmed_at) return { canClaim: false, reason: "email_unverified" as const };
  if ((user.email ?? "").trim().toLowerCase() !== claim.email.trim().toLowerCase()) {
    return { canClaim: false, reason: "email_mismatch" as const };
  }
  return { canClaim: true, reason: null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const claim = await loadClaim(id, token);
  if (!claim) return NextResponse.json({ error: "invalid_claim" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (claim.claimed_at) {
    return NextResponse.json({ ok: true, claimed: true, mine: !!user && claim.claimed_by === user.id });
  }
  const { data: part } = await createServiceClient()
    .from("tournament_participants")
    .select("display_name")
    .eq("id", claim.participant_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    claimed: false,
    displayName: (part as { display_name?: string } | null)?.display_name ?? "your entry",
    maskedEmail: maskEmail(claim.email.toLowerCase()),
    ...eligibility(claim, user),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });

  const claim = await loadClaim(id, token);
  if (!claim) return NextResponse.json({ error: "invalid_claim" }, { status: 404 });
  if (claim.claimed_at) {
    return claim.claimed_by === user.id
      ? NextResponse.json({ ok: true, already: true })
      : NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const e = eligibility(claim, user);
  if (!e.canClaim) return NextResponse.json({ error: e.reason, maskedEmail: maskEmail(claim.email.toLowerCase()) }, { status: 403 });

  const admin = createServiceClient();
  // Mark the claim first, conditionally, so two concurrent confirms cannot both win.
  const { data: won } = await admin
    .from("tournament_guest_claims")
    .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
    .eq("id", claim.id)
    .is("claimed_at", null)
    .select("id");
  if (!won?.length) return NextResponse.json({ error: "already_claimed" }, { status: 409 });

  // Link the entry, only while it is still a guest row.
  await admin
    .from("tournament_participants")
    .update({ user_id: user.id })
    .eq("id", claim.participant_id)
    .is("user_id", null);

  return NextResponse.json({ ok: true });
}
