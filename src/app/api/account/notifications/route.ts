/**
 * GET   /api/account/notifications → { muted, email, emailAddress }
 * PATCH /api/account/notifications { muted?: string[] } | { email: { category, on } }
 *
 * The account › Notifications tab: muted on-site notification groups
 * (users.notification_prefs, see notificationGroups.ts) and email
 * subscriptions by category (email_subscriptions). Text messages have their
 * own route (/api/account/phone). Signed-in account only; service role writes.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isGroupId } from "@/lib/social/notificationGroups";
import { ALL_EMAIL_CATEGORIES, getSubscriptionState, recordOptIns, unsubscribeCategory, type EmailCategory } from "@/lib/email/subscriptions";

export const runtime = "nodejs";

async function me() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data } = await createServiceClient().from("users").select("notification_prefs").eq("id", user.id).maybeSingle();
  const raw = (data as { notification_prefs?: { muted?: unknown } } | null)?.notification_prefs?.muted;
  const muted = Array.isArray(raw) ? raw.filter(isGroupId) : [];
  const email = user.email ? await getSubscriptionState(user.email).catch(() => null) : null;
  return NextResponse.json({ ok: true, muted, email, emailAddress: user.email ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { muted?: unknown; email?: { category?: unknown; on?: unknown } } | null;

  if (Array.isArray(body?.muted)) {
    const muted = [...new Set(body.muted.filter(isGroupId))];
    const svc = createServiceClient();
    const { data } = await svc.from("users").select("notification_prefs").eq("id", user.id).maybeSingle();
    const prefs = ((data as { notification_prefs?: Record<string, unknown> } | null)?.notification_prefs ?? {}) as Record<string, unknown>;
    const { error } = await svc.from("users").update({ notification_prefs: { ...prefs, muted } }).eq("id", user.id);
    if (error) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, muted });
  }

  const category = body?.email?.category;
  if (typeof category === "string" && (ALL_EMAIL_CATEGORIES as string[]).includes(category) && typeof body?.email?.on === "boolean") {
    if (!user.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
    if (body.email.on) await recordOptIns({ email: user.email, userId: user.id, categories: [category as EmailCategory] });
    else await unsubscribeCategory(user.email, category as EmailCategory);
    return NextResponse.json({ ok: true, email: await getSubscriptionState(user.email) });
  }
  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}
