/**
 * GET /api/events/[type]/[id]/ics → an .ics file for one public event.
 *
 * `type` is `tournament` or `game-night`. Public data only (title, time,
 * place, description, page URL); lobby codes and anything gated stay out.
 * Served with `text/calendar` + a download filename so Apple Calendar /
 * Outlook / phones open it straight into "add event".
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { buildIcs, type EventType } from "@/lib/events/calendar";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (type !== "tournament" && type !== "game-night") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const svc = createServiceClient();
  const base = getBaseUrl();
  let input: Parameters<typeof buildIcs>[0] | null = null;

  if (type === "tournament") {
    const { data } = await svc
      .from("tournaments")
      .select("id, title, description, date_time, date_time_end, status, settings")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.status === "draft") return NextResponse.json({ error: "not_found" }, { status: 404 });
    const settings = (data.settings ?? {}) as { locationType?: string; location?: string | null; game_label?: string };
    input = {
      type, id,
      title: data.title as string,
      startsAt: (data.date_time as string | null) ?? null,
      endsAt: (data.date_time_end as string | null) ?? null,
      description: [settings.game_label, data.description as string | null].filter(Boolean).join("\n"),
      location: settings.locationType === "in_person" ? (settings.location ?? "In person") : "Online",
      url: `${base}/tournament/${id}`,
    };
  } else {
    const { data } = await svc
      .from("board_game_nights")
      .select("id, title, description, starts_at, place, status, visibility")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.status === "draft") return NextResponse.json({ error: "not_found" }, { status: 404 });
    input = {
      type, id,
      title: data.title as string,
      startsAt: (data.starts_at as string | null) ?? null,
      description: (data.description as string | null) ?? null,
      location: (data.place as string | null) ?? null,
      url: `${base}/game-nights/${id}`,
    };
  }

  const ics = buildIcs(input);
  if (!ics) return NextResponse.json({ error: "no_date" }, { status: 409 });
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "event";
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
