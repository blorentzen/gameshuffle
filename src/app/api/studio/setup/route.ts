import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { streamSetup } from "@/lib/streaming/setup";

/** GET: the Studio's setup steps, done or not (the guided setup checks every few seconds so a step ticks itself). */
export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const steps = await streamSetup(user.id).catch(() => null);
  return NextResponse.json({ steps }, { headers: { "Cache-Control": "no-store" } });
}
