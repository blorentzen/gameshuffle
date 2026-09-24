/**
 * Staff-only admin for per-tournament Circuit access overrides.
 *
 *   GET    ?q=…        → recent (or matching) tournaments with their active override
 *   POST   { tournamentId, type, playerCap?, note?, stripeInvoiceId?, expiresAt? }
 *                       → grant an override
 *   DELETE ?id=…        → revoke (soft) an override
 *
 * All reads/writes go through the service role after a staff-role check. The
 * override feeds the Decision-8 precedence via getTournamentOverride.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if (!isStaffRole((data as { role: string | null } | null)?.role ?? null)) return { ok: false as const, status: 403 };
  return { ok: true as const, userId: user.id, admin };
}

const OVERRIDE_SELECT = "id, type, player_cap, note, stripe_invoice_id, created_at, expires_at, revoked_at";

export async function GET(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  const { admin } = gate;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const statusFilter = (sp.get("status") ?? "").trim();

  // Platform-wide totals, independent of the page and the search box, so the
  // summary answers "how much is there" rather than "how much is on screen".
  const counts: Record<string, number> = {};
  const { data: allStatuses } = await admin.from("tournaments").select("status").limit(5000);
  for (const r of (allStatuses ?? []) as { status: string }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  counts.total = (allStatuses ?? []).length;

  let query = admin
    .from("tournaments")
    .select("id, title, game_slug, status, max_participants, organizer_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data: tournaments } = await query;
  const rows = (tournaments ?? []) as { id: string; title: string; game_slug: string; status: string; max_participants: number | null; organizer_id: string; created_at: string }[];
  if (rows.length === 0) return NextResponse.json({ tournaments: [], counts });

  const ids = rows.map((t) => t.id);
  const [{ data: orgs }, { data: overrides }, { data: parts }] = await Promise.all([
    admin.from("users").select("id, display_name, username").in("id", rows.map((t) => t.organizer_id)),
    admin.from("tournament_entitlements").select(OVERRIDE_SELECT + ", tournament_id").in("tournament_id", ids).is("revoked_at", null).order("created_at", { ascending: false }),
    admin.from("tournament_participants").select("tournament_id").in("tournament_id", ids),
  ]);
  const orgById = new Map((orgs ?? []).map((o) => [(o as { id: string }).id, o as { display_name: string | null; username: string | null }]));
  const countById = new Map<string, number>();
  for (const p of (parts ?? []) as { tournament_id: string }[]) countById.set(p.tournament_id, (countById.get(p.tournament_id) ?? 0) + 1);
  const now = Date.now();
  const overrideById = new Map<string, unknown>();
  for (const o of (overrides ?? []) as unknown as ({ tournament_id: string; expires_at: string | null })[]) {
    if (o.expires_at && new Date(o.expires_at).getTime() <= now) continue;
    if (!overrideById.has(o.tournament_id)) overrideById.set(o.tournament_id, o); // most recent active
  }

  return NextResponse.json({
    counts,
    tournaments: rows.map((t) => {
      const org = orgById.get(t.organizer_id);
      return {
        id: t.id,
        title: t.title,
        gameSlug: t.game_slug,
        status: t.status,
        maxParticipants: t.max_participants,
        participants: countById.get(t.id) ?? 0,
        organizer: org?.display_name || org?.username || "Unknown",
        createdAt: t.created_at,
        override: overrideById.get(t.id) ?? null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const tournamentId = String(body?.tournamentId ?? "");
  const type = String(body?.type ?? "");
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId." }, { status: 400 });
  if (!["gs_sponsored", "circuit_events", "partner_comp"].includes(type)) return NextResponse.json({ error: "Invalid type." }, { status: 400 });

  const playerCap = body?.playerCap == null || body.playerCap === "" ? null : Number(body.playerCap);
  const row = {
    tournament_id: tournamentId,
    type,
    player_cap: Number.isFinite(playerCap as number) ? playerCap : null,
    note: body?.note ? String(body.note).slice(0, 500) : null,
    stripe_invoice_id: body?.stripeInvoiceId ? String(body.stripeInvoiceId) : null,
    expires_at: body?.expiresAt ? new Date(body.expiresAt).toISOString() : null,
    granted_by: gate.userId,
  };
  const { data, error } = await gate.admin.from("tournament_entitlements").insert(row).select(OVERRIDE_SELECT).single();
  if (error) return NextResponse.json({ error: "Could not grant override." }, { status: 500 });
  return NextResponse.json({ override: data });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await gate.admin.from("tournament_entitlements").update({ revoked_at: new Date().toISOString(), revoked_by: gate.userId }).eq("id", id);
  return NextResponse.json({ ok: true });
}
