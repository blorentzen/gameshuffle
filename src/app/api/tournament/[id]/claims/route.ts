import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { canManageTournament } from "@/lib/tournaments/access";
import QRCode from "qrcode";
import { getBaseUrl } from "@/lib/env";
import { issueClaim, listClaims, unlinkParticipant, MANUAL_TTL_MS } from "@/lib/tournaments/claims";

export const runtime = "nodejs";

/**
 * Organizer view of guest claims (spec F, phase 1).
 *   GET                                  claim status per guest entry
 *   POST { action:"unlink", participantId, reason? }   revert a mistaken claim
 *   POST { action:"issue_manual", participantId }    a 72-hour claim link (and
 *        QR) for a guest, typically one who left no contact
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
  if (!body.participantId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (body.action === "issue_manual") {
    const { data: part } = await createServiceClient().from("tournament_participants").select("id, user_id")
      .eq("id", body.participantId).eq("tournament_id", id).maybeSingle();
    if (!part) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if ((part as { user_id: string | null }).user_id) return NextResponse.json({ error: "not_a_guest" }, { status: 409 });
    const token = await issueClaim({ tournamentId: id, participantId: body.participantId, kind: "manual", issuedBy: g.userId, ttlMs: MANUAL_TTL_MS });
    // Null before tournament-claims-m1: the old table cannot hold a claim with no email.
    if (!token) return NextResponse.json({ error: "unavailable" }, { status: 409 });
    const url = `${getBaseUrl()}/claim/${token}`;
    const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 220 });
    return NextResponse.json({ ok: true, url, svg, expiresAt: new Date(Date.now() + MANUAL_TTL_MS).toISOString() });
  }

  if (body.action !== "unlink") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await unlinkParticipant(id, body.participantId, g.userId, body.reason ?? null);
  return res === "ok" ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res }, { status: 409 });
}
