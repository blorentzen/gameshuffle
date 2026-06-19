/**
 * POST /api/admin/events/[id]/consequences
 *
 * Create OR update a consequence on an event:
 *   - No `consequence_id` in body → create.
 *   - `consequence_id` in body    → update payload (ctype is immutable
 *                                   post-create; delete + recreate for
 *                                   a type change).
 *
 * The payload shape is `ctype`-specific:
 *   - token_delta: { min: number, max: number }
 *   - story:       {} (payload unused at runtime)
 *   - modifier:    { effect: string, scope: 'seconds'|'round'|'chapter',
 *                    duration: number }
 *   - challenge:   { variable_type, condition, reward?, penalty?,
 *                    visibility }
 *
 * Validation here is shape-only (right keys + right types). Semantic
 * validation (e.g. effect string is a known modifier) happens at fire
 * time in the engine, so admins can stage new consequence types in
 * advance of engine support.
 *
 * Staff/admin only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

type Ctype = "token_delta" | "modifier" | "challenge" | "story";
type ConsequenceTarget = "actor" | "partner" | "both";

interface PostBody {
  consequence_id?: string;
  ctype?: Ctype;
  payload?: Record<string, unknown>;
  /** Which party this consequence applies to. Defaults to 'actor'
   *  for backwards compatibility with single-party events created
   *  before the multi-party schema. */
  target?: ConsequenceTarget;
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

function validatePayload(
  ctype: Ctype,
  payload: Record<string, unknown>,
): string | null {
  switch (ctype) {
    case "token_delta": {
      if (typeof payload.min !== "number" || typeof payload.max !== "number") {
        return "token_delta requires numeric `min` and `max`.";
      }
      if (!Number.isFinite(payload.min) || !Number.isFinite(payload.max)) {
        return "token_delta min/max must be finite numbers.";
      }
      return null;
    }
    case "modifier": {
      if (typeof payload.effect !== "string" || !payload.effect.trim()) {
        return "modifier requires a non-empty `effect`.";
      }
      const duration = Number(payload.duration ?? 60);
      if (!Number.isInteger(duration) || duration <= 0) {
        return "modifier `duration` must be a positive integer.";
      }
      if (
        payload.scope &&
        !["seconds", "round", "chapter"].includes(payload.scope as string)
      ) {
        return "modifier `scope` must be seconds, round, or chapter.";
      }
      return null;
    }
    case "challenge": {
      const validTypes = ["binary", "placement", "pickone", "count"];
      if (
        !payload.variable_type ||
        !validTypes.includes(payload.variable_type as string)
      ) {
        return `challenge \`variable_type\` must be one of: ${validTypes.join(", ")}.`;
      }
      if (
        !payload.condition ||
        typeof payload.condition !== "object" ||
        Array.isArray(payload.condition)
      ) {
        return "challenge `condition` must be an object.";
      }
      if (
        payload.visibility &&
        !["public", "secret"].includes(payload.visibility as string)
      ) {
        return "challenge `visibility` must be public or secret.";
      }
      return null;
    }
    case "story":
      // No required fields for story consequences.
      return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id: eventId } = await params;
  if (!eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const admin = createServiceClient();

  const validTargets: ConsequenceTarget[] = ["actor", "partner", "both"];
  const target: ConsequenceTarget =
    body.target && validTargets.includes(body.target) ? body.target : "actor";

  // Update path — ctype is locked at create time. If the caller
  // wants a different type, they delete + recreate. target IS
  // editable since changing it doesn't break payload semantics.
  if (body.consequence_id) {
    const { data: existing } = await admin
      .from("gs_event_consequences")
      .select("id, event_id, ctype")
      .eq("id", body.consequence_id)
      .maybeSingle();
    const row = existing as
      | { id: string; event_id: string; ctype: Ctype }
      | null;
    if (!row || row.event_id !== eventId) {
      return NextResponse.json(
        { error: "consequence_not_found" },
        { status: 404 },
      );
    }
    const validationError = validatePayload(row.ctype, body.payload ?? {});
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const { error } = await admin
      .from("gs_event_consequences")
      .update({ payload: body.payload ?? {}, target })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: row.id });
  }

  // Create path.
  const validTypes: Ctype[] = ["token_delta", "modifier", "challenge", "story"];
  if (!body.ctype || !validTypes.includes(body.ctype)) {
    return NextResponse.json({ error: "invalid_ctype" }, { status: 400 });
  }
  const payload = body.payload ?? {};
  const validationError = validatePayload(body.ctype, payload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const { data, error } = await admin
    .from("gs_event_consequences")
    .insert({ event_id: eventId, ctype: body.ctype, payload, target })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
