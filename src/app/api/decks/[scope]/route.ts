import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit, createCard, DeckError, editorView, resolveScope, setMixOfficial } from "@/lib/party/deckSource";
import type { CardDraft } from "@/lib/party/deck";

export const runtime = "nodejs";

/**
 * Deck editor API. [scope] is "official" (staff and admins), "me" (a Pro+
 * user's own deck) or a streamer's user id (for their active mods).
 *   GET  ?family=            every card incl. drafts, deck settings, card stats
 *   POST { action: "create", card }       add a card (starts as a draft)
 *   POST { action: "settings", mixOfficial }  custom decks: deal official cards too
 */
function errorResponse(e: unknown) {
  const err = e instanceof DeckError ? e : new DeckError("server_error", 500);
  return NextResponse.json({ error: err.code, details: err.details }, { status: err.status });
}

async function authorized(params: Promise<{ scope: string }>) {
  const { scope: raw } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new DeckError("signed_out", 401);
  const scope = resolveScope(raw, user.id);
  if (!(await canEdit(user.id, scope))) throw new DeckError(scope.kind === "official" ? "staff_only" : "pro_only", 403);
  return { user, scope };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  try {
    const { scope } = await authorized(params);
    const family = req.nextUrl.searchParams.get("family") ?? "mario-party";
    return NextResponse.json({ ok: true, scope: scope.kind, ...(await editorView(family, scope)) });
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  try {
    const { user, scope } = await authorized(params);
    const b = (await req.json().catch(() => ({}))) as { action?: string; family?: string; card?: CardDraft; mixOfficial?: boolean };
    const family = b.family ?? "mario-party";
    if (b.action === "settings") { await setMixOfficial(family, scope, user.id, !!b.mixOfficial); return NextResponse.json({ ok: true }); }
    if (b.action === "create" && b.card) return NextResponse.json({ ok: true, card: await createCard(family, scope, user.id, b.card) });
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  } catch (e) { return errorResponse(e); }
}
