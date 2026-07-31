/** POST /api/ideas — submit a new idea (auth + Turnstile + 24h cap). */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createIdea } from "@/lib/ideas/store";
import { IDEA_CATEGORIES, type IdeaCategory } from "@/lib/ideas/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    body?: string;
    category?: string;
    turnstileToken?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const ok = await verifyTurnstileToken(
    body.turnstileToken,
    req.headers.get("x-forwarded-for") ?? undefined,
  );
  if (!ok) return NextResponse.json({ error: "captcha" }, { status: 400 });

  const category = body.category as IdeaCategory;
  if (!IDEA_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "bad_category" }, { status: 400 });
  }

  const res = await createIdea({
    authorId: user.id,
    title: body.title ?? "",
    body: body.body ?? "",
    category,
  });
  if (!res.ok) {
    const status = res.reason === "rate_limited" ? 429 : res.reason === "restricted" ? 403 : 400;
    return NextResponse.json({ error: res.reason }, { status });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
