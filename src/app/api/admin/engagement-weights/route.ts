/**
 * GET /api/admin/engagement-weights — list all weights
 * PUT /api/admin/engagement-weights — update one row (upsert by
 *                                     signal_type)
 *
 * Lets staff rebalance engagement scoring without a deploy. Edits
 * propagate immediately — the PUT invalidates the runtime cache so
 * the next logSignal call sees the new value.
 *
 * Staff/admin only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { invalidateWeightCache } from "@/lib/engagement/signals";

export const runtime = "nodejs";

type SignalType =
  | "command_fired"
  | "event_fired"
  | "social_action"
  | "token_earned"
  | "token_spent";

const SIGNAL_TYPES: SignalType[] = [
  "command_fired",
  "event_fired",
  "social_action",
  "token_earned",
  "token_spent",
];

interface WeightRow {
  signal_type: SignalType;
  weight: number;
  note: string | null;
  updated_at: string;
}

interface PutBody {
  signal_type?: SignalType;
  weight?: number;
  note?: string | null;
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
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as { role: string | null } | null)?.role ?? null;
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
  const { data, error } = await admin
    .from("gs_engagement_weights")
    .select("signal_type, weight, note, updated_at")
    .order("signal_type", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    weights: (data ?? []) as WeightRow[],
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as PutBody | null;
  if (!body || !body.signal_type) {
    return NextResponse.json(
      { error: "missing_signal_type" },
      { status: 400 },
    );
  }
  if (!SIGNAL_TYPES.includes(body.signal_type)) {
    return NextResponse.json({ error: "invalid_signal_type" }, { status: 400 });
  }
  const weight = body.weight;
  if (!Number.isInteger(weight) || (weight as number) < 1) {
    return NextResponse.json(
      { error: "weight_must_be_positive_integer" },
      { status: 400 },
    );
  }
  const note = body.note?.trim() ? body.note.trim() : null;
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_engagement_weights")
    .upsert(
      { signal_type: body.signal_type, weight, note },
      { onConflict: "signal_type" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Bust the runtime cache so the next logSignal call reads the
  // new value instead of waiting for the TTL to expire.
  invalidateWeightCache();
  return NextResponse.json({ ok: true, signal_type: body.signal_type });
}
