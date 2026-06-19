/**
 * GET / PUT /api/admin/events
 *
 * Staff/admin-only management of the global event catalog
 * (`gs_events`). Drives the Platform Admin → Events tab on
 * /account. The chaos + random event decks both pull from this
 * table; toggling `enabled` or editing `flavor_tmpl` here flows
 * through to the next event fire system-wide.
 *
 * Authorization: every method checks `users.role` server-side and
 * returns 403 for anything other than 'staff' or 'admin'. No client
 * trust — even if the page hides the surface, the API would refuse
 * a direct fetch from a non-staff caller.
 *
 * Read shape includes typed consequences (token_delta / modifier /
 * challenge / story) so the UI can preview an event's effects in
 * the edit modal without a second round trip.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

type PartnerMode =
  | "none"
  | "mention"
  | "random_active"
  | "random_n"
  | "all_active";
type ConsequenceTarget = "actor" | "partner" | "both";
type EventAuthority = "viewer" | "vip" | "mod" | "host";

const PARTNER_MODES: PartnerMode[] = [
  "none",
  "mention",
  "random_active",
  "random_n",
  "all_active",
];
const EVENT_AUTHORITIES: EventAuthority[] = ["viewer", "vip", "mod", "host"];

/** Modes that fan out to multiple viewers and require partner_count
 *  to express either K (random_n) or the cap (all_active). */
const FANOUT_MODES = new Set<PartnerMode>(["random_n", "all_active"]);

interface EventRow {
  id: string;
  event_key: string;
  surface: "chaos" | "random" | "both";
  flavor_tmpl: string;
  weight: number;
  game_scope: string | null;
  enabled: boolean;
  partner_mode: PartnerMode;
  partner_count: number | null;
  trigger_directly: boolean;
  min_authority: EventAuthority;
  created_at: string;
}

interface ConsequenceRow {
  id: string;
  event_id: string;
  ctype: "token_delta" | "modifier" | "challenge" | "story";
  payload: Record<string, unknown>;
  target: ConsequenceTarget;
}

async function requireStaff(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createServiceClient();
  const [{ data: eventRows }, { data: consequenceRows }] = await Promise.all([
    admin
      .from("gs_events")
      .select(
        "id, event_key, surface, flavor_tmpl, weight, game_scope, enabled, partner_mode, partner_count, trigger_directly, min_authority, created_at",
      )
      .order("surface", { ascending: true })
      .order("event_key", { ascending: true }),
    admin
      .from("gs_event_consequences")
      .select("id, event_id, ctype, payload, target"),
  ]);

  const events = (eventRows as EventRow[] | null) ?? [];
  const consequences = (consequenceRows as ConsequenceRow[] | null) ?? [];
  const byEvent = new Map<string, ConsequenceRow[]>();
  for (const c of consequences) {
    const list = byEvent.get(c.event_id) ?? [];
    list.push(c);
    byEvent.set(c.event_id, list);
  }
  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({
      ...e,
      consequences: byEvent.get(e.id) ?? [],
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as
    | (Partial<EventRow> & { id?: string })
    | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.event_key?.trim()) {
    return NextResponse.json(
      { error: "event_key_required" },
      { status: 400 },
    );
  }
  if (!body.surface || !["chaos", "random", "both"].includes(body.surface)) {
    return NextResponse.json({ error: "invalid_surface" }, { status: 400 });
  }
  if (!body.flavor_tmpl?.trim()) {
    return NextResponse.json(
      { error: "flavor_tmpl_required" },
      { status: 400 },
    );
  }
  const weight =
    typeof body.weight === "number" && body.weight > 0 ? body.weight : 100;
  const enabled = body.enabled !== false;
  const game_scope = body.game_scope?.trim() || null;
  const partner_mode: PartnerMode =
    body.partner_mode && PARTNER_MODES.includes(body.partner_mode)
      ? body.partner_mode
      : "none";

  // partner_count is meaningful for fanout modes only. For single-
  // party / mention / random_active it's stored as NULL so the DB
  // shape stays honest.
  let partner_count: number | null = null;
  if (FANOUT_MODES.has(partner_mode)) {
    const raw =
      typeof body.partner_count === "number"
        ? body.partner_count
        : parseInt(String(body.partner_count ?? ""), 10);
    if (!Number.isInteger(raw) || raw < 1) {
      return NextResponse.json(
        {
          error:
            "partner_count must be a positive integer when partner_mode is random_n or all_active.",
        },
        { status: 400 },
      );
    }
    partner_count = raw;
  }

  const trigger_directly = body.trigger_directly === true;
  const min_authority: EventAuthority =
    body.min_authority && EVENT_AUTHORITIES.includes(body.min_authority)
      ? body.min_authority
      : "viewer";

  const admin = createServiceClient();
  const payload = {
    event_key: body.event_key.trim(),
    surface: body.surface,
    flavor_tmpl: body.flavor_tmpl.trim(),
    weight,
    game_scope,
    enabled,
    partner_mode,
    partner_count,
    trigger_directly,
    min_authority,
  };

  if (body.id) {
    const { error } = await admin
      .from("gs_events")
      .update(payload)
      .eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: body.id });
  }
  const { data, error } = await admin
    .from("gs_events")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
