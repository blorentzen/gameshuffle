/**
 * Staff: the Chat Brain prompt queue (Platform ▸ Chat Brain).
 *   GET  ?status=draft|collecting|review|published|retired → prompts + categories
 *   POST { action: "create", text, category, familySafe?, opensAt?, closesAt? }
 *   POST { action: "status", id, status }
 * AI drafting, the collecting lane's per-source counts, and grouping/publish come next.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { ChatBrainNotReady, adminCreatePrompt, adminListPrompts, adminSetStatus, listCategories, type PromptStatus } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

const STATUSES: PromptStatus[] = ["draft", "collecting", "review", "published", "retired"];

export async function GET(req: NextRequest) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const s = req.nextUrl.searchParams.get("status") as PromptStatus | null;
  try {
    const [prompts, categories] = await Promise.all([adminListPrompts(s && STATUSES.includes(s) ? s : null), listCategories()]);
    return NextResponse.json({ ok: true, ready: true, prompts, categories });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: true, ready: false, prompts: [], categories: [] });
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; status?: string; text?: string; category?: string; familySafe?: boolean; opensAt?: string | null; closesAt?: string | null };
  try {
    if (body.action === "create") {
      const r = await adminCreatePrompt({ text: String(body.text ?? ""), category: String(body.category ?? ""), familySafe: body.familySafe, opensAt: body.opensAt ?? null, closesAt: body.closesAt ?? null, createdBy: gate.userId });
      return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
    }
    if (body.action === "status" && body.id && STATUSES.includes(body.status as PromptStatus)) {
      return NextResponse.json({ ok: await adminSetStatus(body.id, body.status as PromptStatus) });
    }
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
    throw err;
  }
}
