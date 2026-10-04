/**
 * Staff: the Chat Brain prompt queue (Platform ▸ Chat Brain).
 *   GET  ?status=draft|collecting|review|published|retired → prompts + categories
 *   POST { action: "create", text, category, familySafe?, opensAt?, closesAt? }
 *   POST { action: "status", id, status }
 *   POST { action: "draft", category, count?, guidance? }   Claude drafts questions into the queue
 *   POST { action: "edit", id, text?, category?, familySafe? }
 *   POST { action: "bank" }   add the reviewed question bank as drafts (skips ones already in)
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { draftPrompts, importBank } from "@/lib/chatbrain/drafts";
import { adminEditPrompt, ChatBrainNotReady, adminCreatePrompt, adminListPrompts, adminSetStatus, listCategories, type PromptStatus } from "@/lib/chatbrain/store";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; status?: string; text?: string; category?: string; familySafe?: boolean; opensAt?: string | null; closesAt?: string | null; count?: number; guidance?: string };
  try {
    if (body.action === "create") {
      const r = await adminCreatePrompt({ text: String(body.text ?? ""), category: String(body.category ?? ""), familySafe: body.familySafe, opensAt: body.opensAt ?? null, closesAt: body.closesAt ?? null, createdBy: gate.userId });
      return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
    }
    if (body.action === "draft") {
      const r = await draftPrompts({ category: String(body.category ?? ""), count: body.count, createdBy: gate.userId, guidance: body.guidance ? String(body.guidance).slice(0, 300) : null });
      return r.ok ? NextResponse.json({ ok: true, ...r.outcome }) : NextResponse.json(r, { status: r.error === "not_configured" ? 503 : 400 });
    }
    if (body.action === "bank") {
      const r = await importBank(gate.userId);
      return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 500 });
    }
    if (body.action === "edit" && body.id) {
      const r = await adminEditPrompt(body.id, { text: body.text, category: body.category, familySafe: body.familySafe });
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
