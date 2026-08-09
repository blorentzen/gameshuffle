import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/capabilities/middleware";
import { getSession } from "@/lib/sessions/service";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * POST /api/sessions/[id]/lobby-visibility  { publicLobby: boolean | null }
 *
 * Per-session public-lobby override. `true`/`false` set it explicitly; `null`
 * clears the override so the session inherits the streamer's global default
 * (`twitch_connections.public_lobby_enabled`). Owner-only.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.owner_user_id !== guard.user!.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { publicLobby?: boolean | null };
  const flags: Record<string, unknown> = { ...(session.feature_flags ?? {}) };
  if (body.publicLobby === true || body.publicLobby === false) {
    flags.public_lobby = body.publicLobby;
  } else {
    delete flags.public_lobby; // inherit the global default
  }

  const admin = createServiceClient();
  const { error } = await admin.from("gs_sessions").update({ feature_flags: flags }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, publicLobby: (flags.public_lobby as boolean | undefined) ?? null });
}
