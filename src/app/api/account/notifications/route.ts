/**
 * GET   /api/account/notifications → { channels, muted, email, emailAddress, discordLinked, discordBlocked }
 * PATCH /api/account/notifications { channel: { group, kind: site|email|discord, on } }
 *                                 | { muted: string[] } | { email: { category, on } }
 *
 * Settings ▸ Notifications: each kind of news (a group in notificationGroups.ts) On site, by Email and on Discord,
 * stored in users.notification_prefs, and GameShuffle's own emails by category (email_subscriptions). Text messages
 * have their own route (/api/account/phone). Signed-in account only; service role writes.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { NOTIFICATION_GROUPS, channelOn, isGroupId, readNotifPrefs, type NotifChannel } from "@/lib/social/notificationGroups";
import { ALL_EMAIL_CATEGORIES, getSubscriptionState, recordOptIns, unsubscribeCategory, type EmailCategory } from "@/lib/email/subscriptions";

export const runtime = "nodejs";

async function me() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data } = await createServiceClient().from("users").select("notification_prefs, discord_id").eq("id", user.id).maybeSingle();
  const row = data as { notification_prefs?: unknown; discord_id?: string | null } | null;
  const prefs = readNotifPrefs(row?.notification_prefs);
  const email = user.email ? await getSubscriptionState(user.email).catch(() => null) : null;
  return NextResponse.json({
    ok: true,
    channels: channelsOf(prefs),
    muted: prefs.muted,
    email,
    emailAddress: user.email ?? null,
    discordLinked: !!row?.discord_id,
    discordBlocked: prefs.discordBlockedAt ?? null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

const KINDS: NotifChannel[] = ["site", "email", "discord"];

function channelsOf(prefs: ReturnType<typeof readNotifPrefs>): Record<string, Record<NotifChannel, boolean>> {
  return Object.fromEntries(NOTIFICATION_GROUPS.map((g) => [g.id, { site: channelOn(prefs, g.id, "site"), email: channelOn(prefs, g.id, "email"), discord: channelOn(prefs, g.id, "discord") }]));
}

export async function PATCH(request: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { muted?: unknown; email?: { category?: unknown; on?: unknown }; channel?: { group?: unknown; kind?: unknown; on?: unknown } } | null;

  const ch = body?.channel;
  if (ch && isGroupId(ch.group) && KINDS.includes(ch.kind as NotifChannel) && typeof ch.on === "boolean") {
    const group = ch.group, kind = ch.kind as NotifChannel, on = ch.on;
    const svc = createServiceClient();
    const { data } = await svc.from("users").select("notification_prefs, discord_id").eq("id", user.id).maybeSingle();
    const row = data as { notification_prefs?: Record<string, unknown> | null; discord_id?: string | null } | null;
    if (kind === "discord" && on && !row?.discord_id) return NextResponse.json({ ok: false, error: "no_discord" }, { status: 400 });
    if (kind === "email" && on && !user.email) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
    const stored = (row?.notification_prefs ?? {}) as Record<string, unknown>;
    const prefs = readNotifPrefs(stored);
    const next: Record<string, unknown> = { ...stored };
    if (kind === "site") next.muted = on ? prefs.muted.filter((m) => m !== group) : [...new Set([...prefs.muted, group])];
    else next[kind] = { ...prefs[kind], [group]: on };
    // Turning Discord on again is a fresh try after the bot couldn't reach them.
    if (kind === "discord" && on) next.discordBlockedAt = null;
    const { error } = await svc.from("users").update({ notification_prefs: next }).eq("id", user.id);
    if (error) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, channels: channelsOf(readNotifPrefs(next)) });
  }

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
