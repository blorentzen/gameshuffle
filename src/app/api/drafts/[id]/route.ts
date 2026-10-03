/**
 * PATCH /api/drafts/[id] — the streamer runs their draft (GS Pro).
 * Chat vote:
 *   { action: "next" }                          close the current pick now
 * Captains (sign-ups):
 *   { action: "add", name }                     add a name by hand
 *   { action: "remove", key }                   drop someone
 *   { action: "lobby" }                         pull in everyone in the session lobby
 *   { action: "start", teams: [{ name?, captainKey }], order?, pickSeconds? }
 * Captains (picking):
 *   { action: "pick", key }                     pick for the captain on the clock
 * Both:
 *   { action: "end" }                           cancel the draft
 */

import { NextResponse } from "next/server";
import { bingoOwner as streamOwner } from "@/lib/bingo/owner";
import { manualKey } from "@/lib/drafts/captains";
import {
  addEntrants, cancelDraft, getDraft, lobbyEntrants, pickPlayer, removeEntrant, resolvePick, startCaptains, viewOf,
  type StartCaptainsInput,
} from "@/lib/drafts/store";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";

export const runtime = "nodejs";

type Body = { action?: string; name?: string; key?: string } & Partial<StartCaptainsInput>;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await streamOwner();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!ctx.isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  const draft = await getDraft(id);
  if (!draft || draft.communityId !== ctx.communityId) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (draft.status !== "open" && draft.status !== "signup") return NextResponse.json({ ok: false, error: "not_open" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const done = async (r: { ok: true; value: Parameters<typeof viewOf>[0] } | { ok: false; error: string }) =>
    r.ok ? NextResponse.json({ ok: true, draft: await viewOf(r.value) }) : NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  switch (body?.action) {
    case "next": {
      const next = (await resolvePick(draft, { force: true })) ?? (await getDraft(id));
      return NextResponse.json({ ok: true, draft: next ? await viewOf(next) : null });
    }
    case "end": {
      const ended = await cancelDraft(draft);
      return NextResponse.json({ ok: true, draft: ended ? await viewOf(ended) : null });
    }
    case "add": {
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return NextResponse.json({ ok: false, error: "no_name" }, { status: 400 });
      return done(await addEntrants(draft.id, [{ key: manualKey(name), name, source: "manual" }]));
    }
    case "remove":
      return done(await removeEntrant(draft.id, String(body.key ?? "")));
    case "lobby": {
      const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]).catch(() => null);
      return done(await addEntrants(draft.id, await lobbyEntrants(session?.id ?? null)));
    }
    case "start":
      return done(await startCaptains(draft, { teams: Array.isArray(body.teams) ? body.teams : [], order: body.order, pickSeconds: body.pickSeconds ?? null }));
    case "pick":
      return done(await pickPlayer(draft, String(body.key ?? ""), "streamer"));
    default:
      return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
}
