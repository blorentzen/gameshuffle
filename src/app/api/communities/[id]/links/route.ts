/**
 * Community links API.
 *   PATCH — replace the community's creator links (owner only).
 * `[id]` is the gs_communities id.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateCommunityLinks } from "@/lib/communities/membership";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const links = (body as { links?: unknown })?.links;
  const result = await updateCommunityLinks(user.id, id, links);
  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, links: result.links });
}
