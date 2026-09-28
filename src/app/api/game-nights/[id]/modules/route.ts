import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ModuleError, saveModules } from "@/lib/game-nights/module-server";

export const runtime = "nodejs";

/**
 * PUT /api/game-nights/[id]/modules — the host saves the night's modules.
 * Body: { modules: NightModule[] } (validated; unknown settings dropped).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { modules?: unknown };
  try {
    const modules = await saveModules(id, user.id, body.modules ?? []);
    return NextResponse.json({ ok: true, modules });
  } catch (e) {
    const err = e instanceof ModuleError ? e : new ModuleError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
