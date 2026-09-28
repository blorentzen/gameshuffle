import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit, changeCard, DeckError, resolveScope, type CardChange } from "@/lib/party/deckSource";

export const runtime = "nodejs";

/**
 * PATCH /api/decks/[scope]/cards/[id]
 *   { action: "update", card } | { action: "publish", familySafe: true } | { action: "retire" } | { action: "restore" }
 * Cards are retired, never deleted: their ids live on in saved setups and points history.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ scope: string; id: string }> }) {
  try {
    const { scope: raw, id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new DeckError("signed_out", 401);
    const scope = resolveScope(raw, user.id);
    if (!(await canEdit(user.id, scope))) throw new DeckError(scope.kind === "official" ? "staff_only" : "pro_only", 403);
    const b = (await req.json().catch(() => ({}))) as CardChange & { family?: string };
    return NextResponse.json({ ok: true, card: await changeCard(b.family ?? "mario-party", scope, user.id, id, b) });
  } catch (e) {
    const err = e instanceof DeckError ? e : new DeckError("server_error", 500);
    return NextResponse.json({ error: err.code, details: err.details }, { status: err.status });
  }
}
