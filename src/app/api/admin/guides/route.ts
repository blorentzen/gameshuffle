/**
 * Staff-only guides CRUD, behind the caller's own session.
 *
 * Every query uses the request's Supabase client rather than the service role,
 * so RLS on `gs_guides` decides. A role check here would be a second source of
 * truth that could drift from the policy; letting the policy refuse means
 * there is only one.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GUIDE_CLUSTERS } from "@/lib/guides/manifest";

export const runtime = "nodejs";

const CLUSTERS = new Set(GUIDE_CLUSTERS.map((c) => c.id));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The table has not been created yet, as opposed to the caller being refused. */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || /schema cache|relation .* does not exist/i.test(error.message ?? "");
}

type Body = {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  cluster?: string;
  bodyMd?: string;
  minutes?: number;
  gameSpecific?: string | null;
  published?: boolean;
};

function validate(b: Body): string | null {
  if (!b.slug || !SLUG.test(b.slug)) return "Slug must be lowercase words separated by hyphens.";
  if (!b.title?.trim()) return "Title is required.";
  if (!b.description?.trim()) return "Description is required: it is the meta description and the index card.";
  if (!b.cluster || !CLUSTERS.has(b.cluster as never)) return "Pick a cluster.";
  // Publishing an empty body would put a blank page in the sitemap.
  if (b.published && !b.bodyMd?.trim()) return "Cannot publish a guide with no body.";
  if (b.minutes != null && (b.minutes < 1 || b.minutes > 90)) return "Read time should be between 1 and 90 minutes.";
  return null;
}

const toRow = (b: Body) => ({
  slug: b.slug!.trim(),
  title: b.title!.trim(),
  description: b.description!.trim(),
  cluster: b.cluster!,
  body_md: b.bodyMd ?? "",
  minutes: b.minutes ?? 6,
  game_specific: b.gameSpecific || null,
  published: !!b.published,
});

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gs_guides")
    .select("id, slug, title, description, cluster, body_md, minutes, game_specific, published, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    // Distinguish "not migrated yet" from "not allowed", so the UI can say
    // something true rather than a generic failure. PostgREST reports a missing
    // table as PGRST205 ("Could not find the table ... in the schema cache"),
    // NOT as Postgres's own "relation does not exist", which is what an
    // earlier version of this checked for and why it mislabelled the case.
    if (isMissingTable(error)) return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ guides: data });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const problem = validate(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data, error } = await supabase
    .from("gs_guides")
    .insert({ ...toRow(body), author_id: user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A guide already uses that slug." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const problem = validate(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("gs_guides").update(toRow(body)).eq("id", body.id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A guide already uses that slug." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("gs_guides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}
