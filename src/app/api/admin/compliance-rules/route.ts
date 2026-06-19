/**
 * GET /api/admin/compliance-rules — list every rule
 * PUT /api/admin/compliance-rules — upsert (id present = update,
 *                                    absent = create)
 *
 * Compliance rules (`gs_compliance_rules`) gate token-economy
 * surfaces by region. Public SELECT exists on the table so viewers
 * can introspect availability without auth; writes are admin-only
 * via this endpoint.
 *
 * Schema (region_code, compliance_class, genre) is unique — the
 * upsert collapses identical-tuple edits into an update.
 *
 * NOT LEGAL ADVICE — the rule set mirrors comparable platforms'
 * public restrictions. The final mapping is a counsel question;
 * admins update via this surface as guidance changes.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

type ComplianceClass = "prediction_pool" | "casino_style";
type Behavior = "full" | "spectator" | "unavailable";

const CLASSES: ComplianceClass[] = ["prediction_pool", "casino_style"];
const BEHAVIORS: Behavior[] = ["full", "spectator", "unavailable"];

interface RuleRow {
  id: number;
  region_code: string;
  compliance_class: ComplianceClass;
  genre: string | null;
  behavior: Behavior;
  note: string | null;
  created_at: string;
}

interface PutBody {
  id?: number;
  region_code?: string;
  compliance_class?: ComplianceClass;
  genre?: string | null;
  behavior?: Behavior;
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
    .from("gs_compliance_rules")
    .select(
      "id, region_code, compliance_class, genre, behavior, note, created_at",
    )
    .order("compliance_class", { ascending: true })
    .order("region_code", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    rules: (data ?? []) as RuleRow[],
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as PutBody | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const region_code = (body.region_code ?? "").trim().toUpperCase();
  if (!region_code) {
    return NextResponse.json(
      { error: "region_code_required" },
      { status: 400 },
    );
  }
  // ISO 3166-1 alpha-2 (US, GB, DE) optionally with a 2–3 char
  // subdivision suffix (CA-QC, US-NY). Keep the regex permissive
  // to match the seed shape (`CA-QC`) without over-enforcing.
  if (!/^[A-Z]{2}(-[A-Z0-9]{2,3})?$/.test(region_code)) {
    return NextResponse.json(
      {
        error:
          "Region code must be ISO format (e.g. US, GB, CA-QC).",
      },
      { status: 400 },
    );
  }

  const compliance_class = body.compliance_class;
  if (!compliance_class || !CLASSES.includes(compliance_class)) {
    return NextResponse.json({ error: "invalid_class" }, { status: 400 });
  }
  const behavior = body.behavior;
  if (!behavior || !BEHAVIORS.includes(behavior)) {
    return NextResponse.json({ error: "invalid_behavior" }, { status: 400 });
  }
  // Genre is nullable — empty string = all genres = NULL in DB.
  const genre = body.genre?.trim() ? body.genre.trim() : null;
  const note = body.note?.trim() ? body.note.trim() : null;

  const admin = createServiceClient();
  const payload = {
    region_code,
    compliance_class,
    genre,
    behavior,
    note,
  };

  if (body.id) {
    const { error } = await admin
      .from("gs_compliance_rules")
      .update(payload)
      .eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: body.id });
  }
  // Create: rely on the (region_code, compliance_class, genre)
  // unique constraint to keep duplicates out.
  const { data, error } = await admin
    .from("gs_compliance_rules")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: number }).id });
}
