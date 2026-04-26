/**
 * POST /api/dsar/submit-authenticated
 *
 * Authenticated DSAR submission. Identity is verified by the active
 * Supabase session, so the row is inserted with status='verified' and
 * `verified_by='authenticated_session'` — no magic-link step. Sends both
 * the admin notification and a requester confirmation immediately.
 *
 * Per gs-dsar-spec.md §5.2.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  sendDSARAdminNotification,
  sendDSARRequesterConfirmation,
} from "@/lib/email/dsar";

export const runtime = "nodejs";

const VALID_REQUEST_TYPES = new Set([
  "access",
  "correction",
  "deletion",
  "portability",
  "opt_out_marketing",
  "opt_out_sale",
  "other",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestType: string = typeof body.request_type === "string" ? body.request_type : "";
  const description: string | null =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, 1000)
      : null;
  const confirmed: boolean = body.confirmed === true;

  if (!VALID_REQUEST_TYPES.has(requestType)) {
    return NextResponse.json({ error: "Please select a valid request type." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json(
      { error: "Please confirm this request relates to your own account." },
      { status: 400 }
    );
  }

  const verifiedAt = new Date();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const requesterName: string | null =
    (typeof meta?.display_name === "string" && meta.display_name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    null;

  const admin = createServiceClient();
  const { data: dsarRow, error: insertErr } = await admin
    .from("dsar_requests")
    .insert({
      user_id: user.id,
      requester_email: user.email.toLowerCase(),
      requester_name: requesterName,
      request_type: requestType,
      description,
      status: "verified",
      verified_by: "authenticated_session",
      verified_at: verifiedAt.toISOString(),
    })
    .select("id, response_due_at")
    .single();

  if (insertErr || !dsarRow) {
    console.error("[dsar/submit-authenticated] insert failed:", insertErr);
    return NextResponse.json({ error: "Failed to submit request." }, { status: 500 });
  }

  const responseDueAt = new Date(dsarRow.response_due_at);

  await Promise.all([
    sendDSARAdminNotification({
      requestId: dsarRow.id,
      requesterEmail: user.email,
      requesterName,
      requestType,
      description,
      verifiedBy: "authenticated_session",
      verifiedAt,
      responseDueAt,
      hasAccountMatch: true,
    }),
    sendDSARRequesterConfirmation({
      to: user.email,
      name: requesterName,
      requestType,
      submittedAt: verifiedAt,
      responseDueAt,
    }),
  ]).catch((err) => {
    console.error("[dsar/submit-authenticated] notification email error (non-fatal):", err);
  });

  return NextResponse.json({ success: true });
}
