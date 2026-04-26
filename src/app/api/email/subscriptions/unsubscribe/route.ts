/**
 * POST /api/email/subscriptions/unsubscribe
 *
 * One-click unsubscribe for marketing emails. CAN-SPAM requires this be
 * accessible without login. Token is the per-email value minted by
 * `getOrCreateUnsubscribeToken` and embedded in every marketing send.
 *
 * Body: { token: string, category?: EmailCategory }
 *  - omit `category` to unsubscribe from all marketing categories at once
 */

import { NextResponse } from "next/server";
import {
  findEmailForUnsubscribeToken,
  unsubscribeAll,
  unsubscribeCategory,
  type EmailCategory,
} from "@/lib/email/subscriptions";

export const runtime = "nodejs";

const VALID_CATEGORIES: EmailCategory[] = ["product_updates", "tips_and_guides", "partner_offers"];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const category = typeof body.category === "string" ? (body.category as EmailCategory) : undefined;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const email = await findEmailForUnsubscribeToken(token);
  if (!email) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  try {
    if (category) {
      await unsubscribeCategory(email, category);
    } else {
      await unsubscribeAll(email);
    }
  } catch (err) {
    console.error("[unsubscribe] write failed:", err);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }

  return NextResponse.json({ success: true, email });
}
