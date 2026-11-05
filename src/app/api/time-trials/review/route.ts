/**
 * The reviewers' queue (staff, admins and time trial reviewers; round 2).
 *   GET                                                → clips to check and open tickets (+ reviewers for staff)
 *   GET ?counts=1                                      → what's waiting for the signed-in reviewer (null for anyone else)
 *   POST { action: "video", timeId, ok, note? }        → Verified, or "doesn't match" with a reason
 *   POST { action: "decide", ticketId, outcome, note } → keep or remove a reported time
 *   POST { action: "reviewer_add", username }          → staff and admins only
 *   POST { action: "reviewer_remove", userId }         → staff and admins only
 *   POST { action: "updater_add", username, game, items }   → staff and admins: an updater for one game and items (round 3)
 *   POST { action: "updater_remove", userId, game, items }  → staff and admins
 *   POST { action: "alias_block", game, alias, track } → staff and admins: a learned short name stops reading for everyone
 *   POST { action: "claim", claimId, approve, reason? } → MK8DX mushrooms updaters, reviewers and staff: a Top 10 sheet claim (round 4)
 *   POST { action: "claim_undo", claimId }             → staff and admins: an approved claim goes back to the listed player
 *   POST { action: "verify", timeId, link? }           → a reviewer verifies a time from its proof (a pasted clip, the player's
 *                                                        clip, or a legacy time's clip or post); also from the time's window
 *   POST { action: "legacy_reject", timeId, note }     → a legacy time's clip or post doesn't show the run (leaves the list)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { blockAlias, communityAliasList } from "@/lib/timeTrials/aliases";
import { isTtGame } from "@/lib/timeTrials/tracks";
import { addReviewer, decideTicket, decideVideo, legacyProofQueue, listReviewers, rejectLegacyProof, removeReviewer, reviewCounts, reviewQueue, verifyByReviewer } from "@/lib/timeTrials/review";
import { addUpdater, listUpdaters, removeUpdater, reviewScope, type Mode } from "@/lib/timeTrials/updaters";
import { isItems } from "@/lib/timeTrials/categories";
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
  if (new URL(req.url).searchParams.get("counts")) {
    const { data: { user } } = await (await createClient()).auth.getUser();
    return NextResponse.json({ ok: true, counts: await reviewCounts(user?.id ?? null) }, { headers: NO_STORE });
  }
  const me = await who();
  if (!me?.reviewer) return NextResponse.json({ ok: false, error: "not_reviewer" }, { status: 403 });
  const settle = await canSettleClaims(me.userId);
  const [queue, reviewers, updaters, aliases, claims, sheets, legacy] = await Promise.all([reviewQueue(me.scope ?? "all"), me.staff ? listReviewers() : Promise.resolve(null), me.staff ? listUpdaters() : Promise.resolve(null), me.staff ? communityAliasList() : Promise.resolve(null), settle ? claimQueue(me.staff) : Promise.resolve(null), me.staff ? sheetStatus() : Promise.resolve(null), legacyProofQueue(me.scope ?? "all")]);
  return NextResponse.json({ ok: true, ...queue, reviewers, updaters, aliases, claims, sheets, legacy, staff: me.staff, modes: me.scope === "all" ? null : me.scope }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const me = await who();
  if (!me?.reviewer) return NextResponse.json({ ok: false, error: "not_reviewer" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; timeId?: unknown; ok?: unknown; note?: unknown; ticketId?: unknown; outcome?: unknown; username?: unknown; userId?: unknown; game?: unknown; items?: unknown; alias?: unknown; track?: unknown; claimId?: unknown; approve?: unknown; reason?: unknown; link?: unknown };
  const note = typeof b.note === "string" ? b.note : "";
  if (b.action === "verify" && typeof b.timeId === "string") return NextResponse.json(await verifyByReviewer(b.timeId, me.userId, typeof b.link === "string" ? b.link : null));
  if (b.action === "legacy_reject" && typeof b.timeId === "string") return NextResponse.json(await rejectLegacyProof(b.timeId, me.userId, note));
  if (b.action === "video" && typeof b.timeId === "string") return NextResponse.json(await decideVideo(b.timeId, me.userId, b.ok === true, note));
  if (b.action === "decide" && typeof b.ticketId === "string" && (b.outcome === "kept" || b.outcome === "removed")) return NextResponse.json(await decideTicket(b.ticketId, me.userId, b.outcome, note));
  if (b.action === "claim" && typeof b.claimId === "string") return NextResponse.json(await decideClaim(b.claimId, me.userId, b.approve === true, typeof b.reason === "string" ? b.reason : ""));
  if (!me.staff) return NextResponse.json({ ok: false, error: "staff_only" }, { status: 403 });
  if (b.action === "claim_undo" && typeof b.claimId === "string") return NextResponse.json(await undoClaim(b.claimId, me.userId));
  if (b.action === "reviewer_add" && typeof b.username === "string") return NextResponse.json(await addReviewer(b.username, me.userId));
  if (b.action === "reviewer_remove" && typeof b.userId === "string") { await removeReviewer(b.userId); return NextResponse.json({ ok: true }); }
  if (b.action === "updater_add" && typeof b.username === "string" && isTtGame(b.game) && isItems(b.items)) return NextResponse.json(await addUpdater(b.username, { game: b.game, items: b.items }, me.userId));
  if (b.action === "updater_remove" && typeof b.userId === "string" && isTtGame(b.game) && isItems(b.items)) { await removeUpdater(b.userId, { game: b.game, items: b.items }); return NextResponse.json({ ok: true }); }
  if (b.action === "alias_block" && isTtGame(b.game) && typeof b.alias === "string" && typeof b.track === "string") return NextResponse.json({ ok: await blockAlias(b.game, b.alias, b.track, me.userId) });
  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
