import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ModuleError, startPartyModule } from "@/lib/game-nights/module-server";

export const runtime = "nodejs";

/**
 * POST /api/game-nights/[id]/modules/party — the host starts the night's Mario
 * Party module as a live night (or gets the one already running). → { code }
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await startPartyModule(id, user.id)) });
  } catch (e) {
    const err = e instanceof ModuleError ? e : new ModuleError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
