/**
 * The reviewers' queue (staff, admins and time trial reviewers; round 2).
 *   GET                                                → clips to check and open tickets (+ the team for staff and reviewers)
 *   GET ?counts=1                                      → what's waiting for the signed-in reviewer (null for anyone else)
 *   GET ?access=<userId>                               → one person's access, for the Review access window (team givers)
 *   GET ?people=<text>                                 → accounts by name, @username or Discord name (team givers)
 *   POST { action: "video", timeId, ok, note? }        → Verified, or "doesn't match" with a reason
 *   POST { action: "decide", ticketId, outcome, note } → keep or remove a reported time
 *   POST { action: "access", userId, reviewer, modes } → give or take away access (picks 2026-11-05): staff and admins any,
 *                                                        reviewers updater modes only; the person is told
 *   POST { action: "alias_block", game, alias, track } → staff and admins: a learned short name stops reading for everyone
 *   POST { action: "claim", claimId, approve, reason? } → MK8DX mushrooms updaters, reviewers and staff: a Top 10 sheet claim (round 4)
 *   POST { action: "claim_undo", claimId }             → staff and admins: an approved claim goes back to the listed player
 *   POST { action: "verify", timeId, link?, picture? } → a reviewer verifies a time from its proof (a pasted clip, the player's
 *                                                        clip, or a legacy time's clip or post); also from the time's window
 *   POST { action: "legacy_reject", timeId, note }     → a legacy time's clip or post doesn't show the run (leaves the list)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { blockAlias, communityAliasList } from "@/lib/timeTrials/aliases";
import { isTtGame } from "@/lib/timeTrials/tracks";
import { decideTicket, decideVideo, legacyProofQueue, rejectLegacyProof, reviewCounts, reviewQueue, verifyByReviewer } from "@/lib/timeTrials/review";
import { reviewScope, type Mode } from "@/lib/timeTrials/updaters";
import { accessOf, granterOf, searchPeople, setAccess, teamView } from "@/lib/timeTrials/team";
import { canSettleClaims, claimQueue, decideClaim, undoClaim } from "@/lib/timeTrials/claims";
import { sheetStatus } from "@/lib/timeTrials/sheetSync";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function who(): Promise<{ userId: string; reviewer: boolean; staff: boolean; scope: "all" | Mode[] | null } | null> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string | null } | null)?.role;
  const staff = role === "staff" || role === "admin";
  const scope = await reviewScope(user.id);
  return { userId: user.id, staff, reviewer: !!scope, scope };
}

export async function GET(req: Request) {
  // ?counts=1: what's waiting, for the account menu and the time trials page (null for anyone who doesn't review).
  const sp = new URL(req.url).searchParams;
  if (sp.get("counts")) {
    const { data: { user } } = await (await createClient()).auth.getUser();
    return NextResponse.json({ ok: true, counts: await reviewCounts(user?.id ?? null) }, { headers: NO_STORE });
  }
  const me = await who();
  if (!me?.reviewer) return NextResponse.json({ ok: false, error: "not_reviewer" }, { status: 403 });
  // The Review access window and the Team tab's search: staff, admins and reviewers.
  const access = sp.get("access"), people = sp.get("people");
  if (access !== null || people !== null) {
    const granter = await granterOf(me.userId);
    if (!granter) return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });
    if (access !== null) {
      const person = /^[0-9a-f-]{36}$/.test(access) ? await accessOf(access) : null;
      return NextResponse.json(person ? { ok: true, person, granter, self: person.userId === me.userId } : { ok: false, error: "no_user" }, { headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, people: await searchPeople(people ?? "", granter) }, { headers: NO_STORE });
  }
  const settle = await canSettleClaims(me.userId);
  const granter = me.staff ? "staff" : await granterOf(me.userId);
  const [queue, team, aliases, claims, sheets, legacy] = await Promise.all([reviewQueue(me.scope ?? "all"), granter ? teamView(granter) : Promise.resolve(null), me.staff ? communityAliasList() : Promise.resolve(null), settle ? claimQueue(me.staff) : Promise.resolve(null), me.staff ? sheetStatus() : Promise.resolve(null), legacyProofQueue(me.scope ?? "all")]);
  return NextResponse.json({ ok: true, ...queue, team: team ? { ...team, granter, me: me.userId } : null, aliases, claims, sheets, legacy, staff: me.staff, modes: me.scope === "all" ? null : me.scope }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const me = await who();
  if (!me?.reviewer) return NextResponse.json({ ok: false, error: "not_reviewer" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; timeId?: unknown; ok?: unknown; note?: unknown; ticketId?: unknown; outcome?: unknown; userId?: unknown; reviewer?: unknown; modes?: unknown; game?: unknown; alias?: unknown; track?: unknown; claimId?: unknown; approve?: unknown; reason?: unknown; link?: unknown; picture?: unknown };
  const note = typeof b.note === "string" ? b.note : "";
  if (b.action === "verify" && typeof b.timeId === "string") return NextResponse.json(await verifyByReviewer(b.timeId, me.userId, typeof b.link === "string" ? b.link : null, typeof b.picture === "string" ? b.picture : null));
  if (b.action === "legacy_reject" && typeof b.timeId === "string") return NextResponse.json(await rejectLegacyProof(b.timeId, me.userId, note));
  if (b.action === "video" && typeof b.timeId === "string") return NextResponse.json(await decideVideo(b.timeId, me.userId, b.ok === true, note));
  if (b.action === "decide" && typeof b.ticketId === "string" && (b.outcome === "kept" || b.outcome === "removed")) return NextResponse.json(await decideTicket(b.ticketId, me.userId, b.outcome, note));
  if (b.action === "claim" && typeof b.claimId === "string") return NextResponse.json(await decideClaim(b.claimId, me.userId, b.approve === true, typeof b.reason === "string" ? b.reason : ""));
  // Who's on the team: setAccess checks who may change what (reviewers: updater modes only).
  if (b.action === "access" && typeof b.userId === "string" && typeof b.reviewer === "boolean" && Array.isArray(b.modes)) return NextResponse.json(await setAccess(b.userId, { reviewer: b.reviewer, modes: b.modes }, me.userId));
  if (!me.staff) return NextResponse.json({ ok: false, error: "staff_only" }, { status: 403 });
  if (b.action === "claim_undo" && typeof b.claimId === "string") return NextResponse.json(await undoClaim(b.claimId, me.userId));
  if (b.action === "alias_block" && isTtGame(b.game) && typeof b.alias === "string" && typeof b.track === "string") return NextResponse.json({ ok: await blockAlias(b.game, b.alias, b.track, me.userId) });
  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
