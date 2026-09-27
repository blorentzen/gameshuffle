import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { claimState, findClaim, linkClaim, maskEmail, sendClaimCode, verifyClaimCode, type ClaimRow } from "@/lib/tournaments/claims";

export const runtime = "nodejs";

/**
 * Guest entry claiming (spec F). Phase 0 made claims explicit and email-matched;
 * phase 1 adds hashed expiring tokens (via lib/tournaments/claims) and a
 * one-time code for people who signed up with a different address.
 *
 *   GET  ?token=                   Peek: whose entry, masked contact, state,
 *                                  and whether this account may claim.
 *   POST { token, action:"send_code" }  Email a 6-digit code to the saved address.
 *   POST { token, code? }          Claim. Allowed when the account's verified
 *                                  email matches, or with a valid code.
 */

type User = { id: string; email?: string | null; email_confirmed_at?: string | null } | null;

function eligibility(claim: ClaimRow, user: User) {
  if (!user) return { canClaim: false, reason: "signed_out" as const };
  if (!claim.email) return { canClaim: false, reason: "needs_code" as const };
  if (!user.email_confirmed_at) return { canClaim: false, reason: "email_unverified" as const };
  if ((user.email ?? "").trim().toLowerCase() !== claim.email.trim().toLowerCase()) return { canClaim: false, reason: "email_mismatch" as const };
  return { canClaim: true, reason: null };
}

async function context(claim: ClaimRow) {
  const svc = createServiceClient();
  const [{ data: part }, { data: t }] = await Promise.all([
    svc.from("tournament_participants").select("display_name").eq("id", claim.participant_id).maybeSingle(),
    svc.from("tournaments").select("title").eq("id", claim.tournament_id).maybeSingle(),
  ]);
  return {
    displayName: (part as { display_name?: string } | null)?.display_name ?? "your entry",
    tournamentTitle: (t as { title?: string } | null)?.title ?? "a tournament",
  };
}

async function currentUser(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  const claim = await findClaim(token, id);
  if (!claim) return NextResponse.json({ error: "invalid_claim" }, { status: 404 });
  const user = await currentUser();

  const state = claimState(claim);
  if (state === "claimed") return NextResponse.json({ ok: true, claimed: true, mine: !!user && claim.claimed_by === user.id });
  if (state !== "open") return NextResponse.json({ ok: true, claimed: false, state });

  const ctx = await context(claim);
  return NextResponse.json({
    ok: true, claimed: false, state, displayName: ctx.displayName, maskedEmail: maskEmail(claim.email),
    canUseCode: !!claim.email, ...eligibility(claim, user),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { token?: string; code?: string; action?: string };
  if (!body.token) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });

  const claim = await findClaim(body.token, id);
  if (!claim) return NextResponse.json({ error: "invalid_claim" }, { status: 404 });
  const state = claimState(claim);
  if (state === "claimed") {
    return claim.claimed_by === user.id
      ? NextResponse.json({ ok: true, already: true })
      : NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }
  if (state !== "open") return NextResponse.json({ error: state }, { status: 410 });

  if (body.action === "send_code") {
    const res = await sendClaimCode(claim, await context(claim));
    return res.ok
      ? NextResponse.json({ ok: true, sentTo: maskEmail(claim.email) })
      : NextResponse.json({ error: res.reason }, { status: res.reason === "rate_limited" ? 429 : 400 });
  }

  if (body.code) {
    const v = await verifyClaimCode(claim, body.code);
    if (v !== "ok") return NextResponse.json({ error: `code_${v}` }, { status: v === "locked" ? 429 : 400 });
  } else {
    const e = eligibility(claim, user);
    if (!e.canClaim) return NextResponse.json({ error: e.reason, maskedEmail: maskEmail(claim.email) }, { status: 403 });
  }

  const linked = await linkClaim(claim, user.id);
  return linked === "ok" ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "already_claimed" }, { status: 409 });
}
