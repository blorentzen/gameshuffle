/**
 * GET  /api/chat-brain/audience → { asked, audience, suggestedCountry }
 *      Signed in: the account's saved choices. Signed out: asked false (the
 *      browser keeps its own), plus the country suggested by the connection.
 * POST /api/chat-brain/audience { ageBand?, gender?, country?, countryChosen? }
 *      Signed in only: save the choices (any of them may be "prefer not to say").
 *
 * Audiences are optional and coarse; see src/lib/chatbrain/audience.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanAudience, isCountry } from "@/lib/chatbrain/audience";
import { getAudience, saveAudience } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

function connectionCountry(req: NextRequest): string | null {
  const c = req.headers.get("x-vercel-ip-country");
  return isCountry(c) ? c!.toUpperCase() : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const suggestedCountry = connectionCountry(req);
  if (!user) return NextResponse.json({ ok: true, asked: false, audience: null, suggestedCountry }, { headers: { "Cache-Control": "private, no-store" } });
  const saved = await getAudience(user.id);
  return NextResponse.json({ ok: true, asked: !!saved, audience: saved, suggestedCountry }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const a = cleanAudience(body);
  const chosen = body.countryChosen === true;
  const ok = await saveAudience(user.id, { ...a, country: chosen ? a.country : a.country ?? connectionCountry(req) }, chosen ? "chosen" : "auto");
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
}
