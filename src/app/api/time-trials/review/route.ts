/**
 * The reviewers' queue (staff, admins and time trial reviewers; round 2).
 *   GET                                                → clips to check and open tickets (+ reviewers for staff)
 *   POST { action: "video", timeId, ok, note? }        → Verified, or "doesn't match" with a reason
 *   POST { action: "decide", ticketId, outcome, note } → keep or remove a reported time
 *   POST { action: "reviewer_add", username }          → staff and admins only
 *   POST { action: "reviewer_remove", userId }         → staff and admins only
 *   POST { action: "alias_block", game, alias, track } → staff and admins: a learned short name stops reading for everyone
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { blockAlias, communityAliasList } from "@/lib/timeTrials/aliases";
import { isTtGame } from "@/lib/timeTrials/tracks";
import { addReviewer, decideTicket, decideVideo, isReviewer, listReviewers, removeReviewer, reviewQueue } from "@/lib/timeTrials/review";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function who(): Promise<{ userId: string; reviewer: boolean; staff: boolean } | null> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string | null } | null)?.role;
  const staff = role === "staff" || role === "admin";
  return { userId: user.id, staff, reviewer: staff || (await isReviewer(user.id)) };
}

export async function GET() {
  const me = await who();
  if (!me?.reviewer) return NextResponse.json({ ok: false, error: "not_reviewer" }, { status: 403 });
  const [queue, reviewers, aliases] = await Promise.all([reviewQueue(), me.staff ? listReviewers() : Promise.resolve(null), me.staff ? communityAliasList() : Promise.resolve(null)]);
  return NextResponse.json({ ok: true, ...queue, reviewers, aliases, staff: me.staff }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const me = await who();
  if (!me?.reviewer) return NextResponse.json({ ok: false, error: "not_reviewer" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; timeId?: unknown; ok?: unknown; note?: unknown; ticketId?: unknown; outcome?: unknown; username?: unknown; userId?: unknown; game?: unknown; alias?: unknown; track?: unknown };
  const note = typeof b.note === "string" ? b.note : "";
  if (b.action === "video" && typeof b.timeId === "string") return NextResponse.json(await decideVideo(b.timeId, me.userId, b.ok === true, note));
  if (b.action === "decide" && typeof b.ticketId === "string" && (b.outcome === "kept" || b.outcome === "removed")) return NextResponse.json(await decideTicket(b.ticketId, me.userId, b.outcome, note));
  if (!me.staff) return NextResponse.json({ ok: false, error: "staff_only" }, { status: 403 });
  if (b.action === "reviewer_add" && typeof b.username === "string") return NextResponse.json(await addReviewer(b.username, me.userId));
  if (b.action === "reviewer_remove" && typeof b.userId === "string") { await removeReviewer(b.userId); return NextResponse.json({ ok: true }); }
  if (b.action === "alias_block" && isTtGame(b.game) && typeof b.alias === "string" && typeof b.track === "string") return NextResponse.json({ ok: await blockAlias(b.game, b.alias, b.track, me.userId) });
  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
