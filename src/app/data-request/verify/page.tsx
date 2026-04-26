/**
 * /data-request/verify?token=...&id=...
 *
 * Verifies a public DSAR submission. On success, advances the row to
 * 'verified', clears the token, and fires the admin notification +
 * requester confirmation emails. Idempotent — visiting an already-verified
 * link shows a success page without re-sending emails.
 *
 * Per gs-dsar-spec.md §4.3.
 */

import crypto from "node:crypto";
import { Alert, Container } from "@empac/cascadeds";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  DSAR_REQUEST_TYPE_LABELS,
  sendDSARAdminNotification,
  sendDSARRequesterConfirmation,
} from "@/lib/email/dsar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Outcome =
  | { kind: "success"; requestType: string; responseDueAt: Date }
  | { kind: "already_verified"; requestType: string; responseDueAt: Date }
  | { kind: "missing_params" }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "invalid_token" }
  | { kind: "denied" }
  | { kind: "error" };

async function verify(token: string, id: string): Promise<Outcome> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("dsar_requests")
    .select(
      "id, status, request_type, requester_email, requester_name, description, verification_token_hash, verification_token_expires_at, response_due_at, user_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[dsar/verify] lookup error:", error);
    return { kind: "error" };
  }
  if (!row) {
    return { kind: "not_found" };
  }

  // Already moved past verification — treat as success but skip side effects.
  if (row.status !== "pending_verification") {
    if (row.status === "denied") {
      return { kind: "denied" };
    }
    return {
      kind: "already_verified",
      requestType: row.request_type,
      responseDueAt: new Date(row.response_due_at),
    };
  }

  if (!row.verification_token_hash || !row.verification_token_expires_at) {
    return { kind: "invalid_token" };
  }

  const expiresAt = new Date(row.verification_token_expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    // Mark expired so the row reflects reality.
    await supabase
      .from("dsar_requests")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "pending_verification");
    return { kind: "expired" };
  }

  const providedHash = crypto.createHash("sha256").update(token).digest("hex");
  // Constant-time compare to avoid leaking timing info.
  const storedHash = row.verification_token_hash;
  const a = Buffer.from(providedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { kind: "invalid_token" };
  }

  const verifiedAt = new Date();
  const { error: updateErr } = await supabase
    .from("dsar_requests")
    .update({
      status: "verified",
      verified_by: "magic_link",
      verified_at: verifiedAt.toISOString(),
      verification_token_hash: null,
      verification_token_expires_at: null,
    })
    .eq("id", row.id)
    .eq("status", "pending_verification");

  if (updateErr) {
    console.error("[dsar/verify] update error:", updateErr);
    return { kind: "error" };
  }

  const responseDueAt = new Date(row.response_due_at);
  await Promise.all([
    sendDSARAdminNotification({
      requestId: row.id,
      requesterEmail: row.requester_email,
      requesterName: row.requester_name,
      requestType: row.request_type,
      description: row.description,
      verifiedBy: "magic_link",
      verifiedAt,
      responseDueAt,
      hasAccountMatch: !!row.user_id,
    }),
    sendDSARRequesterConfirmation({
      to: row.requester_email,
      name: row.requester_name,
      requestType: row.request_type,
      submittedAt: verifiedAt,
      responseDueAt,
    }),
  ]).catch((err) => {
    console.error("[dsar/verify] notification email error (non-fatal):", err);
  });

  return {
    kind: "success",
    requestType: row.request_type,
    responseDueAt,
  };
}

export default async function VerifyDSARPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; id?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const id = typeof params.id === "string" ? params.id : "";

  let outcome: Outcome;
  if (!token || !id) {
    outcome = { kind: "missing_params" };
  } else {
    try {
      outcome = await verify(token, id);
    } catch (err) {
      console.error("[dsar/verify] unexpected error:", err);
      outcome = { kind: "error" };
    }
  }

  return (
    <main className="dsar-page-main">
      <Container>
        <div className="dsar-page">
          <h1 className="dsar-page__title">Verify your privacy request</h1>
          <Outcome outcome={outcome} />
        </div>
      </Container>
    </main>
  );
}

function Outcome({ outcome }: { outcome: Outcome }) {
  switch (outcome.kind) {
    case "success":
      return (
        <Alert variant="success" title="Your request is confirmed">
          <p>
            Thanks — we&apos;ve verified your <strong>{DSAR_REQUEST_TYPE_LABELS[outcome.requestType] ?? outcome.requestType}</strong> request.
            We&apos;ll respond by <strong>{outcome.responseDueAt.toDateString()}</strong>.
          </p>
          <p className="dsar-page__success-note">
            We just sent a confirmation email to the address on file. If you have questions, reply to that email or write to{" "}
            <a href="mailto:privacy@gameshuffle.co">privacy@gameshuffle.co</a>.
          </p>
        </Alert>
      );
    case "already_verified":
      return (
        <Alert variant="success" title="This request is already confirmed">
          <p>
            Your <strong>{DSAR_REQUEST_TYPE_LABELS[outcome.requestType] ?? outcome.requestType}</strong> request was already verified. We&apos;ll respond by{" "}
            <strong>{outcome.responseDueAt.toDateString()}</strong>.
          </p>
        </Alert>
      );
    case "denied":
      return (
        <Alert variant="error" title="This request was denied">
          <p>
            Our records show this request was denied. If you believe this is an error, contact{" "}
            <a href="mailto:privacy@gameshuffle.co">privacy@gameshuffle.co</a>.
          </p>
        </Alert>
      );
    case "expired":
      return (
        <Alert variant="warning" title="This link has expired">
          <p>
            Verification links are valid for 7 days. Please <a href="/data-request">submit a new request</a> to receive a fresh link.
          </p>
        </Alert>
      );
    case "invalid_token":
    case "not_found":
      return (
        <Alert variant="error" title="This link isn't valid">
          <p>
            The verification link is missing or doesn&apos;t match our records. If you copied the link from your email, try clicking it directly. Otherwise, <a href="/data-request">submit a new request</a>.
          </p>
        </Alert>
      );
    case "missing_params":
      return (
        <Alert variant="warning" title="Missing verification details">
          <p>
            This page expects a verification link with both a token and ID. <a href="/data-request">Start a new request</a>.
          </p>
        </Alert>
      );
    case "error":
    default:
      return (
        <Alert variant="error" title="Something went wrong">
          <p>
            We hit an unexpected error verifying your request. Please email{" "}
            <a href="mailto:privacy@gameshuffle.co">privacy@gameshuffle.co</a> and we&apos;ll handle it directly.
          </p>
        </Alert>
      );
  }
}
