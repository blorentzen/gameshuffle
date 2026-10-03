/**
 * GET   /api/admin/weekly → this week and next week, plus every topic and
 *        any-game agenda staff can swap in.
 * PATCH /api/admin/weekly { week, topicId?, agendaCardId? } → swap a week's
 *        pick (next week any time; this week only before anyone has played it).
 * Staff/admin only. Backs the Platform ▸ Weekly Challenge tab.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { TIER_TOPICS } from "@/data/originals/tier-wars";
import { ITEMS_PER_ROUND } from "@/lib/originals/tierWars";
import { WEEKLY_AGENDAS, addWeeks, weekNumber, weekOf } from "@/lib/originals/weekly";
import { WeeklyNotReady, agendaCard, countEntries, ensureWeek, swapWeek, type WeekRow } from "@/lib/weekly/store";

export const runtime = "nodejs";

async function describe(row: WeekRow) {
  return {
    week: row.week_start, number: weekNumber(row.week_start), status: row.status, topicId: row.topic_id, title: row.title,
    items: row.items.map((i) => i.label), agendaCardId: row.agenda_card_id, agendaTitle: agendaCard(row.agenda_card_id)?.title ?? row.agenda_card_id,
    players: await countEntries(row.week_start), swapped: !!row.picked_by,
  };
}

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  try {
    const now = weekOf();
    const [cur, next] = await Promise.all([ensureWeek(now), ensureWeek(addWeeks(now, 1))]);
    return NextResponse.json({
      ok: true, ready: true,
      weeks: [await describe(cur), await describe(next)],
      topics: TIER_TOPICS.filter((t) => t.items.length >= ITEMS_PER_ROUND).map((t) => ({ id: t.id, label: t.label })),
      agendas: WEEKLY_AGENDAS.map((a) => ({ id: a.id, title: a.title, text: a.text })),
    });
  } catch (err) {
    if (err instanceof WeeklyNotReady) return NextResponse.json({ ok: true, ready: false });
    throw err;
  }
}

const ERRORS: Record<string, number> = { bad_topic: 400, bad_agenda: 400, has_entries: 409, not_open: 409, past: 400 };

export async function PATCH(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { week?: string; topicId?: string; agendaCardId?: string } | null;
  if (!body?.week || !/^\d{4}-\d{2}-\d{2}$/.test(body.week)) return NextResponse.json({ ok: false, error: "bad_week" }, { status: 400 });
  const r = await swapWeek(body.week, gate.userId, { topicId: body.topicId, agendaCardId: body.agendaCardId });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: ERRORS[r.error] ?? 400 });
  return NextResponse.json({ ok: true, week: await describe(r.week) });
}
