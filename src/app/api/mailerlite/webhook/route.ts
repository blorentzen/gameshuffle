/**
 * POST /api/mailerlite/webhook?secret=<MAILERLITE_WEBHOOK_SECRET>
 *
 * Mirrors MailerLite marketing opt-outs back into GameShuffle so consent stays
 * consistent across both systems. When someone clicks the native `{$unsubscribe}`
 * link (or files a spam complaint) in a MailerLite email, MailerLite fires here
 * and we mark `email_subscriptions.unsubscribed_at` for that address.
 *
 * Why this matters: without it, GS would still count them as opted-in and the
 * daily sync (`/api/cron/mailerlite-sync`) would keep touching them. This closes
 * the loop so MailerLite's unsubscribe is authoritative and GS follows.
 *
 * Auth: MailerLite webhooks aren't HMAC-signed, so we gate on a shared secret in
 * the URL (`?secret=`) that you set when registering the webhook.
 *
 * Note: this only writes to GS's own table — it never calls back into MailerLite,
 * so there's no risk of a suppress/unsubscribe loop.
 */

import { NextResponse } from "next/server";
import { unsubscribeAll } from "@/lib/email/subscriptions";

export const runtime = "nodejs";

function extractEmail(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  if (typeof rec.email === "string") return rec.email;
  const sub = rec.subscriber;
  if (sub && typeof sub === "object") {
    const subEmail = (sub as Record<string, unknown>).email;
    if (typeof subEmail === "string") return subEmail;
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.MAILERLITE_WEBHOOK_SECRET;
  if (secret) {
    const provided = new URL(request.url).searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[mailerlite/webhook] MAILERLITE_WEBHOOK_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // MailerLite batches events under `events`; tolerate a single-event body too.
  const bodyRec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const events: unknown[] = Array.isArray(bodyRec.events) ? (bodyRec.events as unknown[]) : [body];

  let handled = 0;
  for (const ev of events) {
    const evRec = ev && typeof ev === "object" ? (ev as Record<string, unknown>) : {};
    const type = typeof evRec.type === "string" ? evRec.type : "";
    // subscriber.unsubscribe(d), subscriber.spam_complaint, etc.
    if (!/unsubscribe|spam/i.test(type)) continue;

    const email = extractEmail(evRec.data) ?? extractEmail(evRec);
    if (!email) continue;

    try {
      await unsubscribeAll(email.toLowerCase());
      handled += 1;
    } catch (err) {
      console.error("[mailerlite/webhook] unsubscribeAll failed:", err);
    }
  }

  return NextResponse.json({ received: true, handled });
}
