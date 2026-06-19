/**
 * Streamer-facing API for per-community overrides on platform
 * events. Mirrors `/api/account/default-command-overrides` shape:
 * tri-state per event (Off / Use default / Override) plus optional
 * flavor template + trigger_directly overrides.
 *
 * GET     — full event catalog joined with this community's overrides
 * PUT     — upsert an override
 * DELETE  — remove the override row → fall back to platform values
 *
 * The platform admin's PUT against `gs_events` never touches this
 * table — same non-clobber guarantee as default-command overrides.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";

export const runtime = "nodejs";

type EventSurface = "chaos" | "random" | "both";
type PartnerMode =
  | "none"
  | "mention"
  | "random_active"
  | "random_n"
  | "all_active";
type EventAuthority = "viewer" | "vip" | "mod" | "host";

interface EventRow {
  id: string;
  event_key: string;
  surface: EventSurface;
  flavor_tmpl: string;
  partner_mode: PartnerMode;
  partner_count: number | null;
  enabled: boolean;
  trigger_directly: boolean;
  min_authority: EventAuthority;
}

interface OverrideRow {
  event_id: string;
  enabled: boolean;
  flavor_tmpl_override: string | null;
  trigger_directly_override: boolean | null;
}

async function authedCommunityId(): Promise<
  | { ok: true; communityId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId)
    return { ok: false, status: 404, error: "no_community" };
  return { ok: true, communityId };
}

export async function GET() {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createServiceClient();
  const [eventsRes, overridesRes] = await Promise.all([
    admin
      .from("gs_events")
      .select(
        "id, event_key, surface, flavor_tmpl, partner_mode, partner_count, enabled, trigger_directly, min_authority",
      )
      .eq("enabled", true) // platform kill-switched events stay hidden
      .order("surface", { ascending: true })
      .order("event_key", { ascending: true }),
    admin
      .from("gs_event_overrides")
      .select(
        "event_id, enabled, flavor_tmpl_override, trigger_directly_override",
      )
      .eq("community_id", auth.communityId),
  ]);
  if (eventsRes.error) {
    return NextResponse.json(
      { error: eventsRes.error.message },
      { status: 500 },
    );
  }
  if (overridesRes.error) {
    return NextResponse.json(
      { error: overridesRes.error.message },
      { status: 500 },
    );
  }
  const events = (eventsRes.data as EventRow[] | null) ?? [];
  const overrides = (overridesRes.data as OverrideRow[] | null) ?? [];
  const overrideByEvent = new Map<string, OverrideRow>();
  for (const o of overrides) overrideByEvent.set(o.event_id, o);
  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({
      ...e,
      override: overrideByEvent.get(e.id) ?? null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    event_id?: string;
    enabled?: boolean;
    flavor_tmpl_override?: string | null;
    trigger_directly_override?: boolean | null;
  } | null;
  if (!body || !body.event_id) {
    return NextResponse.json(
      { error: "missing_event_id" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  // Verify the event exists + isn't platform-disabled.
  const { data: row } = await admin
    .from("gs_events")
    .select("id, enabled")
    .eq("id", body.event_id)
    .maybeSingle();
  const event = row as { id: string; enabled: boolean } | null;
  if (!event || !event.enabled) {
    return NextResponse.json(
      { error: "event_not_found" },
      { status: 404 },
    );
  }
  const enabled = body.enabled !== false;
  const flavorTmplOverride =
    typeof body.flavor_tmpl_override === "string" &&
    body.flavor_tmpl_override.trim()
      ? body.flavor_tmpl_override.trim()
      : null;
  // null = inherit platform default; true/false = explicit pin.
  const triggerDirectlyOverride =
    typeof body.trigger_directly_override === "boolean"
      ? body.trigger_directly_override
      : null;
  const { error } = await admin
    .from("gs_event_overrides")
    .upsert(
      {
        community_id: auth.communityId,
        event_id: body.event_id,
        enabled,
        flavor_tmpl_override: flavorTmplOverride,
        trigger_directly_override: triggerDirectlyOverride,
      },
      { onConflict: "community_id,event_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json(
      { error: "missing_event_id" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_event_overrides")
    .delete()
    .eq("community_id", auth.communityId)
    .eq("event_id", eventId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
