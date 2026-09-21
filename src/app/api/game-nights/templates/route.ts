/**
 * GET    /api/game-nights/templates            → the host's templates
 * POST   /api/game-nights/templates            → create a template
 *          body: { fromNightId, name? }  OR  { name, data }
 * DELETE /api/game-nights/templates?id=<id>    → delete one
 *
 * Templates are host-owned reusable night setups (RLS-scoped). See
 * `supabase/game night-templates.sql`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listTemplates,
  createTemplate,
  createTemplateFromNight,
  deleteTemplate,
  type NightTemplateData,
} from "@/lib/game-nights/templates";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ templates: [] });
  return NextResponse.json({ templates: await listTemplates() });
}

export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const result = body?.fromNightId
    ? await createTemplateFromNight(String(body.fromNightId), body?.name ? String(body.name) : undefined)
    : await createTemplate(String(body?.name ?? ""), (body?.data ?? {}) as NightTemplateData);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.id });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const res = await deleteTemplate(id);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 400 });
}
