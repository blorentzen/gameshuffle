/**
 * POST /api/board-game-nights/[id]/rsvp → set the signed-in user's RSVP.
 * Body: { status: "going" | "maybe" | "declined" }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { setRsvp } from "@/lib/board-game-nights/store";
import type { RsvpStatus } from "@/lib/board-game-nights/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status: RsvpStatus =
    body.status === "maybe" ? "maybe" : body.status === "declined" ? "declined" : "going";

  const res = await setRsvp(id, status);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status });
}
