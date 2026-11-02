/**
 * GET  /api/war/looks → the signed-in account's saved war overlay looks ({ looks: [{ id, look }] }).
 * POST /api/war/looks { look } → saves it as the account's look for its layout ({ id, paidShown }). Paid choices are
 * kept either way; the overlay shows them only while the account has GS Pro or Supporter looks.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasLooks } from "@/lib/support/looks";
import { looksReady, myLooks, saveLook } from "@/lib/wars/looks";

export const runtime = "nodejs";

async function viewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await viewer();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await looksReady())) return NextResponse.json({ looks: [], ready: false });
  return NextResponse.json({ looks: await myLooks(user.id), ready: true });
}

export async function POST(req: Request) {
  const user = await viewer();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await looksReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { look?: unknown };
  const id = await saveLook(user.id, body.look);
  if (!id) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ id, paidShown: await hasLooks(user.id).catch(() => false) });
}
