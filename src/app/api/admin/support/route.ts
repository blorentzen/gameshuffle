/**
 * Platform ▸ Support (staff/admin): the monthly goal and its cost lines, this
 * month's support, and recent payments with the supporters wall controls.
 *   GET → { ready, settings, month, gifts }
 *   POST { action: "settings", goalCents, costs } | { action: "hide", id, hidden }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { monthProgress, recentGifts, saveSupportSettings, setGiftHidden, supportSettings } from "@/lib/support/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const settings = await supportSettings();
  if (!settings) return NextResponse.json({ ready: false });
  const [month, gifts] = await Promise.all([monthProgress(), recentGifts()]);
  return NextResponse.json({ ready: true, settings, month, gifts });
}

export async function POST(req: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => ({}))) as { action?: string; goalCents?: unknown; costs?: unknown; id?: unknown; hidden?: unknown };
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
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
