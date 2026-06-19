/**
 * GET /api/flavor-variables — public read of the flavor-variable
 * catalog for client-side autocomplete in template editors.
 *
 * The catalog is documentation, not sensitive data. Any
 * authenticated user (streamer or admin) can fetch it. The
 * `/api/admin/flavor-variables` endpoints stay staff-only for
 * write access.
 *
 * Consumed by `VariableAutocomplete` across:
 *   - Platform Admin → Events (flavor_tmpl field)
 *   - Platform Admin → Default Commands (response_template + pool)
 *   - Streamer Account → Chat Commands (custom response_tmpl +
 *     default-command override custom_response)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type VariableCategory = "caller" | "stream" | "profile" | "event" | "pool";

interface VariableRow {
  name: string;
  description: string;
  example: string;
  category: VariableCategory;
}

export async function GET() {
  // Require auth — no point exposing this to anonymous traffic.
  // Anyone signed in can read; we just don't want it indexable.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const admin = createServiceClient();
  // Try the categorized read first; fall back to the legacy shape
  // (no `category` column) if the categories migration hasn't been
  // applied yet. Keeps autofill working through the deploy gap;
  // remove this fallback once every environment has run the
  // migration.
  const { data: catData, error: catError } = await admin
    .from("gs_flavor_variables")
    .select("name, description, example, category")
    .order("category")
    .order("name");
  if (!catError) {
    return NextResponse.json({
      ok: true,
      variables: (catData ?? []) as VariableRow[],
    });
  }
  const { data: legacyData, error: legacyError } = await admin
    .from("gs_flavor_variables")
    .select("name, description, example")
    .order("name");
  if (legacyError) {
    return NextResponse.json({ error: legacyError.message }, { status: 500 });
  }
  const rows =
    ((legacyData as Omit<VariableRow, "category">[] | null) ?? []).map(
      (r) => ({ ...r, category: "stream" as const }),
    );
  return NextResponse.json({ ok: true, variables: rows });
}
