/**
 * Staff: review and publish one Chat Brain prompt.
 *   GET  ?id=<prompt>                            answers grouped by spelling + suggestions
 *   POST { action: "ai", id }                    Claude's proposed meaning groups (a suggestion)
 *   POST { action: "publish", id, groups }       groups: [{ label, keys, hidden? }] → board
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { aiGroups, publish, reviewData, type PublishGroup } from "@/lib/chatbrain/review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await reviewData(id) : null;
  return data ? NextResponse.json({ ok: true, ...data }) : NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; groups?: PublishGroup[] };
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  if (body.action === "ai") {
    const r = await aiGroups(body.id);
    return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.error === "not_configured" ? 503 : 400 });
  }
  if (body.action === "publish") {
    if (!Array.isArray(body.groups)) return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
    const groups = body.groups.slice(0, 500).map((g) => ({ label: String(g.label ?? ""), keys: Array.isArray(g.keys) ? g.keys.map(String).slice(0, 500) : [], hidden: !!g.hidden }));
    const r = await publish(body.id, groups, gate.userId);
    return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
}
