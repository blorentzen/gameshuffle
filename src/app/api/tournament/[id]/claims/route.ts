import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { canManageTournament } from "@/lib/tournaments/access";
import { listClaims, unlinkParticipant } from "@/lib/tournaments/claims";

export const runtime = "nodejs";

/**
 * Organizer view of guest claims (spec F, phase 1).
 *   GET                                  claim status per guest entry
 *   POST { action:"unlink", participantId, reason? }   revert a mistaken claim
 * Organizers and co-organizers. Every unlink is written to the audit log.
 */
async function gate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };
  const role = await getTournamentRole(createServiceClient(), id, user.id);
  if (!canManageTournament(role)) return { error: "forbidden" as const, status: 403 };
  return { userId: user.id };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ claims: await listClaims(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const body = (await req.json().catch(() => ({}))) as { action?: string; participantId?: string; reason?: string };
  if (body.action !== "unlink" || !body.participantId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await unlinkParticipant(id, body.participantId, g.userId, body.reason ?? null);
  return res === "ok" ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res }, { status: 409 });
}
