/**
 * GET /api/admin/flavor-variables  → list
 * PUT /api/admin/flavor-variables  → upsert (create or update by `name`)
 *
 * Manages the dictionary of `{name}` tokens admins can reference in
 * event flavor templates. The engine in `src/lib/economy/events/
 * engine.ts` is the actual source of truth for which variables
 * resolve — this catalog just tells writers what's available.
 *
 * Staff/admin only — RLS on `gs_flavor_variables` is enabled with no
 * public policies, so the service role is the only way in.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

type VariableCategory = "caller" | "stream" | "profile" | "event" | "pool";

const VARIABLE_CATEGORIES: VariableCategory[] = [
  "caller",
  "stream",
  "profile",
  "event",
  "pool",
];

interface VariableRow {
  name: string;
  description: string;
  example: string;
  category: VariableCategory;
  created_at: string;
  updated_at: string;
}

interface PutBody {
  name?: string;
  description?: string;
  example?: string;
  category?: VariableCategory;
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
    .from("gs_flavor_variables")
    .select("name, description, example, category, created_at, updated_at")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, variables: (data ?? []) as VariableRow[] });
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
  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  const example = (body.example ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  // Mirror the DB CHECK so admins get a friendly error instead of a
  // raw constraint violation.
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return NextResponse.json(
      {
        error:
          "Name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.",
      },
      { status: 400 },
    );
  }
  if (!description) {
    return NextResponse.json(
      { error: "description_required" },
      { status: 400 },
    );
  }
  const category: VariableCategory =
    body.category && VARIABLE_CATEGORIES.includes(body.category)
      ? body.category
      : "stream";
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_flavor_variables")
    .upsert(
      { name, description, example, category },
      { onConflict: "name" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, name });
}
