/**
 * One of your GIFs (signed in, owner only).
 *   PATCH { alt?, tags?, shared? } → { gif }   (blocked_words 400, not_found 404)
 *   DELETE                         → { ok }     (the files are deleted; comments that used it say it was removed)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteGif, gifsReady, updateGif } from "@/lib/gifs/store";

export const runtime = "nodejs";

async function owner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await owner();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await gifsReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { alt?: unknown; tags?: unknown; shared?: unknown } | null;
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const res = await updateGif(user.id, id, body);
  if (res.ok) return NextResponse.json({ gif: res.gif });
  return NextResponse.json({ error: res.error }, { status: res.error === "not_found" ? 404 : 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await owner();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await gifsReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  return (await deleteGif(user.id, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
