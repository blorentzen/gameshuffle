/**
 * Platform ▸ Support (staff/admin): the monthly goal and its cost lines, this
 * month's support, monthly supporters by level, the updates on /support, and
 * recent payments with the supporters wall controls.
 *   GET → { ready, settings, month, gifts, levels, updates }
 *   POST { action: "settings", goalCents, costs } | { action: "hide", id, hidden }
 *      | { action: "update_add", body } | { action: "update_remove", id }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { addSupportUpdate, levelCounts, monthProgress, recentGifts, removeSupportUpdate, saveSupportSettings, setGiftHidden, supportSettings, supportUpdates } from "@/lib/support/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const settings = await supportSettings();
  if (!settings) return NextResponse.json({ ready: false });
  const [month, gifts, levels, updates] = await Promise.all([monthProgress(), recentGifts(), levelCounts().catch(() => null), supportUpdates(20)]);
  return NextResponse.json({ ready: true, settings, month, gifts, levels, updates });
}

export async function POST(req: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { action?: string; goalCents?: unknown; costs?: unknown; id?: unknown; hidden?: unknown; body?: unknown };
  if (body.action === "settings") {
    const goalCents = typeof body.goalCents === "number" ? body.goalCents : 0;
    const costs = Array.isArray(body.costs) ? (body.costs as { label?: unknown; cents?: unknown }[]).map((c) => ({ label: String(c.label ?? ""), cents: Number(c.cents) || 0 })) : [];
    const ok = await saveSupportSettings({ goalCents, costs }, gate.userId);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed" }, { status: 500 });
  }
  if (body.action === "hide" && typeof body.id === "string" && typeof body.hidden === "boolean") {
    const ok = await setGiftHidden(body.id, body.hidden);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed" }, { status: 500 });
  }
  if (body.action === "update_add" && typeof body.body === "string") {
    const res = await addSupportUpdate(body.body, gate.userId);
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: res.error === "failed" ? 500 : 400 });
  }
  if (body.action === "update_remove" && typeof body.id === "string") {
    const ok = await removeSupportUpdate(body.id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
