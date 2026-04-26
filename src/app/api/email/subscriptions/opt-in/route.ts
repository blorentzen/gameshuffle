/**
 * POST /api/email/subscriptions/opt-in
 *
 * Records marketing opt-ins. Called from the signup flow right after a
 * successful Supabase registration when the user checked the marketing
 * checkbox. Also reusable later from the account preferences UI.
 *
 * Body: { email: string, categories: EmailCategory[], userId?: string }
 *
 * Anonymous (`userId` omitted) is allowed — captures opt-ins from
 * landing-page email-capture forms before the user has an account.
 * If the requester has a Supabase session, we trust that user_id over the
 * one in the body.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordOptIns, type EmailCategory } from "@/lib/email/subscriptions";

export const runtime = "nodejs";

const VALID_CATEGORIES: EmailCategory[] = ["product_updates", "tips_and_guides", "partner_offers"];
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rawCategories = Array.isArray(body.categories) ? body.categories : [];
  const categories: EmailCategory[] = rawCategories.filter(
    (c): c is EmailCategory => typeof c === "string" && VALID_CATEGORIES.includes(c as EmailCategory)
  );

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (categories.length === 0) {
    return NextResponse.json({ success: true, recorded: 0 });
  }

  // Prefer the active session's user_id over a body-supplied one — never
  // trust the client to pin opt-ins to an arbitrary account.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Anonymous flow — fine.
  }

  try {
    await recordOptIns({ email, userId, categories });
  } catch (err) {
    console.error("[email-opt-in] write failed:", err);
    return NextResponse.json({ error: "Failed to record preferences." }, { status: 500 });
  }

  return NextResponse.json({ success: true, recorded: categories.length });
}
